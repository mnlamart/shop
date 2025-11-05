import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$categorySlug.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const category = await prisma.category.findUnique({
		where: { slug: params.categorySlug },
		include: {
			parent: {
				select: { id: true, name: true, slug: true },
			},
			children: {
				select: { 
					id: true, 
					name: true, 
					slug: true, 
					description: true,
					_count: { select: { products: true } }
				},
				orderBy: { name: 'asc' },
			},
			_count: {
				select: { products: true },
			},
		},
	})

	invariantResponse(category, 'Category not found', { status: 404 })

	// Get products in this category
	const products = await prisma.product.findMany({
		where: { categoryId: category.id },
		select: {
			id: true,
			name: true,
			slug: true,
			sku: true,
			price: true,
			status: true,
			images: {
				select: { objectKey: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
		},
		orderBy: { name: 'asc' },
		take: 10, // Limit to first 10 products
	})

	return { category, products }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.category.name} | Categories | Admin | Epic Shop` },
	{ name: 'description', content: `View category: ${loaderData?.category.name}` },
]

export default function CategoryView({ loaderData }: Route.ComponentProps) {
	const { category, products } = loaderData
	const isUncategorized = category.id === UNCATEGORIZED_CATEGORY_ID

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground">{category.name}</h1>
						{isUncategorized && (
							<Badge variant="warning">System Category</Badge>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						{category.description || 'No description provided'}
						{isUncategorized && (
							<span className="block mt-2 text-sm text-amber-600 dark:text-amber-400">
								⚠️ This is a system category. Products without a category will be assigned to this one.
							</span>
						)}
					</p>
				</div>
				<div className="flex items-center space-x-3">
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<Link to="/admin/categories">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back to Categories
						</Link>
					</Button>
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to={`/admin/categories/${category.slug}/edit`}>
							<Icon name="pencil-1" className="mr-2 h-4 w-4" />
							Edit Category
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Category Information */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Category Information</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Name</label>
								<p className="text-lg font-medium mt-1">{category.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Slug</label>
								<Badge variant="outline" className="mt-1 font-mono">
									{category.slug}
								</Badge>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Parent Category</label>
								<p className="text-lg mt-1">
									{category.parent ? (
										<Link 
											to={`/admin/categories/${category.parent.slug}`}
											className="text-primary hover:underline transition-colors duration-200"
										>
											{category.parent.name}
										</Link>
									) : (
										<span className="text-muted-foreground">Root Category</span>
									)}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Description</label>
								<p className="text-sm mt-1">
									{category.description || (
										<span className="text-muted-foreground italic">No description provided</span>
									)}
								</p>
							</div>
						</CardContent>
					</Card>

					{/* Statistics */}
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Statistics</h2>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-6">
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10">
									<div className="text-3xl font-bold text-primary mb-1">{category._count.products}</div>
									<div className="text-sm text-muted-foreground font-medium">Products</div>
								</div>
								<div className="text-center p-4 rounded-lg bg-gradient-to-br from-secondary/5 to-secondary/10">
									<div className="text-3xl font-bold text-secondary-foreground mb-1">{category.children.length}</div>
									<div className="text-sm text-muted-foreground font-medium">Subcategories</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Subcategories */}
				<div className="space-y-8">
					{category.children.length > 0 && (
						<Card className="rounded-[14px]">
							<CardHeader>
								<h2 className="text-base font-normal text-foreground">Subcategories</h2>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{category.children.map((child) => (
										<div key={child.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors duration-200">
											<div className="flex-1">
												<Link 
													to={`/admin/categories/${child.slug}`}
													className="font-medium text-primary hover:underline transition-colors duration-200"
												>
													{child.name}
												</Link>
												{child.description && (
													<p className="text-sm text-muted-foreground mt-1">{child.description}</p>
												)}
											</div>
											<Badge variant="outline" className="text-xs">
												{child._count.products} products
											</Badge>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}

					{/* Recent Products */}
					{products.length > 0 && (
						<Card className="rounded-[14px]">
							<CardHeader>
								<div className="flex items-center justify-between">
									<h2 className="text-base font-normal text-foreground">Recent Products</h2>
									<Button asChild variant="outline" size="sm" className="h-9 rounded-lg font-medium">
										<Link to={`/admin/products?category=${category.slug}`}>
											View All Products
										</Link>
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								<div className="space-y-3">
									{products.map((product) => (
										<div key={product.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors duration-200">
											<div className="flex items-center space-x-4">
												{product.images[0] && (
													<div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
														<Icon name="image" className="h-6 w-6 text-muted-foreground" />
													</div>
												)}
												<div>
													<Link 
														to={`/admin/products/${product.slug}`}
														className="font-medium text-primary hover:underline transition-colors duration-200"
													>
														{product.name}
													</Link>
													<p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
												</div>
											</div>
											<div className="text-right">
												<div className="font-semibold text-lg">${Number(product.price).toFixed(2)}</div>
												<Badge 
													variant={product.status === 'ACTIVE' ? 'success' : 'secondary'} 
													className="text-xs mt-1"
												>
													{product.status}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
			<Icon name="question-mark-circled" className="h-12 w-12 text-muted-foreground" />
			<h2 className="text-xl font-semibold">Category not found</h2>
			<p className="text-muted-foreground text-center">
				The category you're looking for doesn't exist or has been deleted.
			</p>
			<Button asChild>
				<Link to="/admin/categories">
					<Icon name="arrow-left" className="mr-2 h-4 w-4" />
					Back to Categories
				</Link>
			</Button>
		</div>
	)
}
