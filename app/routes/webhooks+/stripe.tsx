import { invariant } from '@epic-web/invariant'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import Stripe from 'stripe'
import { prisma } from '#app/utils/db.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { sendEmail } from '#app/utils/email.server.ts'
import {
	getOrderByCheckoutSessionId,
	StockUnavailableError,
} from '#app/utils/order.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/stripe.ts'

/**
 * Webhook handler for Stripe events.
 * Handles checkout.session.completed events to create orders.
 */
export async function action({ request }: Route.ActionArgs) {
	console.log('[WEBHOOK] Webhook received')
	const body = await request.text()
	const sig = request.headers.get('stripe-signature')

	console.log('[WEBHOOK] Signature header:', sig ? 'present' : 'missing')
	invariant(sig, 'Missing webhook signature')
	invariant(
		process.env.STRIPE_WEBHOOK_SECRET,
		'STRIPE_WEBHOOK_SECRET must be set in environment variables',
	)

	let event: Stripe.Event
	try {
		console.log('[WEBHOOK] Verifying webhook signature')
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET,
			300, // tolerance in seconds
		)
		console.log('[WEBHOOK] Signature verified. Event type:', event.type, 'Event ID:', event.id)
	} catch (err) {
		console.error(`[WEBHOOK] Webhook signature verification failed:`, err)
		return data(
			{ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
			{ status: 400 },
		)
	}

	// Handle checkout.session.completed event
	if (event.type === 'checkout.session.completed') {
		console.log('[WEBHOOK] Processing checkout.session.completed event')
		const session = event.data.object as Stripe.Checkout.Session
		console.log('[WEBHOOK] Session ID:', session.id)

		// Idempotency check - prevent duplicate order creation
		console.log('[WEBHOOK] Checking for existing order by session ID')
		const existingOrder = await getOrderByCheckoutSessionId(session.id)
		if (existingOrder) {
			console.log(`[WEBHOOK] Order already exists for session ${session.id}, orderNumber: ${existingOrder.orderNumber}`)
			return data({ received: true, orderId: existingOrder.id })
		}

		// Retrieve full session from Stripe with expanded data
		console.log('[WEBHOOK] Retrieving full session from Stripe')
		const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
			expand: ['line_items', 'payment_intent'],
		})
		console.log('[WEBHOOK] Full session retrieved:', {
			id: fullSession.id,
			payment_status: fullSession.payment_status,
			amount_total: fullSession.amount_total,
			metadata: fullSession.metadata,
		})

		// Extract metadata
		const cartId = fullSession.metadata?.cartId
		const userId = fullSession.metadata?.userId || null
		console.log('[WEBHOOK] Extracted metadata:', { cartId, userId })
		invariant(cartId, 'Missing cartId in session metadata')

		// Load cart data BEFORE transaction (more efficient)
		console.log('[WEBHOOK] Loading cart data:', cartId)
		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: {
				items: {
					include: {
						product: {
							select: {
								id: true,
								name: true,
								description: true,
								price: true,
								stockQuantity: true,
							},
						},
						variant: {
							select: {
								id: true,
								price: true,
								stockQuantity: true,
							},
						},
					},
				},
			},
		})

		console.log('[WEBHOOK] Cart loaded:', {
			cartId: cart?.id,
			itemCount: cart?.items.length,
			items: cart?.items.map((item) => ({
				productId: item.productId,
				productName: item.product.name,
				variantId: item.variantId,
				quantity: item.quantity,
			})),
		})
		invariant(cart, 'Cart not found')
		invariant(cart.items.length > 0, 'Cart is empty')

		// Create order in transaction
		console.log('[WEBHOOK] Starting order creation transaction')
		try {
			const order = await prisma.$transaction(
				async (tx) => {
					console.log('[WEBHOOK] Transaction started')
					// 1. Re-check stock (final validation, handles race conditions)
					console.log('[WEBHOOK] Re-checking stock availability')
					for (const item of cart.items) {
						if (item.variantId && item.variant) {
							// Item has variant - check variant-level stock
							const variant = await tx.productVariant.findUnique({
								where: { id: item.variantId },
								select: { id: true, stockQuantity: true },
							})
							invariant(
								variant,
								`Variant ${item.variantId} not found for product ${item.product.name}`,
							)
							console.log('[WEBHOOK] Stock check - variant:', {
								variantId: item.variantId,
								requested: item.quantity,
								available: variant.stockQuantity,
							})
							if (variant.stockQuantity < item.quantity) {
								throw new StockUnavailableError({
									productName: item.product.name,
									requested: item.quantity,
									available: variant.stockQuantity,
								})
							}
						} else {
							// Item has no variant - check product-level stock
							const product = await tx.product.findUnique({
								where: { id: item.productId },
								select: { id: true, name: true, stockQuantity: true },
							})
							invariant(product, `Product ${item.productId} not found`)
							console.log('[WEBHOOK] Stock check - product:', {
								productId: item.productId,
								requested: item.quantity,
								available: product.stockQuantity,
							})
							if (
								product.stockQuantity !== null &&
								product.stockQuantity < item.quantity
							) {
								throw new StockUnavailableError({
									productName: product.name,
									requested: item.quantity,
									available: product.stockQuantity,
								})
							}
						}
					}
					console.log('[WEBHOOK] Stock validation passed')

					// 2. Reduce stock atomically
					console.log('[WEBHOOK] Reducing stock')
					for (const item of cart.items) {
						if (item.variantId) {
							// Reduce variant stock
							await tx.productVariant.update({
								where: { id: item.variantId },
								data: { stockQuantity: { decrement: item.quantity } },
							})
							console.log('[WEBHOOK] Reduced variant stock:', {
								variantId: item.variantId,
								quantity: item.quantity,
							})
						} else {
							// Reduce product stock (if it has stock tracking)
							const product = await tx.product.findUnique({
								where: { id: item.productId },
								select: { stockQuantity: true },
							})
							if (product && product.stockQuantity !== null) {
								await tx.product.update({
									where: { id: item.productId },
									data: { stockQuantity: { decrement: item.quantity } },
								})
								console.log('[WEBHOOK] Reduced product stock:', {
									productId: item.productId,
									quantity: item.quantity,
								})
							}
						}
					}

					// 3. Generate order number (using existing transaction)
					console.log('[WEBHOOK] Generating order number')
					const orderNumber = await generateOrderNumber(tx)
					console.log('[WEBHOOK] Order number generated:', orderNumber)

					// 4. Create order
					const paymentIntentId =
						typeof fullSession.payment_intent === 'string'
							? fullSession.payment_intent
							: fullSession.payment_intent?.id || null

					console.log('[WEBHOOK] Payment intent ID:', paymentIntentId)

					// Get payment intent to extract charge ID
					let chargeId: string | null = null
					if (paymentIntentId) {
						try {
							console.log('[WEBHOOK] Retrieving payment intent to get charge ID')
							const paymentIntent = await stripe.paymentIntents.retrieve(
								paymentIntentId,
							)
							if (typeof paymentIntent.latest_charge === 'string') {
								chargeId = paymentIntent.latest_charge
								console.log('[WEBHOOK] Charge ID:', chargeId)
							}
						} catch (err) {
							// Log but don't fail order creation if charge retrieval fails
							console.error(
								`[WEBHOOK] Failed to retrieve charge ID for payment intent ${paymentIntentId}:`,
								err,
							)
						}
					}

					console.log('[WEBHOOK] Creating order in database')
					const newOrder = await tx.order.create({
						data: {
							orderNumber,
							userId: userId || null,
							email:
								fullSession.customer_email ||
								fullSession.metadata?.email ||
								'',
							subtotal: fullSession.amount_subtotal ?? 0,
							total: fullSession.amount_total ?? 0,
							shippingName: fullSession.metadata?.shippingName || '',
							shippingStreet: fullSession.metadata?.shippingStreet || '',
							shippingCity: fullSession.metadata?.shippingCity || '',
							shippingState: fullSession.metadata?.shippingState || null,
							shippingPostal: fullSession.metadata?.shippingPostal || '',
							shippingCountry: fullSession.metadata?.shippingCountry || 'US',
							stripeCheckoutSessionId: fullSession.id,
							stripePaymentIntentId: paymentIntentId,
							stripeChargeId: chargeId,
							status: 'CONFIRMED',
						},
					})
					console.log('[WEBHOOK] Order created:', {
						orderId: newOrder.id,
						orderNumber: newOrder.orderNumber,
					})

					// 5. Create order items
					console.log('[WEBHOOK] Creating order items')
					await Promise.all(
						cart.items.map((item) =>
							tx.orderItem.create({
								data: {
									orderId: newOrder.id,
									productId: item.productId,
									variantId: item.variantId,
									price:
										item.variantId && item.variant
											? item.variant.price ?? item.product.price
											: item.product.price,
									quantity: item.quantity,
								},
							}),
						),
					)
					console.log('[WEBHOOK] Order items created:', cart.items.length)

					return newOrder
				},
				{
					timeout: 30000, // 30 second timeout
				},
			)

			console.log('[WEBHOOK] Transaction completed successfully. Order:', {
				orderId: order.id,
				orderNumber: order.orderNumber,
			})

			// Send confirmation email (non-blocking - don't fail order creation if email fails)
			try {
				console.log('[WEBHOOK] Sending confirmation email')
				const domainUrl = getDomainUrl(request)
				await sendEmail({
					to: order.email,
					subject: `Order Confirmation - ${order.orderNumber}`,
					html: `
						<h1>Order Confirmation</h1>
						<p>Thank you for your order!</p>
						<p><strong>Order Number:</strong> ${order.orderNumber}</p>
						<p><strong>Total:</strong> ${(order.total / 100).toFixed(2)}</p>
						<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
					`,
					text: `
Order Confirmation

Thank you for your order!

Order Number: ${order.orderNumber}
Total: ${(order.total / 100).toFixed(2)}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
					`,
				})
				console.log('[WEBHOOK] Confirmation email sent successfully')
			} catch (emailError) {
				// Log email error but don't fail order creation
				console.error(
					`[WEBHOOK] Failed to send confirmation email for order ${order.orderNumber}:`,
					emailError,
				)
			}

			// Clear cart
			try {
				console.log('[WEBHOOK] Deleting cart:', cartId)
				await prisma.cart.delete({ where: { id: cartId } })
				console.log('[WEBHOOK] Cart deleted successfully')
			} catch (cartError) {
				// Log but don't fail - cart might already be deleted
				console.error(`[WEBHOOK] Failed to delete cart ${cartId}:`, cartError)
			}

			console.log('[WEBHOOK] Webhook processing completed successfully')
			return data({ received: true, orderId: order.id })
		} catch (error) {
			console.error('[WEBHOOK] Error in transaction:', {
				error,
				message: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			})
			if (error instanceof StockUnavailableError) {
				console.error('[WEBHOOK] Stock unavailable error:', error.data)
				// Stock unavailable after payment - this is a critical error
				// Payment was already processed, so we need to handle refund
				const paymentIntentId =
					typeof fullSession.payment_intent === 'string'
						? fullSession.payment_intent
						: fullSession.payment_intent?.id

				if (paymentIntentId && fullSession.amount_total) {
					try {
						console.log('[WEBHOOK] Creating refund for payment:', paymentIntentId)
						await stripe.refunds.create({
							payment_intent: paymentIntentId,
							amount: fullSession.amount_total,
							reason: 'requested_by_customer',
							metadata: {
								reason: 'stock_unavailable',
								checkout_session_id: fullSession.id,
								product_name: error.data.productName,
							},
						})
						console.log(
							`[WEBHOOK] Refund created for payment ${paymentIntentId} due to stock unavailability`,
						)
					} catch (refundError) {
						// Log refund error but don't fail webhook processing
						console.error(
							`[WEBHOOK] Failed to create refund for payment ${paymentIntentId}:`,
							refundError,
						)
					}
				}

				return data(
					{
						received: true,
						error: 'Stock unavailable',
						message: error.message,
					},
					{ status: 500 },
				)
			}
			// Re-throw other errors to trigger Stripe retry
			throw error
		}
	}

	// Return success for unhandled event types
	console.log('[WEBHOOK] Unhandled event type:', event.type)
	return data({ received: true })
}

