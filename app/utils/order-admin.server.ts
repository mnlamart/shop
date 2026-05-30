import { type OrderStatus, type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * Parameters for paginated admin order queries with filtering.
 */
export type AdminOrdersParams = {
	page?: number
	perPage?: number
	search?: string
	status?: string
	dateFrom?: string
	dateTo?: string
}

/**
 * Result type for paginated admin order queries.
 */
export type AdminOrdersResult = {
	orders: Awaited<ReturnType<typeof getOrdersForPage>>
	total: number
	page: number
	perPage: number
	totalPages: number
}

/**
 * Fetches a single page of orders with the given includes (shared between getAdminOrders).
 */
async function getOrdersForPage(where: Prisma.OrderWhereInput, skip: number, take: number) {
	return prisma.order.findMany({
		where,
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
				select: {
					id: true,
					quantity: true,
				},
			},
		},
		orderBy: { createdAt: 'desc' },
		skip,
		take,
	})
}

/**
 * Server-side paginated query for admin orders list.
 * Supports filtering by status, search text (order number / email / user email),
 * and date range (createdAt).
 *
 * @returns Paginated orders with total count and page metadata.
 */
export async function getAdminOrders(
	params: AdminOrdersParams,
): Promise<AdminOrdersResult> {
	const {
		page = 1,
		perPage = 25,
		search = '',
		status = '',
		dateFrom = '',
		dateTo = '',
	} = params

	const where: Prisma.OrderWhereInput = {}

	// Status filter
	if (status && status !== 'all') {
		where.status = status as OrderStatus
	}

	// Search filter across order number, email, and user email
	if (search.trim()) {
		const term = search.trim()
		where.OR = [
			{ orderNumber: { contains: term } },
			{ email: { contains: term } },
			{ user: { email: { contains: term } } },
		]
	}

	// Date range filter on createdAt
	if (dateFrom || dateTo) {
		where.createdAt = {}
		if (dateFrom) {
			// Start of day in UTC
			where.createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`)
		}
		if (dateTo) {
			// End of day in UTC
			where.createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`)
		}
	}

	const safePage = Math.max(1, page)
	const skip = (safePage - 1) * perPage

	const [orders, total] = await Promise.all([
		getOrdersForPage(where, skip, perPage),
		prisma.order.count({ where }),
	])

	return {
		orders,
		total,
		page: safePage,
		perPage,
		totalPages: Math.ceil(total / perPage),
	}
}
