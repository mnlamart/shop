import { prisma } from './db.server.ts'
import { orderItemsWithVariantInclude } from './prisma-includes.ts'

const orderUserSelect = {
	select: {
		id: true,
		email: true,
		username: true,
		name: true,
	},
} as const

export async function getOrderById(orderId: string) {
	return prisma.order.findUnique({
		where: { id: orderId },
		include: {
			user: orderUserSelect,
			...orderItemsWithVariantInclude,
		},
	})
}

export async function getOrderByOrderNumber(orderNumber: string) {
	return prisma.order.findUnique({
		where: { orderNumber },
		include: {
			user: orderUserSelect,
			...orderItemsWithVariantInclude,
		},
	})
}

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

export async function getGuestOrder(orderNumber: string, email: string) {
	const order = await getOrderByOrderNumber(orderNumber)

	if (!order) return null
	if (order.email.toLowerCase() !== email.toLowerCase()) return null
	if (order.userId) return null

	return order
}

export async function getOrderByCheckoutSessionId(checkoutSessionId: string) {
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
