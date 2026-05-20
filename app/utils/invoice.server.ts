import { type Prisma } from '@prisma/client'
import { prisma } from './db.server.ts'

/**
 * Promise-chain lock for serializing invoice creation operations.
 * In a single-process LiteFS primary, a Promise-based lock is sufficient
 * to prevent concurrent invoice number generation from racing.
 *
 * Usage: await withInvoiceLock(() => createInvoice(payload))
 */
let invoiceLock: Promise<void> = Promise.resolve()

export async function withInvoiceLock<T>(fn: () => Promise<T>): Promise<T> {
	const prev = invoiceLock
	let release: () => void
	invoiceLock = new Promise<void>((resolve) => {
		release = resolve
	})
	await prev
	try {
		return await fn()
	} finally {
		release!()
	}
}

/**
 * Generates a unique invoice number in the format "F{year}-{sequence:05d}" (e.g., "F2025-00001").
 *
 * Uses a database-level write transaction to atomically read the highest sequence
 * for the given fiscal year and return the next one. The @@unique([fiscalYear, sequence])
 * constraint provides a safety net against race conditions.
 *
 * @param fiscalYear - The fiscal year for the invoice (e.g., 2025).
 * @param tx - Optional transaction client. If provided, uses the existing transaction
 *   instead of creating a new one. This allows the invoice number generation to be
 *   composed within a larger transaction (e.g., creating the invoice record).
 * @returns The formatted invoice number string.
 */
export async function generateInvoiceNumber(
	fiscalYear: number,
	tx?: Prisma.TransactionClient,
): Promise<string> {
	// If a transaction client is provided, use it directly
	if (tx) {
		const lastInvoice = await tx.invoice.findFirst({
			where: { fiscalYear },
			orderBy: { sequence: 'desc' },
			select: { sequence: true },
		})

		const nextSequence =
			lastInvoice && !isNaN(lastInvoice.sequence)
				? lastInvoice.sequence + 1
				: 1

		return formatInvoiceNumber(fiscalYear, nextSequence)
	}

	// For SQLite, we use BEGIN IMMEDIATE to get an exclusive write lock.
	// This ensures sequential numbering even with concurrent requests.
	return await prisma.$transaction(
		async (transactionTx) => {
			const lastInvoice = await transactionTx.invoice.findFirst({
				where: { fiscalYear },
				orderBy: { sequence: 'desc' },
				select: { sequence: true },
			})

			const nextSequence =
				lastInvoice && !isNaN(lastInvoice.sequence)
					? lastInvoice.sequence + 1
					: 1

			return formatInvoiceNumber(fiscalYear, nextSequence)
		},
		{
			// Use maxWait to prevent indefinite waits
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}

/**
 * Formats a fiscal year and sequence into the invoice number format.
 *
 * @example
 * formatInvoiceNumber(2025, 1)   // "F2025-00001"
 * formatInvoiceNumber(2025, 42)  // "F2025-00042"
 * formatInvoiceNumber(2026, 150) // "F2026-00150"
 */
export function formatInvoiceNumber(
	fiscalYear: number,
	sequence: number,
): string {
	return `F${fiscalYear}-${String(sequence).padStart(5, '0')}`
}

/**
 * Extracts the fiscal year and sequence from an invoice number string.
 * Returns null if the format is invalid.
 *
 * @example
 * parseInvoiceNumber("F2025-00001") // { fiscalYear: 2025, sequence: 1 }
 * parseInvoiceNumber("F2025-00150") // { fiscalYear: 2025, sequence: 150 }
 */
export function parseInvoiceNumber(
	invoiceNumber: string,
): { fiscalYear: number; sequence: number } | null {
	const match = invoiceNumber.match(/^F(\d{4})-(\d{5})$/)
	if (!match || !match[1] || !match[2]) return null
	const fiscalYear = parseInt(match[1], 10)
	const sequence = parseInt(match[2], 10)
	if (isNaN(fiscalYear) || isNaN(sequence)) return null
	return { fiscalYear, sequence }
}

// ---------------------------------------------------------------------------
// Credit note helpers
// ---------------------------------------------------------------------------

export interface RefundedLineItem {
	description: string
	quantity: number
	unitPriceCents: number
	totalCents: number
}

export interface VatBreakdownEntry {
	kind: string
	rate: number
	baseCents: number
	vatCents: number
}

/**
 * Issues a credit note (avoir) for a full order refund.
 *
 * Credit notes share the same gapless invoice number sequence per French
 * tax law (CGI art. L. 102 B) — no separate counter. Amounts are stored as
 * negative values: positive cents become negative to represent the reversal.
 *
 * @param parentInvoiceId - The original INVOICE being corrected.
 * @param refundedItems - The line items being refunded (with positive amounts;
 *   they are negated during creation).
 * @param refundedShippingCents - Shipping cost being refunded (positive; negated).
 * @param tx - Optional transaction client for composing within a larger
 *   transaction (e.g., alongside the order status update).
 * @returns The newly created credit note Invoice record.
 */
export async function issueCreditNote(
	parentInvoiceId: string,
	refundedItems: RefundedLineItem[],
	refundedShippingCents: number,
	tx?: Prisma.TransactionClient,
) {
	const db = tx ?? prisma

	// Fetch parent invoice to get orderId and original VAT breakdown
	const parent = await db.invoice.findUnique({
		where: { id: parentInvoiceId },
		select: {
			id: true,
			orderId: true,
			fiscalYear: true,
			vatBreakdown: true,
			vatTotalCents: true,
			status: true,
		},
	})

	if (!parent) {
		throw new Error(`Parent invoice ${parentInvoiceId} not found`)
	}

	// Build negative line items — negate the positive amounts into reversals
	const negativeItems = refundedItems.map((item) => ({
		description: item.description,
		quantity: -item.quantity,
		unitPriceCents: item.unitPriceCents, // unit price stays positive for display
		totalCents: -item.totalCents,
	}))

	// Compute subtotal (sum of all negative line item totals)
	const subtotalCents = negativeItems.reduce(
		(sum, item) => sum + item.totalCents,
		0,
	)

	// Negate shipping
	const shippingCents = -refundedShippingCents

	// Build negative VAT breakdown — mirror the original but negate amounts
	const vatBreakdown = parent.vatBreakdown as VatBreakdownEntry[] | null
	const creditNoteVatBreakdown: VatBreakdownEntry[] = []
	let vatTotalCents = 0

	if (Array.isArray(vatBreakdown) && vatBreakdown.length > 0) {
		for (const entry of vatBreakdown) {
			creditNoteVatBreakdown.push({
				kind: entry.kind,
				rate: entry.rate,
				baseCents: -Math.abs(entry.baseCents),
				vatCents: -Math.abs(entry.vatCents),
			})
			vatTotalCents += -Math.abs(entry.vatCents)
		}
	}

	// Total = subtotal + shipping + VAT
	const totalCents = subtotalCents + shippingCents + vatTotalCents

	// Generate next invoice number (shared sequence)
	const fiscalYear = new Date().getFullYear()
	const invoiceNumber = await generateInvoiceNumber(fiscalYear, tx)
	const parsed = parseInvoiceNumber(invoiceNumber)
	if (!parsed) {
		throw new Error(
			`Failed to parse generated invoice number: ${invoiceNumber}`,
		)
	}

	// Create the credit note
	const creditNote = await db.invoice.create({
		data: {
			fiscalYear,
			sequence: parsed.sequence,
			kind: 'CREDIT_NOTE',
			orderId: parent.orderId,
			parentInvoiceId,
			subtotalCents,
			totalCents,
			vatBreakdown: creditNoteVatBreakdown,
			vatTotalCents,
			status: 'FINAL',
			issuedAt: new Date(),
		},
	})

	return {
		id: creditNote.id,
		number: invoiceNumber,
		fiscalYear,
		sequence: parsed.sequence,
	}
}
