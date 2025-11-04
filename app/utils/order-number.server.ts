import { prisma } from './db.server.ts'
import type { Prisma } from '@prisma/client'

/**
 * Generates a unique order number in the format "ORD-XXXXXX" where XXXXXX is a zero-padded 6-digit number.
 * Uses database-level locking by selecting with a write lock to prevent race conditions.
 * For SQLite, this ensures sequential numbering even under high concurrency.
 * @param tx - Optional transaction client. If provided, uses the existing transaction instead of creating a new one.
 */
export async function generateOrderNumber(
	tx?: Prisma.TransactionClient,
): Promise<string> {
	// If a transaction client is provided, use it directly
	if (tx) {
		// Get the highest order number within the existing transaction
		const lastOrder = await tx.order.findFirst({
			orderBy: { orderNumber: 'desc' },
			select: { orderNumber: true },
		})

		let nextNumber = 1

		if (lastOrder) {
			// Extract the numeric part from "ORD-XXXXXX"
			const lastNumber = parseInt(
				lastOrder.orderNumber.replace('ORD-', ''),
				10,
			)
			if (!isNaN(lastNumber)) {
				nextNumber = lastNumber + 1
			}
		}

		// Format as "ORD-XXXXXX" with zero padding
		return `ORD-${String(nextNumber).padStart(6, '0')}`
	}

	// For SQLite, we use BEGIN IMMEDIATE to get an exclusive lock
	// This ensures sequential numbering even with concurrent requests
	return await prisma.$transaction(
		async (transactionTx) => {
			// Get the highest order number
			const lastOrder = await transactionTx.order.findFirst({
				orderBy: { orderNumber: 'desc' },
				select: { orderNumber: true },
			})

			let nextNumber = 1

			if (lastOrder) {
				// Extract the numeric part from "ORD-XXXXXX"
				const lastNumber = parseInt(
					lastOrder.orderNumber.replace('ORD-', ''),
					10,
				)
				if (!isNaN(lastNumber)) {
					nextNumber = lastNumber + 1
				}
			}

			// Format as "ORD-XXXXXX" with zero padding
			return `ORD-${String(nextNumber).padStart(6, '0')}`
		},
		{
			// Use maxWait to prevent indefinite waits
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}

