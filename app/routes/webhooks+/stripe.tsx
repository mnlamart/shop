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
	const body = await request.text()
	const sig = request.headers.get('stripe-signature')

	invariant(sig, 'Missing webhook signature')
	invariant(
		process.env.STRIPE_WEBHOOK_SECRET,
		'STRIPE_WEBHOOK_SECRET must be set in environment variables',
	)

	let event: Stripe.Event
	try {
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET,
			300, // tolerance in seconds
		)
	} catch (err) {
		console.error(`[WEBHOOK] Webhook signature verification failed:`, err)
		return data(
			{ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
			{ status: 400 },
		)
	}

	// Handle checkout.session.completed event
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session

		// Idempotency check - prevent duplicate order creation
		const existingOrder = await getOrderByCheckoutSessionId(session.id)
		if (existingOrder) {
			// Order already exists - ensure cart is deleted (idempotent operation)
			// This handles webhook retries and ensures cart is cleaned up even if
			// the first webhook call deleted the cart but a retry comes in
			// Retrieve full session to get metadata (cartId)
			const fullSession = await stripe.checkout.sessions.retrieve(session.id)
			const cartId = fullSession.metadata?.cartId
			if (cartId) {
				try {
					// Try to delete cart items first, then cart
					await prisma.cartItem.deleteMany({
						where: { cartId },
					})
					await prisma.cart.delete({
						where: { id: cartId },
					}).catch(() => {
						// Cart might already be deleted - that's fine
					})
				} catch (error) {
					// Cart might already be deleted or not exist - that's fine
					// This is idempotent - we don't want to fail if cart is already gone
				}
			}
			return data({ received: true, orderId: existingOrder.id })
		}

		// Retrieve full session from Stripe with expanded data
		const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
			expand: ['line_items', 'payment_intent'],
		})

		// Extract metadata
		const cartId = fullSession.metadata?.cartId
		const userId = fullSession.metadata?.userId || null
		invariant(cartId, 'Missing cartId in session metadata')

		// Load cart data BEFORE transaction (more efficient)
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

		invariant(cart, 'Cart not found')
		invariant(cart.items.length > 0, 'Cart is empty')

		// Create order in transaction
		try {
			const order = await prisma.$transaction(
				async (tx) => {
					// 1. Re-check stock (final validation, handles race conditions)
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

					// 2. Reduce stock atomically
					for (const item of cart.items) {
						if (item.variantId) {
							// Reduce variant stock
							await tx.productVariant.update({
								where: { id: item.variantId },
								data: { stockQuantity: { decrement: item.quantity } },
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
							}
						}
					}

					// 3. Generate order number (using existing transaction)
					const orderNumber = await generateOrderNumber(tx)

					// 4. Create order
					const paymentIntentId =
						typeof fullSession.payment_intent === 'string'
							? fullSession.payment_intent
							: fullSession.payment_intent?.id || null

					// Get payment intent to extract charge ID
					let chargeId: string | null = null
					if (paymentIntentId) {
						try {
							const paymentIntent = await stripe.paymentIntents.retrieve(
								paymentIntentId,
							)
							if (typeof paymentIntent.latest_charge === 'string') {
								chargeId = paymentIntent.latest_charge
							}
						} catch (err) {
							// Log but don't fail order creation if charge retrieval fails
							console.error(
								`[WEBHOOK] Failed to retrieve charge ID for payment intent ${paymentIntentId}:`,
								err,
							)
						}
					}

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

					// 5. Create order items
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

					// 6. Delete cart items (within transaction for atomicity)
					await tx.cartItem.deleteMany({
						where: { cartId },
					})

					// 7. Delete cart (within transaction for atomicity)
					await tx.cart.delete({
						where: { id: cartId },
					})

					return newOrder
				},
				{
					timeout: 30000, // 30 second timeout
				},
			)

			// Send confirmation email (non-blocking - don't fail order creation if email fails)
			try {
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
			} catch (emailError) {
				// Log email error but don't fail order creation
				console.error(
					`[WEBHOOK] Failed to send confirmation email for order ${order.orderNumber}:`,
					emailError,
				)
			}

			// Cart is already deleted within the transaction above
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
						console.error(
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
	return data({ received: true })
}

