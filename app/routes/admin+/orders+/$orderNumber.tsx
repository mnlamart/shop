import { invariantResponse } from '@epic-web/invariant'
import { parseWithZod } from '@conform-to/zod/v4'
import { useEffect, useState } from 'react'
import { data, Link, redirect, useFetcher } from 'react-router'
import { z } from 'zod'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
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
import { getOrderByOrderNumber, updateOrderStatus } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$orderNumber.ts'

const StatusUpdateSchema = z.object({
	status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
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

	const { status } = submission.value

	await updateOrderStatus(order.id, status, request)

	return redirect(`/admin/orders/${orderNumber}`)
}

export const meta: Route.MetaFunction = ({ data }) => {
	if (!data?.order) {
		return [{ title: 'Order Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Order ${data.order.orderNumber} | Admin | Epic Shop`,
		},
		{ name: 'description', content: `View and manage order: ${data.order.orderNumber}` },
	]
}

function getStatusBadgeVariant(status: string) {
	switch (status) {
		case 'PENDING':
			return 'warning'
		case 'CONFIRMED':
			return 'default'
		case 'SHIPPED':
			return 'secondary'
		case 'DELIVERED':
			return 'success'
		case 'CANCELLED':
			return 'destructive'
		default:
			return 'secondary'
	}
}

function getStatusLabel(status: string) {
	switch (status) {
		case 'PENDING':
			return 'Pending'
		case 'CONFIRMED':
			return 'Confirmed'
		case 'SHIPPED':
			return 'Shipped'
		case 'DELIVERED':
			return 'Delivered'
		case 'CANCELLED':
			return 'Cancelled'
		default:
			return status
	}
}

export default function AdminOrderDetail({ loaderData }: Route.ComponentProps) {
	const { order, currency } = loaderData
	const statusFetcher = useFetcher()
	const [status, setStatus] = useState(order.status)

	// Sync status state when order data changes
	useEffect(() => {
		setStatus(order.status)
	}, [order.status])

	const isUpdating = statusFetcher.state !== 'idle'

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-2">
						<h1 className="text-3xl font-bold tracking-tight">Order {order.orderNumber}</h1>
						<Badge variant={getStatusBadgeVariant(order.status)} className="text-sm">
							{getStatusLabel(order.status)}
						</Badge>
					</div>
					<p className="text-muted-foreground">
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
				<div className="flex items-center space-x-3">
					<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
						<Link to="/admin/orders">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back to Orders
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Order Information */}
				<div className="space-y-8">
					{/* Order Details */}
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Order Information</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Order Number
								</label>
								<p className="text-lg font-medium mt-1 font-mono">{order.orderNumber}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Customer</label>
								<p className="text-lg mt-1">
									{order.user ? (
										<Link
											to={`/admin/users/${order.user.id}`}
											className="text-primary hover:underline transition-colors duration-200"
										>
											{order.user.name || order.user.username}
										</Link>
									) : (
										<span className="text-muted-foreground">Guest</span>
									)}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Email</label>
								<p className="text-lg mt-1">{order.email}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Payment Status
								</label>
								<div className="mt-1">
									<Badge variant="success" className="text-sm">
										Paid
									</Badge>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Status Update */}
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Update Status</CardTitle>
						</CardHeader>
						<CardContent>
							<statusFetcher.Form method="POST" className="space-y-4">
								<input type="hidden" name="status" value={status} />
								<div>
									<label
										htmlFor="status-select"
										className="text-sm font-medium text-muted-foreground block mb-2"
									>
										Order Status
									</label>
									<Select
										value={status}
										disabled={isUpdating}
										onValueChange={(value) => setStatus(value as typeof status)}
									>
										<SelectTrigger id="status-select" className="w-full">
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
								<Button
									type="submit"
									disabled={isUpdating}
									className="w-full transition-all duration-200 hover:shadow-sm"
								>
									{isUpdating ? (
										<>
											<Icon name="update" className="mr-2 h-4 w-4 animate-spin" />
											Updating...
										</>
									) : (
										<>
											<Icon name="check" className="mr-2 h-4 w-4" />
											Update Status
										</>
									)}
								</Button>
							</statusFetcher.Form>
						</CardContent>
					</Card>

					{/* Shipping Address */}
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Shipping Address</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2">
							<p className="font-semibold">{order.shippingName}</p>
							<p className="text-muted-foreground">{order.shippingStreet}</p>
							<p className="text-muted-foreground">
								{order.shippingCity}
								{order.shippingState && `, ${order.shippingState}`} {order.shippingPostal}
							</p>
							<p className="text-muted-foreground">{order.shippingCountry}</p>
						</CardContent>
					</Card>
				</div>

				{/* Order Items and Summary */}
				<div className="space-y-8">
					{/* Order Items */}
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Order Items</CardTitle>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Product</TableHead>
										<TableHead className="text-right">Quantity</TableHead>
										<TableHead className="text-right">Price</TableHead>
										<TableHead className="text-right">Total</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{order.items.map((item) => (
										<TableRow key={item.id}>
											<TableCell>
												<div className="flex items-center gap-4">
													{item.product.images[0] && (
														<img
															src={`/resources/images?objectKey=${encodeURIComponent(item.product.images[0].objectKey)}`}
															alt={item.product.images[0].altText || item.product.name}
															className="w-12 h-12 object-cover rounded"
														/>
													)}
													<div>
														<Link
															to={`/admin/products/${item.product.slug}`}
															className="font-medium text-primary hover:underline transition-colors duration-200"
														>
															{item.product.name}
														</Link>
														{item.variant && (
															<p className="text-sm text-muted-foreground">
																{item.variant.attributeValues
																	.map(
																		(av) =>
																			`${av.attributeValue.attribute.name}: ${av.attributeValue.value}`,
																	)
																	.join(', ')}
															</p>
														)}
													</div>
												</div>
											</TableCell>
											<TableCell className="text-right">{item.quantity}</TableCell>
											<TableCell className="text-right">
												{formatPrice(item.price, currency)}
											</TableCell>
											<TableCell className="text-right font-semibold">
												{formatPrice(item.price * item.quantity, currency)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>

					{/* Order Summary */}
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<CardTitle className="text-xl">Order Summary</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Subtotal</span>
								<span className="font-medium">{formatPrice(order.subtotal, currency)}</span>
							</div>
							<div className="border-t pt-4 flex justify-between text-lg font-bold">
								<span>Total</span>
								<span>{formatPrice(order.total, currency)}</span>
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
			<Icon name="question-mark-circled" className="h-12 w-12 text-muted-foreground" />
			<h2 className="text-xl font-semibold">Order not found</h2>
			<p className="text-muted-foreground text-center">
				The order you're looking for doesn't exist or has been deleted.
			</p>
			<Button asChild>
				<Link to="/admin/orders">
					<Icon name="arrow-left" className="mr-2 h-4 w-4" />
					Back to Orders
				</Link>
			</Button>
		</div>
	)
}

