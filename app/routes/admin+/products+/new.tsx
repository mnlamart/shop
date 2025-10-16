import { Link } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/new.ts'
import { ProductEditor } from './__product-editor.tsx'
import { action } from './__product-editor.server.tsx'

export { action }

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

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

export const meta: Route.MetaFunction = () => [
	{ title: 'New Product | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new product' },
]

export default function NewProduct({ loaderData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
					<p className="text-muted-foreground">
						Add a new product to your catalog
					</p>
				</div>
				<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
					<Link to="/admin/products">Cancel</Link>
				</Button>
			</div>

			<ProductEditor
				categories={loaderData.categories}
				attributes={loaderData.attributes}
			/>
		</div>
	)
}
