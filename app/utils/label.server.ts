/**
 * Label Management Service
 * 
 * Handles shipping label retrieval and generation for Mondial Relay shipments
 */

import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { getLabel } from './carriers/mondial-relay-api2.server.ts'
import { createMondialRelayShipment, type StoreAddress } from './shipment.server.ts'

/**
 * Gets the shipping label for a Mondial Relay shipment.
 * 
 * @param orderId - The ID of the order to get the label for
 * @returns The label as a Blob (PDF)
 * @throws Error if order is not found, doesn't have shipment number, or API call fails
 */
export async function getMondialRelayLabel(orderId: string): Promise<Blob> {
	// Load order
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			mondialRelayShipmentNumber: true,
		},
	})

	invariant(order, 'Order not found')
	invariant(
		order.mondialRelayShipmentNumber,
		'Order does not have a Mondial Relay shipment number',
	)

	try {
		// Get label via API2
		const labelBlob = await getLabel(order.mondialRelayShipmentNumber)

		return labelBlob
	} catch (error) {
		// Log error to Sentry
		Sentry.captureException(error, {
			tags: { context: 'mondial-relay-label-retrieval' },
			extra: {
				orderId,
				orderNumber: order.orderNumber,
				shipmentNumber: order.mondialRelayShipmentNumber,
			},
		})

		throw new Error(
			`Failed to retrieve label: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}
}

/**
 * Creates a shipment and retrieves the label for an order.
 * This is useful when an order needs a label but doesn't have a shipment yet.
 * 
 * @param orderId - The ID of the order
 * @param storeAddress - The store/shipper address information
 * @returns The label as a Blob (PDF)
 * @throws Error if order is not found, doesn't have pickup point, or API calls fail
 */
export async function createMondialRelayShipmentAndLabel(
	orderId: string,
	storeAddress: StoreAddress,
): Promise<Blob> {
	// Create shipment first
	const shipmentResult = await createMondialRelayShipment(orderId, storeAddress)

	// Then get the label
	const labelBlob = await getLabel(shipmentResult.shipmentNumber)

	return labelBlob
}

