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
import { getReturnRequestById } from './return-queries.server.ts'
import { updateReturnStatus } from './return.server.ts'

/**
 * Processes a refund for a return request — calls Stripe, issues a credit note,
 * updates the return status to REFUNDED, and sends a confirmation email.
 *
 * Idempotency: if the return is already REFUNDED, this is a no-op (safeguard
 * against double-clicks until Stripe idempotency keys land in P2.1).
 *
 * @param returnRequestId - The ID of the ReturnRequest to refund.
 * @param request - Optional request object for domain URL (email links).
 * @returns The Stripe refund ID and credit note number.
 */
export async function processReturnRefund(
	returnRequestId: string,
	request?: Request,
): Promise<{ refundId: string | null; creditNoteNumber: string | null }> {
	const returnRequest = await getReturnRequestById(returnRequestId)

	invariant(returnRequest, 'Return request not found')

	// Idempotency: if already refunded, don't process again
	if (returnRequest.status === 'REFUNDED') {
		return {
			refundId: null,
			creditNoteNumber: null,
		}
	}

	// Validate status transition BEFORE Stripe refund — prevents processing
	// a refund when the return is not in RECEIVED state, which would leave
	// money refunded without the return being marked as REFUNDED.
	if (returnRequest.status !== 'RECEIVED') {
		throw new Response(
			`Invalid status transition: ${returnRequest.status} → REFUNDED`,
			{ status: 400 },
		)
	}

	const order = await prisma.order.findUnique({
		where: { id: returnRequest.orderId },
		select: {
			id: true,
			orderNumber: true,
			email: true,
			stripePaymentIntentId: true,
			stripeChargeId: true,
			shippingName: true,
			shippingStreet: true,
			shippingCity: true,
			shippingPostal: true,
			shippingCountry: true,
			createdAt: true,
		},
	})

	invariant(order, 'Order not found for return request')

	// Compute refund amount from returned items
	let itemRefundCents = 0
	const refundedItems: CreateCreditNoteItem[] = []

	for (const returnItem of returnRequest.items) {
		const oi = returnItem.orderItem
		if (!oi) continue

		const unitPriceCents = oi.price
		const lineRefundCents = unitPriceCents * returnItem.quantity
		itemRefundCents += lineRefundCents

		refundedItems.push({
			description: oi.product?.name ?? `Item ${oi.id}`,
			quantity: returnItem.quantity,
			unitPriceCents,
			totalCents: lineRefundCents,
		})
	}

	// Apply restocking fee if set (reduces the refund)
	const restockingFee = returnRequest.restockingFeeCents ?? 0
	const shippingRefundCents = 0 // Shipping is not refunded for partial returns
	const refundAmountCents = itemRefundCents - restockingFee

	invariant(refundAmountCents > 0, 'Refund amount must be positive')

	// Process Stripe refund
	let refundId: string | null = null
	if (order.stripePaymentIntentId || order.stripeChargeId) {
		try {
			const refundParams: Stripe.RefundCreateParams = {
				amount: refundAmountCents,
				reason: 'requested_by_customer',
				metadata: {
					orderNumber: order.orderNumber,
					returnRequestId: returnRequest.id,
					returnedBy: 'admin',
				},
			}

			if (order.stripePaymentIntentId) {
				refundParams.payment_intent = order.stripePaymentIntentId
			} else if (order.stripeChargeId) {
				refundParams.charge = order.stripeChargeId
			}

			const refund = await stripe.refunds.create(refundParams)
			refundId = refund.id
		} catch (refundError) {
			Sentry.captureException(refundError, {
				tags: { context: 'return-refund-stripe' },
				extra: {
					orderNumber: order.orderNumber,
					returnRequestId: returnRequest.id,
				},
			})
			throw refundError
		}
	}

	// Update return status to REFUNDED
	await updateReturnStatus(
		returnRequestId,
		'REFUNDED',
		null,
		refundAmountCents,
		restockingFee > 0 ? restockingFee : null,
	)

	// Issue credit note
	let creditNoteNumber: string | null = null
	let creditNotePdfBuffer: Buffer | null = null

	try {
		// Find parent invoice for the order
		const parentInvoice = await prisma.invoice.findFirst({
			where: { orderId: order.id, kind: 'INVOICE' },
			orderBy: { createdAt: 'desc' },
		})

		if (parentInvoice && refundedItems.length > 0) {
			// Create credit note via the centralized flow — handles
			// partial/full detection, parent invoice status update,
			// and reason recording automatically.
			const creditNote = await createCreditNote(
				parentInvoice.id,
				refundAmountCents,
				'Return',
				refundedItems,
				shippingRefundCents,
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
		}
	} catch (creditNoteError) {
		// Log credit note error but don't fail refund — the Stripe refund
		// and status update have already succeeded.
		Sentry.captureException(creditNoteError, {
			tags: { context: 'return-refund-credit-note' },
			extra: {
				orderNumber: order.orderNumber,
				returnRequestId: returnRequest.id,
			},
		})
	}

	// Send refund confirmation email (non-blocking)
	try {
		const domainUrl = request
			? getDomainUrl(request)
			: 'http://localhost:3000'

		const restockingLine = restockingFee > 0
			? `<p><strong>Restocking Fee:</strong> €${(restockingFee / 100).toFixed(2)}</p>`
			: ''

		await sendEmail({
			to: order.email,
			subject: `Refund Processed — Order ${order.orderNumber}`,
			html: `
				<h1>Refund Processed</h1>
				<p>A refund has been processed for your return.</p>
				<p><strong>Order Number:</strong> ${order.orderNumber}</p>
				<p><strong>Refund Amount:</strong> €${(refundAmountCents / 100).toFixed(2)}</p>
				${restockingLine}
				${refundId ? `<p><strong>Refund ID:</strong> ${refundId}</p>` : ''}
				${creditNoteNumber ? `<p><strong>Credit Note:</strong> ${creditNoteNumber}</p>` : ''}
				<p>The refund will appear in your account within 5-10 business days.</p>
				<p><a href="${domainUrl}/account/returns/${returnRequest.id}">View Return Details</a></p>
			`,
			text: `
Refund Processed

A refund has been processed for your return.

Order Number: ${order.orderNumber}
Refund Amount: €${(refundAmountCents / 100).toFixed(2)}
${restockingFee > 0 ? `Restocking Fee: €${(restockingFee / 100).toFixed(2)}\n` : ''}
${refundId ? `Refund ID: ${refundId}\n` : ''}
${creditNoteNumber ? `Credit Note: ${creditNoteNumber}\n` : ''}

The refund will appear in your account within 5-10 business days.

View Return Details: ${domainUrl}/account/returns/${returnRequest.id}
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
		// Log email error but don't fail refund
		Sentry.captureException(emailError, {
			tags: { context: 'return-refund-email' },
			extra: {
				orderNumber: order.orderNumber,
				returnRequestId: returnRequest.id,
			},
		})
	}

	return { refundId, creditNoteNumber }
}

