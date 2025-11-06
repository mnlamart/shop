/**
 * Admin Action: Create Shipment for Order
 * 
 * Allows admins to manually create a shipment for an order
 * when automatic fulfillment failed or was skipped.
 */

import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { createMondialRelayShipment, type StoreAddress } from '#app/utils/shipment.server.ts'
import { sendShippingConfirmationEmail } from '#app/utils/shipping-email.server.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/$orderNumber.create-shipment.ts'

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

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params
	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	// Validate that order can have a shipment created
	if (!order.mondialRelayPickupPointId) {
		return data(
			{
				error: 'Order does not have a Mondial Relay pickup point',
				message: 'This order does not have a pickup point selected. Shipment cannot be created.',
			},
			{ status: 400 },
		)
	}

	if (order.mondialRelayShipmentNumber) {
		return data(
			{
				error: 'Shipment already exists',
				message: `This order already has a shipment: ${order.mondialRelayShipmentNumber}`,
			},
			{ status: 400 },
		)
	}

	if (order.shippingCarrierName !== 'Mondial Relay') {
		return data(
			{
				error: 'Invalid carrier',
				message: `This order uses ${order.shippingCarrierName}, not Mondial Relay. Shipment creation is only supported for Mondial Relay orders.`,
			},
			{ status: 400 },
		)
	}

	try {
		const storeAddress = getStoreAddress()
		const shipmentResult = await createMondialRelayShipment(order.id, storeAddress)

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
					trackingUrl: undefined,
				},
				order.email,
				request,
			)
		} catch (emailError) {
			// Log email error but don't fail shipment creation
			console.error('Failed to send shipping confirmation email:', emailError)
		}

		return data({
			success: true,
			message: `Shipment created successfully: ${shipmentResult.shipmentNumber}`,
			shipmentNumber: shipmentResult.shipmentNumber,
			labelUrl: shipmentResult.labelUrl,
		})
	} catch (error) {
		console.error('Failed to create shipment:', error)
		return data(
			{
				error: 'Failed to create shipment',
				message:
					error instanceof Error
						? error.message
						: 'An unknown error occurred while creating the shipment',
			},
			{ status: 500 },
		)
	}
}

