import React, { useState, useEffect } from 'react'
import { Outlet, useLocation, Link } from 'react-router'
import { AppSidebar } from '#app/components/app-sidebar.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '#app/components/ui/breadcrumb.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Toggle } from '#app/components/ui/toggle.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/_layout.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Admin | Epic Shop' },
	{ name: 'description', content: 'Admin dashboard for managing your e-commerce store' },
]

function AdminBreadcrumbs() {
	const location = useLocation()
	const pathSegments = location.pathname.split('/').filter(Boolean)
	
	// Skip the first segment (admin) for breadcrumbs
	const breadcrumbSegments = pathSegments.slice(1)
	
	if (breadcrumbSegments.length === 0) {
		return (
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage>Dashboard</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		)
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink asChild>
						<Link to="/admin">Dashboard</Link>
					</BreadcrumbLink>
				</BreadcrumbItem>
				{breadcrumbSegments.map((segment, index) => {
					const isLast = index === breadcrumbSegments.length - 1
					const href = `/${pathSegments.slice(0, index + 2).join('/')}`
					const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ')
					
					return (
						<React.Fragment key={segment}>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								{isLast ? (
									<BreadcrumbPage>{label}</BreadcrumbPage>
								) : (
									<BreadcrumbLink asChild>
										<Link to={href}>{label}</Link>
									</BreadcrumbLink>
								)}
							</BreadcrumbItem>
						</React.Fragment>
					)
				})}
			</BreadcrumbList>
		</Breadcrumb>
	)
}



export default function AdminLayout() {
	const [isCollapsed, setIsCollapsed] = useState(false)

	// Listen for sidebar state changes
	useEffect(() => {
		const handleSidebarStateChange = (event: CustomEvent) => {
			setIsCollapsed(event.detail.isCollapsed)
		}

		window.addEventListener('sidebar-state-change', handleSidebarStateChange as EventListener)
		return () => window.removeEventListener('sidebar-state-change', handleSidebarStateChange as EventListener)
	}, [])

	return (
		<div className="flex h-screen bg-background">
			<AppSidebar />
			<div className="flex-1 flex flex-col min-w-0">
				<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background">
					<Toggle
						pressed={!isCollapsed}
						onPressedChange={() => {
							// This will be handled by the sidebar component
							const event = new CustomEvent('toggle-sidebar')
							window.dispatchEvent(event)
						}}
						aria-label="Toggle sidebar"
						size="sm"
						className="h-8 w-8 px-2"
					>
						<Icon 
							name="layout" 
							className="size-full" 
						/>
					</Toggle>
					<AdminBreadcrumbs />
				</header>
				<main className="flex-1 overflow-auto p-4">
					<Outlet />
				</main>
			</div>
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
							<Link to="/">Back to Home</Link>
						</Button>
					</div>
				),
			}}
		/>
	)
}
