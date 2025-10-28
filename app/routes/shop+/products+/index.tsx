import { useState, useMemo } from 'react'
import { Link } from 'react-router'
import { prisma } from '#app/utils/db.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader() {
	const products = await prisma.product.findMany({
		where: {
			status: 'ACTIVE',
		},
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
		},
		orderBy: { name: 'asc' },
	})

	const categories = await prisma.category.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	const currency = await getStoreCurrency()

	return { products, categories, currency }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Products | Shop | Epic Shop' },
	{ name: 'description', content: 'Browse our product catalog' },
]

export default function ProductsIndex({ loaderData }: Route.ComponentProps) {
	const { products, categories, currency } = loaderData

	const [searchTerm, setSearchTerm] = useState('')
	const [selectedCategory, setSelectedCategory] = useState('all')

	// Filter products
	const filteredProducts = useMemo(() => {
		let filtered = products

		// Filter by search term
		if (searchTerm.trim()) {
			filtered = filtered.filter((product) =>
				product.name.toLowerCase().includes(searchTerm.toLowerCase()),
			)
		}

		// Filter by category
		if (selectedCategory !== 'all') {
			filtered = filtered.filter((product) => product.category.id === selectedCategory)
		}

		return filtered
	}, [products, searchTerm, selectedCategory])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Products</h1>
				<p className="text-muted-foreground">
					{filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
				</p>
			</div>

			{/* Filters */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<input
						type="search"
						placeholder="Search products by name..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="w-full px-4 py-2 border rounded-md"
					/>
				</div>
				<div className="sm:w-48">
					<select
						value={selectedCategory}
						onChange={(e) => setSelectedCategory(e.target.value)}
						className="w-full px-4 py-2 border rounded-md"
						aria-label="Filter by category"
					>
						<option value="all">All Categories</option>
						{categories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Products Grid */}
			{filteredProducts.length === 0 ? (
				<div className="text-center py-12">
					<p className="text-muted-foreground">No products found.</p>
				</div>
			) : (
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{filteredProducts.map((product) => (
						<Link
							key={product.id}
							to={`/shop/products/${product.slug}`}
							className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-200"
							data-testid="product-card"
						>
							<div className="aspect-video bg-muted flex items-center justify-center">
								{product.images[0] ? (
									<img
										src={`/resources/images?objectKey=${encodeURIComponent(product.images[0].objectKey)}`}
										alt={product.images[0].altText || product.name}
										className="w-full h-full object-cover"
									/>
								) : (
									<span className="text-muted-foreground">No image</span>
								)}
							</div>
						<div className="p-4">
							<h3 className="font-semibold mb-1">{product.name}</h3>
							<p className="text-sm text-muted-foreground mb-2">{product.category.name}</p>
							<p className="text-lg font-bold">{formatPrice(product.price, currency)}</p>
						</div>
						</Link>
					))}
				</div>
			)}
		</div>
	)
}

