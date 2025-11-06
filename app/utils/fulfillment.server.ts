/**
 * Order Fulfillment Service
 * 
 * Handles post-order creation tasks such as:
 * - Creating shipments with carriers
 * - Sending fulfillment emails
 * - Updating order status
 */

import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { createMondialRelayShipment, type StoreAddress } from './shipment.server.ts'

/**
 * Fulfills an order by creating shipments and performing other fulfillment tasks.
 * This is called after an order is successfully created and paid.
 * 
 * @param orderId - The ID of the order to fulfill
 * @param storeAddress - The store/shipper address information
 * @returns Promise that resolves when fulfillment is complete
 */
export async function fulfillOrder(
	orderId: string,
	storeAddress: StoreAddress,
): Promise<void> {
	// Load order to check if it needs shipment creation
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			mondialRelayPickupPointId: true,
			mondialRelayShipmentNumber: true,
			shippingCarrierName: true,
		},
	})

	if (!order) {
		// Order not found - log but don't throw (idempotent)
		Sentry.captureMessage(`Order ${orderId} not found during fulfillment`, {
			level: 'warning',
			tags: { context: 'order-fulfillment' },
		})
		return
	}

	// Check if order needs Mondial Relay shipment creation
	const needsMondialRelayShipment =
		order.mondialRelayPickupPointId &&
		!order.mondialRelayShipmentNumber &&
		order.shippingCarrierName === 'Mondial Relay'

	if (needsMondialRelayShipment) {
		try {
			await createMondialRelayShipment(order.id, storeAddress)
			// Shipment creation updates the order with shipment number and label URL
		} catch (error) {
			// Log error but don't fail fulfillment
			// Admin can manually create shipment later if needed
			Sentry.captureException(error, {
				tags: { context: 'order-fulfillment-shipment' },
				extra: {
					orderId: order.id,
					orderNumber: order.orderNumber,
				},
			})
			// Continue with other fulfillment tasks even if shipment creation fails
		}
	}

	// Future: Add other fulfillment tasks here:
	// - Send fulfillment confirmation email
	// - Update inventory systems
	// - Trigger warehouse notifications
	// - etc.
}

