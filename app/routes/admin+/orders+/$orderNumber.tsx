import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect, useState } from 'react'
import { data, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { OrderStatusBadge } from '#app/components/order-status-badge.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { getOrderStatusLabel } from '#app/utils/order-status.ts'
import { getOrderByOrderNumber, updateOrderStatus, cancelOrder } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$orderNumber.ts'

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
	const statusFetcher = useFetcher()
	const cancelFetcher = useFetcher()
	const createShipmentFetcher = useFetcher<{
		success?: boolean
		error?: string
		message?: string
		shipmentNumber?: string
	}>()
	const syncTrackingFetcher = useFetcher<{
		success?: boolean
		message?: string
		newStatus?: string
		updated?: boolean
	}>()
	const [status, setStatus] = useState(order.status)
	const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')

	// Sync status state when order data changes
	useEffect(() => {
		setStatus(order.status)
		setTrackingNumber(order.trackingNumber || '')
	}, [order.status, order.trackingNumber])

	const isUpdating = statusFetcher.state !== 'idle'
	const isCancelling = cancelFetcher.state !== 'idle'
	const isCreatingShipment = createShipmentFetcher.state !== 'idle'
	const isSyncingTracking = syncTrackingFetcher.state !== 'idle'
	const shipmentResult = createShipmentFetcher.data
	const syncTrackingResult = syncTrackingFetcher.data
	const showTrackingNumber = status === 'SHIPPED' || status === 'DELIVERED'
	const canCancel = order.status !== 'CANCELLED'
	
	// Show success/error messages for shipment creation
	useEffect(() => {
		if (shipmentResult?.success && shipmentResult.shipmentNumber) {
			// Reload page to show updated order with shipment number
			window.location.reload()
		}
	}, [shipmentResult])

	// Reload page when tracking sync updates status
	useEffect(() => {
		if (syncTrackingResult?.success && syncTrackingResult.updated && syncTrackingResult.newStatus) {
			// Reload page to show updated order status
			window.location.reload()
		}
	}, [syncTrackingResult])

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
					<Card className="rounded-[14px]">
						<CardHeader className="pb-6 px-6 pt-6">
							<CardTitle className="text-base font-normal text-foreground">
								Order Management
							</CardTitle>
						</CardHeader>
						<CardContent className="px-6 pb-6">
							<div className="space-y-6">
								{/* Update Status Section */}
								<div className="space-y-4">
									<h4 className="text-sm font-normal text-foreground">Update Status</h4>
									<div className="space-y-4">
										<statusFetcher.Form method="POST" className="space-y-4">
											<input type="hidden" name="status" value={status} />
											<div className="space-y-2">
												<label
													htmlFor="status-select"
													className="text-sm font-medium flex items-center gap-2 text-foreground"
												>
													Order Status
												</label>
												<Select
													value={status}
													disabled={isUpdating}
													onValueChange={(value) => setStatus(value as typeof status)}
												>
													<SelectTrigger
														id="status-select"
														className="w-full h-10 rounded-lg border bg-input px-3"
														aria-label="Order status"
													>
														<SelectValue placeholder="Select status" />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="PENDING">Pending</SelectItem>
														<SelectItem value="CONFIRMED">Confirmed</SelectItem>
														<SelectItem value="SHIPPED">Shipped</SelectItem>
														<SelectItem value="DELIVERED">Delivered</SelectItem>
														<SelectItem value="CANCELLED">Cancelled</SelectItem>
													</SelectContent>
												</Select>
											</div>
											{showTrackingNumber && (
												<div className="space-y-2">
													<label
														htmlFor="tracking-number"
														className="text-sm font-medium flex items-center gap-2 text-foreground"
													>
														Tracking Number
													</label>
													<Input
														id="tracking-number"
														name="trackingNumber"
														type="text"
														value={trackingNumber}
														onChange={(e) => setTrackingNumber(e.target.value)}
														disabled={isUpdating}
														placeholder="Enter tracking number"
														className="h-10 rounded-lg bg-input"
													/>
												</div>
											)}
											<Button
												type="submit"
												disabled={isUpdating}
												aria-busy={isUpdating}
												className="w-full h-9 rounded-lg font-medium transition-all duration-200 bg-[var(--action-button)] text-[var(--action-button-foreground)] hover:bg-[var(--action-button)]/90"
											>
												{isUpdating ? (
													<>
														<Icon name="update" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
														<span>Updating...</span>
													</>
												) : (
													<span>Update Status</span>
												)}
											</Button>
										</statusFetcher.Form>
									</div>
								</div>

								{/* Divider */}
								<div className="border-t border-border" />

								{/* Cancel Order Section */}
								{canCancel && (
									<div className="space-y-4">
										<div className="flex items-start gap-3">
											<Icon
												name="cross-1"
												className="h-5 w-5 flex-shrink-0 mt-0.5 text-[var(--destructive-accent)]"
												aria-hidden="true"
											/>
											<div className="space-y-1">
												<h4 className="text-sm font-normal text-foreground">Cancel Order</h4>
												<p className="text-sm text-muted-foreground">
													This action cannot be undone. The order will be permanently
													cancelled.
												</p>
											</div>
										</div>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													variant="destructive"
													disabled={isCancelling}
													aria-busy={isCancelling}
													className="w-full h-9 rounded-lg font-medium transition-all duration-200"
												>
													{isCancelling ? (
														<>
															<Icon name="update" className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
															<span>Cancelling...</span>
														</>
													) : (
														<span>Cancel Order</span>
													)}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>Cancel Order?</AlertDialogTitle>
													<AlertDialogDescription>
														Are you sure you want to cancel order {order.orderNumber}? This
														will create a refund for the customer and send them a cancellation
														email. This action cannot be undone.
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel>Keep Order</AlertDialogCancel>
													<cancelFetcher.Form method="POST">
														<input type="hidden" name="intent" value="cancel" />
														<AlertDialogAction
															type="submit"
															disabled={isCancelling}
															className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
														>
															Yes, Cancel Order
														</AlertDialogAction>
													</cancelFetcher.Form>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								)}
							</div>
						</CardContent>
					</Card>

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
														<span className="text-green-600">Free</span>
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
										{order.mondialRelayPickupPointId &&
											order.shippingCarrierName === 'Mondial Relay' && (
												<div className="mt-4 pt-4 border-t border-border">
													<h3 className="text-sm font-medium mb-3">Shipment Management</h3>
													{!order.mondialRelayShipmentNumber ? (
														<div className="space-y-3">
															<createShipmentFetcher.Form
																method="POST"
																action={`/admin/orders/${order.orderNumber}/create-shipment`}
															>
																<Button
																	type="submit"
																	variant="default"
																	size="sm"
																	className="h-9"
																	disabled={isCreatingShipment}
																	aria-busy={isCreatingShipment}
																>
																	{isCreatingShipment ? (
																		<>
																			<Icon
																				name="update"
																				className="h-4 w-4 mr-2 animate-spin"
																			/>
																			Creating...
																		</>
																	) : (
																		<>
																			<Icon name="plus" className="h-4 w-4 mr-2" />
																			Create Shipment
																		</>
																	)}
																</Button>
															</createShipmentFetcher.Form>
															{shipmentResult?.error && (
																<p className="text-sm text-destructive">
																	{shipmentResult.message || shipmentResult.error}
																</p>
															)}
															{shipmentResult?.success && (
																<p className="text-sm text-green-600">
																	{shipmentResult.message}
																</p>
															)}
														</div>
													) : (
														<p className="text-sm text-muted-foreground">
															Shipment created: <strong>{order.mondialRelayShipmentNumber}</strong>
														</p>
													)}
												</div>
											)}

										{/* Tracking Status Sync */}
										{order.mondialRelayShipmentNumber &&
											order.shippingCarrierName === 'Mondial Relay' &&
											order.status !== 'DELIVERED' &&
											order.status !== 'CANCELLED' && (
												<div className="mt-4 pt-4 border-t border-border">
													<h3 className="text-sm font-medium mb-3">Tracking Status</h3>
													<syncTrackingFetcher.Form
														method="POST"
														action={`/admin/orders/${order.orderNumber}/sync-tracking`}
													>
														<Button
															type="submit"
															variant="outline"
															size="sm"
															className="h-9"
															disabled={isSyncingTracking}
															aria-busy={isSyncingTracking}
														>
															{isSyncingTracking ? (
																<>
																	<Icon
																		name="update"
																		className="h-4 w-4 mr-2 animate-spin"
																	/>
																	Syncing...
																</>
															) : (
																<>
																	<Icon name="update" className="h-4 w-4 mr-2" />
																	Sync Tracking Status
																</>
															)}
														</Button>
													</syncTrackingFetcher.Form>
													{syncTrackingResult?.message && (
														<p
															className={`text-sm mt-2 ${
																syncTrackingResult.success && syncTrackingResult.updated
																	? 'text-green-600'
																	: 'text-muted-foreground'
															}`}
														>
															{syncTrackingResult.message}
														</p>
													)}
												</div>
											)}

										{/* Label Management */}
										{(order.mondialRelayShipmentNumber || order.mondialRelayPickupPointId) && (
											<div className="mt-4 pt-4 border-t border-border">
												<h3 className="text-sm font-medium mb-3">Shipping Label</h3>
												<div className="flex gap-2">
													{order.mondialRelayShipmentNumber ? (
														<Button
															asChild
															variant="outline"
															size="sm"
															className="h-9"
														>
															<a
																href={`/admin/orders/${order.orderNumber}/label`}
																target="_blank"
																rel="noopener noreferrer"
															>
																<Icon name="download" className="h-4 w-4 mr-2" />
																Download Label
															</a>
														</Button>
													) : order.mondialRelayPickupPointId ? (
														<Button
															asChild
															variant="default"
															size="sm"
															className="h-9"
														>
															<a
																href={`/admin/orders/${order.orderNumber}/label?create=true`}
																target="_blank"
																rel="noopener noreferrer"
															>
																<Icon name="plus" className="h-4 w-4 mr-2" />
																Create & Download Label
															</a>
														</Button>
													) : null}
												</div>
												{order.mondialRelayLabelUrl && (
													<p className="text-xs text-muted-foreground mt-2">
														Label URL: <a href={order.mondialRelayLabelUrl} target="_blank" rel="noopener noreferrer" className="underline">{order.mondialRelayLabelUrl}</a>
													</p>
												)}
											</div>
										)}
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

