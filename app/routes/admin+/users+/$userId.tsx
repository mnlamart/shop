import { invariantResponse } from '@epic-web/invariant'
import { Link } from 'react-router'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/$userId.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
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
					description: true,
				},
			},
			orders: {
				select: {
					id: true,
					orderNumber: true,
					status: true,
					total: true,
					createdAt: true,
				},
				orderBy: { createdAt: 'desc' },
				take: 10, // Show last 10 orders
			},
			sessions: {
				select: {
					id: true,
					expirationDate: true,
					createdAt: true,
				},
				orderBy: { createdAt: 'desc' },
				take: 10, // Show last 10 sessions
			},
			_count: {
				select: {
					orders: true,
					sessions: true,
					notes: true,
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	return {
		user,
	}
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.user) {
		return [{ title: 'User Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `${loaderData.user.name || loaderData.user.username} | Admin | Epic Shop`,
		},
		{
			name: 'description',
			content: `View user details: ${loaderData.user.email}`,
		},
	]
}

export default function UserDetail({ loaderData }: Route.ComponentProps) {
	const { user } = loaderData

	const activeSessions = user.sessions.filter(
		(session) => new Date(session.expirationDate) > new Date(),
	)

	return (
		<div className="space-y-6 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Button
						asChild
						variant="ghost"
						size="icon"
						className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-muted"
						aria-label="Back to users"
					>
						<Link to="/admin/users">
							<Icon name="arrow-left" className="h-5 w-5" aria-hidden="true" />
						</Link>
					</Button>
					<div className="flex items-center gap-4">
						{user.image ? (
							<img
								src={getUserImgSrc(user.image.objectKey)}
								alt={user.image.altText || user.name || user.username}
								className="h-12 w-12 rounded-full"
							/>
						) : (
							<div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
								<span className="text-lg font-medium text-primary">
									{user.name?.charAt(0) || user.username.charAt(0).toUpperCase()}
								</span>
							</div>
						)}
						<div>
							<h1 className="text-2xl font-normal tracking-tight text-foreground">
								{user.name || user.username}
							</h1>
							<p className="text-sm text-muted-foreground" data-testid="user-header-email">{user.email}</p>
						</div>
					</div>
				</div>
				<Button asChild variant="outline">
					<Link to={`/admin/users/${user.id}/edit`}>Edit User</Link>
				</Button>
			</div>

			{/* User Information */}
			<h2 className="sr-only">User Information</h2>
			<div className="grid gap-6 md:grid-cols-2">
				{/* Profile Details */}
				<Card>
					<CardHeader>
						<CardTitle>Profile Details</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label className="text-sm font-medium text-muted-foreground">Email</label>
							<p className="text-sm" data-testid="user-detail-email">{user.email}</p>
						</div>
						<div>
							<label className="text-sm font-medium text-muted-foreground">Username</label>
							<p className="text-sm" data-testid="user-detail-username">{user.username}</p>
						</div>
						{user.name && (
							<div>
								<label className="text-sm font-medium text-muted-foreground">Name</label>
								<p className="text-sm" data-testid="user-detail-name">{user.name}</p>
							</div>
						)}
						<div>
							<label className="text-sm font-medium text-muted-foreground">
								Account Created
							</label>
							<p className="text-sm">
								{new Date(user.createdAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}
							</p>
						</div>
					</CardContent>
				</Card>

				{/* Roles */}
				<Card>
					<CardHeader>
						<CardTitle>Roles</CardTitle>
					</CardHeader>
					<CardContent>
						{user.roles.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{user.roles.map((role) => (
									<Badge key={role.id} variant="secondary">
										{role.name}
										{role.description && (
											<span className="ml-2 text-xs text-muted-foreground">
												({role.description})
											</span>
										)}
									</Badge>
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground">No roles assigned</p>
						)}
					</CardContent>
				</Card>

				{/* Statistics */}
				<Card>
					<CardHeader>
						<CardTitle>Statistics</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Total Orders</span>
							<span className="text-sm font-medium">{user._count.orders}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Active Sessions</span>
							<span className="text-sm font-medium">{activeSessions.length}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Total Sessions</span>
							<span className="text-sm font-medium">{user._count.sessions}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-sm text-muted-foreground">Notes</span>
							<span className="text-sm font-medium">{user._count.notes}</span>
						</div>
					</CardContent>
				</Card>

				{/* Account Metadata */}
				<Card>
					<CardHeader>
						<CardTitle>Account Metadata</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label className="text-sm font-medium text-muted-foreground">
								Last Updated
							</label>
							<p className="text-sm">
								{new Date(user.updatedAt).toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
									hour: '2-digit',
									minute: '2-digit',
								})}
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Order History */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Recent Orders</CardTitle>
						{user._count.orders > 10 && (
							<Button variant="ghost" size="sm" asChild>
								<Link to={`/admin/orders?user=${user.id}`}>
									View All ({user._count.orders})
								</Link>
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{user.orders.length > 0 ? (
						<div className="space-y-2">
							{user.orders.map((order) => (
								<div
									key={order.id}
									className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-4">
										<Link
											to={`/admin/orders/${order.orderNumber}`}
											className="font-medium text-primary hover:underline"
										>
											{order.orderNumber}
										</Link>
										<Badge variant="secondary">{order.status}</Badge>
										<span className="text-sm text-muted-foreground">
											{new Date(order.createdAt).toLocaleDateString()}
										</span>
									</div>
									<span className="text-sm font-medium">${order.total / 100}</span>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No orders yet</p>
					)}
				</CardContent>
			</Card>

			{/* Active Sessions */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Active Sessions</CardTitle>
						{user._count.sessions > 10 && (
							<Button variant="ghost" size="sm">
								View All ({user._count.sessions})
							</Button>
						)}
					</div>
				</CardHeader>
				<CardContent>
					{activeSessions.length > 0 ? (
						<div className="space-y-2">
							{activeSessions.map((session) => (
								<div
									key={session.id}
									className="flex items-center justify-between p-3 border rounded-lg"
								>
									<div>
										<p className="text-sm font-medium">Session {session.id.slice(0, 8)}</p>
										<p className="text-xs text-muted-foreground">
											Created:{' '}
											{new Date(session.createdAt).toLocaleDateString('en-US', {
												year: 'numeric',
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit',
											})}
										</p>
									</div>
									<div className="text-xs text-muted-foreground">
										Expires:{' '}
										{new Date(session.expirationDate).toLocaleDateString('en-US', {
											year: 'numeric',
											month: 'short',
											day: 'numeric',
											hour: '2-digit',
											minute: '2-digit',
										})}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No active sessions</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

