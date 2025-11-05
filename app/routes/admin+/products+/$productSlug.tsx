import { invariantResponse } from '@epic-web/invariant'
import { Link, useFetcher } from 'react-router'
import { ProductImageScrollArea } from '#app/components/product-image-scroll-area.tsx'
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
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
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
import { type Route } from './+types/$productSlug.ts'

/**
 * Loads product details for display
 * 
 * @param params - Route parameters containing the product slug
 * @param request - HTTP request object
 * @returns Product data with all relations (images, variants, tags, category)
 * @throws {invariantResponse} If product is not found (404)
 */
export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const product = await prisma.product.findUnique({
		where: { slug: params.productSlug },
		include: {
			category: {
				select: { id: true, name: true, slug: true },
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

	const currency = await getStoreCurrency()

	return {
		product: {
			...product,
			price: Number(product.price),
			variants: product.variants.map(variant => ({
				...variant,
				price: variant.price ? Number(variant.price) : null,
				attributes: variant.attributeValues.reduce((acc: any, av: any) => {
					acc[av.attributeValue.attribute.name] = av.attributeValue.value
					return acc
				}, {}),
			})),
		},
		currency,
	}
}

/**
 * Generates metadata for the product view page
 * 
 * @param data - Route data containing product information
 * @returns Array of meta tags for the page
 */
export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `${data?.product.name} | Admin | Epic Shop` },
	{ name: 'description', content: `View product: ${data?.product.name}` },
]

/**
 * StatusBadge component for displaying product status
 * 
 * @param status - Product status (ACTIVE, ARCHIVED, DRAFT)
 * @returns Badge component with appropriate styling based on status
 */
function StatusBadge({ status }: { status: string }) {
	if (status === 'ACTIVE') {
		return <Badge variant="success">Active</Badge>
	}
	if (status === 'ARCHIVED') {
		return <Badge variant="destructive">Archived</Badge>
	}
	return <Badge variant="secondary">Draft</Badge>
}

/**
 * StockBadge component for displaying stock quantity status
 * 
 * @param stockQuantity - Current stock quantity
 * @returns Badge component with stock status (Out of Stock, Low Stock, In Stock)
 */
function StockBadge({ stockQuantity }: { stockQuantity: number }) {
	if (stockQuantity === 0) {
		return <Badge variant="destructive">Out of Stock</Badge>
	}
	if (stockQuantity <= 10) {
		return <Badge variant="warning">Low Stock ({stockQuantity})</Badge>
	}
	return <Badge variant="success">In Stock ({stockQuantity})</Badge>
}

/**
 * DeleteProductButton component with confirmation dialog
 * 
 * @param product - Product data to delete
 * @returns Alert dialog button for deleting the product
 */
function DeleteProductButton({ product }: { product: any }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="destructive"
					className="h-9 px-4 rounded-lg font-medium transition-colors duration-200"
				>
					<Icon name="trash" className="h-4 w-4 mr-2" />
					Delete Product
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

/**
 * ProductView component for displaying product details
 * 
 * @param loaderData - Product data loaded from the loader function
 * @returns React component with product information, images, variants, and metadata
 */
export default function ProductView({ loaderData }: Route.ComponentProps) {
	const { product, currency } = loaderData
	const totalStock = product.variants.reduce((sum: number, variant: any) => sum + variant.stockQuantity, 0)

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title and badges */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-3xl font-normal text-[#101828]">{product.name}</h1>
						<StatusBadge status={product.status} />
					</div>
					<p className="text-sm font-normal text-[#4A5565] mt-1">
						SKU: {product.sku} · Created {new Date(product.createdAt).toLocaleDateString()}
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50">
						<Link to={`/admin/products/${product.slug}/edit`}>
							<Icon name="pencil-1" className="h-4 w-4 mr-2" />
							Edit
						</Link>
					</Button>
					<DeleteProductButton product={product} />
				</div>
			</div>

			{/* Statistics cards in grid */}
			<div className="grid gap-6 md:grid-cols-3">
				<Card className="rounded-lg border border-[#D1D5DC]">
					<CardHeader className="pb-2">
						<div className="text-sm font-normal text-[#4A5565]">
							Total Variants
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-normal text-[#101828]">{product.variants.length}</div>
						<p className="text-xs font-normal text-[#4A5565] mt-1">
							Product variations
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-lg border border-[#D1D5DC]">
					<CardHeader className="pb-2">
						<div className="text-sm font-normal text-[#4A5565]">
							Total Stock
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-normal text-[#101828]">{totalStock}</div>
						<p className="text-xs font-normal text-[#4A5565] mt-1">
							Units available
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-lg border border-[#D1D5DC]">
					<CardHeader className="pb-2">
						<div className="text-sm font-normal text-[#4A5565]">
							Price
						</div>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-normal text-[#101828]">
							{formatPrice(product.price, currency)}
						</div>
						<p className="text-xs font-normal text-[#4A5565] mt-1">
							Base price
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Product Details - Full Width */}
			<Card className="rounded-lg border border-[#D1D5DC]">
				<CardHeader>
					<h2 className="text-lg font-normal text-[#101828]">Product Details</h2>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-3 gap-8">
						<div>
							<div className="text-sm font-normal text-[#4A5565] mb-2">Stock Status</div>
							<StockBadge stockQuantity={totalStock} />
						</div>

						<div>
							<div className="text-sm font-normal text-[#4A5565] mb-2">Category</div>
							<div className="text-sm font-normal text-[#101828]">
								{product.category ? (
									<Link 
										to={`/admin/categories/${product.category.slug}`}
										className="text-primary hover:underline"
									>
										{product.category.name}
									</Link>
								) : (
									'Uncategorized'
								)}
							</div>
						</div>

						{product.tags.length > 0 && (
							<div>
								<div className="text-sm font-normal text-[#4A5565] mb-2">Tags</div>
								<div className="flex flex-wrap gap-1">
									{product.tags.map(({ tag }: any) => (
										<Badge key={tag.name} variant="secondary" className="text-xs">
											{tag.name}
										</Badge>
									))}
								</div>
							</div>
						)}
					</div>

					{product.description && (
						<div className="mt-6 pt-6 border-t border-[#D1D5DC]">
							<div className="text-sm font-normal text-[#4A5565] mb-3">Description</div>
							<div className="text-sm font-normal text-[#101828] leading-relaxed whitespace-pre-wrap">
								{product.description}
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Product Images - Horizontal Scroll */}
			<Card className="rounded-lg border border-[#D1D5DC]">
				<CardHeader>
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-normal text-[#101828]">Product Images</h2>
						{product.images.length > 0 && (
							<div className="flex items-center gap-2 text-sm font-normal text-[#4A5565]">
								<Icon name="image" className="h-4 w-4" />
								<span>{product.images.length} images</span>
							</div>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{product.images.length > 0 ? (
						<ProductImageScrollArea images={product.images} productName={product.name} />
					) : (
						<div className="flex aspect-square items-center justify-center rounded-lg border bg-muted">
							<Icon name="image" className="h-12 w-12 text-[#4A5565]" />
						</div>
					)}
				</CardContent>
			</Card>

			{/* Product Variants */}
			{product.variants.length > 0 && (
				<Card className="rounded-lg border border-[#D1D5DC]">
					<CardHeader>
						<h2 className="text-lg font-normal text-[#101828]">Product Variants</h2>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="text-sm font-normal text-[#4A5565]">SKU</TableHead>
									<TableHead className="text-sm font-normal text-[#4A5565]">Attributes</TableHead>
									<TableHead className="hidden md:table-cell text-sm font-normal text-[#4A5565]">Price</TableHead>
									<TableHead className="text-sm font-normal text-[#4A5565]">Stock</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{product.variants.map((variant: any) => (
									<TableRow key={variant.id} className="transition-colors duration-150 hover:bg-muted/50">
										<TableCell className="font-normal text-[#101828]">
											{variant.sku}
										</TableCell>
										<TableCell>
											<div className="flex flex-wrap gap-1">
												{Object.entries(variant.attributes).map(([key, value]) => (
													<Badge key={key} variant="secondary" className="text-xs">
														{key}: {String(value)}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell className="hidden md:table-cell">
											{variant.price ? (
												<span className="font-normal text-[#101828]">
													{formatPrice(variant.price, currency)}
												</span>
											) : (
												<span className="text-[#4A5565]">Base price</span>
											)}
										</TableCell>
										<TableCell>
											<StockBadge stockQuantity={variant.stockQuantity} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
