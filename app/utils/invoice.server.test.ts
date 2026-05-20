import { describe, expect, test, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	generateInvoiceNumber,
	formatInvoiceNumber,
	parseInvoiceNumber,
	withInvoiceLock,
	issueCreditNote,
	type RefundedLineItem,
} from './invoice.server.ts'
import { generateOrderNumber } from './order-number.server.ts'

/**
 * Creates a test order and returns it. Orders are required for Invoice FK.
 */
async function createTestOrder(
	id: string,
	overrides: Record<string, unknown> = {},
) {
	const orderNumber = await generateOrderNumber()
	return prisma.order.create({
		data: {
			id,
			orderNumber,
			email: 'test@example.com',
			subtotal: 1000,
			total: 1200,
			shippingName: 'Test User',
			shippingStreet: '123 Test St',
			shippingCity: 'Test City',
			shippingPostal: '12345',
			shippingCountry: 'US',
			stripeCheckoutSessionId: `cs_test_${id}`,
			...overrides,
		} as never,
	})
}

/**
 * Creates order items linked to a given order.
 */
async function createTestOrderItems(orderId: string, items: Array<{
	productId: string
	price: number
	quantity: number
}>) {
	for (const item of items) {
		await prisma.orderItem.create({
			data: {
				orderId,
				productId: item.productId,
				price: item.price,
				quantity: item.quantity,
			},
		})
	}
}

/**
 * Creates a test product.
 */
async function createTestProduct(id: string, name: string) {
	return prisma.product.create({
		data: {
			id,
			name,
			description: `${name} description`,
			price: 1000,
			stockQuantity: 100,
			slug: `test-${id}`,
			taxKind: 'STANDARD',
		} as never,
	})
}

/**
 * Creates a test invoice linked to a given order.
 */
async function createTestInvoice(
	fiscalYear: number,
	sequence: number,
	orderId: string,
	overrides: Record<string, unknown> = {},
) {
	return prisma.invoice.create({
		data: {
			fiscalYear,
			sequence,
			kind: 'INVOICE',
			orderId,
			subtotalCents: 1000,
			totalCents: 1200,
			...overrides,
		} as never,
	})
}

afterEach(async () => {
	await prisma.invoice.deleteMany({})
	await prisma.orderItem.deleteMany({})
	await prisma.order.deleteMany({})
	await prisma.product.deleteMany({})
})

// ---------------------------------------------------------------------------
// Existing tests (preserved from original)
// ---------------------------------------------------------------------------

describe('formatInvoiceNumber', () => {
	test('should format fiscal year 2025 sequence 1', () => {
		expect(formatInvoiceNumber(2025, 1)).toBe('F2025-00001')
	})

	test('should format fiscal year 2025 sequence 42', () => {
		expect(formatInvoiceNumber(2025, 42)).toBe('F2025-00042')
	})

	test('should format fiscal year 2026 sequence 150', () => {
		expect(formatInvoiceNumber(2026, 150)).toBe('F2026-00150')
	})

	test('should format sequence 99999 as padded', () => {
		expect(formatInvoiceNumber(2025, 99999)).toBe('F2025-99999')
	})

	test('should format 6-digit sequence (overflow of 5-digit padding)', () => {
		expect(formatInvoiceNumber(2025, 100000)).toBe('F2025-100000')
	})
})

describe('parseInvoiceNumber', () => {
	test('should parse valid invoice number', () => {
		expect(parseInvoiceNumber('F2025-00001')).toEqual({
			fiscalYear: 2025,
			sequence: 1,
		})
	})

	test('should parse with larger sequence', () => {
		expect(parseInvoiceNumber('F2025-00150')).toEqual({
			fiscalYear: 2025,
			sequence: 150,
		})
	})

	test('should parse F2026-00042', () => {
		expect(parseInvoiceNumber('F2026-00042')).toEqual({
			fiscalYear: 2026,
			sequence: 42,
		})
	})

	test('should return null for non-matching format', () => {
		expect(parseInvoiceNumber('INV-00001')).toBeNull()
		expect(parseInvoiceNumber('F25-00001')).toBeNull()
		expect(parseInvoiceNumber('F2025-001')).toBeNull()
		expect(parseInvoiceNumber('F2025-000001')).toBeNull()
		expect(parseInvoiceNumber('')).toBeNull()
		expect(parseInvoiceNumber('F20250-00001')).toBeNull()
	})

	test('should return null for empty string', () => {
		expect(parseInvoiceNumber('')).toBeNull()
	})
})

describe('generateInvoiceNumber', () => {
	test('should generate invoice number in correct format', async () => {
		const invoiceNumber = await generateInvoiceNumber(2025)

		expect(invoiceNumber).toMatch(/^F\d{4}-\d{5}$/)
	})

	test('should start from F{year}-00001 when no invoices exist for that year', async () => {
		const invoiceNumber = await generateInvoiceNumber(2025)

		expect(invoiceNumber).toBe('F2025-00001')
	})

	test('should generate sequential invoice numbers within same fiscal year', async () => {
		const order1 = await createTestOrder('order-seq-1')
		const order2 = await createTestOrder('order-seq-2')

		const num1 = await generateInvoiceNumber(2025)
		await createTestInvoice(2025, 1, order1.id)

		const num2 = await generateInvoiceNumber(2025)
		await createTestInvoice(2025, 2, order2.id)

		const num3 = await generateInvoiceNumber(2025)

		expect(num1).toBe('F2025-00001')
		expect(num2).toBe('F2025-00002')
		expect(num3).toBe('F2025-00003')
	})

	test('should generate independent sequences for different fiscal years', async () => {
		const order2024 = await createTestOrder('order-2024')

		// Create invoice in 2024
		await createTestInvoice(2024, 1, order2024.id)

		// First invoice of 2025 should start at 1, not 2
		const num2025 = await generateInvoiceNumber(2025)
		expect(num2025).toBe('F2025-00001')

		// Second invoice of 2024 should be 2 (independent of 2025)
		const num2024_v2 = await generateInvoiceNumber(2024)
		expect(num2024_v2).toBe('F2024-00002')
	})

	test('should be unique across consecutive calls', async () => {
		const numbers: string[] = []
		for (let i = 0; i < 5; i++) {
			const order = await createTestOrder(`order-seq5-${i}`)
			const num = await generateInvoiceNumber(2025)
			numbers.push(num)
			const parsed = parseInvoiceNumber(num)
			await createTestInvoice(2025, parsed!.sequence, order.id, {
				subtotalCents: 1000 * (i + 1),
				totalCents: 1200 * (i + 1),
			})
		}

		const uniqueNumbers = new Set(numbers)
		expect(uniqueNumbers.size).toBe(5)

		// Verify sequential
		numbers.forEach((num, idx) => {
			expect(num).toBe(`F2025-${String(idx + 1).padStart(5, '0')}`)
		})
	})

	test('should work within an explicit transaction', async () => {
		const order = await createTestOrder('order-tx')

		const result = await prisma.$transaction(async (tx) => {
			const num = await generateInvoiceNumber(2025, tx)

			// Create the invoice within the same transaction
			const parsed = parseInvoiceNumber(num)!
			await tx.invoice.create({
				data: {
					fiscalYear: 2025,
					sequence: parsed.sequence,
					kind: 'INVOICE',
					orderId: order.id,
					subtotalCents: 5000,
					totalCents: 6000,
				},
			})

			return num
		})

		expect(result).toBe('F2025-00001')

		// Verify it was persisted
		const invoice = await prisma.invoice.findFirst({
			where: { orderId: order.id },
		})
		expect(invoice).toBeTruthy()
		expect(invoice!.fiscalYear).toBe(2025)
		expect(invoice!.sequence).toBe(1)
	})

	test('should respect existing invoices when generating next number', async () => {
		// Create invoices with sequences 1-3 for 2025
		for (let seq = 1; seq <= 3; seq++) {
			const order = await createTestOrder(`order-existing-${seq}`)
			await createTestInvoice(2025, seq, order.id)
		}

		const nextNum = await generateInvoiceNumber(2025)
		expect(nextNum).toBe('F2025-00004')
	})

	test('should handle non-contiguous sequences (gap)', async () => {
		// Create invoices with sequences 1, 2, 5 (gap at 3-4)
		for (const seq of [1, 2, 5]) {
			const order = await createTestOrder(`order-gap-${seq}`)
			await createTestInvoice(2025, seq, order.id)
		}

		const nextNum = await generateInvoiceNumber(2025)
		// Should be 6, not 3, because we use MAX(sequence) not find-first-gap
		expect(nextNum).toBe('F2025-00006')
	})

	test('should handle large fiscal years', async () => {
		const num = await generateInvoiceNumber(2030)
		expect(num).toBe('F2030-00001')
	})
})

describe('withInvoiceLock', () => {
	test('should serialize concurrent operations', async () => {
		const order: number[] = []

		// Simulate two concurrent invoice creations
		const [result1, result2] = await Promise.all([
			withInvoiceLock(async () => {
				order.push(1)
				await new Promise((r) => setTimeout(r, 10))
				order.push(2)
				return 'first'
			}),
			withInvoiceLock(async () => {
				order.push(3)
				await new Promise((r) => setTimeout(r, 5))
				order.push(4)
				return 'second'
			}),
		])

		expect(result1).toBe('first')
		expect(result2).toBe('second')
		// The lock should serialize: 1,2 then 3,4 — not interleaved
		expect(order).toEqual([1, 2, 3, 4])
	})

	test('should propagate errors without deadlocking', async () => {
		const error = new Error('test failure')

		await expect(
			withInvoiceLock(async () => {
				expect(await prisma.invoice.count()).toBe(0)
				throw error
			}),
		).rejects.toThrow('test failure')

		// Lock should be released even after error — subsequent lock should work
		await withInvoiceLock(async () => {
			expect(await prisma.invoice.count()).toBe(0)
		})
	})

	test('should work with generateInvoiceNumber to ensure uniqueness', async () => {
		const numbers: string[] = []

		// Create 5 invoices with lock — each generates number and creates record
		for (let i = 0; i < 5; i++) {
			await withInvoiceLock(async () => {
				const order = await createTestOrder(`order-lock-${i}`)
				const num = await generateInvoiceNumber(2025)
				numbers.push(num)
				const parsed = parseInvoiceNumber(num)!
				await createTestInvoice(2025, parsed.sequence, order.id, {
					subtotalCents: 1000 * (i + 1),
					totalCents: 1200 * (i + 1),
				})
			})
		}

		const uniqueNumbers = new Set(numbers)
		expect(uniqueNumbers.size).toBe(5)

		// Verify sequential: F2025-00001, F2025-00002, ...
		numbers.forEach((num, idx) => {
			expect(num).toBe(`F2025-${String(idx + 1).padStart(5, '0')}`)
		})
	})
})

// ---------------------------------------------------------------------------
// Credit note tests
// ---------------------------------------------------------------------------

describe('issueCreditNote', () => {
	test('credit note negates parent', async () => {
		const order = await createTestOrder('order-cn-negate', {
			total: 4800,
			subtotal: 4000,
			shippingCost: 800,
		})

		// Create parent invoice
		const parentNum = await generateInvoiceNumber(2025)
		const parentParsed = parseInvoiceNumber(parentNum)!
		const parent = await createTestInvoice(
			2025,
			parentParsed.sequence,
			order.id,
			{
				subtotalCents: 4000,
				totalCents: 4800,
				vatTotalCents: 800,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 4000, vatCents: 800 },
				],
				status: 'FINAL',
			},
		)

		const refundedItems: RefundedLineItem[] = [
			{
				description: 'Test Product A',
				quantity: 2,
				unitPriceCents: 1000,
				totalCents: 2000,
			},
			{
				description: 'Test Product B',
				quantity: 1,
				unitPriceCents: 2000,
				totalCents: 2000,
			},
		]

		const creditNote = await issueCreditNote(
			parent.id,
			refundedItems,
			800, // refunded shipping
		)

		// Credit note should have a number in the same sequence
		expect(creditNote.number).toMatch(/^F\d{4}-\d{5}$/)
		expect(creditNote.fiscalYear).toBe(new Date().getFullYear())

		// Verify the credit note record was created with negative amounts
		const cn = await prisma.invoice.findUnique({
			where: { id: creditNote.id },
		})

		expect(cn).toBeTruthy()
		expect(cn!.kind).toBe('CREDIT_NOTE')
		expect(cn!.parentInvoiceId).toBe(parent.id)
		expect(cn!.orderId).toBe(order.id)
		expect(cn!.status).toBe('FINAL')
		expect(cn!.issuedAt).toBeTruthy()

		// Amounts should be negative
		expect(cn!.subtotalCents).toBeLessThan(0) // -(2000 + 2000)
		expect(cn!.totalCents).toBeLessThan(0) // subtotal + shipping + VAT

		// VAT breakdown should be negated
		const vatBreakdown = cn!.vatBreakdown as Array<{
			kind: string
			rate: number
			baseCents: number
			vatCents: number
		}>
		expect(vatBreakdown).toHaveLength(1)
		expect(vatBreakdown[0]!.kind).toBe('STANDARD')
		expect(vatBreakdown[0]!.baseCents).toBe(-4000)
		expect(vatBreakdown[0]!.vatCents).toBe(-800)
	})

	test('credit note shares the gapless invoice number sequence', async () => {
		const currentYear = new Date().getFullYear()

		const order = await createTestOrder('order-cn-seq', {
			total: 1000,
			subtotal: 1000,
			shippingCost: 0,
		})

		// Create a regular invoice first
		const parentNum = await generateInvoiceNumber(currentYear)
		const parentParsed = parseInvoiceNumber(parentNum)!
		const parent = await createTestInvoice(
			currentYear,
			parentParsed.sequence,
			order.id,
			{
				status: 'FINAL',
				vatTotalCents: 0,
				vatBreakdown: [],
			},
		)

		// Now issue a credit note — it should get the NEXT sequence number
		const creditNote = await issueCreditNote(
			parent.id,
			[
				{
					description: 'Test Product',
					quantity: 1,
					unitPriceCents: 1000,
					totalCents: 1000,
				},
			],
			0,
		)

		// The credit note should have the next sequence in the same fiscal year
		const expectedNum = `F${currentYear}-${String(parentParsed.sequence + 1).padStart(5, '0')}`
		expect(creditNote.number).toBe(expectedNum)
	})

	test('credit note works within a transaction', async () => {
		const order = await createTestOrder('order-cn-tx', {
			total: 3000,
			subtotal: 2500,
			shippingCost: 500,
		})

		// Create parent invoice first
		const parentNum = await generateInvoiceNumber(2025)
		const parentParsed = parseInvoiceNumber(parentNum)!
		const parent = await createTestInvoice(
			2025,
			parentParsed.sequence,
			order.id,
			{
				status: 'FINAL',
				totalCents: 3000,
				subtotalCents: 2500,
				vatTotalCents: 500,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 2500, vatCents: 500 },
				],
			},
		)

		const refundedItems: RefundedLineItem[] = [
			{
				description: 'Product X',
				quantity: 1,
				unitPriceCents: 2500,
				totalCents: 2500,
			},
		]

		// Issue credit note within a transaction
		const result = await prisma.$transaction(async (tx) => {
			return issueCreditNote(parent.id, refundedItems, 500, tx)
		})

		expect(result.number).toMatch(/^F\d{4}-\d{5}$/)

		const cn = await prisma.invoice.findUnique({
			where: { id: result.id },
		})
		expect(cn).toBeTruthy()
		expect(cn!.kind).toBe('CREDIT_NOTE')
		expect(cn!.subtotalCents).toBe(-2500)
		expect(cn!.totalCents).toBe(-3500) // subtotal + shipping + VAT
	})

	test('credit note throws when parent invoice does not exist', async () => {
		await expect(
			issueCreditNote(
				'nonexistent-invoice-id',
				[
					{
						description: 'Product',
						quantity: 1,
						unitPriceCents: 1000,
						totalCents: 1000,
					},
				],
				0,
			),
		).rejects.toThrow('Parent invoice nonexistent-invoice-id not found')
	})

	test('credit note with zero VAT breakdown', async () => {
		const order = await createTestOrder('order-cn-zero-vat', {
			total: 1000,
			subtotal: 1000,
			shippingCost: 0,
		})

		const parentNum = await generateInvoiceNumber(2025)
		const parentParsed = parseInvoiceNumber(parentNum)!
		const parent = await createTestInvoice(
			2025,
			parentParsed.sequence,
			order.id,
			{
				status: 'FINAL',
				vatTotalCents: 0,
				vatBreakdown: [],
			},
		)

		const creditNote = await issueCreditNote(
			parent.id,
			[
				{
					description: 'No-VAT Product',
					quantity: 1,
					unitPriceCents: 1000,
					totalCents: 1000,
				},
			],
			0,
		)

		const cn = await prisma.invoice.findUnique({
			where: { id: creditNote.id },
		})
		expect(cn!.vatBreakdown).toEqual([])
		expect(cn!.vatTotalCents).toBe(0)
		expect(cn!.totalCents).toBe(-1000)
	})

	test('credit note with multiple VAT breakdown entries', async () => {
		const order = await createTestOrder('order-cn-multi-vat', {
			total: 3500,
			subtotal: 3000,
			shippingCost: 500,
		})

		const parentNum = await generateInvoiceNumber(2025)
		const parentParsed = parseInvoiceNumber(parentNum)!
		const parent = await createTestInvoice(
			2025,
			parentParsed.sequence,
			order.id,
			{
				status: 'FINAL',
				subtotalCents: 3000,
				totalCents: 3500,
				vatTotalCents: 500,
				vatBreakdown: [
					{ kind: 'STANDARD', rate: 2000, baseCents: 2500, vatCents: 500 },
					{ kind: 'REDUCED', rate: 550, baseCents: 500, vatCents: 0 },
				],
			},
		)

		const creditNote = await issueCreditNote(
			parent.id,
			[
				{ description: 'Item 1', quantity: 1, unitPriceCents: 2500, totalCents: 2500 },
				{ description: 'Item 2', quantity: 1, unitPriceCents: 500, totalCents: 500 },
			],
			500,
		)

		const cn = await prisma.invoice.findUnique({
			where: { id: creditNote.id },
		})
		const breakdown = cn!.vatBreakdown as Array<{
			kind: string
			rate: number
			baseCents: number
			vatCents: number
		}>
		expect(breakdown).toHaveLength(2)
		expect(breakdown[0]!.kind).toBe('STANDARD')
		expect(breakdown[0]!.baseCents).toBe(-2500)
		expect(breakdown[0]!.vatCents).toBe(-500)
		expect(breakdown[1]!.kind).toBe('REDUCED')
		expect(breakdown[1]!.baseCents).toBe(-500)
	})
})
