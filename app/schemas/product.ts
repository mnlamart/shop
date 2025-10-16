import { z } from 'zod'

export const ImageFieldsetSchema = z.object({
	id: z.string().optional(),
	file: z.instanceof(File).optional(),
	altText: z.string().max(500).optional(),
	displayOrder: z.number().int().optional(),
	isPrimary: z.boolean().optional(),
})

export const VariantSchema = z.object({
	id: z.string().optional(),
	sku: z.string().min(1),
	price: z.number().min(0).multipleOf(0.01).optional(),
	stockQuantity: z.number().int().min(0),
	attributeValueIds: z.array(z.string()).optional(),
})

// Constants for validation
const MAX_NAME_LENGTH = 200
const MAX_SLUG_LENGTH = 250
const MAX_DESCRIPTION_LENGTH = 5000
const MAX_SKU_LENGTH = 100
const MAX_TAGS = 10
const MAX_IMAGES = 10
const SLUG_REGEX = /^[a-z0-9-]+$/
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
const STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

export const ProductEditorSchema = z.object({
	id: z.string().optional(),
	name: z.string()
		.min(1, 'Name is required')
		.max(MAX_NAME_LENGTH, `Name must be less than ${MAX_NAME_LENGTH} characters`),
	slug: z.string()
		.min(1, 'Slug is required')
		.max(MAX_SLUG_LENGTH, `Slug must be less than ${MAX_SLUG_LENGTH} characters`)
		.regex(SLUG_REGEX, 'Slug can only contain lowercase letters, numbers, and hyphens'),
	description: z.string()
		.max(MAX_DESCRIPTION_LENGTH, `Description must be less than ${MAX_DESCRIPTION_LENGTH} characters`)
		.optional(),
	sku: z.string()
		.min(1, 'SKU is required')
		.max(MAX_SKU_LENGTH, `SKU must be less than ${MAX_SKU_LENGTH} characters`),
	price: z.number()
		.min(0, 'Price must be positive')
		.multipleOf(0.01),
	currency: z.enum(CURRENCIES).default('USD'),
	status: z.enum(STATUSES).default('DRAFT'),
	categoryId: z.string().optional(),
	tags: z.array(z.string()).max(MAX_TAGS).optional(),
	images: z.array(ImageFieldsetSchema).max(MAX_IMAGES),
	variants: z.array(VariantSchema).optional(),
})

export type ProductEditorSchema = z.infer<typeof ProductEditorSchema>
export type ImageFieldset = z.infer<typeof ImageFieldsetSchema>
export type VariantFieldset = z.infer<typeof VariantSchema>
