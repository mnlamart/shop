import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$attributeId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const attribute = await prisma.attribute.findUnique({
		where: { id: params.attributeId },
		include: {
			values: {
				orderBy: { displayOrder: 'asc' },
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
			_count: {
				select: { values: true },
			},
		},
	})

	invariantResponse(attribute, 'Attribute not found', { status: 404 })

	// Get products that use this attribute
	const products = await prisma.product.findMany({
		where: {
			variants: {
				some: {
					attributeValues: {
						some: {
							attributeValue: {
								attributeId: attribute.id,
							},
						},
					},
				},
			},
		},
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

	return { 
		attribute, 
		products: products.map(product => ({
			...product,
			price: Number(product.price),
		}))
	}
}

export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `${data?.attribute.name} | Attributes | Admin | Epic Shop` },
	{ name: 'description', content: `View attribute: ${data?.attribute.name}` },
]

export default function AttributeView({ loaderData }: Route.ComponentProps) {
	const { attribute, products } = loaderData
	const totalVariants = attribute.values.reduce((sum: number, value: any) => sum + value._count.variants, 0)
	const hasVariants = totalVariants > 0

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground">{attribute.name}</h1>
						<Badge variant={hasVariants ? 'success' : 'secondary'}>
							{hasVariants ? 'In Use' : 'Unused'}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Attribute for product variants with {attribute._count.values} values
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" asChild className="h-9 rounded-lg font-medium">
						<Link to="edit">
							<Icon name="pencil-1" className="h-4 w-4 mr-2" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			{/* Statistics cards in grid */}
			<div className="grid gap-6 md:grid-cols-3">
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Values
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-normal text-foreground">{attribute._count.values}</div>
						<p className="text-xs text-muted-foreground">
							Available values for this attribute
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Product Variants
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-normal text-foreground">{totalVariants}</div>
						<p className="text-xs text-muted-foreground">
							Variants using this attribute
						</p>
					</CardContent>
				</Card>
				
				<Card className="rounded-[14px]">
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Created
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-sm font-medium">
							{new Date(attribute.createdAt).toLocaleDateString()}
						</div>
						<p className="text-xs text-muted-foreground">
							{new Date(attribute.createdAt).toLocaleTimeString()}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Values section */}
			<Card className="rounded-[14px]">
				<CardHeader>
					<CardTitle className="text-base font-normal text-foreground">Attribute Values</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{attribute.values.map((value: any) => (
							<div key={value.id} className="flex items-center justify-between p-3 border rounded-lg">
								<div>
									<div className="font-medium">{value.value}</div>
									<p className="text-sm text-muted-foreground">
										{value._count.variants} variants
									</p>
								</div>
								<Badge variant={value._count.variants > 0 ? 'success' : 'secondary'}>
									{value._count.variants > 0 ? 'Used' : 'Unused'}
								</Badge>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Products using this attribute */}
			{products.length > 0 && (
				<Card className="rounded-[14px]">
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="text-base font-normal text-foreground">Products Using This Attribute</CardTitle>
							<Button variant="outline" size="sm" asChild>
								<Link to={`/admin/products?attribute=${attribute.id}`}>
									View All
								</Link>
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{products.map((product: any) => (
								<div key={product.id} className="flex items-center justify-between p-3 border rounded-lg">
									<div className="flex items-center gap-3">
										{product.images[0] ? (
											<div className="h-10 w-10 flex-shrink-0">
												<img 
													src={`/resources/images?objectKey=${encodeURIComponent(product.images[0].objectKey)}`} 
													alt={product.images[0].altText || product.name}
													className="h-10 w-10 rounded object-cover"
												/>
											</div>
										) : (
											<div className="h-10 w-10 flex-shrink-0 rounded bg-muted flex items-center justify-center">
												<Icon name="image" className="h-5 w-5 text-muted-foreground" />
											</div>
										)}
										<div>
											<Link 
												to={`/admin/products/${product.slug}`}
												className="font-medium text-primary hover:underline"
											>
												{product.name}
											</Link>
											<p className="text-sm text-muted-foreground">
												SKU: {product.sku} • ${product.price.toFixed(2)}
											</p>
										</div>
									</div>
									<Badge variant={product.status === 'ACTIVE' ? 'success' : 'secondary'}>
										{product.status}
									</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
