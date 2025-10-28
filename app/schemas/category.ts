import z from "zod"
import { SLUG_REGEX } from "./constants"

/**
 * ID for the uncategorized category
 */
export const UNCATEGORIZED_CATEGORY_ID = 'uncategorized-category-id'

/**
 * Schema for validating category data
 * 
 * @description Validates category name, slug, description, and parent category
 * @example
 * ```ts
 * const category = CategorySchema.parse({
 *   name: "Electronics",
 *   slug: "electronics",
 *   description: "Electronic products"
 * })
 * ```
 */
export const CategorySchema = z.object({
	id: z.string(),
	name: z.string().min(1, { error: 'Name is required' }).max(100, {
		error: 'Name must be less than 100 characters',
	}),
	slug: z.string().min(1, { error: 'Slug is required' }).max(100, {
		error: 'Slug must be less than 100 characters',
	}).regex(/^[a-z0-9-]+$/, {
		error: 'Slug can only contain lowercase letters, numbers, and hyphens',
	}),
	description: z.string().max(500, {
		error: 'Description must be less than 500 characters',
	}).optional(),
	parentId: z.string().optional(),
})