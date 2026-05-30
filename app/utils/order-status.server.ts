import { type OrderStatus } from '@prisma/client'
import * as Sentry from '@sentry/react-router'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'

/**
 * Updates an order status (admin only) and sends email notification.
 * @param orderId - The ID of the order to update
 * @param status - The new status
 * @param request - Optional request object for getting domain URL (for email links)
 * @param trackingNumber - Optional tracking number (required when status is SHIPPED)
 */
export async function updateOrderStatus(
	orderId: string,
	status: OrderStatus,
	request?: Request,
	trackingNumber?: string | null,
): Promise<void> {
	// Update order status and tracking number
	const order = await prisma.order.update({
		where: { id: orderId },
		data: {
			status,
			// Always update trackingNumber when status is SHIPPED (even if it's empty string/null)
			...(status === 'SHIPPED'
				? { trackingNumber: trackingNumber ?? '' }
				: {}),
		},
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			trackingNumber: true,
		},
	})

	// Send status update email (non-blocking - don't fail status update if email fails)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'
		const statusLabel = getStatusLabel(status)
		
		let emailBody = `
			<h1>Order Status Update</h1>
			<p>Your order status has been updated.</p>
			<p><strong>Order Number:</strong> ${order.orderNumber}</p>
			<p><strong>New Status:</strong> ${statusLabel}</p>
		`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			emailBody += `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>`
		}
		
		emailBody += `<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>`
		
		let textBody = `
Order Status Update

Your order status has been updated.

Order Number: ${order.orderNumber}
New Status: ${statusLabel}
`
		
		if (status === 'SHIPPED' && order.trackingNumber) {
			textBody += `Tracking Number: ${order.trackingNumber}\n`
		}
		
		textBody += `View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}`
		
		await sendEmail({
			to: order.email,
			subject: `Order Status Update - ${order.orderNumber}`,
			html: emailBody,
			text: textBody,
		})
	} catch (emailError) {
		// Log email error but don't fail status update
		// Status was successfully updated, email is secondary
		Sentry.captureException(emailError, {
			tags: { context: 'order-status-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

/**
 * Gets a human-readable label for order status.
 */
function getStatusLabel(status: OrderStatus): string {
	switch (status) {
		case 'PENDING':
			return 'Pending'
		case 'CONFIRMED':
			return 'Confirmed'
		case 'SHIPPED':
			return 'Shipped'
		case 'DELIVERED':
			return 'Delivered'
		case 'CANCELLED':
			return 'Cancelled'
		default:
			return status
	}
}

