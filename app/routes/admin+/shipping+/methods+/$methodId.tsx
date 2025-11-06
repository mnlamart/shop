import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { type Route } from './+types/$methodId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const method = await prisma.shippingMethod.findUnique({
		where: { id: params.methodId },
		include: {
			carrier: {
				select: {
					id: true,
					name: true,
					displayName: true,
				},
			},
			zone: {
				select: {
					id: true,
					name: true,
				},
			},
			_count: {
				select: { orders: true },
			},
		},
	})

	invariantResponse(method, 'Shipping method not found', { status: 404 })

	const currency = await getStoreCurrency()

	return { method, currency }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.method.name} | Shipping Methods | Admin | Epic Shop` },
	{ name: 'description', content: `View shipping method: ${loaderData?.method.name}` },
]

export default function ShippingMethodView({ loaderData }: Route.ComponentProps) {
	const { method, currency } = loaderData

	let costDisplay = '—'
	if (method.rateType === 'FLAT' && method.flatRate !== null) {
		costDisplay = formatPrice(method.flatRate, currency)
	} else if (method.rateType === 'FREE') {
		costDisplay = method.freeShippingThreshold
			? `Free over ${formatPrice(method.freeShippingThreshold, currency)}`
			: 'Free'
	} else if (method.rateType === 'PRICE_BASED') {
		costDisplay = 'Price-based'
	} else if (method.rateType === 'WEIGHT_BASED') {
		costDisplay = 'Weight-based'
	}

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground">{method.name}</h1>
						{!method.isActive && <Badge variant="secondary">Inactive</Badge>}
					</div>
					<p className="text-sm text-muted-foreground">
						{method.description || 'No description provided'}
					</p>
				</div>
				<div className="flex items-center space-x-3">
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<Link to="/admin/shipping/methods">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back to Methods
						</Link>
					</Button>
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to={`/admin/shipping/methods/${method.id}/edit`}>
							<Icon name="pencil-1" className="mr-2 h-4 w-4" />
							Edit Method
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Method Information */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Method Information</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Name</label>
								<p className="text-lg font-medium mt-1">{method.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Status</label>
								<div className="mt-1">
									<Badge variant={method.isActive ? 'default' : 'secondary'}>
										{method.isActive ? 'Active' : 'Inactive'}
									</Badge>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Zone</label>
								<p className="text-lg mt-1">
									<Link
										to={`/admin/shipping/zones/${method.zone.id}`}
										className="text-primary hover:underline"
									>
										{method.zone.name}
									</Link>
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Carrier</label>
								<p className="text-lg mt-1">
									{method.carrier ? (
										<Badge variant="outline">{method.carrier.displayName}</Badge>
									) : (
										<span className="text-muted-foreground">Generic (no carrier)</span>
									)}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Rate Type</label>
								<div className="mt-1">
									<Badge variant="secondary">{method.rateType.replace('_', ' ')}</Badge>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Cost</label>
								<p className="text-lg font-medium mt-1">{costDisplay}</p>
							</div>
							{method.rateType === 'FLAT' && method.flatRate !== null && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">Flat Rate</label>
									<p className="text-lg font-medium mt-1">
										{formatPrice(method.flatRate, currency)}
									</p>
								</div>
							)}
							{method.rateType === 'FREE' && method.freeShippingThreshold !== null && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">
										Free Shipping Threshold
									</label>
									<p className="text-lg font-medium mt-1">
										{formatPrice(method.freeShippingThreshold, currency)}
									</p>
								</div>
							)}
							{method.rateType === 'WEIGHT_BASED' && method.weightRates && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">Weight Rates</label>
									<pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
										{JSON.stringify(method.weightRates, null, 2)}
									</pre>
								</div>
							)}
							{method.rateType === 'PRICE_BASED' && method.priceRates && (
								<div>
									<label className="text-sm font-medium text-muted-foreground">Price Rates</label>
									<pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
										{JSON.stringify(method.priceRates, null, 2)}
									</pre>
								</div>
							)}
							<div>
								<label className="text-sm font-medium text-muted-foreground">Display Order</label>
								<p className="text-lg mt-1">{method.displayOrder}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">
									Estimated Delivery Days
								</label>
								<p className="text-lg mt-1">
									{method.estimatedDays ? `${method.estimatedDays} days` : 'Not specified'}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Description</label>
								<p className="text-sm mt-1">
									{method.description || (
										<span className="text-muted-foreground italic">No description provided</span>
									)}
								</p>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Usage Statistics */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Usage Statistics</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Orders Using This Method</label>
								<p className="text-2xl font-bold mt-1">{method._count.orders}</p>
								<p className="text-xs text-muted-foreground mt-1">
									Historical order data is preserved even if this method is deleted
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}

