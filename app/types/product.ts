import { type Prisma } from '@prisma/client'

/**
 * Product list item type for the admin products index page
 * Includes all necessary fields for displaying products in a table
 */
export type ProductListItem = Prisma.ProductGetPayload<{
	include: {
		category: {
			select: { id: true; name: true; slug: true }
		}
		images: {
			select: { objectKey: true; altText: true }
		}
		variants: {
			select: { stockQuantity: true }
		}
		tags: {
			include: {
				tag: { select: { name: true } }
			}
		}
	}
}>

/**
 * Product detail type for viewing a single product
 * Includes all relations with full data for product details page
 */
export type ProductDetail = Prisma.ProductGetPayload<{
	include: {
		category: {
			select: { id: true; name: true; slug: true }
		}
		images: true
		variants: {
			include: {
				attributeValues: {
					include: {
						attributeValue: {
							include: { attribute: true }
						}
					}
				}
			}
		}
		tags: {
			include: {
				tag: { select: { name: true } }
			}
		}
	}
}>

/**
 * Attribute detail type for viewing a single attribute
 * Includes values and usage statistics
 */
export type AttributeDetail = Prisma.AttributeGetPayload<{
	include: {
		values: {
			include: {
				_count: {
					select: { variants: true }
				}
			}
		}
		_count: {
			select: { values: true }
		}
	}
}>

/**
 * Product for attribute page
 * Simplified product type for displaying products that use an attribute
 */
export type ProductForAttribute = {
	id: string
	name: string
	slug: string
	sku: string
	price: number
	status: string
	images: Array<{ objectKey: string }>
}

