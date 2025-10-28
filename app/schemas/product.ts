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
	altText: z.string().max(MAX_ALT_TEXT_LENGTH).optional(),
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
	sku: z.string().min(1),
	price: z.number().min(0).multipleOf(0.01).nullable().optional(),
	stockQuantity: z.number().int().min(0),
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
	name: z.string().min(1).max(MAX_NAME_LENGTH),
	slug: z.string().min(1).max(MAX_SLUG_LENGTH).regex(SLUG_REGEX, {
		error: 'Slug can only contain lowercase letters, numbers, and hyphens',
	}),
	description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
	sku: z.string().min(1).max(MAX_SKU_LENGTH),
	price: z.number().min(0).multipleOf(0.01),
	currency: z.enum(CURRENCIES).default('EUR'),
	status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
	categoryId: z.string().default(UNCATEGORIZED_CATEGORY_ID),
	tags: z.array(z.string().min(1).max(MAX_TAG_LENGTH)).max(MAX_TAGS, {
		error: 'Maximum 10 tags allowed',
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
	images: z.array(ImageFieldsetSchema).max(MAX_IMAGES).optional(),
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
