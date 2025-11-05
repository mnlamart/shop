import { parseWithZod } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { type Prisma } from '@prisma/client'
import { data } from 'react-router'
import { MAX_UPLOAD_SIZE } from '#app/schemas/constants'
import { productSchema } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { handlePrismaError } from '#app/utils/prisma-error.server.ts'
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
			const { variants = [], tags = [], categoryId, ...productDataWithoutVariantsAndCategory } = productData
			const productCreateData: Prisma.ProductCreateInput = { 
				...productDataWithoutVariantsAndCategory,
				category: {
					connect: { id: categoryId }
				}
			}

			// Add images if they exist
			if (newImages && newImages.length > 0) {
				productCreateData.images = {
					create: newImages
				}
			}

			// Add tags if they exist
			if (tags && tags.length > 0) {
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
