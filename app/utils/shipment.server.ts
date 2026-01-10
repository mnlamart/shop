/**
 * Shipment Creation Service
 * 
 * Handles creation of shipments with carriers (e.g., Mondial Relay)
 * after orders are confirmed.
 */

import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { createShipment, type ShipmentRequest } from './carriers/mondial-relay-api2.server.ts'
import { searchPickupPoints } from './carriers/mondial-relay-api1.server.ts'
import { prisma } from './db.server.ts'

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

	// Ensure minimum weight (Mondial Relay minimum is 15g, but we'll use 100g as safe minimum)
	// Also ensure weight is a valid integer
	const MIN_WEIGHT_GRAMS = 100
	const MAX_WEIGHT_GRAMS = 30000 // 30kg max for most Mondial Relay services
	totalWeight = Math.max(Math.min(Math.round(totalWeight), MAX_WEIGHT_GRAMS), MIN_WEIGHT_GRAMS)

	// For Point Relais delivery, we need to look up the pickup point details
	// The recipient address should be the pickup point address, not the customer's home address
	let pickupPointAddress = order.shippingStreet
	let pickupPointCity = order.shippingCity
	let pickupPointPostalCode = order.shippingPostal
	let pickupPointCountry = order.shippingCountry

	if (order.mondialRelayPickupPointId) {
		try {
			// Look up the pickup point details using the ID
			// We'll search by the customer's postal code to find nearby points, then find the matching ID
			const pickupPoints = await searchPickupPoints({
				postalCode: order.shippingPostal,
				country: order.shippingCountry,
				city: order.shippingCity,
				maxResults: 50, // Get more results to find our pickup point
			})

			const selectedPickupPoint = pickupPoints.find(
				(point) => point.id === order.mondialRelayPickupPointId,
			)

			if (selectedPickupPoint) {
				// Use pickup point address for recipient
				pickupPointAddress = selectedPickupPoint.address
				pickupPointCity = selectedPickupPoint.city
				pickupPointPostalCode = selectedPickupPoint.postalCode
				pickupPointCountry = selectedPickupPoint.country
				console.log('[Shipment] Found pickup point details:', {
					id: selectedPickupPoint.id,
					address: selectedPickupPoint.address,
					city: selectedPickupPoint.city,
					postalCode: selectedPickupPoint.postalCode,
				})
			} else {
				console.warn(
					`[Shipment] Pickup point ${order.mondialRelayPickupPointId} not found in search results. Using customer address as fallback.`,
				)
			}
		} catch (error) {
			console.error('[Shipment] Error looking up pickup point details:', error)
			// Fallback to customer address if lookup fails
		}
	}

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
			// For Point Relais: recipient name is customer (so they can pick it up), but address is pickup point
			name: order.shippingName,
			address: pickupPointAddress,
			city: pickupPointCity,
			postalCode: pickupPointPostalCode,
			country: pickupPointCountry,
			phone: '', // Phone not stored in order model currently
			email: order.email,
		},
		pickupPointId: order.mondialRelayPickupPointId,
		pickupPointCountry: pickupPointCountry, // Country code for the pickup point (required for DeliveryMode Location)
		weight: totalWeight,
		reference: order.orderNumber,
		value: order.total, // Order total in cents
	}

	try {
		console.log('[Shipment] Creating Mondial Relay shipment for order:', order.orderNumber)
		console.log('[Shipment] Request details:', {
			pickupPointId: order.mondialRelayPickupPointId,
			weight: totalWeight,
			shipper: { name: storeAddress.name, city: storeAddress.city, postalCode: storeAddress.postalCode },
			recipient: { name: order.shippingName, city: order.shippingCity, postalCode: order.shippingPostal },
		})

		// Create shipment via API2
		const result = await createShipment(shipmentRequest)

		console.log('[Shipment] API response:', {
			shipmentNumber: result.shipmentNumber,
			labelUrl: result.labelUrl,
			statusCode: result.statusCode,
			statusMessage: result.statusMessage,
		})

		// Update order with shipment information
		await prisma.order.update({
			where: { id: orderId },
			data: {
				mondialRelayShipmentNumber: result.shipmentNumber,
				mondialRelayLabelUrl: result.labelUrl,
			},
		})

		console.log('[Shipment] Order updated with shipment number:', result.shipmentNumber)

		return {
			shipmentNumber: result.shipmentNumber,
			labelUrl: result.labelUrl,
		}
	} catch (error) {
		console.error('[Shipment] Error creating Mondial Relay shipment:', error)
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

