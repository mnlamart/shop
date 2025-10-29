import { invariant } from '@epic-web/invariant'
import { type OrderStatus } from '@prisma/client'
import { prisma } from './db.server.ts'
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
 * Creates an order from a cart with price snapshots and inventory reduction.
 * Uses a database transaction to ensure atomicity.
 * @param cartId - The ID of the cart to convert to an order
 * @param shippingData - Shipping information for the order
 * @param stripeCheckoutSessionId - Stripe Checkout Session ID
 * @param stripePaymentIntentId - Stripe PaymentIntent ID (optional)
 * @param userId - User ID if authenticated (optional)
 * @param email - Email address for the order
 * @param subtotal - Order subtotal in cents
 * @param total - Order total in cents
 */
export async function createOrderFromCart({
	cartId,
	shippingData,
	stripeCheckoutSessionId,
	stripePaymentIntentId,
	userId,
	email,
	subtotal,
	total,
}: {
	cartId: string
	shippingData: {
		name: string
		street: string
		city: string
		state?: string
		postal: string
		country: string
	}
	stripeCheckoutSessionId: string
	stripePaymentIntentId?: string | null
	userId?: string | null
	email: string
	subtotal: number
	total: number
}) {
	// Load cart data BEFORE transaction (more efficient)
	const cart = await prisma.cart.findUnique({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
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
					if (item.variantId) {
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
						if (product.stockQuantity !== null && product.stockQuantity < item.quantity) {
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
					userId: userId || null,
					email,
					subtotal,
					total,
					shippingName: shippingData.name,
					shippingStreet: shippingData.street,
					shippingCity: shippingData.city,
					shippingState: shippingData.state || null,
					shippingPostal: shippingData.postal,
					shippingCountry: shippingData.country,
					stripeCheckoutSessionId,
					stripePaymentIntentId: stripePaymentIntentId || null,
					status: 'CONFIRMED',
				},
			})

			// 5. Create order items with price snapshots
			await Promise.all(
				cart.items.map((item) =>
					tx.orderItem.create({
						data: {
							orderId: newOrder.id,
							productId: item.productId,
							variantId: item.variantId || null,
							price:
								item.variant?.price ?? item.product.price,
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

	return order
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
 * Updates an order status (admin only).
 * @param orderId - The ID of the order to update
 * @param status - The new status
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
): Promise<void> {
	await prisma.order.update({
		where: { id: orderId },
		data: { status },
	})
}

/**
 * Gets an order by Stripe Checkout Session ID (for webhook idempotency).
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

