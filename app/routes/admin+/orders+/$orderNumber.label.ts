import { invariantResponse } from '@epic-web/invariant'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getMondialRelayLabel, createMondialRelayShipmentAndLabel } from '#app/utils/label.server.ts'
import { type StoreAddress } from '#app/utils/shipment.server.ts'
import { type Route } from './+types/$orderNumber.label.ts'

/**
 * Gets store address from environment variables or settings.
 * In a real application, this would come from settings/configuration.
 */
function getStoreAddress(): StoreAddress {
	return {
		name: process.env.STORE_NAME || 'Store',
		address1: process.env.STORE_ADDRESS1 || '',
		address2: process.env.STORE_ADDRESS2,
		city: process.env.STORE_CITY || '',
		postalCode: process.env.STORE_POSTAL_CODE || '',
		country: process.env.STORE_COUNTRY || 'FR',
		phone: process.env.STORE_PHONE || '',
		email: process.env.STORE_EMAIL,
	}
}

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params
	const url = new URL(request.url)
	const create = url.searchParams.get('create') === 'true'

	const order = await getOrderByOrderNumber(orderNumber)
	invariantResponse(order, 'Order not found', { status: 404 })

	try {
		let labelBlob: Blob

		if (create && !order.mondialRelayShipmentNumber) {
			// Create shipment and label if order doesn't have shipment yet
			if (!order.mondialRelayPickupPointId) {
				return new Response(
					JSON.stringify({ error: 'Order does not have a Mondial Relay pickup point' }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}

			const storeAddress = getStoreAddress()
			labelBlob = await createMondialRelayShipmentAndLabel(order.id, storeAddress)
		} else {
			// Get existing label
			if (!order.mondialRelayShipmentNumber) {
				return new Response(
					JSON.stringify({ error: 'Order does not have a Mondial Relay shipment' }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' },
					},
				)
			}

			labelBlob = await getMondialRelayLabel(order.id)
		}

		// Return PDF as response
		return new Response(labelBlob, {
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="label-${order.orderNumber}.pdf"`,
			},
		})
	} catch (error) {
		console.error('Error retrieving label:', error)
		return new Response(
			JSON.stringify({
				error: 'Failed to retrieve label',
				message: error instanceof Error ? error.message : 'Unknown error',
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		)
	}
}

