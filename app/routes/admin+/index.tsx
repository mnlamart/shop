import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	
	// Get statistics for the dashboard
	const [productCount, categoryCount, attributeCount] = await Promise.all([
		prisma.product.count(),
		prisma.category.count(),
		prisma.attribute.count(),
	])
	
	return {
		stats: {
			products: productCount,
			categories: categoryCount,
			attributes: attributeCount,
		},
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Admin Dashboard | Epic Shop' },
	{ name: 'description', content: 'Admin dashboard for managing products and categories' },
]

export default function AdminDashboard() {
	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold">Admin Dashboard</h1>
				<p className="text-muted-foreground mt-2">
					Manage your e-commerce store from here
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{/* Products Management Card */}
				<div className="rounded-lg border bg-card p-6 shadow-sm">
					<div className="flex items-center space-x-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<Icon name="archive" className="h-6 w-6 text-primary" />
						</div>
						<div className="flex-1">
							<h3 className="text-lg font-semibold">Products</h3>
							<p className="text-sm text-muted-foreground">
								Manage your product catalog
							</p>
						</div>
					</div>
					<div className="mt-4 space-y-2">
						<Button asChild className="w-full">
							<a href="/admin/products">View Products</a>
						</Button>
						<Button asChild variant="outline" className="w-full">
							<a href="/admin/products/new">Add New Product</a>
						</Button>
					</div>
				</div>

				{/* Categories Management Card */}
				<div className="rounded-lg border bg-card p-6 shadow-sm">
					<div className="flex items-center space-x-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<Icon name="tags" className="h-6 w-6 text-primary" />
						</div>
						<div className="flex-1">
							<h3 className="text-lg font-semibold">Categories</h3>
							<p className="text-sm text-muted-foreground">
								Organize your products
							</p>
						</div>
					</div>
					<div className="mt-4 space-y-2">
						<Button asChild className="w-full">
							<a href="/admin/categories">View Categories</a>
						</Button>
						<Button asChild variant="outline" className="w-full">
							<a href="/admin/categories/new">Add New Category</a>
						</Button>
					</div>
				</div>

				{/* Attributes Card */}
				<div className="rounded-lg border bg-card p-6 shadow-sm">
					<div className="flex items-center space-x-4">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
							<Icon name="settings" className="h-6 w-6 text-primary" />
						</div>
						<div className="flex-1">
							<h3 className="text-lg font-semibold">Attributes</h3>
							<p className="text-sm text-muted-foreground">
								Configure product attributes
							</p>
						</div>
					</div>
					<div className="mt-4 space-y-2">
						<Button asChild className="w-full">
							<a href="/admin/attributes">View Attributes</a>
						</Button>
						<Button asChild variant="outline" className="w-full">
							<a href="/admin/attributes/new">Add New Attribute</a>
						</Button>
					</div>
				</div>
			</div>

			{/* Quick Actions */}
			<div>
				<h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
				<div className="flex flex-wrap gap-4">
					<Button asChild>
						<a href="/admin/products/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Create Product
						</a>
					</Button>
					<Button asChild variant="outline">
						<a href="/admin/categories/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Create Category
						</a>
					</Button>
					<Button asChild variant="outline">
						<a href="/admin/attributes/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Create Attribute
						</a>
					</Button>
				</div>
			</div>
		</div>
	)
}
