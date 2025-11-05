import { invariantResponse } from '@epic-web/invariant'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/$orderNumber.ts'

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
		return [{ title: 'Order Not Found | Shop | Epic Shop' }]
	}
	return [{ title: `Order ${loaderData.order.orderNumber} | Shop | Epic Shop` }]
}

export default function OrderDetail({ loaderData }: Route.ComponentProps) {
	const { order } = loaderData

	return (
		<div className="container mx-auto px-4 py-8 space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Order Details</h1>
					<p className="text-muted-foreground">
						Order Number: <span className="font-semibold">{order.orderNumber}</span>
					</p>
				</div>
				<OrderStatusBadge status={order.status} className="text-sm" />
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
											<p className="text-sm text-muted-foreground">
												{item.variant.attributeValues
													.map((av) => `${av.attributeValue.attribute.name}: ${av.attributeValue.value}`)
													.join(', ')}
											</p>
										)}
										<p className="text-sm text-muted-foreground">
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
								<span className="text-muted-foreground">Subtotal</span>
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
							<p className="text-muted-foreground">{order.shippingStreet}</p>
							<p className="text-muted-foreground">
								{order.shippingCity}
								{order.shippingState && `, ${order.shippingState}`} {order.shippingPostal}
							</p>
							<p className="text-muted-foreground">{order.shippingCountry}</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<h2>Order Information</h2>
						</CardHeader>
						<CardContent className="space-y-2">
							<div>
								<p className="text-sm text-muted-foreground">Order Date</p>
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
								<p className="text-sm text-muted-foreground">Email</p>
								<p>{order.email}</p>
							</div>
							{order.trackingNumber && (
								<div>
									<p className="text-sm text-muted-foreground">Tracking Number</p>
									<p className="font-mono font-semibold">{order.trackingNumber}</p>
								</div>
							)}
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="flex gap-4">
				<Button variant="outline" asChild>
					<a href="/shop/orders">Back to Orders</a>
				</Button>
				<Button asChild>
					<a href="/shop">Continue Shopping</a>
				</Button>
			</div>
		</div>
	)
}

