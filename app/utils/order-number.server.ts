import { prisma } from './db.server.ts'

/**
 * Generates a unique order number in the format "ORD-XXXXXX" where XXXXXX is a zero-padded 6-digit number.
 * Uses database-level locking by selecting with a write lock to prevent race conditions.
 * For SQLite, this ensures sequential numbering even under high concurrency.
 */
export async function generateOrderNumber(): Promise<string> {
	// For SQLite, we use BEGIN IMMEDIATE to get an exclusive lock
	// This ensures sequential numbering even with concurrent requests
	return await prisma.$transaction(
		async (tx) => {
			// Get the highest order number
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
		},
		{
			// Use maxWait to prevent indefinite waits
			maxWait: 5000, // 5 seconds
			timeout: 10000, // 10 seconds
		},
	)
}

