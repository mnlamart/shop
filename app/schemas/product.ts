import { z } from 'zod'
import { UNCATEGORIZED_CATEGORY_ID } from './category'
import { CURRENCIES, PRODUCT_STATUSES, SLUG_REGEX, MAX_UPLOAD_SIZE, ACCEPTED_IMAGE_TYPES } from './constants'
// Constants for validation
export const MAX_NAME_LENGTH = 200
export const MAX_SLUG_LENGTH = 250
export const MAX_DESCRIPTION_LENGTH = 5000
export const MAX_SKU_LENGTH = 100
export const MAX_TAGS = 10
export const MAX_IMAGES = 10
export const MAX_ALT_TEXT_LENGTH = 500
export const MAX_TAG_LENGTH = 100

/**
 * Schema for validating product images
 * 
 * @description Validates image files with size and type constraints
 * @example
 * ```ts
 * const image = ImageFieldsetSchema.parse({
 *   file: fileObject,
 *   altText: "Product image"
 * })
 * ```
 */
export const ImageFieldsetSchema = z.object({
	id: z.string().optional(),
	file: z
		.instanceof(File)
		.optional()
		.refine(
			(file) => {
				return !file || file.size <= MAX_UPLOAD_SIZE
			},
			{ error: 'File size must be less than 5MB' },
		)
		.refine(
			(file) => {
				return !file || ACCEPTED_IMAGE_TYPES.includes(file.type as any)
			},
			{ error: 'Only JPEG, PNG, WebP, and GIF images are allowed' },
		),
	altText: z.string().max(MAX_ALT_TEXT_LENGTH, {
		error: `Alt text must be less than ${MAX_ALT_TEXT_LENGTH} characters`,
	}).optional(),
	displayOrder: z.number().int().default(0),
})

/**
 * Schema for validating product variants
 * 
 * @description Validates variant SKU, price, stock quantity, and attribute values
 * @example
 * ```ts
 * const variant = VariantSchema.parse({
 *   sku: "VARIANT-001",
 *   price: 29.99,
 *   stockQuantity: 100
 * })
 * ```
 */
export const VariantSchema = z.object({
	id: z.string().optional(),
	sku: z.string().min(1, { error: 'SKU is required' }).max(MAX_SKU_LENGTH, {
		error: `SKU must be less than ${MAX_SKU_LENGTH} characters`,
	}),
	price: z.number().min(0, { error: 'Price cannot be negative' }).multipleOf(0.01, {
		error: 'Price must have at most 2 decimal places',
	}).nullable().optional(),
	stockQuantity: z.number().int({ error: 'Stock quantity must be a whole number' }).min(0, {
		error: 'Stock quantity cannot be negative',
	}),
	attributeValueIds: z.array(z.string()).optional(),
})

/**
 * Schema for validating product data
 * 
 * @description Comprehensive validation schema for products including basic info, pricing, images, variants, and metadata
 * @example
 * ```ts
 * const product = productSchema.parse({
 *   name: "Product Name",
 *   slug: "product-name",
 *   sku: "SKU-001",
 *   price: 99.99,
 *   currency: "USD",
 *   status: "ACTIVE"
 * })
 * ```
 */
export const productSchema = z.object({
	id: z.cuid2(),
	name: z.string({
		error: (issue) => issue.input === undefined 
			? 'Name is required' 
			: 'Name must be a string',
	}).min(1, { error: 'Name is required' }).max(MAX_NAME_LENGTH, {
		error: `Name must be less than ${MAX_NAME_LENGTH} characters`,
	}),
	slug: z.string({
		error: (issue) => issue.input === undefined 
			? 'Slug is required' 
			: 'Slug must be a string',
	}).min(1, { error: 'Slug is required' }).max(MAX_SLUG_LENGTH, {
		error: `Slug must be less than ${MAX_SLUG_LENGTH} characters`,
	}).regex(SLUG_REGEX, {
		error: 'Slug can only contain lowercase letters, numbers, and hyphens',
	}),
	description: z.string().max(MAX_DESCRIPTION_LENGTH, {
		error: `Description must be less than ${MAX_DESCRIPTION_LENGTH} characters`,
	}).optional(),
	sku: z.string({
		error: (issue) => issue.input === undefined 
			? 'SKU is required' 
			: 'SKU must be a string',
	}).min(1, { error: 'SKU is required' }).max(MAX_SKU_LENGTH, {
		error: `SKU must be less than ${MAX_SKU_LENGTH} characters`,
	}),
	price: z.number({
		error: (issue) => issue.input === undefined 
			? 'Price is required' 
			: 'Price must be a number',
	}).min(0, { error: 'Price cannot be negative' }).multipleOf(0.01, {
		error: 'Price must have at most 2 decimal places',
	}),
	currency: z.enum(CURRENCIES, {
		error: `Currency must be one of: ${CURRENCIES.join(', ')}`,
	}).default('EUR'),
	status: z.enum(PRODUCT_STATUSES, {
		error: `Status must be one of: ${PRODUCT_STATUSES.join(', ')}`,
	}).default('DRAFT'),
	categoryId: z.string().default(UNCATEGORIZED_CATEGORY_ID),
	tags: z.array(z.string().min(1, { error: 'Tag cannot be empty' }).max(MAX_TAG_LENGTH, {
		error: `Tag must be less than ${MAX_TAG_LENGTH} characters`,
	})).max(MAX_TAGS, {
		error: `Maximum ${MAX_TAGS} tags allowed`,
	}).optional()
		.refine(
			(tags) => {
				if (!tags) return true;
				const uniqueTags = new Set(tags);
				return uniqueTags.size === tags.length;
			}, {
				error: 'Tags must be unique',
			}
		),
	images: z.array(ImageFieldsetSchema).max(MAX_IMAGES, {
		error: `Maximum ${MAX_IMAGES} images allowed`,
	}).optional(),
	variants: z.array(VariantSchema).optional(),
})

/**
 * Type inference for image fieldset from schema
 */
export type ImageFieldset = z.infer<typeof ImageFieldsetSchema>

/**
 * Type inference for variant fieldset from schema
 */
export type VariantFieldset = z.infer<typeof VariantSchema>
