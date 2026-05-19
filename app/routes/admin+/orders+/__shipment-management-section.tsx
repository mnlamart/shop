import { useEffect } from 'react'
import { useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

interface ShipmentManagementSectionProps {
	order: {
		orderNumber: string
		status: string
		shippingCarrierName: string | null
		mondialRelayPickupPointId: string | null
		mondialRelayShipmentNumber: string | null
		mondialRelayLabelUrl: string | null
	}
}

export function ShipmentManagementSection({ order }: ShipmentManagementSectionProps) {
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

	const isCreatingShipment = createShipmentFetcher.state !== 'idle'
	const isSyncingTracking = syncTrackingFetcher.state !== 'idle'
	const shipmentResult = createShipmentFetcher.data
	const syncTrackingResult = syncTrackingFetcher.data

	// Reload when a new shipment is created so the page reflects the new shipmentNumber.
	useEffect(() => {
		if (shipmentResult?.success && shipmentResult.shipmentNumber) {
			window.location.reload()
		}
	}, [shipmentResult])

	// Reload when tracking sync changes the order status.
	useEffect(() => {
		if (syncTrackingResult?.success && syncTrackingResult.updated && syncTrackingResult.newStatus) {
			window.location.reload()
		}
	}, [syncTrackingResult])

	const isMondialRelay = order.shippingCarrierName === 'Mondial Relay'
	const showCreateShipment = order.mondialRelayPickupPointId && isMondialRelay
	const showTrackingSync =
		order.mondialRelayShipmentNumber &&
		isMondialRelay &&
		order.status !== 'DELIVERED' &&
		order.status !== 'CANCELLED'
	const showLabelManagement = order.mondialRelayShipmentNumber || order.mondialRelayPickupPointId

	return (
		<>
			{showCreateShipment && (
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
											<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
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
								<p className="text-sm text-green-700">{shipmentResult.message}</p>
							)}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							Shipment created: <strong>{order.mondialRelayShipmentNumber}</strong>
						</p>
					)}
				</div>
			)}

			{showTrackingSync && (
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
									<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
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
									? 'text-green-700'
									: 'text-muted-foreground'
							}`}
						>
							{syncTrackingResult.message}
						</p>
					)}
				</div>
			)}

			{showLabelManagement && (
				<div className="mt-4 pt-4 border-t border-border">
					<h3 className="text-sm font-medium mb-3">Shipping Label</h3>
					<div className="flex gap-2">
						{order.mondialRelayShipmentNumber ? (
							<Button asChild variant="outline" size="sm" className="h-9">
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
							<Button asChild variant="default" size="sm" className="h-9">
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
							Label URL:{' '}
							<a
								href={order.mondialRelayLabelUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="underline"
							>
								{order.mondialRelayLabelUrl}
							</a>
						</p>
					)}
				</div>
			)}
		</>
	)
}
