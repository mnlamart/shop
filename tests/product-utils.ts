import { faker } from '@faker-js/faker'
import { UniqueEnforcer } from 'enforce-unique'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { slugify } from '#app/utils/slug.ts'

const uniqueSlugEnforcer = new UniqueEnforcer()
const uniqueSkuEnforcer = new UniqueEnforcer()

export type ProductData = {
	name: string
	slug: string
	description?: string
	sku: string
	price: number
	status?: string
	categoryId?: string
	tags?: string[]
}

export type VariantData = {
	sku: string
	price?: number | null
	stockQuantity: number
	attributeValueIds?: string[]
}

/**
 * Creates a unique product slug
 */
function createProductSlug(name?: string): string {
	return uniqueSlugEnforcer
		.enforce(() => {
			const baseSlug = name ? slugify(name) : faker.commerce.productName()
			return slugify(baseSlug) + '-' + faker.string.alphanumeric(4)
		})
		.toLowerCase()
}

/**
 * Creates a unique product SKU
 */
function createProductSku(): string {
	return uniqueSkuEnforcer
		.enforce(() => {
			return 'SKU-' + faker.string.alphanumeric(8).toUpperCase()
		})
}

/**
 * Creates test product data
 */
export function createProductData(): ProductData {
	return {
		name: faker.commerce.productName(),
		slug: createProductSlug(),
		description: faker.commerce.productDescription(),
		sku: createProductSku(),
		price: parseFloat(faker.commerce.price({ min: 10, max: 1000, dec: 2 })),
		status: 'DRAFT',
		categoryId: UNCATEGORIZED_CATEGORY_ID,
		tags: [],
	}
}

/**
 * Creates test variant data
 */
export function createVariantData(productSku?: string): VariantData {
	return {
		sku: productSku 
			? `${productSku}-VAR-${faker.string.alphanumeric(4)}`
			: `VAR-${faker.string.alphanumeric(6).toUpperCase()}`,
		price: null,
		stockQuantity: faker.number.int({ min: 0, max: 1000 }),
		attributeValueIds: [],
	}
}

/**
 * Creates FormData for product action tests
 */
export function createProductFormData(productData: ProductData, options?: {
	images?: { file?: File; altText?: string }[]
	variants?: VariantData[]
	tags?: string[]
}): FormData {
	const formData = new FormData()

	// Basic fields
	formData.append('name', productData.name)
	formData.append('slug', productData.slug)
	if (productData.description) {
		formData.append('description', productData.description)
	}
	formData.append('sku', productData.sku)
	formData.append('price', productData.price.toString())
	
	// Optional fields
	if (productData.status) {
		formData.append('status', productData.status)
	}
	if (productData.categoryId) {
		formData.append('categoryId', productData.categoryId)
	}

	// Tags
	if (options?.tags) {
		options.tags.forEach((tag, index) => {
			formData.append(`tags[${index}]`, tag)
		})
	}

	// Images
	if (options?.images) {
		options.images.forEach((image, index) => {
			if (image.file) {
				formData.append(`images[${index}][file]`, image.file)
			}
			if (image.altText) {
				formData.append(`images[${index}][altText]`, image.altText)
			}
		})
	}

	// Variants
	if (options?.variants) {
		options.variants.forEach((variant, index) => {
			formData.append(`variants[${index}][sku]`, variant.sku)
			formData.append(`variants[${index}][stockQuantity]`, variant.stockQuantity.toString())
			
			if (variant.price !== undefined && variant.price !== null) {
				formData.append(`variants[${index}][price]`, variant.price.toString())
			}

			if (variant.attributeValueIds) {
				variant.attributeValueIds.forEach((attrId, attrIndex) => {
					formData.append(`variants[${index}][attributeValueIds][${attrIndex}]`, attrId)
				})
			}
		})
	}

	return formData
}

let testCategories: Array<{ id: string; name: string }> | undefined
let testAttributes: Array<{ id: string; name: string; values: Array<{ id: string; value: string }> }> | undefined

/**
 * Gets or creates test categories
 */
export async function getTestCategories() {
	if (testCategories) return testCategories

	testCategories = await prisma.category.findMany({
		select: { id: true, name: true },
		take: 5,
	})

	return testCategories
}

/**
 * Gets or creates test attributes
 */
export async function getTestAttributes() {
	if (testAttributes) return testAttributes

	testAttributes = await prisma.attribute.findMany({
		include: {
			values: {
				select: { id: true, value: true },
				take: 5,
			},
		},
		take: 3,
	})

	return testAttributes
}

/**
 * Creates a mock File object for testing
 */
export function createMockFile(
	name: string = 'test.jpg',
	size: number = 1024,
	type: string = 'image/jpeg',
): File {
	const blob = new Blob(['x'.repeat(size)], { type })
	return new File([blob], name, { type })
}

/**
 * Creates a larger mock file for size validation testing
 */
export function createLargeMockFile(sizeMB: number = 6): File {
	const size = sizeMB * 1024 * 1024
	return createMockFile('large.jpg', size, 'image/jpeg')
}

