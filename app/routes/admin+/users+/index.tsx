import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
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
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all users with related data
	const users = await prisma.user.findMany({
		include: {
			image: {
				select: {
					objectKey: true,
					altText: true,
				},
			},
			roles: {
				select: {
					id: true,
					name: true,
				},
			},
			_count: {
				select: {
					orders: true,
					sessions: true,
				},
			},
		},
		orderBy: { createdAt: 'desc' },
	})

	// Get all roles for filter
	const roles = await prisma.role.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	})

	return {
		users,
		roles,
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Users | Admin | Epic Shop' },
	{ name: 'description', content: 'Manage all users' },
]

const ITEMS_PER_PAGE = 25

export default function UsersList({ loaderData }: Route.ComponentProps) {
	const { users, roles } = loaderData

	// State for search and filtering
	const [searchTerm, setSearchTerm] = useState('')
	const [roleFilter, setRoleFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)

	// Filter users based on search and filter criteria
	const filteredUsers = useMemo(() => {
		let filtered = users

		// Apply search filter
		if (searchTerm.trim()) {
			const search = searchTerm.toLowerCase()
			filtered = filtered.filter(
				(user) =>
					user.name?.toLowerCase().includes(search) ||
					user.email.toLowerCase().includes(search) ||
					user.username.toLowerCase().includes(search),
			)
		}

		// Apply role filter
		if (roleFilter !== 'all') {
			filtered = filtered.filter((user) =>
				user.roles.some((role) => role.id === roleFilter),
			)
		}

		return filtered
	}, [users, searchTerm, roleFilter])

	// Pagination calculations
	const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE)
	const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
	const endIndex = startIndex + ITEMS_PER_PAGE
	const paginatedUsers = filteredUsers.slice(startIndex, endIndex)

	// Reset to page 1 when filters change
	useEffect(() => {
		setCurrentPage(1)
	}, [searchTerm, roleFilter])

	// Memoize role options to avoid recreating on every render
	const roleOptions = useMemo(
		() =>
			roles.map((role) => (
				<SelectItem key={role.id} value={role.id}>
					{role.name}
				</SelectItem>
			)),
		[roles],
	)

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header with title */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Users</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Manage all users ({users.length} total)
						{searchTerm.trim() || roleFilter !== 'all'
							? ` • ${filteredUsers.length} shown`
							: ''}
					</p>
				</div>
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
							placeholder="Search users by name, email, or username..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
				</div>
				<div className="sm:w-48">
					<Select value={roleFilter} onValueChange={setRoleFilter}>
						<SelectTrigger
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							aria-label="Filter by role"
						>
							<SelectValue placeholder="Filter by role" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Roles</SelectItem>
							{roleOptions}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>User</TableHead>
						<TableHead className="hidden md:table-cell">Email</TableHead>
						<TableHead className="hidden md:table-cell">Username</TableHead>
						<TableHead>Roles</TableHead>
						<TableHead className="hidden lg:table-cell">Orders</TableHead>
						<TableHead className="hidden md:table-cell">Created</TableHead>
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{filteredUsers.length === 0 ? (
						<TableRow>
							<TableCell colSpan={7} className="text-center py-8">
								{searchTerm.trim() || roleFilter !== 'all' ? (
									<div className="text-muted-foreground">
										<Icon
											name="magnifying-glass"
											className="h-8 w-8 mx-auto mb-2 opacity-50"
										/>
										<p>No users match your search criteria.</p>
										<p className="text-sm">Try adjusting your search or filters.</p>
									</div>
								) : (
									<div className="text-muted-foreground">
										<Icon name="user" className="h-8 w-8 mx-auto mb-2 opacity-50" />
										<p>No users found.</p>
										<p className="text-sm">There are no users in the system yet.</p>
									</div>
								)}
							</TableCell>
						</TableRow>
					) : (
						paginatedUsers.map((user) => (
							<TableRow
								key={user.id}
								className="transition-colors duration-150 hover:bg-muted/50 animate-slide-top"
							>
								<TableCell>
									<div className="flex items-center gap-2">
										{user.image ? (
											<img
												src={getUserImgSrc(user.image.objectKey)}
												alt={user.image.altText || user.name || user.username}
												className="h-8 w-8 rounded-full"
											/>
										) : (
											<div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
												<span className="text-xs font-medium text-primary">
													{user.name?.charAt(0) || user.username.charAt(0).toUpperCase()}
												</span>
											</div>
										)}
										<div>
											<Link
												to={`/admin/users/${user.id}`}
												className="font-medium text-primary hover:underline transition-colors duration-200"
												aria-label={`View user ${user.name || user.username}`}
											>
												{user.name || user.username}
											</Link>
											{user.name && (
												<p className="text-xs text-muted-foreground">{user.username}</p>
											)}
										</div>
									</div>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground">{user.email}</span>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground">{user.username}</span>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{user.roles.length > 0 ? (
											user.roles.map((role) => (
												<Badge key={role.id} variant="secondary">
													{role.name}
												</Badge>
											))
										) : (
											<span className="text-xs text-muted-foreground">No roles</span>
										)}
									</div>
								</TableCell>
								<TableCell className="hidden lg:table-cell">
									<span className="text-muted-foreground">
										{user._count.orders} order{user._count.orders !== 1 ? 's' : ''}
									</span>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									<span className="text-muted-foreground">
										{new Date(user.createdAt).toLocaleDateString()}
									</span>
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<Button variant="ghost" size="sm" asChild>
											<Link
												to={`/admin/users/${user.id}`}
												aria-label={`View user ${user.name || user.username}`}
											>
												<Icon name="eye-open" className="h-4 w-4" aria-hidden="true" />
											</Link>
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<div className="text-sm text-muted-foreground">
						Showing {startIndex + 1} to {Math.min(endIndex, filteredUsers.length)} of{' '}
						{filteredUsers.length} users
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
						>
							<Icon name="arrow-left" className="h-4 w-4" />
							Previous
						</Button>
						<div className="flex items-center gap-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(
									(page) =>
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1,
								)
								.map((page, index, arr) => (
									<div key={page} className="flex items-center gap-1">
										{index > 0 && arr[index - 1] !== page - 1 && (
											<span className="px-2 text-muted-foreground">...</span>
										)}
										<Button
											variant={currentPage === page ? 'default' : 'outline'}
											size="sm"
											onClick={() => setCurrentPage(page)}
											className="min-w-[2.5rem]"
										>
											{page}
										</Button>
									</div>
								))}
						</div>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === totalPages}
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
						>
							Next
							<Icon name="arrow-right" className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
						<Icon name="lock-closed" className="h-12 w-12 text-muted-foreground" />
						<h2 className="text-xl font-semibold">Unauthorized</h2>
						<p className="text-muted-foreground text-center">
							{typeof error.data === 'object' && error.data && 'message' in error.data
								? String(error.data.message)
								: 'You do not have permission to access this page.'}
						</p>
						<Button asChild>
							<Link to="/admin">Back to Dashboard</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}

