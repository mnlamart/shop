import { invariantResponse } from '@epic-web/invariant'
import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$categorySlug.ts'

export async function loader({ params }: Route.LoaderArgs) {
	const category = await prisma.category.findUnique({
		where: {
			slug: params.categorySlug,
		},
	})

	invariantResponse(category, 'Category not found', { status: 404 })

	// Get all products for all categories (for client-side filtering)
	const products = await prisma.product.findMany({
		where: {
			status: 'ACTIVE',
		},
		include: {
			category: {
				select: { id: true, name: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
		},
		orderBy: { name: 'asc' },
	})

	// Get all categories for the filter dropdown
	const allCategories = await prisma.category.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	const currency = await getStoreCurrency()

	return { category, products, allCategories, currency: currency || { symbol: '$', decimals: 2 } }
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.category) {
		return [{ title: 'Category not found' }]
	}

	return [
		{ title: `${loaderData.category.name} - Shop` },
		{ name: 'description', content: loaderData.category.description || `Browse ${loaderData.category.name} products` },
	]
}

export default function CategoryPage({ loaderData }: Route.ComponentProps) {
	const { category, products, allCategories, currency } = loaderData
	const [selectedCategory, setSelectedCategory] = useState(category.id)

	// Filter products by selected category
	const filteredProducts = useMemo(() => {
		return products.filter((product) => product.category.id === selectedCategory)
	}, [products, selectedCategory])

	// Find the selected category for display
	const selectedCategoryObj = allCategories.find((cat) => cat.id === selectedCategory)

	return (
		<div className="container py-8">
			<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					{selectedCategoryObj && selectedCategoryObj.name}
				</h1>
				{selectedCategory === category.id && category.description && (
					<p className="text-muted-foreground mt-2">{category.description}</p>
				)}
				<p className="text-muted-foreground mt-1">
					{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
				</p>
			</div>

			{/* Filters */}
			<div className="sm:w-48">
				<select
					value={selectedCategory}
					onChange={(e) => setSelectedCategory(e.target.value)}
					className="w-full px-4 py-2 border rounded-md"
					aria-label="Filter by category"
				>
					{allCategories.map((cat) => (
						<option key={cat.id} value={cat.id}>
							{cat.name}
						</option>
					))}
				</select>
			</div>

			{/* Products Grid */}
			{filteredProducts.length === 0 ? (
				<div className="text-center py-12">
					<p className="text-muted-foreground">No products available in this category.</p>
				</div>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{filteredProducts.map((product) => (
						<Link
							key={product.id}
							to={`/shop/products/${product.slug}`}
							className="block p-4 border rounded-lg hover:shadow-md transition-shadow duration-200"
						>
						{product.images.length > 0 && product.images[0] && (
							<div className="aspect-square mb-4 bg-muted rounded-md overflow-hidden">
								<img
									src={product.images[0].objectKey}
									alt={product.images[0].altText || product.name}
									className="w-full h-full object-cover"
								/>
							</div>
						)}
							<h2 className="font-semibold text-lg mb-1">{product.name}</h2>
							<p className="text-primary font-medium">
								{formatPrice(product.price, currency)}
							</p>
						</Link>
					))}
				</div>
			)}
		</div>
		</div>
	)
}

