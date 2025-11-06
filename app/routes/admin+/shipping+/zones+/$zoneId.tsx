import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
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
import { type Route } from './+types/$zoneId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const zone = await prisma.shippingZone.findUnique({
		where: { id: params.zoneId },
		include: {
			methods: {
				include: {
					carrier: {
						select: {
							id: true,
							name: true,
							displayName: true,
						},
					},
				},
				orderBy: [
					{ displayOrder: 'asc' },
					{ name: 'asc' },
				],
			},
			_count: {
				select: { methods: true },
			},
		},
	})

	invariantResponse(zone, 'Shipping zone not found', { status: 404 })

	const currency = await getStoreCurrency()

	return { zone, currency }
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
	{ title: `${loaderData?.zone.name} | Shipping Zones | Admin | Epic Shop` },
	{ name: 'description', content: `View shipping zone: ${loaderData?.zone.name}` },
]

export default function ShippingZoneView({ loaderData }: Route.ComponentProps) {
	const { zone, currency } = loaderData
	const countries = zone.countries as string[]
	const countryCount = Array.isArray(countries) ? countries.length : 0

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-1">
						<h1 className="text-2xl font-normal tracking-tight text-foreground">{zone.name}</h1>
						{!zone.isActive && <Badge variant="secondary">Inactive</Badge>}
					</div>
					<p className="text-sm text-muted-foreground">
						{zone.description || 'No description provided'}
					</p>
				</div>
				<div className="flex items-center space-x-3">
					<Button asChild variant="outline" className="h-9 rounded-lg font-medium">
						<Link to="/admin/shipping/zones">
							<Icon name="arrow-left" className="mr-2 h-4 w-4" />
							Back to Zones
						</Link>
					</Button>
					<Button asChild className="h-9 rounded-lg font-medium">
						<Link to={`/admin/shipping/zones/${zone.id}/edit`}>
							<Icon name="pencil-1" className="mr-2 h-4 w-4" />
							Edit Zone
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Zone Information */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<h2 className="text-base font-normal text-foreground">Zone Information</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div>
								<label className="text-sm font-medium text-muted-foreground">Name</label>
								<p className="text-lg font-medium mt-1">{zone.name}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Status</label>
								<div className="mt-1">
									<Badge variant={zone.isActive ? 'default' : 'secondary'}>
										{zone.isActive ? 'Active' : 'Inactive'}
									</Badge>
								</div>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Display Order</label>
								<p className="text-lg mt-1">{zone.displayOrder}</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Description</label>
								<p className="text-sm mt-1">
									{zone.description || (
										<span className="text-muted-foreground italic">No description provided</span>
									)}
								</p>
							</div>
							<div>
								<label className="text-sm font-medium text-muted-foreground">Countries</label>
								<div className="mt-2 flex flex-wrap gap-2">
									{countryCount > 0 ? (
										countries.map((country) => (
											<Badge key={country} variant="outline" className="text-xs">
												{country}
											</Badge>
										))
									) : (
										<Badge variant="outline" className="text-xs">
											All countries (empty zone)
										</Badge>
									)}
								</div>
								<p className="text-xs text-muted-foreground mt-2">
									{countryCount} {countryCount === 1 ? 'country' : 'countries'} in this zone
								</p>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Shipping Methods */}
				<div className="space-y-8">
					<Card className="rounded-[14px]">
						<CardHeader>
							<div className="flex items-center justify-between">
								<h2 className="text-base font-normal text-foreground">Shipping Methods</h2>
								<Button asChild size="sm" variant="outline">
									<Link to={`/admin/shipping/methods/new?zoneId=${zone.id}`}>
										<Icon name="plus" className="mr-2 h-4 w-4" />
										Add Method
									</Link>
								</Button>
							</div>
						</CardHeader>
						<CardContent>
							{zone.methods.length === 0 ? (
								<div className="text-center py-8">
									<p className="text-muted-foreground mb-4">No shipping methods for this zone</p>
									<Button asChild size="sm">
										<Link to={`/admin/shipping/methods/new?zoneId=${zone.id}`}>
											<Icon name="plus" className="mr-2 h-4 w-4" />
											Add First Method
										</Link>
									</Button>
								</div>
							) : (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Method</TableHead>
											<TableHead className="hidden md:table-cell">Carrier</TableHead>
											<TableHead className="hidden lg:table-cell">Rate Type</TableHead>
											<TableHead className="text-right">Cost</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{zone.methods.map((method) => {
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
												<TableRow key={method.id}>
													<TableCell>
														<Link
															to={`/admin/shipping/methods/${method.id}`}
															className="font-medium text-primary hover:underline"
														>
															{method.name}
														</Link>
														{method.description && (
															<div className="text-xs text-muted-foreground mt-1">
																{method.description}
															</div>
														)}
													</TableCell>
													<TableCell className="hidden md:table-cell">
														{method.carrier ? (
															<Badge variant="outline">{method.carrier.displayName}</Badge>
														) : (
															<span className="text-muted-foreground">Generic</span>
														)}
													</TableCell>
													<TableCell className="hidden lg:table-cell">
														<Badge variant="secondary" className="text-xs">
															{method.rateType.replace('_', ' ')}
														</Badge>
													</TableCell>
													<TableCell className="text-right font-medium">
														{costDisplay}
													</TableCell>
												</TableRow>
											)
										})}
									</TableBody>
								</Table>
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}

