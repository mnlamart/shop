import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { data } from 'react-router'
import { MAX_UPLOAD_SIZE } from '#app/schemas/constants'
import { productSchema } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { handlePrismaError } from '#app/utils/prisma-error.server.ts'
import { uploadProductImage } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$productSlug_.edit.ts'
import { imageHasFile } from './__new.server.tsx'

/**
 * Handles product edit form submissions
 * 
 * @description Validates and updates product data including images, variants, and tags
 * @param request - HTTP request object
 * @returns Redirect to product page on success, or error data on failure
 * @throws {invariantResponse} If product is not found (404)
 */
export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request, {
		maxFileSize: MAX_UPLOAD_SIZE,
	})

	const submission = await parseWithZod(formData, {
		schema: productSchema.superRefine(async (data, ctx) => {
			// Validate slug uniqueness (excluding current product)
			const existingProduct = await prisma.product.findFirst({
				where: {
					slug: data.slug,
					id: { not: data.id },
				},
			})
			if (existingProduct) {
			ctx.addIssue({
				code: 'custom',
				message: 'Slug already exists',
				path: ['slug'],
			})
			}

			// Validate SKU uniqueness (excluding current product)
			const existingSku = await prisma.product.findFirst({
				where: {
					sku: data.sku,
					id: { not: data.id },
				},
			})
			if (existingSku) {
			ctx.addIssue({
				code: 'custom',
				message: 'SKU already exists',
				path: ['sku'],
			})
			}
		}).transform(async ({ images = [], ...data }) => {
			const productId = data.id
			
			return {
				...data,
				existingImages: images.filter(img => img.id && !imgHasFile(img)),
				newImages: await Promise.all(
					images
						.filter(imageHasFile)
						.map(async (image, index) => {
							return {
								altText: image.altText,
								objectKey: await uploadProductImage(productId, image.file!),
								displayOrder: images.filter(img => !imageHasFile(img)).length + index,
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

	const { existingImages, newImages, ...productData } = submission.value

	// Load existing product to compare changes
	const existingProduct = await prisma.product.findUnique({
		where: { id: productData.id },
		include: {
			images: true,
			variants: {
				include: {
					attributeValues: true,
				},
			},
			tags: {
				include: {
					tag: true,
				},
			},
		},
	})

	invariantResponse(existingProduct, 'Product not found', { status: 404 })

	try {
		await prisma.$transaction(async (tx) => {
			// Update product basic info
			const { variants = [], tags, ...productDataWithoutVariants } = productData
			
			const newTagNames = tags || []

			// Update the product
			await tx.product.update({
				where: { id: productData.id },
				data: {
					...productDataWithoutVariants,
					images: {
						// Delete removed images
						delete: existingProduct.images
							.filter(existingImg => !existingImages.find(img => img.id === existingImg.id))
							.map(img => ({ id: img.id })),
						// Add new images
						create: newImages,
					},
				},
			})

			// Handle tags separately - delete all and recreate
			// First, delete existing product-to-tag connections
			await tx.productToTag.deleteMany({
				where: { productId: productData.id },
			})

			// Upsert tags (create if they don't exist) and connect to product
			for (const tagName of newTagNames) {
				// Get or create tag
				const tag = await tx.productTag.upsert({
					where: { name: tagName },
					create: { name: tagName },
					update: {},
				})
				
				// Connect product to tag
				await tx.productToTag.create({
					data: {
						productId: productData.id,
						tagId: tag.id,
					},
				})
			}

			// Handle variants - delete all and recreate
			if (variants && variants.length > 0) {
				// Delete existing variants
				await tx.productVariant.deleteMany({
					where: { productId: productData.id },
				})

				// Create new variants
				await tx.productVariant.createMany({
					data: variants.map((variant) => ({
						productId: productData.id,
						sku: variant.sku,
						price: variant.price,
						stockQuantity: variant.stockQuantity,
					})),
				})

				// Get created variants
				const createdVariants = await tx.productVariant.findMany({
					where: { productId: productData.id },
				})

				// Create attribute value connections
				for (const [index, variant] of variants.entries()) {
					if (variant.attributeValueIds && variant.attributeValueIds.length > 0) {
						const attributeValueIds = variant.attributeValueIds
							.filter((id) => id && id.trim() !== '' && id !== 'none')

						if (attributeValueIds.length > 0 && createdVariants[index]) {
							await tx.variantAttributeValue.createMany({
								data: attributeValueIds.map((attributeValueId) => ({
									variantId: createdVariants[index]!.id,
									attributeValueId,
								})),
							})
						}
					}
				}
			} else {
				// If no variants, delete existing ones
				await tx.productVariant.deleteMany({
					where: { productId: productData.id },
				})
			}
		})

		return redirectWithToast(`/admin/products/${productData.slug}`, {
			description: 'Product updated successfully',
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

/**
 * Checks if an image object has a valid file
 * 
 * @param img - Image object with optional id and file
 * @returns True if the image has a valid file with size > 0
 */
function imgHasFile(img: { id?: string; file?: File }): boolean {
	return Boolean(img.file?.size && img.file?.size > 0)
}

