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
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all shipping zones with method counts
	const zones = await prisma.shippingZone.findMany({
		include: {
			_count: {
				select: { methods: true },
			},
		},
		orderBy: [
			{ displayOrder: 'asc' },
			{ name: 'asc' },
		],
	})

	return { zones }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Shipping Zones | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage shipping zones' },
]

function ZoneRow({ zone }: { zone: Route.ComponentProps['loaderData']['zones'][number] }) {
	const fetcher = useFetcher()
	const countries = zone.countries as string[]
	const countryCount = Array.isArray(countries) ? countries.length : 0

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex items-center space-x-3">
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<Link
								to={`/admin/shipping/zones/${zone.id}`}
								className="font-medium text-primary hover:underline transition-colors duration-200"
								aria-label={`View ${zone.name} zone`}
							>
								{zone.name}
							</Link>
							{!zone.isActive && (
								<Badge variant="secondary" className="text-xs">
									Inactive
								</Badge>
							)}
						</div>
						{zone.description && (
							<div className="text-sm text-muted-foreground mt-1">
								{zone.description}
							</div>
						)}
						{/* Mobile-only info */}
						<div className="md:hidden mt-2 flex flex-wrap gap-2">
							<Badge variant="outline" className="text-xs">
								{countryCount} {countryCount === 1 ? 'country' : 'countries'}
							</Badge>
							<Badge variant="default" className="text-xs">
								{zone._count.methods} {zone._count.methods === 1 ? 'method' : 'methods'}
							</Badge>
						</div>
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground hidden md:table-cell">
				{countryCount > 0 ? (
					<div className="flex flex-wrap gap-1">
						{countries.slice(0, 5).map((country) => (
							<Badge key={country} variant="outline" className="text-xs">
								{country}
							</Badge>
						))}
						{countryCount > 5 && (
							<Badge variant="outline" className="text-xs">
								+{countryCount - 5}
							</Badge>
						)}
					</div>
				) : (
					<span className="text-muted-foreground">All countries</span>
				)}
			</TableCell>
			<TableCell className="font-medium hidden lg:table-cell">
				<Badge variant="default" className="text-xs">
					{zone._count.methods} {zone._count.methods === 1 ? 'method' : 'methods'}
				</Badge>
			</TableCell>
			<TableCell className="text-right">
				<div className="flex items-center justify-end space-x-1">
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/zones/${zone.id}`} aria-label={`View ${zone.name}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
						<Link to={`/admin/shipping/zones/${zone.id}/edit`} aria-label={`Edit ${zone.name}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive hover:text-destructive transition-colors duration-200"
								aria-label={`Delete ${zone.name}`}
							>
								<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete Shipping Zone</AlertDialogTitle>
								<AlertDialogDescription>
									Are you sure you want to delete "{zone.name}"? This action cannot be undone.
									{zone._count.methods > 0 && (
										<span className="block mt-2 text-destructive">
											This zone has {zone._count.methods} shipping method{zone._count.methods === 1 ? '' : 's'} that will also be deleted.
										</span>
									)}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<fetcher.Form
									method="POST"
									action={`/admin/shipping/zones/${zone.id}/delete`}
								>
									<input type="hidden" name="zoneId" value={zone.id} />
									<AlertDialogAction
										type="submit"
										disabled={fetcher.state !== 'idle'}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
									>
										{fetcher.state === 'idle' ? 'Delete Zone' : 'Deleting...'}
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

export default function ShippingZonesList({ loaderData }: Route.ComponentProps) {
	const { zones } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')

	// Filter zones based on search and status
	const filteredZones = useMemo(() => {
		let filtered = zones

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(zone) =>
					zone.name.toLowerCase().includes(search) ||
					(zone.description && zone.description.toLowerCase().includes(search)),
			)
		}

		// Apply status filter
		if (filterStatus === 'active') {
			filtered = filtered.filter((zone) => zone.isActive)
		} else if (filterStatus === 'inactive') {
			filtered = filtered.filter((zone) => !zone.isActive)
		}

		return filtered
	}, [zones, searchTerm, filterStatus])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">
						Shipping Zones
					</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage geographic shipping zones ({zones.length} zone{zones.length === 1 ? '' : 's'})
						{searchTerm || filterStatus !== 'all' ? (
							<span className="ml-2">• {filteredZones.length} shown</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/shipping/zones/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						Add Zone
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
							placeholder="Search zones by name or description..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as typeof filterStatus)}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by status"
						>
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Zones</SelectItem>
							<SelectItem value="active">Active Only</SelectItem>
							<SelectItem value="inactive">Inactive Only</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Zones Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">Zone</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Countries</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Methods</TableHead>
							<TableHead className="text-right font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredZones.map((zone) => (
							<ZoneRow key={zone.id} zone={zone} />
						))}
					</TableBody>
				</Table>
			</Card>

			{zones.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="shopping-cart" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No shipping zones yet</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						Get started by creating your first shipping zone to define geographic regions for shipping.
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/shipping/zones/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Zone
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{zones.length > 0 && filteredZones.length === 0 && (searchTerm || filterStatus !== 'all') && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h2 className="text-xl font-semibold mb-2">No zones found</h2>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{searchTerm ? (
							<>
								No zones match your search for "<strong>{searchTerm}</strong>".
							</>
						) : (
							<>No zones match the selected filter.</>
						)}
					</p>
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Button
							variant="outline"
							onClick={() => {
								setSearchTerm('')
								setFilterStatus('all')
							}}
							className="h-9 rounded-lg font-medium"
						>
							Clear filters
						</Button>
						<Button asChild className="h-9 rounded-lg font-medium">
							<Link to="/admin/shipping/zones/new">
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Zone
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

