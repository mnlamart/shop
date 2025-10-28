import { parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$categorySlug.delete.ts'

const DeleteCategorySchema = z.object({
	categoryId: z.string().min(1),
})

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: DeleteCategorySchema })

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}

	const category = await prisma.category.findUnique({
		where: { slug: params.categorySlug },
		include: {
			_count: { select: { products: true, children: true } },
		},
	})

	invariantResponse(category, 'Category not found', { status: 404 })

	// Find or create "Uncategorized" category
	const uncategorized = await prisma.category.upsert({
		where: { slug: 'uncategorized' },
		create: {
			name: 'Uncategorized',
			slug: 'uncategorized',
			description: 'Products without a specific category',
		},
		update: {},
	})

	// Prevent deletion of "Uncategorized" category
	if (category.id === uncategorized.id) {
		return redirectWithToast('/admin/categories', {
			type: 'error',
			description: 'Cannot delete the Uncategorized category',
		})
	}

	// Reassign products to Uncategorized
	if (category._count.products > 0) {
		await prisma.product.updateMany({
			where: { categoryId: category.id },
			data: { categoryId: uncategorized.id },
		})
	}

	// Reassign subcategories to parent or null
	if (category._count.children > 0) {
		await prisma.category.updateMany({
			where: { parentId: category.id },
			data: { parentId: category.parentId },
		})
	}

	// Delete the category
	await prisma.category.delete({ where: { id: category.id } })

	const productMsg = category._count.products > 0
		? ` ${category._count.products} products moved to Uncategorized.`
		: ''
	const childMsg = category._count.children > 0
		? ` ${category._count.children} subcategories reassigned.`
		: ''

	return redirectWithToast('/admin/categories', {
		description: `Category "${category.name}" deleted.${productMsg}${childMsg}`,
	})
}
