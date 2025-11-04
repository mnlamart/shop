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
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all categories with hierarchy and product counts
	const allCategories = await prisma.category.findMany({
		include: {
			parent: {
				select: { id: true, name: true, slug: true },
			},
			children: {
				select: { id: true, name: true, slug: true },
			},
			_count: {
				select: { products: true },
			},
		},
		orderBy: [
			{ parentId: 'asc' },
			{ name: 'asc' },
		],
	})

	// Organize categories hierarchically
	const rootCategories = allCategories.filter(cat => !cat.parentId)
	const categories = rootCategories.map(root => ({
		...root,
		children: allCategories.filter(cat => cat.parentId === root.id).map(child => ({
			...child,
			children: [] // Children don't have their own children in this structure
		}))
	}))

	return { categories }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Categories | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage product categories' },
]

function CategoryRow({ category, level = 0 }: { category: any; level?: number }) {
	const fetcher = useFetcher()
	const isUncategorized = category.id === UNCATEGORIZED_CATEGORY_ID
	const hasChildren = category.children && category.children.length > 0
	
	return (
		<>
			<TableRow className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top">
				<TableCell>
					<div className={`flex items-center space-x-3 ${level > 0 ? `ml-${level * 6}` : ''}`}>
						{level > 0 && (
							<div className="flex items-center">
								<Icon name="chevron-right" className="h-4 w-4 text-muted-foreground" />
							</div>
						)}
						<div className="flex-1">
							<div className="flex items-center gap-2">
								<Link 
									to={`/admin/categories/${category.slug}`}
									className="font-medium text-primary hover:underline transition-colors duration-200"
								>
									{category.name}
								</Link>
								{isUncategorized && (
									<Badge variant="warning" className="text-xs">
										System Category
									</Badge>
								)}
							</div>
							{category.description && (
								<div className="text-sm text-muted-foreground mt-1">
									{category.description}
								</div>
							)}
							{/* Mobile-only info */}
							<div className="md:hidden mt-2 flex flex-wrap gap-2">
								<Badge variant="outline" className="text-xs">
									{hasChildren ? `${category.children.length} subcategories` : '0 subcategories'}
								</Badge>
								<Badge variant="default" className="text-xs">
									{category._count.products} products
								</Badge>
								{category.parent && (
									<span className="text-xs text-muted-foreground">
										Parent: {category.parent.name}
									</span>
								)}
							</div>
						</div>
					</div>
				</TableCell>
				<TableCell className="text-muted-foreground hidden md:table-cell">
					{category.parent?.name || (
						<span className="text-muted-foreground/70">Root Category</span>
					)}
				</TableCell>
				<TableCell className="text-muted-foreground hidden lg:table-cell">
					<Badge variant="outline" className="text-xs">
						{hasChildren ? `${category.children.length} subcategories` : '0 subcategories'}
					</Badge>
				</TableCell>
				<TableCell className="font-medium hidden lg:table-cell">
					<Badge variant="default" className="text-xs">
						{category._count.products} products
					</Badge>
				</TableCell>
				<TableCell className="text-right">
					<div className="flex items-center justify-end space-x-1">
						<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
							<Link to={`/admin/categories/${category.slug}`}>
								<Icon name="eye-open" className="h-4 w-4" />
							</Link>
						</Button>
						<Button asChild variant="ghost" size="sm" className="transition-colors duration-200">
							<Link to={`/admin/categories/${category.slug}/edit`}>
								<Icon name="pencil-1" className="h-4 w-4" />
							</Link>
						</Button>
						
						{!isUncategorized && (
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
										<AlertDialogTitle>Delete Category</AlertDialogTitle>
										<AlertDialogDescription>
											Are you sure you want to delete "{category.name}"? This action cannot be undone.
											{category._count.products > 0 && (
												<span className="block mt-2 text-destructive">
													This category has {category._count.products} products that will be moved to "Uncategorized".
												</span>
											)}
											{hasChildren && (
												<span className="block mt-2 text-destructive">
													This category has {category.children.length} subcategories that will also be deleted.
												</span>
											)}
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<fetcher.Form 
											method="POST" 
											action={`/admin/categories/${category.slug}/delete`}
										>
											<input type="hidden" name="categoryId" value={category.id} />
											<AlertDialogAction
												type="submit"
												disabled={fetcher.state !== 'idle'}
												className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
											>
												{fetcher.state === 'idle' ? 'Delete Category' : 'Deleting...'}
											</AlertDialogAction>
										</fetcher.Form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}
					</div>
				</TableCell>
			</TableRow>
			{hasChildren && category.children.map((child: any) => (
				<CategoryRow key={child.id} category={child} level={level + 1} />
			))}
		</>
	)
}

export default function CategoriesList({ loaderData }: Route.ComponentProps) {
	const { categories } = loaderData
	const [searchTerm, setSearchTerm] = useState('')
	const [filterType, setFilterType] = useState('all')

	// Flatten categories for search and filtering
	const allCategories = useMemo(() => {
		const flatten = (cats: any[], level = 0): any[] => {
			const result: any[] = []
			for (const cat of cats) {
				result.push({ ...cat, level })
				if (cat.children && cat.children.length > 0) {
					result.push(...flatten(cat.children, level + 1))
				}
			}
			return result
		}
		return flatten(categories)
	}, [categories])

	// Filter categories based on search and filter criteria
	const filteredCategories = useMemo(() => {
		let filtered = allCategories

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(cat => 
				cat.name.toLowerCase().includes(search) ||
				(cat.description && cat.description.toLowerCase().includes(search))
			)
		}

		// Apply type filter
		if (filterType === 'with-products') {
			filtered = filtered.filter(cat => cat._count.products > 0)
		} else if (filterType === 'system') {
			filtered = filtered.filter(cat => cat.id === UNCATEGORIZED_CATEGORY_ID)
		}

		return filtered
	}, [allCategories, searchTerm, filterType])

	// Rebuild hierarchy for display
	const displayCategories = useMemo(() => {
		if (searchTerm.trim() || filterType !== 'all') {
			// For filtered results, show flat list
			return filteredCategories
		}
		// For unfiltered results, show hierarchical structure
		return categories
	}, [filteredCategories, categories, searchTerm, filterType])

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Categories</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Organize your products into categories ({categories.length} categories)
						{searchTerm || filterType !== 'all' ? (
							<span className="ml-2">
								• {filteredCategories.length} shown
							</span>
						) : null}
					</p>
				</div>
				<Button asChild className="h-9 rounded-lg font-medium">
					<Link to="/admin/categories/new">
						<Icon name="plus" className="mr-2 h-4 w-4" />
						Add Category
					</Link>
				</Button>
			</div>

			{/* Search and Filter Controls */}
			<div className="flex flex-col sm:flex-row gap-4">
				<div className="flex-1">
					<div className="relative">
						<Icon name="magnifying-glass" className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search categories by name or description..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={filterType} onValueChange={setFilterType}>
						<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
							<SelectValue placeholder="Filter by type" />
						</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Categories</SelectItem>
						<SelectItem value="with-products">With Products</SelectItem>
						<SelectItem value="system">System Category</SelectItem>
					</SelectContent>
					</Select>
				</div>
			</div>

			{/* Categories Table */}
			<Card className="rounded-[14px]">
				<Table>
					<TableHeader>
						<TableRow className="border-b">
							<TableHead className="font-semibold">Category</TableHead>
							<TableHead className="font-semibold hidden md:table-cell">Parent</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Subcategories</TableHead>
							<TableHead className="font-semibold hidden lg:table-cell">Products</TableHead>
							<TableHead className="text-right font-semibold">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{displayCategories.map((category) => (
							<CategoryRow 
								key={category.id} 
								category={category} 
								level={category.level || 0}
							/>
						))}
					</TableBody>
				</Table>
			</Card>

			{categories.length === 0 && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="tags" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h3 className="text-xl font-semibold mb-2">No categories yet</h3>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						Get started by creating your first category to organize your products.
					</p>
					<Button asChild size="lg" className="h-9 rounded-lg font-medium">
						<Link to="/admin/categories/new">
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Category
						</Link>
					</Button>
				</div>
			)}

			{/* No search results */}
			{categories.length > 0 && displayCategories.length === 0 && (searchTerm || filterType !== 'all') && (
				<div className="text-center py-16 animate-slide-top">
					<div className="mx-auto w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
						<Icon name="magnifying-glass" className="h-12 w-12 text-muted-foreground" />
					</div>
					<h3 className="text-xl font-semibold mb-2">No categories found</h3>
					<p className="text-muted-foreground mb-8 max-w-md mx-auto">
						{searchTerm ? (
							<>No categories match your search for "<strong>{searchTerm}</strong>".</>
						) : (
							<>No categories match the selected filter.</>
						)}
					</p>
					<div className="flex flex-col sm:flex-row gap-3 justify-center">
						<Button 
							variant="outline" 
							onClick={() => {
								setSearchTerm('')
								setFilterType('all')
							}}
							className="h-9 rounded-lg font-medium"
						>
							Clear filters
						</Button>
						<Button asChild className="h-9 rounded-lg font-medium">
							<Link to="/admin/categories/new">
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Category
							</Link>
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
