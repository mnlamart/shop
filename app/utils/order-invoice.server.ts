import { type Prisma } from '@prisma/client'
import { generateInvoiceNumber, parseInvoiceNumber, formatInvoiceNumber } from './invoice.server.ts'

/**
 * Creates an Invoice record for an order within a transaction.
 * Generates a sequential fiscal-year invoice number using the existing transaction
 * and snapshots the order's financial data (subtotal, total, VAT breakdown) into
 * the Invoice record. The invoice is created in DRAFT status.
 *
 * Idempotent: if an invoice already exists for this order, returns the existing one.
 * Must be called within a Prisma transaction.
 *
 * @param tx - The Prisma transaction client
 * @param orderId - The ID of the order to invoice
 * @param subtotalCents - Order subtotal in cents
 * @param totalCents - Order total in cents
 * @param vatCalculation - VAT calculation result from tax.server.ts
 * @returns The created or existing invoice
 */
export async function createInvoiceForOrder(
	tx: Prisma.TransactionClient,
	orderId: string,
	subtotalCents: number,
	totalCents: number,
	vatCalculation: { breakdown: Array<{ kind: string; rate: number; baseCents: number; vatCents: number }>; totalVatCents: number; taxCountry: string | null },
): Promise<{ id: string; invoiceNumber: string }> {
	// Idempotency check — if an invoice already exists for this order, return it
	const existingInvoice = await tx.invoice.findFirst({
		where: { orderId, kind: 'INVOICE' },
		select: { id: true, fiscalYear: true, sequence: true },
	})
	if (existingInvoice) {
		const num = formatInvoiceNumber(existingInvoice.fiscalYear, existingInvoice.sequence)
		return { id: existingInvoice.id, invoiceNumber: num }
	}

	// Determine fiscal year from current date
	const fiscalYear = new Date().getFullYear()

	// Generate invoice number within the transaction
	const invoiceNumber = await generateInvoiceNumber(fiscalYear, tx)

	// Extract sequence from the generated number
	const parsed = parseInvoiceNumber(invoiceNumber)
	if (!parsed) {
		throw new Error(`Invalid generated invoice number: ${invoiceNumber}`)
	}

	// Build VAT breakdown from the vatCalculation result (snapshot at invoice time)
	const vatBreakdown = vatCalculation.breakdown.map((line) => ({
		kind: line.kind,
		rate: line.rate,
		baseCents: line.baseCents,
		vatCents: line.vatCents,
	}))

	const invoice = await tx.invoice.create({
		data: {
			fiscalYear,
			sequence: parsed.sequence,
			kind: 'INVOICE',
			orderId,
			subtotalCents,
			totalCents,
			vatBreakdown,
			vatTotalCents: vatCalculation.totalVatCents,
			status: 'DRAFT',
		},
	})

	return { id: invoice.id, invoiceNumber }
}

