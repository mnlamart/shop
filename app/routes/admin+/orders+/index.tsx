import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all orders for client-side filtering
	const orders = await prisma.order.findMany({
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
	})

	// Get currency for price formatting
	const currency = await getStoreCurrency()

	return {
		orders,
		currency,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Orders | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all orders' },
]

function StatusBadge({ status }: { status: string }) {
	const statusConfig: Record<
		string,
		{ label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }
	> = {
		PENDING: { label: 'Pending', variant: 'warning' },
		CONFIRMED: { label: 'Confirmed', variant: 'default' },
		SHIPPED: { label: 'Shipped', variant: 'secondary' },
		DELIVERED: { label: 'Delivered', variant: 'success' },
		CANCELLED: { label: 'Cancelled', variant: 'destructive' },
	}

	const config = statusConfig[status] || { label: status, variant: 'default' }

	return (
		<Badge variant={config.variant} className="capitalize">
			{config.label}
		</Badge>
	)
}

const ITEMS_PER_PAGE = 25

export default function OrdersList({ loaderData }: Route.ComponentProps) {
	const { orders, currency } = loaderData

	// State for search and filtering
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)

	// Filter orders based on search and filter criteria
	const filteredOrders = useMemo(() => {
		let filtered = orders

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(order) =>
					order.orderNumber.toLowerCase().includes(search) ||
					order.email.toLowerCase().includes(search) ||
					(order.user?.email && order.user.email.toLowerCase().includes(search)),
			)
		}

		// Apply status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter((order) => order.status === statusFilter)
		}

		return filtered
	}, [orders, searchTerm, statusFilter])

	// Pagination calculations
	const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedOrders = filteredOrders.slice(startIndex, endIndex)

	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, statusFilter])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Orders</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage all orders ({orders.length} total)
						{searchTerm.trim() || statusFilter !== 'all'
							? ` • ${filteredOrders.length} shown`
							: ''}
					</p>
				</div>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder="Search orders by order number or email..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Filter by status">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="PENDING">Pending</SelectItem>
							<SelectItem value="CONFIRMED">Confirmed</SelectItem>
							<SelectItem value="SHIPPED">Shipped</SelectItem>
							<SelectItem value="DELIVERED">Delivered</SelectItem>
							<SelectItem value="CANCELLED">Cancelled</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Order Number</TableHead>
						<TableHead className="hidden md:table-cell">Customer</TableHead>
						<TableHead className="hidden md:table-cell">Email</TableHead>
						<TableHead className="hidden lg:table-cell">Items</TableHead>
						<TableHead>Total</TableHead>
						<TableHead className="hidden md:table-cell">Date</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredOrders.length === 0 ? (
						<TableRow>
							<TableCell colSpan={8} className="text-center py-8">
								{searchTerm.trim() || statusFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No orders match your search criteria.</p>
										<p className="text-sm">Try adjusting your search or filters.</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon name="archive" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No orders found.</p>
										<p className="text-sm">You haven't received any orders yet.</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						paginatedOrders.map((order) => {
							const itemCount = order.items.reduce(
								(sum, item) => sum + item.quantity,
								0,
							)

							return (
								<TableRow
									key={order.id}
									className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
								>
									<TableCell>
										<Link
											to={`/admin/orders/${order.orderNumber}`}
											className="font-medium text-primary hover:underline transition-colors duration-200"
											aria-label={`View order ${order.orderNumber}`}
										>
											{order.orderNumber}
										</Link>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{order.user?.name || order.shippingName || 'Guest'}
										</span>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">{order.email}</span>
									</TableCell>
									<TableCell className="hidden lg:table-cell">
										<span className="text-muted-foreground">{itemCount} items</span>
									</TableCell>
									<TableCell>
										<span className="font-medium">
											{formatPrice(order.total, currency)}
										</span>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{new Date(order.createdAt).toLocaleDateString()}
										</span>
									</TableCell>
									<TableCell>
										<StatusBadge status={order.status} />
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button variant="ghost" size="sm" asChild>
												<Link to={`/admin/orders/${order.orderNumber}`} aria-label={`View order ${order.orderNumber}`}>
													<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
												</Link>
											</Button>
										</div>
									</TableCell>
								</TableRow>
							)
						})
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {startIndex + 1} to {Math.min(endIndex, filteredOrders.length)} of{' '}
						{filteredOrders.length} orders
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						>
							<Icon name="arrow-left" className="h-4 w-4" />
							Previous
						</Button>
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(page) =>
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1,
								)
								.map((page, index, arr) => (
									<div key={page} className="flex items-center gap-1">
										{index > 0 && arr[index - 1] !== page - 1 && (
											<span className="px-2 text-muted-foreground">...</span>
										)}
										<Button
											variant={currentPage === page ? 'default' : 'outline'}
											size="sm"
											onClick={() => setCurrentPage(page)}
											className="min-w-[2.5rem]"
										>
											{page}
										</Button>
									</div>
								))}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === totalPages}
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
						>
							Next
							<Icon name="arrow-right" className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="lock-closed" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}






