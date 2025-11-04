import { invariant } from '@epic-web/invariant'
import { type OrderStatus } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'
import { generateOrderNumber } from './order-number.server.ts'
import { stripe } from './stripe.server.ts'

/**
 * Type for stock availability issues
 */
export type StockIssue = {
	productName: string
	requested: number
	available: number
}

export class StockValidationError extends Error {
	constructor(public issues: StockIssue[]) {
		super('Insufficient stock for one or more items')
		this.name = 'StockValidationError'
	}
}

export class StockUnavailableError extends Error {
	constructor(public data: StockIssue) {
		super(`Insufficient stock for ${data.productName}`)
		this.name = 'StockUnavailableError'
	}
}

/**
 * Validates that all items in the cart have sufficient stock availability.
 * Checks variant-level stock when variant exists, product-level stock when no variant.
 * @param cartId - The ID of the cart to validate
 * @throws StockValidationError if any items have insufficient stock
 */
export async function validateStockAvailability(cartId: string): Promise<void> {
	const cart = await prisma.cart.findUnique({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							stockQuantity: true,
						},
					},
				},
			},
		},
	})

	invariant(cart, 'Cart not found')
	invariant(cart.items.length > 0, 'Cart is empty')

	const stockIssues: StockIssue[] = []

	for (const item of cart.items) {
		if (item.variantId) {
			// Item has variant - check variant-level stock
			const variant = await prisma.productVariant.findUnique({
				where: { id: item.variantId },
				select: { id: true, stockQuantity: true },
			})

			invariant(
				variant,
				`Variant ${item.variantId} not found for product ${item.product.name}`,
			)

			if (variant.stockQuantity < item.quantity) {
				stockIssues.push({
					productName: item.product.name,
					requested: item.quantity,
					available: variant.stockQuantity,
				})
			}
		} else {
			// Item has no variant - check product-level stock
			if (item.product.stockQuantity !== null) {
				// Product has stock tracking
				if (item.product.stockQuantity < item.quantity) {
					stockIssues.push({
						productName: item.product.name,
						requested: item.quantity,
						available: item.product.stockQuantity,
					})
				}
			}
			// If stockQuantity is null, treat as unlimited (no validation)
		}
	}

	if (stockIssues.length > 0) {
		throw new StockValidationError(stockIssues)
	}
}

/**
 * Gets an order by ID with full details including items, products, and variants.
 */
export async function getOrderById(orderId: string) {
	return prisma.order.findUnique({
		where: { id: orderId },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
			},
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						include: {
							attributeValues: {
								include: {
									attributeValue: {
										include: {
											attribute: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets an order by order number.
 */
export async function getOrderByOrderNumber(orderNumber: string) {
	return prisma.order.findUnique({
		where: { orderNumber },
		include: {
			user: {
				select: {
					id: true,
					email: true,
					username: true,
					name: true,
				},
			},
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						include: {
							attributeValues: {
								include: {
									attributeValue: {
										include: {
											attribute: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets all orders for a user, ordered by most recent first.
 */
export async function getUserOrders(userId: string) {
	return prisma.order.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		include: {
			items: {
				include: {
					product: {
						select: {
							name: true,
							slug: true,
							images: {
								select: {
									objectKey: true,
									altText: true,
								},
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
				},
			},
		},
	})
}

/**
 * Gets a guest order by order number and email for security.
 */
export async function getGuestOrder(orderNumber: string, email: string) {
	const order = await getOrderByOrderNumber(orderNumber)

	if (!order) {
		return null
	}

	// Verify email matches for security
	if (order.email.toLowerCase() !== email.toLowerCase()) {
		return null
	}

	// Only return guest orders (no userId)
	if (order.userId) {
		return null
	}

	return order
}

/**
 * Updates an order status (admin only) and sends email notification.
 * @param orderId - The ID of the order to update
 * @param status - The new status
 * @param request - Optional request object for getting domain URL (for email links)
 * @param trackingNumber - Optional tracking number (required when status is SHIPPED)
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
	request?: Request,
	trackingNumber?: string | null,
): Promise<void> {
	// Update order status and tracking number
	const order = await prisma.order.update({
		where: { id: orderId },
		data: {
			status,
			...(status === 'SHIPPED' && trackingNumber ? { trackingNumber } : {}),
		},
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			trackingNumber: true,
		},
	})

	// Send status update email (non-blocking - don't fail status update if email fails)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const statusLabel = getStatusLabel(status)
		
		let emailBody = `
			<h1>Order Status Update</h1>
			<p>Your order status has been updated.</p>
			<p><strong>Order Number:</strong> ${order.orderNumber}</p>
			<p><strong>New Status:</strong> ${statusLabel}</p>
		`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			emailBody += `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>`
		}
		
		emailBody += `<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>`
		
		let textBody = `
Order Status Update

Your order status has been updated.

Order Number: ${order.orderNumber}
New Status: ${statusLabel}
`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			textBody += `Tracking Number: ${order.trackingNumber}\n`
		}
		
		textBody += `View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}`
		
		await sendEmail({
			to: order.email,
			subject: `Order Status Update - ${order.orderNumber}`,
			html: emailBody,
			text: textBody,
		})
	} catch (emailError) {
		// Log email error but don't fail status update
		// Status was successfully updated, email is secondary
		console.error(
			`Failed to send status update email for order ${order.orderNumber}:`,
			emailError,
		)
	}
}

/**
 * Gets a human-readable label for order status.
 */
function getStatusLabel(status: OrderStatus): string {
	switch (status) {
		case 'PENDING':
			return 'Pending'
		case 'CONFIRMED':
			return 'Confirmed'
		case 'SHIPPED':
			return 'Shipped'
		case 'DELIVERED':
			return 'Delivered'
		case 'CANCELLED':
			return 'Cancelled'
		default:
			return status
	}
}

/**
 * Cancels an order and creates a Stripe refund (admin only).
 * @param orderId - The ID of the order to cancel
 * @param request - Optional request object for getting domain URL (for email links)
 */
export async function cancelOrder(orderId: string, request?: Request): Promise<void> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			stripePaymentIntentId: true,
			stripeChargeId: true,
			total: true,
		},
	})

	invariant(order, 'Order not found')
	invariant(order.status !== 'CANCELLED', 'Order is already cancelled')

	// Create refund via Stripe if payment was processed
	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundParams: Stripe.RefundCreateParams = {
				amount: order.total,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					cancelledBy: 'admin',
				},
			}

			// Use payment_intent if available, otherwise use charge
			if (order.stripePaymentIntentId) {
				refundParams.payment_intent = order.stripePaymentIntentId
			} else if (order.stripeChargeId) {
				refundParams.charge = order.stripeChargeId
			}

			const refund = await stripe.refunds.create(refundParams)
			refundId = refund.id
		} catch (refundError) {
			// Log refund error but don't fail order cancellation
			// Admin can manually process refund if needed
			console.error(
				`Failed to create refund for order ${order.orderNumber}:`,
				refundError,
			)
			// Still proceed with order cancellation
		}
	}

	// Update order status to CANCELLED
	await prisma.order.update({
		where: { id: orderId },
		data: { status: 'CANCELLED' },
	})

	// Send cancellation email (non-blocking)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		await sendEmail({
			to: order.email,
			subject: `Order Cancelled - ${order.orderNumber}`,
			html: `
				<h1>Order Cancelled</h1>
				<p>Your order has been cancelled.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				${refundId ? `<p><strong>Refund ID:</strong> ${refundId}</p>` : ''}
				<p>${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
			`,
			text: `
Order Cancelled

Your order has been cancelled.

Order Number: ${order.orderNumber}
${refundId ? `Refund ID: ${refundId}` : ''}
${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
		})
	} catch (emailError) {
		// Log email error but don't fail cancellation
		console.error(
			`Failed to send cancellation email for order ${order.orderNumber}:`,
			emailError,
		)
	}
}

/**
 * Gets an order by checkout session ID (for webhook idempotency).
 */
export async function getOrderByCheckoutSessionId(
	checkoutSessionId: string,
) {
	return prisma.order.findUnique({
		where: { stripeCheckoutSessionId: checkoutSessionId },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
		},
	})
}

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
					console.error(
						`[ORDER] Failed to retrieve charge ID for payment intent ${paymentIntentId}:`,
						err,
					)
				}
			}

			const newOrder = await tx.order.create({
				data: {
					orderNumber,
					userId: userId || null,
					email:
						session.customer_email ||
						session.metadata?.email ||
						'',
					subtotal: session.amount_subtotal ?? 0,
					total: session.amount_total ?? 0,
					shippingName: session.metadata?.shippingName || '',
					shippingStreet: session.metadata?.shippingStreet || '',
					shippingCity: session.metadata?.shippingCity || '',
					shippingState: session.metadata?.shippingState || null,
					shippingPostal: session.metadata?.shippingPostal || '',
					shippingCountry: session.metadata?.shippingCountry || 'US',
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
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
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
			`[ORDER] Failed to send confirmation email for order ${order.orderNumber}:`,
			emailError,
		)
	}

	return { id: order.id, orderNumber: order.orderNumber }
}

