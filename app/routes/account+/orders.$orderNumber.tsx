import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/orders.$orderNumber.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Order Details',
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const { orderNumber } = params
	const userId = await getUserId(request)
	const url = new URL(request.url)
	const email = url.searchParams.get('email')

	// Try to get order by order number
	let order = await getOrderByOrderNumber(orderNumber)

	// If not found, return 404
	invariantResponse(order, 'Order not found', { status: 404 })

	// Authorization check
	if (order.userId) {
		// Order belongs to a user - require authentication
		invariantResponse(userId === order.userId, 'Unauthorized', { status: 403 })
	} else {
		// Guest order - require email verification
		invariantResponse(email, 'Email required to view guest order', { status: 400 })
		invariantResponse(
			email.toLowerCase() === order.email.toLowerCase(),
			'Email does not match order',
			{ status: 403 },
		)
	}

	return { order }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.order) {
		return [{ title: 'Order Not Found | Account | Epic Shop' }]
	}
	return [{ title: `Order ${loaderData.order.orderNumber} | Account | Epic Shop` }]
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
	const { order } = loaderData

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Order {order.orderNumber}</h1>
					<p className="text-gray-600">
						Order Number: <span className="font-semibold">{order.orderNumber}</span>
					</p>
				</div>
				<div className="flex items-center gap-4">
					<OrderStatusBadge status={order.status} className="text-sm" />
					<Button variant="outline" asChild>
						<Link to="/account/orders">
							<Icon name="arrow-left" className="h-4 w-4 mr-2" />
							Back to Orders
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* Order Items */}
				<Card>
					<CardHeader>
						<h2>Items</h2>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{order.items.map((item) => (
								<div key={item.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
									{item.product.images[0] && (
										<img
											src={`/resources/images?objectKey=${encodeURIComponent(item.product.images[0].objectKey)}`}
											alt={item.product.images[0].altText || item.product.name}
											className="w-16 h-16 object-cover rounded"
										/>
									)}
									<div className="flex-1">
										<h2 className="font-semibold">{item.product.name}</h2>
										{item.variant && (
											<p className="text-sm text-gray-500">
												{item.variant.attributeValues
													.map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
													.join(', ')}
											</p>
										)}
										<p className="text-sm text-gray-500">
											Quantity: {item.quantity}
										</p>
									</div>
									<div className="text-right">
										<p className="font-semibold">{formatPrice(item.price)}</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Order Summary */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<h2>Order Summary</h2>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between">
								<span className="text-gray-500">Subtotal</span>
								<span>{formatPrice(order.subtotal)}</span>
							</div>
							<div className="border-t pt-4 flex justify-between text-lg font-bold">
								<span>Total</span>
								<span>{formatPrice(order.total)}</span>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<h2>Shipping Address</h2>
						</CardHeader>
						<CardContent>
							<p className="font-semibold">{order.shippingName}</p>
							<p className="text-gray-500">{order.shippingStreet}</p>
							<p className="text-gray-500">
								{order.shippingCity}
								{order.shippingState && `, ${order.shippingState}`} {order.shippingPostal}
							</p>
							<p className="text-gray-500">{order.shippingCountry}</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<h2>Order Information</h2>
						</CardHeader>
						<CardContent className="space-y-2">
							<div>
								<p className="text-sm text-gray-500">Order Date</p>
								<p>
									{new Date(order.createdAt).toLocaleDateString('en-US', {
										year: 'numeric',
										month: 'long',
										day: 'numeric',
										hour: '2-digit',
										minute: '2-digit',
									})}
								</p>
							</div>
							<div>
								<p className="text-sm text-gray-500">Email</p>
								<p>{order.email}</p>
							</div>
							{order.trackingNumber && (
								<div>
									<p className="text-sm text-gray-500">Tracking Number</p>
									<p className="font-mono font-semibold">{order.trackingNumber}</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="flex gap-4">
				<Button variant="outline" asChild>
					<Link to="/account/orders">Back to Orders</Link>
				</Button>
				<Button asChild>
					<Link to="/shop">Continue Shopping</Link>
				</Button>
			</div>
		</div>
	)
}
