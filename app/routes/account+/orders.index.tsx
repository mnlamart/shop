import { Link, data } from 'react-router'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getUserOrders } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/orders.index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	// Require authentication for account orders page
	const userId = await requireUserId(request)
	const orders = await getUserOrders(userId)
	return { orders }
}

// No action needed - this page is for authenticated users only
// Guest order lookup is handled at /shop/orders
export async function action(_args: Route.ActionArgs) {
	// This should not be called for authenticated users
	return data({}, { status: 405 })
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order History | Account | Epic Shop' },
]

export default function OrderHistory({ loaderData }: Route.ComponentProps) {
	const { orders } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Order History</h1>
					<p className="text-gray-600">
						View and track your orders ({orders.length} total)
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Account
					</Link>
				</Button>
			</div>

			{orders.length === 0 ? (
				<Card className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
					<CardContent className="py-12 text-center">
						<Icon name="package" className="h-12 w-12 mx-auto mb-4 text-gray-500" />
						<p className="text-lg text-gray-900 mb-2">
							You haven't placed any orders yet.
						</p>
						<p className="text-sm text-gray-500 mb-4">
							Start shopping to see your orders here
						</p>
						<Button asChild>
							<Link to="/shop">Start Shopping</Link>
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-4">
					{orders.map((order) => (
						<Card key={order.id} className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
							<CardContent className="p-0">
								<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
											<Link
												to={`/account/orders/${order.orderNumber}`}
												className="font-semibold text-lg text-gray-900 hover:text-primary hover:underline"
											>
												{order.orderNumber}
											</Link>
											<OrderStatusBadge status={order.status} />
										</div>
										<p className="text-sm text-gray-500">
											{new Date(order.createdAt).toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'long',
												day: 'numeric',
											})}
										</p>
										{order.items.length > 0 && (
											<p className="text-sm text-gray-500 mt-1">
												{order.items.length} item{order.items.length !== 1 ? 's' : ''}
											</p>
										)}
									</div>
									<div className="text-right">
										<p className="text-xl font-bold text-gray-900">
											{formatPrice(order.total)}
										</p>
										<Button variant="outline" size="sm" asChild className="mt-2">
											<Link to={`/account/orders/${order.orderNumber}`}>
												View Details
											</Link>
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	)
}
