/**
 * Shipment Creation Service
 * 
 * Handles creation of shipments with carriers (e.g., Mondial Relay)
 * after orders are confirmed.
 */

import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { createShipment, type ShipmentRequest } from './carriers/mondial-relay-api2.server.ts'

/**
 * Store address information for shipment creation.
 * In a real application, this would come from settings or configuration.
 */
export interface StoreAddress {
	name: string
	address1: string
	address2?: string
	city: string
	postalCode: string
	country: string // ISO 2-letter code
	phone: string
	email?: string
}

/**
 * Creates a Mondial Relay shipment for an order.
 * 
 * @param orderId - The ID of the order to create a shipment for
 * @param storeAddress - The store/shipper address information
 * @returns The shipment number and label URL
 * @throws Error if order is not found, doesn't have pickup point, or API call fails
 */
export async function createMondialRelayShipment(
	orderId: string,
	storeAddress: StoreAddress,
): Promise<{ shipmentNumber: string; labelUrl: string }> {
	// Load order with items and products
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							weightGrams: true,
						},
					},
					variant: {
						select: {
							id: true,
							weightGrams: true,
						},
					},
				},
			},
		},
	})

	invariant(order, 'Order not found')
	invariant(
		order.mondialRelayPickupPointId,
		'Order does not have a Mondial Relay pickup point',
	)

	// Calculate total weight from order items
	// Use variant weight if available, otherwise product weight, otherwise default
	const DEFAULT_WEIGHT_GRAMS = 500
	let totalWeight = 0

	for (const item of order.items) {
		const itemWeight =
			item.variant?.weightGrams ??
			item.product.weightGrams ??
			DEFAULT_WEIGHT_GRAMS
		totalWeight += itemWeight * item.quantity
	}

	// Ensure minimum weight (Mondial Relay minimum is usually 100g)
	const MIN_WEIGHT_GRAMS = 100
	totalWeight = Math.max(totalWeight, MIN_WEIGHT_GRAMS)

	// Prepare shipment request
	// Combine address1 and address2 for shipper if address2 exists
	const shipperAddress = storeAddress.address2
		? `${storeAddress.address1}, ${storeAddress.address2}`
		: storeAddress.address1

	const shipmentRequest: ShipmentRequest = {
		shipper: {
			name: storeAddress.name,
			address: shipperAddress,
			city: storeAddress.city,
			postalCode: storeAddress.postalCode,
			country: storeAddress.country,
			phone: storeAddress.phone,
			email: storeAddress.email || '',
		},
		recipient: {
			name: order.shippingName,
			address: order.shippingStreet,
			city: order.shippingCity,
			postalCode: order.shippingPostal,
			country: order.shippingCountry,
			phone: '', // Phone not stored in order model currently
			email: order.email,
		},
		pickupPointId: order.mondialRelayPickupPointId,
		weight: totalWeight,
		reference: order.orderNumber,
	}

	try {
		// Create shipment via API2
		const result = await createShipment(shipmentRequest)

		// Update order with shipment information
		await prisma.order.update({
			where: { id: orderId },
			data: {
				mondialRelayShipmentNumber: result.shipmentNumber,
				mondialRelayLabelUrl: result.labelUrl,
			},
		})

		return {
			shipmentNumber: result.shipmentNumber,
			labelUrl: result.labelUrl,
		}
	} catch (error) {
		// Log error to Sentry
		Sentry.captureException(error, {
			tags: { context: 'mondial-relay-shipment-creation' },
			extra: {
				orderId,
				orderNumber: order.orderNumber,
			},
		})

		throw new Error(
			`Failed to create Mondial Relay shipment: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}
}

