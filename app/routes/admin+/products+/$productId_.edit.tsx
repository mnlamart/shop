import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$productId_.edit.ts'
import { ProductEditor } from './__product-editor.tsx'
import { action } from './__product-editor.server.tsx'

export { action }

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const product = await prisma.product.findUnique({
		where: { slug: params.productId },
		include: {
			category: {
				select: { id: true, name: true, parentId: true },
			},
			images: {
				orderBy: { displayOrder: 'asc' },
			},
			variants: {
				include: {
					attributeValues: {
						include: {
							attributeValue: {
								include: { attribute: true },
							},
						},
					},
				},
				orderBy: { id: 'asc' },
			},
			tags: {
				include: {
					tag: { select: { name: true } },
				},
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

	// Get categories and attributes for the form
	const [categories, attributes] = await Promise.all([
		prisma.category.findMany({
			select: { id: true, name: true, parentId: true },
			orderBy: { name: 'asc' },
		}),
		prisma.attribute.findMany({
			include: {
				values: {
					orderBy: { displayOrder: 'asc' },
				},
			},
			orderBy: { displayOrder: 'asc' },
		}),
	])

	return {
		product: {
			...product,
			price: Number(product.price),
			variants: product.variants.map(variant => ({
				...variant,
				price: variant.price ? Number(variant.price) : null,
				attributeValueIds: variant.attributeValues.map(av => av.attributeValueId),
			})),
		},
		categories,
		attributes: attributes.map(attr => ({
			id: attr.id,
			name: attr.name,
			values: attr.values.map(value => ({
				id: value.id,
				value: value.value,
			})),
		})),
	}
}

export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `Edit ${data?.product.name} | Admin | Epic Shop` },
	{ name: 'description', content: `Edit product: ${data?.product.name}` },
]

export default function EditProduct({ loaderData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Edit Product</h1>
					<p className="text-muted-foreground">
						Update product: {loaderData.product.name}
					</p>
				</div>
				<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
					<Link to={`/admin/products/${loaderData.product.slug}`}>Cancel</Link>
				</Button>
			</div>

			<ProductEditor
				product={loaderData.product}
				categories={loaderData.categories}
				attributes={loaderData.attributes}
			/>
		</div>
	)
}
