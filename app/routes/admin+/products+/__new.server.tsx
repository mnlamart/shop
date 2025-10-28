import { parseWithZod } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Prisma } from '@prisma/client'
import { data } from 'react-router'
import { MAX_UPLOAD_SIZE } from '#app/schemas/constants'
import { productSchema } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { uploadProductImage } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const productWithoutIdSchema = productSchema.omit({ id: true })

/**
 * Type guard to check if an image has a valid file
 * 
 * @param image - Image object with optional file
 * @returns Type predicate indicating if the image has a file property
 */
export function imageHasFile(
	image: { file?: File },
): image is { file: NonNullable<{ file?: File }['file']> } {
	return Boolean(image.file?.size && image.file?.size > 0)
}

/**
 * Result type for Prisma error handling
 */
export type PrismaErrorResult = {
	formErrors: string[]
	fieldErrors?: Record<string, string[]>
	statusCode: number
}

/**
 * Handles Prisma database errors and converts them to user-friendly error messages
 * 
 * @param error - The error object from Prisma operations
 * @returns Structured error result with form errors, field errors, and status code
 */
export function handlePrismaError(error: unknown): PrismaErrorResult {
	// 1. Known Prisma errors
	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		const fieldErrors: Record<string, string[]> = {}

		switch (error.code) {
			case 'P2002': // Unique constraint violation
				if (error.meta && 'target' in error.meta) {
					const target = error.meta.target as string[]
					if (target.includes('slug')) {
						fieldErrors.slug = ['This slug already exists']
					}
					if (target.includes('sku')) {
						fieldErrors.sku = ['This SKU already exists']
					}
					if (target.includes('tagId')) {
						fieldErrors.tags = ['A tag with this name already exists']
					}
				}
				break

			case 'P2003': // Foreign key constraint failed
				if (error.meta && 'field_name' in error.meta) {
					fieldErrors.categoryId = ['This category does not exist']
				}
				break

			case 'P2025': // Record not found
				return {
					formErrors: ['Record not found'],
					statusCode: 404
				}
		}

		return {
			formErrors: ['Validation error'],
			fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
			statusCode: 400
		}
	}

	// 2. Prisma validation errors
	if (error instanceof Prisma.PrismaClientValidationError) {
		return {
			formErrors: ['Invalid data. Please check required fields.'],
			statusCode: 400
		}
	}

	// 3. Unknown Prisma errors
	if (error instanceof Prisma.PrismaClientUnknownRequestError) {
		return {
			formErrors: ['Database error. Please try again later.'],
			statusCode: 500
		}
	}

	// 4. Prisma initialization errors
	if (error instanceof Prisma.PrismaClientInitializationError) {
		return {
			formErrors: ['Service temporarily unavailable.'],
			statusCode: 503
		}
	}

	// 5. Rust panic errors (rare but possible)
	if (error instanceof Prisma.PrismaClientRustPanicError) {
		return {
			formErrors: ['System error. Please restart the application.'],
			statusCode: 500
		}
	}

	// 6. Generic error
	return {
		formErrors: ['An unexpected error occurred'],
		statusCode: 500
	}
}

/**
 * Handles product creation form submissions
 * 
 * @description Validates and creates new products with images, variants, and tags
 * @param request - HTTP request object
 * @returns Redirect to product page on success, or error data on failure
 */
export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request, {
		maxFileSize: MAX_UPLOAD_SIZE,
	})
	const submission = await parseWithZod(formData, {
		schema: productWithoutIdSchema.transform(async ({ images = [], ...data }) => {
			const productId = crypto.randomUUID()
			return {
				...data,
				id: productId,
				newImages: await Promise.all(
					images
						.filter(imageHasFile)
						.map(async (image, index) => {
							return {
								altText: image.altText,
								objectKey: await uploadProductImage(productId, image.file!),
								displayOrder: index,
							}
						}),
				),
			}
		}),
		async: true,
	})

	// Report the submission to client if it is not successful.
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { newImages, ...productData } = submission.value

	try {
		const result = await prisma.$transaction(async (tx) => {
			// Prepare product data
			const { variants = [], tags, ...productDataWithoutVariants } = productData
			const productCreateData: Prisma.ProductCreateInput = { ...productDataWithoutVariants }

			// Add images if they exist
			if (newImages && newImages.length > 0) {
				productCreateData.images = {
					create: newImages
				}
			}

			// Add tags if they exist
			if (tags) {
				productCreateData.tags = {
					create: tags.map(tagName => ({
						tag: {
							connectOrCreate: {
								where: { name: tagName },
								create: { name: tagName }
							}
						}
					}))
				}
			}

			// Add variants if they exist
			if (variants && variants.length > 0) {
				productCreateData.variants = {
					create: variants.map((variant) => ({
						sku: variant.sku,
						price: variant.price,
						stockQuantity: variant.stockQuantity,
						attributeValues: {
							create: (variant.attributeValueIds || [])
								.filter((id) => id && id.trim() !== '' && id !== 'none')
								.map((attributeValueId) => ({
									attributeValueId,
								})),
						},
					})),
				}
			}

			const createdProduct = await tx.product.create({
				data: productCreateData,
				include: {
					images: true,
					variants: {
						include: {
							attributeValues: {
								include: {
									attributeValue: true
								}
							}
						}
					},
					tags: {
						include: {
							tag: true
						}
					},
				},
			})
			
			return createdProduct
		})

		return redirectWithToast(`/admin/products/${result.slug}`, {
			description: 'Product created successfully',
		})
	} catch (error: unknown) {
		const prismaError = handlePrismaError(error)
		
		return data(
			{
				result: submission.reply(prismaError)
			},
			{ status: 400 },
		)
	}
}
