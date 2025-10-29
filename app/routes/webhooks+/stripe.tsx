import { invariant } from '@epic-web/invariant'
import  { type ActionFunctionArgs } from 'react-router'
import type Stripe from 'stripe'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import {
	StockUnavailableError,
} from '#app/utils/order.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'

export async function action({ request }: ActionFunctionArgs) {
	const body = await request.text()
	const sig = request.headers.get('stripe-signature')

	invariant(sig, 'Missing webhook signature')
	invariant(
		process.env.STRIPE_WEBHOOK_SECRET,
		'Missing webhook secret',
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
		const error = err as Error
		console.error(`Webhook signature verification failed: ${error.message}`)
		return new Response(`Webhook Error: ${error.message}`, { status: 400 })
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session

		// Idempotency check
		const existingOrder = await prisma.order.findUnique({
			where: { stripeCheckoutSessionId: session.id },
		})
		if (existingOrder) {
			return Response.json({ received: true, orderId: existingOrder.id })
		}

		// Load cart data BEFORE transaction (more efficient)
		const cartId = session.metadata?.cartId
		invariant(cartId, 'Missing cartId in session metadata')

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
		invariant(cart.items, 'Cart items not loaded')
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

					// 3. Generate order number
					const orderNumber = await generateOrderNumber()

					// 4. Create order
					const newOrder = await tx.order.create({
						data: {
							orderNumber,
							userId: session.metadata?.userId || null,
							email:
								session.customer_email || session.metadata?.email || '',
							subtotal: session.amount_subtotal ?? 0,
							total: session.amount_total ?? 0,
							shippingName: session.metadata?.shippingName || '',
							shippingStreet: session.metadata?.shippingStreet || '',
							shippingCity: session.metadata?.shippingCity || '',
							shippingState: session.metadata?.shippingState || null,
							shippingPostal: session.metadata?.shippingPostal || '',
							shippingCountry: session.metadata?.shippingCountry || 'US',
							stripeCheckoutSessionId: session.id,
							stripePaymentIntentId:
								(typeof session.payment_intent === 'string'
									? session.payment_intent
									: session.payment_intent?.id) || null,
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
						<p><strong>Total:</strong> $${(order.total / 100).toFixed(2)}</p>
						<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
					`,
					text: `
Order Confirmation

Thank you for your order!

Order Number: ${order.orderNumber}
Total: $${(order.total / 100).toFixed(2)}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
					`,
				})
			} catch (emailError) {
				// Log email error but don't fail order creation
				// Order was successfully created, email is secondary
				console.error(
					`Failed to send confirmation email for order ${order.orderNumber}:`,
					emailError,
				)
			}

			// Clear cart
			await prisma.cart.delete({ where: { id: cartId } })

			return Response.json({ received: true, orderId: order.id })
		} catch (error) {
			if (error instanceof StockUnavailableError) {
				// Handle refund for stock unavailable (payment already processed)
				const paymentIntentId =
					typeof session.payment_intent === 'string'
						? session.payment_intent
						: session.payment_intent?.id

				if (paymentIntentId && session.amount_total) {
					try {
						await stripe.refunds.create({
							payment_intent: paymentIntentId,
							amount: session.amount_total,
							reason: 'requested_by_customer',
							metadata: {
								reason: 'stock_unavailable',
								checkout_session_id: session.id,
								product_name: error.data.productName,
							},
						})
					} catch (refundError) {
						// Log refund error but don't fail webhook processing
						// Stripe will retry webhook if needed
						console.error(
							`Failed to create refund for payment ${paymentIntentId}:`,
							refundError,
						)
					}
				}

				return Response.json(
					{
						received: true,
						error: 'Stock unavailable',
						message: error.message,
					},
					{ status: 500 },
				)
			}
			throw error
		}
	}

	return Response.json({ received: true })
}

