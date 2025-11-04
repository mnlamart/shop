import { invariantResponse } from '@epic-web/invariant'
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
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
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
					className="transition-colors duration-200"
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
	const primaryImage = product.images[0] // Already ordered by displayOrder in loader

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title and badges */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground">{product.name}</h1>
						<StatusBadge status={product.status} />
					</div>
					<p className="text-sm text-muted-foreground">
						SKU: {product.sku} • Created {new Date(product.createdAt).toLocaleDateString()}
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild className="h-9 rounded-lg font-medium">
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
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Variants
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-normal text-foreground">{product.variants.length}</div>
						<p className="text-xs text-muted-foreground">
							Product variations
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Stock
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-normal text-foreground">{totalStock}</div>
						<p className="text-xs text-muted-foreground">
							Units available
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Price
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-normal text-foreground">
							{formatPrice(product.price, currency)}
						</div>
						<p className="text-xs text-muted-foreground">
							Base price
						</p>
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Product Images */}
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Product Images</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{primaryImage ? (
								<div className="aspect-square rounded-lg border bg-muted">
									<img
										src={`/resources/images?objectKey=${encodeURIComponent(primaryImage.objectKey)}`}
										alt={primaryImage.altText || product.name}
										className="h-full w-full rounded-lg object-cover"
									/>
								</div>
							) : (
								<div className="flex aspect-square items-center justify-center rounded-lg border bg-muted">
									<Icon name="image" className="h-12 w-12 text-muted-foreground" />
								</div>
							)}
							
							{product.images.length > 1 && (
								<div className="grid grid-cols-4 gap-2">
									{product.images.slice(1).map((image: any) => (
										<div key={image.id} className="aspect-square rounded-lg border bg-muted">
											<img
												src={`/resources/images?objectKey=${encodeURIComponent(image.objectKey)}`}
												alt={image.altText || product.name}
												className="h-full w-full rounded-lg object-cover"
											/>
										</div>
									))}
								</div>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Product Details */}
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Product Details</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Stock Status</label>
								<div className="mt-1">
									<StockBadge stockQuantity={totalStock} />
								</div>
							</div>
							
							<div>
								<label className="text-sm font-medium text-muted-foreground">Category</label>
								<p className="text-sm">
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
								</p>
							</div>
							
							{product.tags.length > 0 && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">Tags</label>
									<div className="mt-1 flex flex-wrap gap-1">
										{product.tags.map(({ tag }: any) => (
											<Badge key={tag.name} variant="secondary" className="text-xs">
												{tag.name}
											</Badge>
										))}
									</div>
								</div>
							)}

							{product.description && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">Description</label>
									<div className="mt-1 text-sm whitespace-pre-wrap">
										{product.description}
									</div>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Product Variants */}
			{product.variants.length > 0 && (
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Product Variants</CardTitle>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>SKU</TableHead>
									<TableHead>Attributes</TableHead>
									<TableHead className="hidden md:table-cell">Price</TableHead>
									<TableHead>Stock</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{product.variants.map((variant: any) => (
									<TableRow key={variant.id} className="transition-colors duration-150 hover:bg-muted/50">
										<TableCell className="font-medium">
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
												<span className="font-medium">
													{formatPrice(variant.price, currency)}
												</span>
											) : (
												<span className="text-muted-foreground">Base price</span>
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
