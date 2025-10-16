import { UNCATEGORIZED_CATEGORY_ID } from './category.ts'
import { prisma } from './db.server.ts'

/**
 * Get the uncategorized category
 */
export async function getUncategorizedCategory() {
	return await prisma.category.findUnique({
		where: { id: UNCATEGORIZED_CATEGORY_ID },
		include: {
			_count: {
				select: { products: true }
			}
		}
	})
}

/**
 * Ensure the uncategorized category exists
 * This is useful for development and production setup
 */
export async function ensureUncategorizedCategory() {
	const existing = await prisma.category.findUnique({
		where: { id: UNCATEGORIZED_CATEGORY_ID }
	})

	if (!existing) {
		return await prisma.category.create({
			data: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Uncategorized',
				slug: 'uncategorized',
				description: 'Default category for products without a specific category',
				parentId: null
			}
		})
	}

	return existing
}
