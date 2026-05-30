import { prisma } from './db.server.ts'

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
			invoices: {
				select: {
					id: true,
					fiscalYear: true,
					sequence: true,
					kind: true,
					status: true,
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
			invoices: {
				select: {
					id: true,
					fiscalYear: true,
					sequence: true,
					kind: true,
					status: true,
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
