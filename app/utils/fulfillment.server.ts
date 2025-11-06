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
import { sendShippingConfirmationEmail } from './shipping-email.server.tsx'

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
			email: true,
			shippingName: true,
			mondialRelayPickupPointId: true,
			mondialRelayPickupPointName: true,
			mondialRelayShipmentNumber: true,
			shippingCarrierName: true,
			status: true,
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
			const shipmentResult = await createMondialRelayShipment(order.id, storeAddress)
			// Shipment creation updates the order with shipment number and label URL

			// Update order status to SHIPPED
			await prisma.order.update({
				where: { id: order.id },
				data: { status: 'SHIPPED' },
			})

			// Send shipping confirmation email (non-blocking)
			try {
				await sendShippingConfirmationEmail(
					{
						orderNumber: order.orderNumber,
						customerName: order.shippingName,
						carrierName: order.shippingCarrierName || 'Mondial Relay',
						shipmentNumber: shipmentResult.shipmentNumber,
						pickupPointName: order.mondialRelayPickupPointName || undefined,
						trackingUrl: undefined, // Could be added if Mondial Relay provides tracking URL
					},
					order.email,
				)
			} catch (emailError) {
				// Log email error but don't fail fulfillment
				Sentry.captureException(emailError, {
					tags: { context: 'order-fulfillment-email' },
					extra: {
						orderId: order.id,
						orderNumber: order.orderNumber,
					},
				})
			}
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
	// - Update inventory systems
	// - Trigger warehouse notifications
	// - etc.
}

