import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, Link } from 'react-router'
import { z } from 'zod'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getOrderByOrderNumber } from '#app/utils/order-queries.server.ts'
import { getOrderStatusLabel } from '#app/utils/order-status.ts'
import { updateOrderStatus, cancelOrder } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$orderNumber.ts'
import { OrderManagementCard } from './__order-management-card.tsx'
import { ShipmentManagementSection } from './__shipment-management-section.tsx'

const StatusUpdateSchema = z.object({
	status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], {
		error: 'Status must be one of: PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED',
	}),
	trackingNumber: z.string({
		error: (issue) =>
			issue.input === undefined ? undefined : 'Tracking number must be a string',
	}).optional(),
})

const CancelOrderSchema = z.object({
	intent: z.literal('cancel', {
		error: 'Invalid intent value',
	}),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params

	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	const currency = await getStoreCurrency()

	return {
		order,
		currency,
	}
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const intent = formData.get('intent')

	// Handle order cancellation
	if (intent === 'cancel') {
		const submission = parseWithZod(formData, {
			schema: CancelOrderSchema,
		})

		if (submission.status !== 'success') {
			return data(
				{ result: submission.reply() },
				{ status: submission.status === 'error' ? 400 : 200 },
			)
		}

		const { orderNumber } = params
		const order = await getOrderByOrderNumber(orderNumber)

		invariantResponse(order, 'Order not found', { status: 404 })

		await cancelOrder(order.id, request)

		return redirectWithToast(`/admin/orders/${orderNumber}`, {
			type: 'success',
			title: 'Order Cancelled',
			description: `Order ${orderNumber} has been cancelled successfully`,
		})
	}

	// Handle status update
	const submission = parseWithZod(formData, {
		schema: StatusUpdateSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { orderNumber } = params
	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	const { status, trackingNumber } = submission.value

	await updateOrderStatus(order.id, status, request, trackingNumber || null)

	const statusLabel = getOrderStatusLabel(status)
	const description = trackingNumber
		? `Order status updated to ${statusLabel} (Tracking: ${trackingNumber})`
		: `Order status updated to ${statusLabel}`

	return redirectWithToast(`/admin/orders/${orderNumber}`, {
		type: 'success',
		title: 'Order Updated',
		description,
	})
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.order) {
		return [{ title: 'Order Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Order ${loaderData.order.orderNumber} | Admin | Epic Shop`,
		},
		{ name: 'description', content: `View and manage order: ${loaderData.order.orderNumber}` },
	]
}

export default function AdminOrderDetail({ loaderData }: Route.ComponentProps) {
	const { order, currency } = loaderData

	return (
		<div className="space-y-6 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						asChild
						variant="ghost"
						size="icon"
						className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-muted"
						aria-label="Back to orders"
					>
						<Link to="/admin/orders">
							<Icon name="arrow-left" className="h-5 w-5" aria-hidden="true" />
						</Link>
					</Button>
					<div>
						<div className="flex items-center gap-4 mb-1">
							<h1 className="text-2xl font-normal tracking-tight text-foreground">
								Order {order.orderNumber}
							</h1>
							<OrderStatusBadge 
								status={order.status}
								className="text-xs font-medium px-2 py-0.5 rounded-lg"
							/>
						</div>
						<p className="text-sm text-muted-foreground">
							Placed on{' '}
							{new Date(order.createdAt).toLocaleDateString('en-US', {
								year: 'numeric',
								month: 'long',
								day: 'numeric',
								hour: '2-digit',
								minute: '2-digit',
							})}
						</p>
					</div>
				</div>
				<Button
					asChild
					variant="outline"
					className="h-9 px-4 rounded-lg transition-all duration-200"
				>
					<Link to="/admin/orders">Back to Orders</Link>
				</Button>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Order Information */}
				<div className="space-y-6">
					{/* Order Details */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<h2 className="text-base font-normal text-foreground">
								Order Information
							</h2>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="grid grid-cols-2 gap-6">
								{/* Customer */}
								<div className="flex items-start gap-3">
									<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0" aria-hidden="true">
										<Icon name="user" className="h-5 w-5 text-muted-foreground" />
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">Customer</label>
										<p className="text-base font-normal text-[var(--text-dark)]">
											{order.user ? (
												<Link
													to={`/admin/users/${order.user.id}`}
													className="hover:underline transition-colors duration-200 text-[var(--text-dark)]"
												>
													{order.user.name || order.user.username}
												</Link>
											) : (
												<span className="text-muted-foreground">Guest</span>
											)}
										</p>
									</div>
								</div>

								{/* Order Number */}
								<div className="flex items-start gap-3">
									<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0" aria-hidden="true">
										<Icon name="file-text" className="h-5 w-5 text-muted-foreground" />
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">Order Number</label>
										<p className="text-base font-normal font-mono text-[var(--text-dark)]">
											{order.orderNumber}
										</p>
									</div>
								</div>

								{/* Email */}
								<div className="flex items-start gap-3">
									<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0" aria-hidden="true">
										<Icon name="envelope-closed" className="h-5 w-5 text-muted-foreground" />
									</div>
									<div className="flex flex-col gap-1 min-w-0">
										<label className="text-sm text-muted-foreground">Email</label>
										<p className="text-base font-normal text-[var(--text-dark)]">{order.email}</p>
									</div>
								</div>

								{/* Phone - Not available in schema, skip for now */}
							</div>
						</CardContent>
					</Card>

					{/* Order Management */}
					<OrderManagementCard order={order} />

					{/* Shipping Address */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">
								Shipping Address
							</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="flex items-start gap-3">
								<div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted flex-shrink-0" aria-hidden="true">
									<Icon name="map-pin" className="h-5 w-5 text-muted-foreground" />
								</div>
								<div className="flex flex-col gap-2">
									<p className="text-base font-normal text-[var(--text-dark)]">
										{order.shippingName}
									</p>
									<p className="text-sm text-[var(--text-medium)]">{order.shippingStreet}</p>
									<p className="text-sm text-[var(--text-medium)]">
										{order.shippingCity}
										{order.shippingState && `, ${order.shippingState}`} {order.shippingPostal}
									</p>
									<p className="text-sm text-[var(--text-medium)]">{order.shippingCountry}</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Order Items and Summary */}
				<div className="space-y-6">
					{/* Order Items */}
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">Order Items</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="space-y-6">
								{/* Items List */}
								<div className="space-y-4">
									{order.items.map((item) => (
										<div key={item.id} className="flex items-start gap-4">
											{item.product.images[0] && (
												<img
													src={`/resources/images?objectKey=${encodeURIComponent(item.product.images[0].objectKey)}`}
													alt={item.product.images[0].altText || item.product.name}
													className="w-16 h-16 object-cover flex-shrink-0 rounded-[10px]"
												/>
											)}
											<div className="flex-1 min-w-0">
												<Link
													to={`/admin/products/${item.product.slug}`}
													className="text-sm font-normal hover:underline transition-colors duration-200 block mb-2 text-[var(--text-dark)]"
												>
													{item.product.name}
												</Link>
												{item.variant && (
													<p className="text-sm mb-2 text-muted-foreground">
														{item.variant.attributeValues
															.map(
																(av) =>
																	`${av.attributeValue.attribute.name}: ${av.attributeValue.value}`,
															)
															.join(', ')}
													</p>
												)}
												<div className="flex items-center justify-between">
													<span className="text-sm text-muted-foreground">
														Qty: {item.quantity}
													</span>
													<span className="text-sm font-normal text-foreground">
														{formatPrice(item.price * item.quantity, currency)}
													</span>
												</div>
											</div>
										</div>
									))}
								</div>

								{/* Divider */}
								<div className="border-t border-border" />

								{/* Order Summary */}
								<div className="space-y-3">
									<h4 className="text-sm font-normal text-foreground">Order Summary</h4>
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<span className="text-sm text-[var(--text-medium)]">Subtotal</span>
											<span className="text-sm font-normal text-[var(--text-dark)]">
												{formatPrice(order.subtotal, currency)}
											</span>
										</div>
										{order.shippingCost !== null && order.shippingCost !== undefined && (
											<div className="flex items-center justify-between">
												<span className="text-sm text-[var(--text-medium)]">Shipping</span>
												<span className="text-sm font-normal text-[var(--text-dark)]">
													{order.shippingCost === 0 ? (
														<span className="text-green-700">Free</span>
													) : (
														formatPrice(order.shippingCost, currency)
													)}
												</span>
											</div>
										)}
										{order.shippingMethodName && (
											<div className="pt-2 border-t border-border space-y-1">
												{order.shippingCarrierName && (
													<div className="text-xs text-[var(--text-medium)]">
														<strong>Carrier:</strong> {order.shippingCarrierName}
													</div>
												)}
												<div className="text-xs text-[var(--text-medium)]">
													<strong>Method:</strong> {order.shippingMethodName}
												</div>
												{order.mondialRelayPickupPointName && (
													<div className="text-xs text-[var(--text-medium)]">
														<strong>Pickup Point:</strong>{' '}
														{order.mondialRelayPickupPointName}
													</div>
												)}
												{order.mondialRelayShipmentNumber && (
													<div className="text-xs text-[var(--text-medium)]">
														<strong>Tracking:</strong> {order.mondialRelayShipmentNumber}
													</div>
												)}
											</div>
										)}

										{/* Shipment Management */}
										<ShipmentManagementSection order={order} />
										<div className="flex items-center justify-between pt-2 border-t border-border">
											<span className="text-base font-normal text-foreground">Total</span>
											<span className="text-lg font-normal text-foreground">
												{formatPrice(order.total, currency)}
											</span>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
			<Icon name="question-mark-circled" className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
			<h2 className="text-xl font-semibold">Order not found</h2>
			<p className="text-muted-foreground text-center">
				The order you're looking for doesn't exist or has been deleted.
			</p>
			<Button asChild>
				<Link to="/admin/orders">
					<Icon name="arrow-left" className="mr-2 h-4 w-4" aria-hidden="true" />
					Back to Orders
				</Link>
			</Button>
		</div>
	)
}

