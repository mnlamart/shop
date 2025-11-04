import { invariant } from '@epic-web/invariant'
import { type OrderStatus } from '@prisma/client'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'
import { generateOrderNumber } from './order-number.server.ts'

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
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
	request?: Request,
): Promise<void> {
	// Update order status
	const order = await prisma.order.update({
		where: { id: orderId },
		data: { status },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
		},
	})

	// Send status update email (non-blocking - don't fail status update if email fails)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const statusLabel = getStatusLabel(status)
		
		await sendEmail({
			to: order.email,
			subject: `Order Status Update - ${order.orderNumber}`,
			html: `
				<h1>Order Status Update</h1>
				<p>Your order status has been updated.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				<p><strong>New Status:</strong> ${statusLabel}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
			`,
			text: `
Order Status Update

Your order status has been updated.

Order Number: ${order.orderNumber}
New Status: ${statusLabel}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
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

