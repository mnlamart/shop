import { invariantResponse } from '@epic-web/invariant'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { deleteProductImages } from '#app/utils/storage.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$productId.delete.ts'

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	// Get product with images for cleanup
	const product = await prisma.product.findUnique({
		where: { slug: params.productId },
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
			console.error('Failed to delete product images from storage:', error)
			// Continue anyway - database is already cleaned up
		}
	}

	return redirectWithToast('/admin/products', {
		type: 'success',
		title: 'Product Deleted',
		description: `"${product.name}" has been deleted successfully.`,
	})
}
