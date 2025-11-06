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
import { Card } from '#app/components/ui/card.tsx'
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

	// Get all shipping methods with related data
	const methods = await prisma.shippingMethod.findMany({
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
		orderBy: [
			{ zone: { displayOrder: 'asc' } },
			{ displayOrder: 'asc' },
			{ name: 'asc' },
		],
	})

	const currency = await getStoreCurrency()

	return { methods, currency }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Shipping Methods | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage shipping methods' },
]

function MethodRow({
	method,
	currency,
}: {
	method: Route.ComponentProps['loaderData']['methods'][number]
	currency: Route.ComponentProps['loaderData']['currency']
}) {
	const fetcher = useFetcher()

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
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/admin/shipping/methods/${method.id}`}
								className="font-medium text-primary hover:underline transition-colors duration-200"
								aria-label={`View ${method.name} method`}
							>
								{method.name}
							</Link>
							{!method.isActive && (
								<Badge variant="secondary" className="text-xs">
									Inactive
								</Badge>
							)}
						</div>
						{method.description && (
							<div className="text-sm text-muted-foreground mt-1">{method.description}</div>
						)}
						{/* Mobile-only info */}
						<div className="md:hidden mt-2 flex flex-wrap gap-2">
							<Badge variant="outline" className="text-xs">
								{method.zone.name}
							</Badge>
							{method.carrier && (
								<Badge variant="outline" className="text-xs">
									{method.carrier.displayName}
								</Badge>
							)}
							<Badge variant="secondary" className="text-xs">
								{method.rateType.replace('_', ' ')}
							</Badge>
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				<Link
					to={`/admin/shipping/zones/${method.zone.id}`}
					className="text-primary hover:underline"
				>
					{method.zone.name}
				</Link>
			</TableCell>
			<TableCell className="text-muted-foreground hidden lg:table-cell">
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
			<TableCell className="font-medium hidden lg:table-cell">{costDisplay}</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/methods/${method.id}`} aria-label={`View ${method.name}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link
							to={`/admin/shipping/methods/${method.id}/edit`}
							aria-label={`Edit ${method.name}`}
						>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${method.name}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Shipping Method</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete "{method.name}"? This action cannot be undone.
									{method._count.orders > 0 && (
										<span className="block mt-2 text-destructive">
											This method has been used in {method._count.orders} order
											{method._count.orders === 1 ? '' : 's'}. Historical order data will be
											preserved.
										</span>
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form method="POST" action={`/admin/shipping/methods/${method.id}/delete`}>
									<input type="hidden" name="methodId" value={method.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state === 'idle' ? 'Delete Method' : 'Deleting...'}
									</AlertDialogAction>
								</fetcher.Form>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</TableCell>
		</TableRow>
	)
}

export default function ShippingMethodsList({ loaderData }: Route.ComponentProps) {
	const { methods, currency } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
	const [filterZone, setFilterZone] = useState<string>('all')

	// Get unique zones for filter
	const zones = useMemo(() => {
		const zoneMap = new Map<string, { id: string; name: string }>()
		methods.forEach((method) => {
			if (!zoneMap.has(method.zone.id)) {
				zoneMap.set(method.zone.id, { id: method.zone.id, name: method.zone.name })
			}
		})
		return Array.from(zoneMap.values()).sort((a, b) => a.name.localeCompare(b.name))
	}, [methods])

	// Filter methods based on search, status, and zone
	const filteredMethods = useMemo(() => {
		let filtered = methods

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(method) =>
					method.name.toLowerCase().includes(search) ||
					(method.description && method.description.toLowerCase().includes(search)) ||
					(method.carrier && method.carrier.displayName.toLowerCase().includes(search)) ||
					method.zone.name.toLowerCase().includes(search),
			)
		}

		// Apply status filter
		if (filterStatus === 'active') {
			filtered = filtered.filter((method) => method.isActive)
		} else if (filterStatus === 'inactive') {
			filtered = filtered.filter((method) => !method.isActive)
		}

		// Apply zone filter
		if (filterZone !== 'all') {
			filtered = filtered.filter((method) => method.zone.id === filterZone)
		}

		return filtered
	}, [methods, searchTerm, filterStatus, filterZone])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Shipping Methods
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage shipping methods and rates ({methods.length} method{methods.length === 1 ? '' : 's'})
						{searchTerm || filterStatus !== 'all' || filterZone !== 'all' ? (
							<span className="ml-2">• {filteredMethods.length} shown</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/shipping/methods/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						Add Method
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon
							name="magnifying-glass"
							className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
						/>
						<Input
							placeholder="Search methods by name, description, carrier, or zone..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select
						value={filterStatus}
						onValueChange={(value) => setFilterStatus(value as typeof filterStatus)}
					>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Methods</SelectItem>
							<SelectItem value="active">Active Only</SelectItem>
							<SelectItem value="inactive">Inactive Only</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="sm:w-48">
					<Select value={filterZone} onValueChange={setFilterZone}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by zone"
						>
							<SelectValue placeholder="All Zones" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Zones</SelectItem>
							{zones.map((zone) => (
								<SelectItem key={zone.id} value={zone.id}>
									{zone.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Methods Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">Method</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Zone</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Carrier</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Rate Type</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Cost</TableHead>
							<TableHead className="text-right font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredMethods.map((method) => (
							<MethodRow key={method.id} method={method} currency={currency} />
						))}
					</TableBody>
				</Table>
			</Card>

			{methods.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="shopping-cart" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No shipping methods yet</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						Get started by creating your first shipping method to define shipping rates and options.
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/shipping/methods/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Method
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{methods.length > 0 && filteredMethods.length === 0 &&
				(searchTerm || filterStatus !== 'all' || filterZone !== 'all') && (
					<div className="text-center py-16 animate-slide-top">
						<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
							<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
						</div>
						<h2 className="text-xl font-semibold mb-2">No methods found</h2>
						<p className="text-muted-foreground mb-8 max-w-md mx-auto">
							{searchTerm ? (
								<>
									No methods match your search for "<strong>{searchTerm}</strong>".
								</>
							) : (
								<>No methods match the selected filters.</>
							)}
						</p>
						<div className="flex flex-col sm:flex-row gap-3 justify-center">
							<Button
								variant="outline"
								onClick={() => {
									setSearchTerm('')
									setFilterStatus('all')
									setFilterZone('all')
								}}
								className="h-9 rounded-lg font-medium"
							>
								Clear filters
							</Button>
							<Button asChild className="h-9 rounded-lg font-medium">
								<Link to="/admin/shipping/methods/new">
									<Icon name="plus" className="mr-2 h-4 w-4" />
									Add Method
								</Link>
							</Button>
						</div>
					</div>
				)}
		</div>
	)
}

