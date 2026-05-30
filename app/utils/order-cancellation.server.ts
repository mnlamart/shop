import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import type Stripe from 'stripe'
import { prisma } from './db.server.ts'
import { sendEmail } from './email.server.ts'
import { getDomainUrl } from './misc.tsx'
import { stripe } from './stripe.server.ts'
import {
	createCreditNote,
	generateCreditNotePdf,
	type CreateCreditNoteItem,
} from './credit-note.server.ts'

/**
 * Cancels an order and creates a Stripe refund (admin only).
 * @param orderId - The ID of the order to cancel
 * @param request - Optional request object for getting domain URL (for email links)
 */
export async function cancelOrder(
	orderId: string,
	request?: Request,
	refundAmountCents?: number,
): Promise<void> {
	const order = await prisma.order.findUnique({
		where: { id: orderId },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			status: true,
			stripePaymentIntentId: true,
			stripeChargeId: true,
			total: true,
			subtotal: true,
			shippingCost: true,
			shippingName: true,
			shippingStreet: true,
			shippingCity: true,
			shippingPostal: true,
			shippingCountry: true,
			createdAt: true,
			items: {
				include: {
					product: { select: { name: true } },
					variant: {
						select: { id: true, sku: true },
					},
				},
			},
			invoices: {
				where: { kind: 'INVOICE' },
				take: 1,
				orderBy: { createdAt: 'desc' },
			},
		},
	})

	invariant(order, 'Order not found')
	invariant(order.status !== 'CANCELLED', 'Order is already cancelled')

	// Create refund via Stripe if payment was processed
	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundAmount = refundAmountCents ?? order.total
			const refundParams: Stripe.RefundCreateParams = {
				amount: refundAmount,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					cancelledBy: 'admin',
				},
			}

			// Use payment_intent if available, otherwise use charge
			if (order.stripePaymentIntentId) {
				refundParams.payment_intent = order.stripePaymentIntentId
			} else if (order.stripeChargeId) {
				refundParams.charge = order.stripeChargeId
			}

			const refund = await stripe.refunds.create(refundParams)
			refundId = refund.id
		} catch (refundError) {
			// Log refund error but don't fail order cancellation
			// Admin can manually process refund if needed
			Sentry.captureException(refundError, {
				tags: { context: 'order-cancellation-refund' },
				extra: { orderNumber: order.orderNumber },
			})
			// Still proceed with order cancellation
		}
	}

	// Update order status to CANCELLED
	await prisma.order.update({
		where: { id: orderId },
		data: { status: 'CANCELLED' },
	})

	// Send cancellation email with credit note PDF if available (non-blocking)
	try {
		const domainUrl = request ? getDomainUrl(request) : 'http://localhost:3000'

		// Attempt to generate credit note PDF for email attachment
		let creditNotePdfBuffer: Buffer | null = null
		let creditNoteNumber: string | null = null

		const parentInvoice = order.invoices[0]
		if (parentInvoice && order.items.length > 0) {
			try {
				// Build refunded line items from order items
				const refundedItems: CreateCreditNoteItem[] = order.items.map(
					(oi) => ({
						description:
							oi.variant?.sku ?? oi.product.name,
						quantity: oi.quantity,
						unitPriceCents: oi.price,
						totalCents: oi.price * oi.quantity,
					}),
				)

				const refundedShippingCents = order.shippingCost ?? 0
				const refundAmount = refundAmountCents ?? order.total

				// Create credit note via the centralized flow — handles
				// partial/full detection, parent invoice status update,
				// and reason recording automatically.
				const creditNote = await createCreditNote(
					parentInvoice.id,
					refundAmount,
					'Cancellation',
					refundedItems,
					refundedShippingCents,
				)

				creditNoteNumber = creditNote.number

				// Generate PDF via the centralized credit note PDF pipeline
				creditNotePdfBuffer = await generateCreditNotePdf(
					creditNote.id,
					order.orderNumber,
					order.createdAt,
					{
						name: order.shippingName,
						email: order.email,
						street: order.shippingStreet,
						city: order.shippingCity,
						postal: order.shippingPostal,
						country: order.shippingCountry,
					},
				)
			} catch (creditNoteError) {
				// Log credit note error but don't fail cancellation
				Sentry.captureException(creditNoteError, {
					tags: { context: 'order-cancellation-credit-note' },
					extra: { orderNumber: order.orderNumber },
				})
			}
		}

		await sendEmail({
			to: order.email,
			subject: `Order Cancelled - ${order.orderNumber}`,
			html: `
				<h1>Order Cancelled</h1>
				<p>Your order has been cancelled.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				${refundId ? `<p><strong>Refund ID:</strong> ${refundId}</p>` : ''}
				${creditNoteNumber ? `<p><strong>Credit Note:</strong> ${creditNoteNumber}</p>` : ''}
				<p>${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}</p>
				<p><a href="${domainUrl}/shop/orders/${order.orderNumber}">View Order Details</a></p>
			`,
			text: `
Order Cancelled

Your order has been cancelled.

Order Number: ${order.orderNumber}
${refundId ? `Refund ID: ${refundId}` : ''}
${creditNoteNumber ? `Credit Note: ${creditNoteNumber}` : ''}
${refundId ? 'A refund has been processed and will appear in your account within 5-10 business days.' : 'If you have already been charged, please contact support for a refund.'}

View Order Details: ${domainUrl}/shop/orders/${order.orderNumber}
			`,
			...(creditNotePdfBuffer
				? {
						attachments: [
							{
								content: creditNotePdfBuffer,
								filename: `Avoir-${creditNoteNumber ?? 'credit-note'}.pdf`,
							},
						],
					}
				: {}),
		})
	} catch (emailError) {
		// Log email error but don't fail cancellation
		Sentry.captureException(emailError, {
			tags: { context: 'order-cancellation-email' },
			extra: { orderNumber: order.orderNumber },
		})
	}
}

