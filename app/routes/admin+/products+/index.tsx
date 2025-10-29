import { useState, useMemo } from 'react'
import { Link, useFetcher } from 'react-router'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all products for client-side filtering
	const products = await prisma.product.findMany({
		include: {
			category: {
				select: { id: true, name: true, slug: true },
			},
			images: {
				select: { objectKey: true, altText: true },
				orderBy: { displayOrder: 'asc' },
				take: 1,
			},
			variants: {
				select: { stockQuantity: true },
			},
			tags: {
				include: {
					tag: { select: { name: true } },
				},
			},
		},
		orderBy: { updatedAt: 'desc' },
	})

	// Get categories for filter
	const categories = await prisma.category.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	// Get currency for price formatting
	const currency = await getStoreCurrency()

	return {
		products,
		categories,
		currency,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Products | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage your product catalog' },
]

function StockBadge({ stockQuantity }: { stockQuantity: number }) {
	if (stockQuantity === 0) {
		return <Badge variant="destructive">Out of Stock</Badge>
	}
	if (stockQuantity <= 10) {
		return <Badge variant="warning">Low Stock ({stockQuantity})</Badge>
	}
	return <Badge variant="success">In Stock ({stockQuantity})</Badge>
}

function StatusBadge({ status }: { status: string }) {
	if (status === 'ACTIVE') {
		return <Badge variant="success">Active</Badge>
	}
	if (status === 'ARCHIVED') {
		return <Badge variant="destructive">Archived</Badge>
	}
	return <Badge variant="secondary">Draft</Badge>
}

function DeleteProductButton({ product }: { product: any }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive transition-colors duration-200"
				>
					<Icon name="trash" className="h-4 w-4" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Product</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete "{product.name}"? This action cannot be undone.
						{product.variants?.length > 0 && (
							<span className="block mt-2 text-destructive">
								This will also delete {product.variants.length} variant(s).
							</span>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<fetcher.Form 
						method="POST" 
						action={`/admin/products/${product.slug}/delete`}
					>
						<AlertDialogAction
							type="submit"
							disabled={fetcher.state !== 'idle'}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							{fetcher.state === 'idle' ? 'Delete Product' : 'Deleting...'}
						</AlertDialogAction>
					</fetcher.Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default function ProductsList({ loaderData }: Route.ComponentProps) {
	const { products, categories, currency } = loaderData
	
	// State for search and filtering
	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [categoryFilter, setCategoryFilter] = useState('all')

	// Filter products based on search and filter criteria
	const filteredProducts = useMemo(() => {
		let filtered = products

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(product => 
				product.name.toLowerCase().includes(search) ||
				product.sku.toLowerCase().includes(search)
			)
		}

		// Apply status filter
		if (statusFilter !== 'all') {
			filtered = filtered.filter(product => product.status === statusFilter)
		}

		// Apply category filter
		if (categoryFilter !== 'all') {
			filtered = filtered.filter(product => product.categoryId === categoryFilter)
		}

		return filtered
	}, [products, searchTerm, statusFilter, categoryFilter])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title and action button */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Products</h1>
					<p className="text-muted-foreground">
						Manage your product catalog ({products.length} total)
						{searchTerm.trim() || statusFilter !== 'all' || categoryFilter !== 'all' ? ` • ${filteredProducts.length} shown` : ''}
					</p>
				</div>
				<Link to="/admin/products/new">
					<Button>
						<Icon name="plus" className="h-4 w-4 mr-2" />
						Add Product
					</Button>
				</Link>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search products by name or SKU..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							<SelectItem value="DRAFT">Draft</SelectItem>
							<SelectItem value="ACTIVE">Active</SelectItem>
							<SelectItem value="ARCHIVED">Archived</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="sm:w-48">
					<Select value={categoryFilter} onValueChange={setCategoryFilter}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
							<SelectValue placeholder="Filter by category" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Categories</SelectItem>
							{categories.map((category) => (
								<SelectItem key={category.id} value={category.id}>
									{category.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Product</TableHead>
						<TableHead className="hidden md:table-cell">SKU</TableHead>
						<TableHead className="hidden md:table-cell">Price</TableHead>
						<TableHead>Stock</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="hidden lg:table-cell">Category</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredProducts.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="text-center py-8">
								{searchTerm.trim() || statusFilter !== 'all' || categoryFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon name="magnifying-glass" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No products match your search criteria.</p>
										<p className="text-sm">Try adjusting your search or filters.</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon name="archive" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No products found.</p>
										<Link to="/admin/products/new" className="text-primary hover:underline">
											Create your first product
										</Link>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						filteredProducts.map((product) => {
							const totalStock = product.variants.reduce((sum, variant) => sum + variant.stockQuantity, 0)
							const primaryImage = product.images[0]
							
							return (
								<TableRow key={product.id} className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
									<TableCell>
										<div className="flex items-center space-x-4">
											{primaryImage ? (
												<div className="h-12 w-12 flex-shrink-0">
													<img
														src={`/resources/images?objectKey=${encodeURIComponent(primaryImage.objectKey)}`}
														alt={primaryImage.altText || product.name}
														className="h-12 w-12 rounded-lg object-cover"
													/>
												</div>
											) : (
												<div className="h-12 w-12 flex-shrink-0 rounded-lg bg-muted flex items-center justify-center">
													<Icon name="image" className="h-6 w-6 text-muted-foreground" />
												</div>
											)}
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<Link 
														to={`/admin/products/${product.slug}`}
														className="font-medium text-primary hover:underline transition-colors duration-200"
													>
														{product.name}
													</Link>
												</div>
												<p className="text-sm text-muted-foreground md:hidden">
													SKU: {product.sku} • {formatPrice(product.price, currency)}
												</p>
												<div className="flex items-center gap-4 text-xs text-muted-foreground md:hidden mt-1">
													<span>{totalStock} in stock</span>
													<span>{product.category?.name || 'Uncategorized'}</span>
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell className="hidden md:table-cell">
										<span className="text-muted-foreground">
											{product.sku}
										</span>
									</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="font-medium">
										{formatPrice(product.price, currency)}
									</span>
								</TableCell>
									<TableCell>
										<StockBadge stockQuantity={totalStock} />
									</TableCell>
									<TableCell>
										<StatusBadge status={product.status} />
									</TableCell>
									<TableCell className="hidden lg:table-cell">
										<span className="text-muted-foreground">
											{product.category?.name || 'Uncategorized'}
										</span>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button variant="ghost" size="sm" asChild>
												<Link to={`/admin/products/${product.slug}`}>
													<Icon name="eye-open" className="h-4 w-4" />
												</Link>
											</Button>
											<Button variant="ghost" size="sm" asChild>
												<Link to={`/admin/products/${product.slug}/edit`}>
													<Icon name="pencil-1" className="h-4 w-4" />
												</Link>
											</Button>
											<DeleteProductButton product={product} />
										</div>
									</TableCell>
								</TableRow>
							)
						})
					)}
				</TableBody>
			</Table>
		</div>
	)
}
