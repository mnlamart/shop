/**
 * Tracking Service
 * 
 * Handles tracking information retrieval for shipments (e.g., Mondial Relay)
 */

import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { getTrackingInfo } from './carriers/mondial-relay-api1.server.ts'

/**
 * Gets tracking information for a Mondial Relay shipment.
 * 
 * @param orderId - The ID of the order to get tracking info for
 * @returns Tracking information including status and events
 * @throws Error if order is not found, doesn't have shipment number, or API call fails
 */
export async function getMondialRelayTrackingInfo(orderId: string) {
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
		// Get tracking info via API1
		const trackingInfo = await getTrackingInfo(order.mondialRelayShipmentNumber)

		return trackingInfo
	} catch (error) {
		// Log error to Sentry
		Sentry.captureException(error, {
			tags: { context: 'mondial-relay-tracking' },
			extra: {
				orderId,
				orderNumber: order.orderNumber,
				shipmentNumber: order.mondialRelayShipmentNumber,
			},
		})

		throw new Error(
			`Failed to get tracking info: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}
}

