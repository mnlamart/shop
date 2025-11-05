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
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const attributes = await prisma.attribute.findMany({
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
		orderBy: { displayOrder: 'asc' },
	})

	return { attributes }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Attributes | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage product attributes' },
]

function AttributeRow({ attribute }: { attribute: any }) {
	const hasVariants = attribute.values.some((value: any) => value._count.variants > 0)
	const totalVariants = attribute.values.reduce((sum: number, value: any) => sum + value._count.variants, 0)

	return (
		<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
			<TableCell>
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<Link 
							to={`/admin/attributes/${attribute.id}`}
							className="font-medium text-primary hover:underline transition-colors duration-200"
						>
							{attribute.name}
						</Link>
					</div>
					<p className="text-sm text-muted-foreground md:hidden">
						{attribute._count.values} values • {totalVariants} variants
					</p>
				</div>
			</TableCell>
			<TableCell className="hidden md:table-cell">
				<div className="flex flex-wrap gap-1">
					{attribute.values.slice(0, 3).map((value: any) => (
						<Badge key={value.id} variant="secondary" className="text-xs">
							{value.value}
						</Badge>
					))}
					{attribute.values.length > 3 && (
						<Badge variant="outline" className="text-xs">
							+{attribute.values.length - 3} more
						</Badge>
					)}
				</div>
			</TableCell>
			<TableCell className="hidden lg:table-cell">
				<span className="text-muted-foreground">
					{attribute._count.values} values
				</span>
			</TableCell>
			<TableCell className="hidden md:table-cell">
				<span className="text-muted-foreground">
					{totalVariants} variants
				</span>
			</TableCell>
			<TableCell>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" asChild>
						<Link to={`/admin/attributes/${attribute.id}`} aria-label={`View ${attribute.name}`}>
							<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<Button variant="ghost" size="sm" asChild>
						<Link to={`/admin/attributes/${attribute.id}/edit`} aria-label={`Edit ${attribute.name}`}>
							<Icon name="pencil-1" className="h-4 w-4" aria-hidden="true" />
						</Link>
					</Button>
					<DeleteButton attribute={attribute} hasVariants={hasVariants} />
				</div>
			</TableCell>
		</TableRow>
	)
}

function DeleteButton({ attribute, hasVariants }: { attribute: any; hasVariants: boolean }) {
	const fetcher = useFetcher()

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive hover:text-destructive transition-colors duration-200"
					aria-label={`Delete ${attribute.name}`}
				>
					<Icon name="trash" className="h-4 w-4" aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Attribute</AlertDialogTitle>
					<AlertDialogDescription>
						Are you sure you want to delete "{attribute.name}"? This action cannot be undone.
						{hasVariants && (
							<span className="block mt-2 text-destructive">
								This attribute is used in product variants and cannot be deleted.
							</span>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<fetcher.Form 
						method="POST" 
						action={`/admin/attributes/${attribute.id}/delete`}
					>
						<input type="hidden" name="attributeId" value={attribute.id} />
						<AlertDialogAction
							type="submit"
							disabled={fetcher.state !== 'idle' || hasVariants}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
						>
							{fetcher.state === 'idle' ? 'Delete Attribute' : 'Deleting...'}
						</AlertDialogAction>
					</fetcher.Form>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

export default function AttributesList({ loaderData }: Route.ComponentProps) {
	const { attributes } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterType, setFilterType] = useState('all')

	// Filter attributes based on search and filter criteria
	const filteredAttributes = useMemo(() => {
		let filtered = attributes

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter((attribute: any) => 
				attribute.name.toLowerCase().includes(search) ||
				attribute.values.some((value: any) => 
					value.value.toLowerCase().includes(search)
				)
			)
		}

		// Apply type filter
		if (filterType === 'with-variants') {
			filtered = filtered.filter((attribute: any) => 
				attribute.values.some((value: any) => value._count.variants > 0)
			)
		} else if (filterType === 'unused') {
			filtered = filtered.filter((attribute: any) => 
				attribute.values.every((value: any) => value._count.variants === 0)
			)
		}

		return filtered
	}, [attributes, searchTerm, filterType])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Attributes</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Configure attributes for product variants ({attributes.length} attributes)
						{searchTerm.trim() || filterType !== 'all' ? ` • ${filteredAttributes.length} shown` : ''}
					</p>
				</div>
				<Link to="/admin/attributes/new">
					<Button className="h-9 rounded-lg font-medium">
						<Icon name="plus" className="h-4 w-4 mr-2" />
						Add Attribute
					</Button>
				</Link>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search attributes by name or values..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterType} onValueChange={setFilterType}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20" aria-label="Filter by usage">
							<SelectValue placeholder="Filter by usage" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Attributes</SelectItem>
							<SelectItem value="with-variants">With Variants</SelectItem>
							<SelectItem value="unused">Unused</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Attributes Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Attribute</TableHead>
						<TableHead className="hidden md:table-cell">Values</TableHead>
						<TableHead className="hidden lg:table-cell">Value Count</TableHead>
						<TableHead className="hidden md:table-cell">Variants</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredAttributes.length === 0 ? (
						<TableRow>
							<TableCell colSpan={5} className="text-center py-8">
								{searchTerm.trim() || filterType !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon name="magnifying-glass" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No attributes match your search criteria.</p>
										<p className="text-sm">Try adjusting your search or filters.</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon name="settings" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No attributes found.</p>
										<p className="text-sm">Create attributes like Size, Color, or Material to use in product variants.</p>
										<Link to="/admin/attributes/new" className="text-primary hover:underline">
											Create your first attribute
										</Link>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						filteredAttributes.map((attribute: any) => (
							<AttributeRow key={attribute.id} attribute={attribute} />
						))
					)}
				</TableBody>
			</Table>
		</div>
	)
}
