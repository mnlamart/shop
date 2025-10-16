import { parseWithZod } from '@conform-to/zod'
import { parseFormData } from '@mjackson/form-data-parser'
import { z } from 'zod'
import { ProductEditorSchema, type ImageFieldset, type VariantFieldset } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { uploadProductImage } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
// Constants
const MAX_UPLOAD_SIZE = 1024 * 1024 * 3 // 3MB
const DEFAULT_CURRENCY = 'USD'
const DEFAULT_STATUS = 'DRAFT'

// Helper functions
function imageHasId(image: ImageFieldset): image is ImageFieldset & { id: string } {
	return Boolean(image.id)
}

function imageHasFile(image: ImageFieldset): image is ImageFieldset & { file: File } {
	return Boolean(image.file && image.file.size > 0)
}

function variantHasId(variant: VariantFieldset): variant is VariantFieldset & { id: string } {
	return Boolean(variant.id)
}

export async function action({ request }: { request: Request }) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request, {
		maxFileSize: MAX_UPLOAD_SIZE,
	})

	const submission = await parseWithZod(formData, {
		schema: ProductEditorSchema.superRefine(async (data, ctx) => {
			// Check if product exists (for updates)
			if (data.id) {
				const existingProduct = await prisma.product.findUnique({
					where: { id: data.id },
				})
				if (!existingProduct) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Product not found',
					})
				}
			}

			// Check SKU uniqueness
			const existingProduct = await prisma.product.findFirst({
				where: {
					sku: data.sku,
					...(data.id ? { id: { not: data.id } } : {}),
				},
			})
			if (existingProduct) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'SKU already exists',
					path: ['sku'],
				})
			}

			// Check slug uniqueness
			const existingSlug = await prisma.product.findFirst({
				where: {
					slug: data.slug,
					...(data.id ? { id: { not: data.id } } : {}),
				},
			})
			if (existingSlug) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Slug already exists',
					path: ['slug'],
				})
			}
		}).transform(async ({ images = [], variants = [], tags = [], ...data }) => {
			const productId = data.id || crypto.randomUUID()
			
			// Process images in parallel
			const [imageUpdates, newImages] = await Promise.all([
				Promise.all(
					images.filter(imageHasId).map(async (image) => {
						if (imageHasFile(image)) {
							return {
								id: image.id,
								altText: image.altText,
								objectKey: await uploadProductImage(productId, image.file),
								displayOrder: image.displayOrder,
								isPrimary: image.isPrimary,
							}
						} else {
							return {
								id: image.id,
								altText: image.altText,
								displayOrder: image.displayOrder,
								isPrimary: image.isPrimary,
							}
						}
					}),
				),
				Promise.all(
					images
						.filter(imageHasFile)
						.filter((image) => !image.id)
						.map(async (image) => ({
							altText: image.altText,
							objectKey: await uploadProductImage(productId, image.file),
							displayOrder: image.displayOrder,
							isPrimary: image.isPrimary,
						})),
				),
			])
			
			return {
				...data,
				id: productId,
				imageUpdates,
				newImages,
				variants,
				tags,
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const {
		id: productId,
		name,
		slug,
		description,
		sku,
		price,
		currency,
		status,
		categoryId,
		imageUpdates = [],
		newImages = [],
		variants = [],
		tags = [],
	} = submission.value

	// Create or update product
	let updatedProduct
	try {
		updatedProduct = await prisma.product.upsert({
		select: { id: true, slug: true },
		where: { id: productId },
		create: {
			id: productId,
			name,
			slug,
			description,
			sku,
			price,
			currency: currency || DEFAULT_CURRENCY,
			status: status || DEFAULT_STATUS,
			categoryId: categoryId === 'none' ? null : categoryId,
			images: {
				create: newImages,
			},
			variants: {
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
			},
			tags: {
				create: tags.map((tagName) => ({
					tag: {
						connectOrCreate: {
							where: { name: tagName },
							create: { name: tagName },
						},
					},
				})),
			},
		},
		update: {
			name,
			slug,
			description,
			sku,
			price,
			currency: currency || DEFAULT_CURRENCY,
			status: status || DEFAULT_STATUS,
			categoryId: categoryId === 'none' ? null : categoryId,
			images: {
				deleteMany: { id: { notIn: imageUpdates.map((i) => i.id) } },
				updateMany: imageUpdates.map((updates) => ({
					where: { id: updates.id },
					data: {
						...updates,
						// If the image is new, we need to generate a new ID to bust the cache.
						id: updates.objectKey ? crypto.randomUUID() : updates.id,
					},
				})),
				create: newImages,
			},
			variants: {
				deleteMany: { id: { notIn: variants.filter(variantHasId).map((v) => v.id) } },
				updateMany: variants.filter(variantHasId).map((variant) => ({
					where: { id: variant.id },
					data: {
						sku: variant.sku,
						price: variant.price,
						stockQuantity: variant.stockQuantity,
					},
				})),
				create: variants.filter((v) => !v.id).map((variant) => ({
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
			},
			tags: {
				deleteMany: {},
				create: tags.map((tagName) => ({
					tag: {
						connectOrCreate: {
							where: { name: tagName },
							create: { name: tagName },
						},
					},
				})),
			},
		},
	})
	} catch (error) {
		console.error('Failed to create/update product:', error)
		return {
			result: submission.reply({
				formErrors: ['Failed to save product. Please try again.'],
			}),
		}
	}

	// Handle variant attribute updates for existing variants
	try {
		const existingVariants = variants.filter(variantHasId)
		for (const variant of existingVariants) {
			// Delete existing attribute values for this variant
			await prisma.variantAttributeValue.deleteMany({
				where: { variantId: variant.id },
			})
			
			// Create new attribute value associations
			const validAttributeIds = (variant.attributeValueIds || [])
				.filter((id) => id && id.trim() !== '' && id !== 'none')
			if (validAttributeIds.length > 0) {
				await prisma.variantAttributeValue.createMany({
					data: validAttributeIds.map((attributeValueId) => ({
						variantId: variant.id,
						attributeValueId,
					})),
				})
			}
		}
	} catch (error) {
		console.error('Failed to update variant attributes:', error)
		// Continue execution - the product was saved successfully
	}

	return redirectWithToast(`/admin/products/${updatedProduct.slug}`, {
		type: 'success',
		title: productId ? 'Product Updated' : 'Product Created',
		description: productId ? 'Product updated successfully.' : 'Product created successfully.',
	})
}
