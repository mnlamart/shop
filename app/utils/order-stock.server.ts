import { invariant } from '@epic-web/invariant'
import { prisma } from './db.server.ts'

/**
 * Type for stock availability issues
 */
export type StockIssue = {
	productName: string
	requested: number
	available: number
}

export class StockValidationError extends Error {
	constructor(public issues: StockIssue[]) {
		super('Insufficient stock for one or more items')
		this.name = 'StockValidationError'
	}
}

export class StockUnavailableError extends Error {
	constructor(public data: StockIssue) {
		super(`Insufficient stock for ${data.productName}`)
		this.name = 'StockUnavailableError'
	}
}

/**
 * Validates that all items in the cart have sufficient stock availability.
 * Checks variant-level stock when variant exists, product-level stock when no variant.
 * @param cartId - The ID of the cart to validate
 * @throws StockValidationError if any items have insufficient stock
 */
export async function validateStockAvailability(cartId: string): Promise<void> {
	const cart = await prisma.cart.findUnique({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							stockQuantity: true,
						},
					},
				},
			},
		},
	})

	invariant(cart, 'Cart not found')
	invariant(cart.items.length > 0, 'Cart is empty')

	const stockIssues: StockIssue[] = []

	for (const item of cart.items) {
		if (item.variantId) {
			// Item has variant - check variant-level stock
			const variant = await prisma.productVariant.findUnique({
				where: { id: item.variantId },
				select: { id: true, stockQuantity: true },
			})

			invariant(
				variant,
				`Variant ${item.variantId} not found for product ${item.product.name}`,
			)

			if (variant.stockQuantity < item.quantity) {
				stockIssues.push({
					productName: item.product.name,
					requested: item.quantity,
					available: variant.stockQuantity,
				})
			}
		} else {
			// Item has no variant - check product-level stock
			if (item.product.stockQuantity !== null) {
				// Product has stock tracking
				if (item.product.stockQuantity < item.quantity) {
					stockIssues.push({
						productName: item.product.name,
						requested: item.quantity,
						available: item.product.stockQuantity,
					})
				}
			}
			// If stockQuantity is null, treat as unlimited (no validation)
		}
	}

	if (stockIssues.length > 0) {
		throw new StockValidationError(stockIssues)
	}
}

