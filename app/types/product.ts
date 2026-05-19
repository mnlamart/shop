import { type Prisma } from '@prisma/client'
import { variantsWithAttributesInclude } from '#app/utils/prisma-includes.ts'

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

export type ProductDetail = Prisma.ProductGetPayload<{
	include: {
		category: {
			select: { id: true; name: true; slug: true }
		}
		images: true
		variants: typeof variantsWithAttributesInclude.variants
		tags: {
			include: {
				tag: { select: { name: true } }
			}
		}
	}
}>

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

export type ProductForAttribute = {
	id: string
	name: string
	slug: string
	sku: string
	price: number
	status: string
	images: Array<{ objectKey: string }>
}

