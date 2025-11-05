import { invariantResponse } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { deleteProductImages } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$productSlug.delete.ts'

/**
 * Handles product deletion including cleanup of images from storage
 * 
 * @param params - Route parameters containing the product slug
 * @param request - HTTP request object
 * @returns Redirect to products list with success message
 * @throws {invariantResponse} If product is not found (404)
 */
export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	// Get product with images for cleanup
	const product = await prisma.product.findUnique({
		where: { slug: params.productSlug },
		include: {
			images: {
				select: { objectKey: true },
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	// Extract objectKeys for cleanup
	const imageKeys = product.images.map(img => img.objectKey)

	// Delete from database (cascade will handle images and variants)
	await prisma.product.delete({
		where: { id: product.id },
	})

	// Clean up images from Tigris storage
	if (imageKeys.length > 0) {
		try {
			await deleteProductImages(imageKeys)
		} catch (error) {
			// Log error but continue - database is already cleaned up
			Sentry.captureException(error, {
				tags: { context: 'product-delete-storage' },
				extra: { productId: product.id, imageKeysCount: imageKeys.length },
			})
			// Continue anyway - database is already cleaned up
		}
	}

	return redirectWithToast('/admin/products', {
		type: 'success',
		title: 'Product Deleted',
		description: `"${product.name}" has been deleted successfully.`,
	})
}
