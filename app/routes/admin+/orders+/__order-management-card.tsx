import { useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
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

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

interface OrderManagementCardProps {
	order: {
		orderNumber: string
		status: OrderStatus
		trackingNumber: string | null
	}
}

export function OrderManagementCard({ order }: OrderManagementCardProps) {
	const statusFetcher = useFetcher()
	const cancelFetcher = useFetcher()

	const [status, setStatus] = useState<OrderStatus>(order.status)
	const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')

	// Re-sync local state when the loader returns fresh order data (e.g. after a mutation).
	useEffect(() => {
		setStatus(order.status)
		setTrackingNumber(order.trackingNumber || '')
	}, [order.status, order.trackingNumber])

	const isUpdating = statusFetcher.state !== 'idle'
	const isCancelling = cancelFetcher.state !== 'idle'
	const showTrackingNumber = status === 'SHIPPED' || status === 'DELIVERED'
	const canCancel = order.status !== 'CANCELLED'

	return (
		<Card className="rounded-[14px]">
			<CardHeader className="pb-6 px-6 pt-6">
				<CardTitle className="text-base font-normal text-foreground">
					Order Management
				</CardTitle>
			</CardHeader>
			<CardContent className="px-6 pb-6">
				<div className="space-y-6">
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
										onValueChange={(value) => setStatus(value as OrderStatus)}
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

					<div className="border-t border-border" />

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
	)
}
