/**
 * Admin Action: Sync Order Status from Tracking
 * 
 * Allows admins to manually sync order status from tracking information.
 * Useful when automatic sync hasn't run or to check current tracking status.
 */

import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { getOrderByOrderNumber } from '#app/utils/order.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { syncOrderStatusFromTracking } from '#app/utils/tracking-status.server.ts'
import { type Route } from './+types/$orderNumber.sync-tracking.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const { orderNumber } = params
	const order = await getOrderByOrderNumber(orderNumber)

	invariantResponse(order, 'Order not found', { status: 404 })

	// Sync tracking status
	const result = await syncOrderStatusFromTracking(order.id, request)

	return data({
		success: result.updated,
		message: result.message,
		newStatus: result.newStatus,
		updated: result.updated,
	})
}

