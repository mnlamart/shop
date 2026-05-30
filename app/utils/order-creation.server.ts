import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import type Stripe from 'stripe'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'
import { generateGuestToken } from './guest-token.server.ts'
import { generateOrderNumber } from './order-number.server.ts'
import { stripe } from './stripe.server.ts'
import { calculateVat, type TaxableItem } from './tax.server.ts'
import { createInvoiceForOrder } from './order-invoice.server.ts'
import { StockUnavailableError } from './order-stock.server.ts'
import { getOrderByCheckoutSessionId } from './order-queries.server.ts'
/**
 * Creates an order from a Stripe checkout session.
 * This function handles the complete order creation process including:
 * - Payment status verification
 * - Idempotency checking
 * - Stock validation
 * - Atomic order creation with stock reduction and cart deletion
 * 
 * @param sessionId - The Stripe checkout session ID
 * @param fullSession - Optional pre-retrieved session (to avoid duplicate API calls)
 * @param request - Optional request object for getting domain URL (for email links)
 * @returns The created or existing order
 * @throws StockUnavailableError if stock is insufficient
 */
export async function createOrderFromStripeSession(
	sessionId: string,
	fullSession?: Stripe.Checkout.Session,
	request?: Request,
): Promise<{ id: string; orderNumber: string }> {
	// Idempotency check - prevent duplicate order creation
	const existingOrder = await getOrderByCheckoutSessionId(sessionId)
	if (existingOrder) {
		// Order already exists - ensure cart is deleted (idempotent operation)
		// This handles webhook retries and ensures cart is cleaned up even if
		// the first call deleted the cart but a retry comes in
		const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId)
		const cartId = session.metadata?.cartId
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
			} catch {
				// Cart might already be deleted or not exist - that's fine
				// This is idempotent - we don't want to fail if cart is already gone
			}
		}
		return { id: existingOrder.id, orderNumber: existingOrder.orderNumber }
	}

	// Retrieve full session from Stripe with expanded data if not provided
	const session = fullSession || await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['line_items', 'payment_intent'],
	})

	// Verify payment status before fulfilling order
	if (session.payment_status !== 'paid') {
		throw new Error(
			`Payment not completed for session ${sessionId}. Payment status: ${session.payment_status}`,
		)
	}

	// Extract metadata
	const cartId = session.metadata?.cartId
	const userId = session.metadata?.userId || null
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
							taxKind: true,
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
				typeof session.payment_intent === 'string'
					? session.payment_intent
					: session.payment_intent?.id || null

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
					Sentry.captureException(err, {
						tags: { context: 'order-charge-retrieval' },
						extra: { paymentIntentId },
					})
				}
			}

			// Extract shipping information from metadata
			const shippingMethodId = session.metadata?.shippingMethodId || null
			const shippingCost = session.metadata?.shippingCost
				? parseInt(session.metadata.shippingCost, 10)
				: 0
			const mondialRelayPickupPointId =
				session.metadata?.mondialRelayPickupPointId || null

			// Get shipping method details if available
			let shippingMethodName: string | null = null
			let shippingCarrierName: string | null = null
			let mondialRelayPickupPointName: string | null = null

			if (shippingMethodId) {
				const shippingMethod = await tx.shippingMethod.findUnique({
					where: { id: shippingMethodId },
					include: {
						carrier: {
							select: {
								displayName: true,
							},
						},
					},
				})

				if (shippingMethod) {
					shippingMethodName = shippingMethod.name
					shippingCarrierName = shippingMethod.carrier?.displayName || null
				}
			}

			// Calculate subtotal (total - shipping)
			const calculatedSubtotal = (session.amount_subtotal ?? 0) - shippingCost

			// Calculate VAT for the order
			const shippingCountry = session.metadata?.shippingCountry || 'US'
			const customerVatNumber = session.metadata?.customerVatNumber || null

			// Build taxable items from cart
			const taxableItems: TaxableItem[] = cart.items.map((item) => ({
				priceCents:
					item.variantId && item.variant
						? item.variant.price ?? item.product.price
						: item.product.price,
				quantity: item.quantity,
				taxKind: item.product.taxKind,
			}))

			// Calculate VAT (separate DB read - TaxRate table is read-only, not part of transaction)
			const vatCalculation = await calculateVat(
				taxableItems,
				shippingCountry,
				customerVatNumber,
			)

			const newOrder = await tx.order.create({
				data: {
					orderNumber,
					userId: userId || null,
					email:
						session.customer_email ||
						session.metadata?.email ||
						'',
					subtotal: calculatedSubtotal,
					total: session.amount_total ?? 0,
					shippingName: session.metadata?.shippingName || '',
					shippingStreet: session.metadata?.shippingStreet || '',
					shippingCity: session.metadata?.shippingCity || '',
					shippingState: session.metadata?.shippingState || null,
					shippingPostal: session.metadata?.shippingPostal || '',
					shippingCountry,
					shippingMethodId,
					shippingCost,
					shippingMethodName,
					shippingCarrierName,
					mondialRelayPickupPointId,
					mondialRelayPickupPointName,
					// VAT data
					vatBreakdown: vatCalculation.breakdown as any,
					vatTotalCents: vatCalculation.totalVatCents,
					taxCountry: vatCalculation.taxCountry,
					customerVatNumber,
					vatValidationStatus: 'UNCHECKED',
					stripeCheckoutSessionId: session.id,
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

			// 6. Create invoice for the order (within transaction for atomicity)
			await createInvoiceForOrder(tx, newOrder.id, calculatedSubtotal, newOrder.total, vatCalculation)

			// 7. Delete cart items (within transaction for atomicity)
			await tx.cartItem.deleteMany({
				where: { cartId },
			})

			// 8. Delete cart (within transaction for atomicity)
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
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'

		const guestToken = !order.userId
			? generateGuestToken(order.orderNumber, order.email)
			: null
		const orderLink = guestToken
			? `${domainUrl}/shop/orders?token=${encodeURIComponent(guestToken)}`
			: `${domainUrl}/shop/orders/${order.orderNumber}`

		// Build VAT details for email
		let vatHtml = ''
		let vatText = ''
		if (order.vatTotalCents > 0 && order.vatBreakdown) {
			const breakdown = typeof order.vatBreakdown === 'string'
				? JSON.parse(order.vatBreakdown)
				: order.vatBreakdown
			if (Array.isArray(breakdown)) {
				for (const line of breakdown as Array<{ kind: string; rate: number; vatCents: number }>) {
					const pct = (line.rate / 100).toFixed(1)
					vatHtml += `<p><strong>VAT (${line.kind} ${pct}%):</strong> €${(line.vatCents / 100).toFixed(2)}</p>\n`
					vatText += `VAT (${line.kind} ${pct}%): €${(line.vatCents / 100).toFixed(2)}\n`
				}
			}
		}
		
		await sendEmail({
			to: order.email,
			subject: `Order Confirmation - ${order.orderNumber}`,
			html: `
				<h1>Order Confirmation</h1>
				<p>Thank you for your order!</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				<p><strong>Subtotal:</strong> €${(order.subtotal / 100).toFixed(2)}</p>
				${vatHtml}
				<p><strong>Total:</strong> €${(order.total / 100).toFixed(2)}</p>
				<p><a href="${orderLink}">View Order Details</a></p>
			`,
			text: `
Order Confirmation

Thank you for your order!

Order Number: ${order.orderNumber}
Subtotal: €${(order.subtotal / 100).toFixed(2)}
${vatText}
Total: €${(order.total / 100).toFixed(2)}

View Order Details: ${orderLink}
			`,
		})
	} catch (emailError) {
		// Log email error but don't fail order creation
		Sentry.captureException(emailError, {
			tags: { context: 'order-confirmation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}

	return { id: order.id, orderNumber: order.orderNumber }
}

