import { z } from 'zod'

/**
 * Schema for address type enum
 */
export const AddressTypeSchema = z.enum(['SHIPPING', 'BILLING', 'BOTH'])

/**
 * Schema for validating address data
 * 
 * @description Validates address fields including name, street, city, state, postal code, country, and type
 * Uses z.preprocess to handle empty strings correctly for required fields
 * @example
 * ```ts
 * const address = AddressSchema.parse({
 *   name: "John Doe",
 *   street: "123 Main St",
 *   city: "New York",
 *   postal: "10001",
 *   country: "US",
 *   type: "SHIPPING"
 * })
 * ```
 */
export const AddressSchema = z.object({
	id: z.string().optional(), // For updates
	name: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Name is required' : 'Not a string',
			})
			.min(1, { error: 'Name is required' })
			.max(100, { error: 'Name must be less than 100 characters' })
			.trim(),
	),
	street: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Street address is required'
						: 'Not a string',
			})
			.min(1, { error: 'Street address is required' })
			.max(200, { error: 'Street address must be less than 200 characters' })
			.trim(),
	),
	city: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'City is required' : 'Not a string',
			})
			.min(1, { error: 'City is required' })
			.max(100, { error: 'City must be less than 100 characters' })
			.trim(),
	),
	state: z
		.preprocess(
			(val) => (val === '' ? undefined : val),
			z
				.string()
				.max(100, { error: 'State must be less than 100 characters' })
				.trim()
				.optional(),
		),
	postal: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Postal code is required'
						: 'Not a string',
			})
			.min(1, { error: 'Postal code is required' })
			.max(20, { error: 'Postal code must be less than 20 characters' })
			.trim(),
	),
	country: z.preprocess(
		(val) => (val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Country is required' : 'Not a string',
			})
			.trim()
			.toUpperCase()
			.refine((val) => val.length === 2, {
				error: 'Country must be a 2-letter ISO code (e.g., US, GB)',
			}),
	),
	type: AddressTypeSchema,
	label: z
		.preprocess(
			(val) => (val === '' ? undefined : val),
			z
				.string()
				.max(50, { error: 'Label must be less than 50 characters' })
				.trim()
				.optional(),
		),
	isDefaultShipping: z.preprocess(
		(val) => val === 'on' || val === true || val === 'true',
		z.boolean().default(false),
	),
	isDefaultBilling: z.preprocess(
		(val) => val === 'on' || val === true || val === 'true',
		z.boolean().default(false),
	),
})

export type AddressFormData = z.infer<typeof AddressSchema>

