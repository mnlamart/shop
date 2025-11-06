/**
 * Tracking Status Sync Service
 * 
 * Automatically updates order status based on tracking information.
 * Checks tracking status and updates order to DELIVERED when package is delivered.
 */

import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { updateOrderStatus } from './order.server.ts'
import { getMondialRelayTrackingInfo } from './tracking.server.ts'

/**
 * Checks if a tracking status indicates the package has been delivered.
 * 
 * @param status - The tracking status description
 * @param statusCode - The tracking status code
 * @param events - Array of tracking events
 * @returns true if the package appears to be delivered
 */
function isDelivered(
	status: string,
	statusCode: string,
	events: Array<{ date: Date; description: string; location?: string }>,
): boolean {
	// Check status description for delivery keywords
	const statusLower = status.toLowerCase()
	if (
		statusLower.includes('livré') ||
		statusLower.includes('delivered') ||
		statusLower.includes('distribué') ||
		statusLower.includes('remis')
	) {
		return true
	}

	// Check events for delivery-related descriptions
	const hasDeliveryEvent = events.some((event) => {
		const descLower = event.description.toLowerCase()
		return (
			descLower.includes('livré') ||
			descLower.includes('delivered') ||
			descLower.includes('distribué') ||
			descLower.includes('remis') ||
			descLower.includes('retiré') ||
			descLower.includes('collected')
		)
	})

	return hasDeliveryEvent
}

/**
 * Syncs order status from tracking information.
 * Updates order to DELIVERED if tracking indicates delivery.
 * 
 * @param orderId - The ID of the order to sync
 * @param request - Optional request object for email links
 * @returns Object indicating if status was updated and the new status
 */
export async function syncOrderStatusFromTracking(
	orderId: string,
	request?: Request,
): Promise<{ updated: boolean; newStatus?: string; message: string }> {
	try {
		// Load order
		const order = await prisma.order.findUnique({
			where: { id: orderId },
			select: {
				id: true,
				orderNumber: true,
				status: true,
				mondialRelayShipmentNumber: true,
				shippingCarrierName: true,
			},
		})

		if (!order) {
			return {
				updated: false,
				message: 'Order not found',
			}
		}

		// Only sync Mondial Relay orders with shipment numbers
		if (
			order.shippingCarrierName !== 'Mondial Relay' ||
			!order.mondialRelayShipmentNumber
		) {
			return {
				updated: false,
				message: 'Order does not have Mondial Relay tracking',
			}
		}

		// Skip if already delivered or cancelled
		if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
			return {
				updated: false,
				message: `Order is already ${order.status}`,
			}
		}

		// Get tracking information
		const trackingInfo = await getMondialRelayTrackingInfo(order.id)

		// Check if delivered
		const delivered = isDelivered(
			trackingInfo.status,
			trackingInfo.statusCode,
			trackingInfo.events,
		)

		if (!delivered) {
			return {
				updated: false,
				message: `Package not yet delivered. Status: ${trackingInfo.status}`,
			}
		}

		// Update order status to DELIVERED
		await updateOrderStatus(order.id, 'DELIVERED', request)

		return {
			updated: true,
			newStatus: 'DELIVERED',
			message: `Order status updated to DELIVERED based on tracking information`,
		}
	} catch (error) {
		// Log error but don't throw - allow caller to handle
		Sentry.captureException(error, {
			tags: { context: 'tracking-status-sync' },
			extra: { orderId },
		})

		return {
			updated: false,
			message:
				error instanceof Error
					? `Failed to sync tracking status: ${error.message}`
					: 'Failed to sync tracking status: Unknown error',
		}
	}
}

/**
 * Syncs tracking status for multiple orders.
 * Useful for batch processing or scheduled jobs.
 * 
 * @param orderIds - Array of order IDs to sync
 * @param request - Optional request object for email links
 * @returns Summary of sync results
 */
export async function syncMultipleOrdersFromTracking(
	orderIds: string[],
	request?: Request,
): Promise<{
	total: number
	updated: number
	failed: number
	skipped: number
	results: Array<{ orderId: string; updated: boolean; message: string }>
}> {
	const results = await Promise.allSettled(
		orderIds.map(async (orderId) => {
			const result = await syncOrderStatusFromTracking(orderId, request)
			return { orderId, ...result }
		}),
	)

	const summary = {
		total: orderIds.length,
		updated: 0,
		failed: 0,
		skipped: 0,
		results: [] as Array<{ orderId: string; updated: boolean; message: string }>,
	}

	for (const result of results) {
		if (result.status === 'fulfilled') {
			summary.results.push(result.value)
			if (result.value.updated) {
				summary.updated++
			} else if (result.value.message.includes('not yet delivered')) {
				summary.skipped++
			} else {
				summary.skipped++
			}
		} else {
			summary.failed++
			summary.results.push({
				orderId: 'unknown',
				updated: false,
				message: result.reason?.message || 'Unknown error',
			})
		}
	}

	return summary
}

