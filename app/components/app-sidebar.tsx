import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#app/components/ui/collapsible.tsx'
import { cn } from '#app/utils/misc.tsx'
import { useOptionalUser } from '#app/utils/user.ts'

// Navigation data structure
const navData = {
	navMain: [
		{
			title: 'Platform',
			items: [
				{
					title: 'Dashboard',
					url: '/admin',
					icon: 'layout-dashboard' as IconName,
					isActive: true,
				},
				{
					title: 'Orders',
					url: '/admin/orders',
					icon: 'file-text' as IconName,
				},
				{
					title: 'Products',
					url: '/admin/products',
					icon: 'package' as IconName,
					hasSubmenu: true,
					items: [
						{ title: 'All Products', url: '/admin/products' },
						{ title: 'Add Product', url: '/admin/products/new' },
					],
				},
				{
					title: 'Categories',
					url: '/admin/categories',
					icon: 'tags' as IconName,
					hasSubmenu: true,
					items: [
						{ title: 'All Categories', url: '/admin/categories' },
						{ title: 'Add Category', url: '/admin/categories/new' },
					],
				},
				{
					title: 'Attributes',
					url: '/admin/attributes',
					icon: 'settings' as IconName,
					hasSubmenu: true,
					items: [
						{ title: 'All Attributes', url: '/admin/attributes' },
						{ title: 'Add Attribute', url: '/admin/attributes/new' },
					],
				},
			],
		},
		{
			title: 'System',
			items: [
				{
					title: 'Settings',
					url: '/admin/settings',
					icon: 'settings' as IconName,
					hasSubmenu: true,
					items: [
						{ title: 'General', url: '/admin/settings/general' },
						{ title: 'Users', url: '/admin/settings/users' },
						{ title: 'Permissions', url: '/admin/settings/permissions' },
					],
				},
				{
					title: 'View Store',
					url: '/',
					icon: 'store' as IconName,
				},
			],
		},
	],
}

// Custom SidebarRail component that works with our toggle system
function CustomSidebarRail({ isCollapsed }: { isCollapsed: boolean }) {
	const handleToggle = () => {
		const event = new CustomEvent('toggle-sidebar')
		window.dispatchEvent(event)
	}

	return (
		<button
			onClick={handleToggle}
			aria-label="Toggle Sidebar"
			title="Toggle Sidebar"
			className={cn(
				"absolute inset-y-0 z-20 w-8 -right-4 transition-all ease-linear",
				"after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2 after:bg-sidebar-border after:transition-all after:duration-200",
				"hover:after:bg-sidebar-accent-foreground/20",
				"cursor-w-resize",
				isCollapsed && "cursor-e-resize",
				"block", // Always show the rail
				"bg-transparent hover:bg-sidebar-accent/10" // Add subtle background on hover
			)}
		/>
	)
}

export function AppSidebar() {
	const location = useLocation()
	const user = useOptionalUser()
	const [isCollapsed, setIsCollapsed] = useState(false)

	// Listen for toggle events from the header
	useEffect(() => {
		const handleToggle = () => {
			const newState = !isCollapsed
			setIsCollapsed(newState)
			// Dispatch state change event to update header icon
			const event = new CustomEvent('sidebar-state-change', {
				detail: { isCollapsed: newState }
			})
			window.dispatchEvent(event)
		}

		window.addEventListener('toggle-sidebar', handleToggle)
		return () => window.removeEventListener('toggle-sidebar', handleToggle)
	}, [isCollapsed])

	// Dispatch initial state
	useEffect(() => {
		const event = new CustomEvent('sidebar-state-change', {
			detail: { isCollapsed }
		})
		window.dispatchEvent(event)
	}, [isCollapsed])

	return (
		<div className={`flex flex-col h-full bg-sidebar border-r transition-all duration-300 relative ${isCollapsed ? 'w-16' : 'w-64'}`}>
			<div className={`flex h-16 shrink-0 items-center border-b ${isCollapsed ? 'px-2 justify-center' : 'px-4 justify-between'}`}>
				{isCollapsed ? (
					<div className="flex aspect-square size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
						<span className="text-sm font-semibold">
							{user?.name?.charAt(0) || 'U'}
						</span>
					</div>
				) : (
					<>
						<div className="flex items-center gap-2">
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<Icon name="settings" className="size-4" />
							</div>
							<div className="grid text-left text-sm leading-tight">
								<span className="truncate font-semibold">Epic Shop</span>
								<span className="truncate text-xs text-sidebar-foreground/70">Enterprise</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex aspect-square size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
								<span className="text-sm font-semibold">
									{user?.name?.charAt(0) || 'U'}
								</span>
							</div>
						</div>
					</>
				)}
			</div>
			<div className={`flex-1 overflow-auto ${isCollapsed ? 'p-1' : 'p-2'}`}>
				{navData.navMain.map((group) => (
					<div key={group.title} className="mb-4">
						{!isCollapsed && (
							<div className="px-2 py-1 text-xs font-medium text-sidebar-foreground/70">
								{group.title}
							</div>
						)}
						<div className="space-y-1">
							{group.items.map((item) => (
								<div key={item.title}>
									{item.hasSubmenu ? (
										<Collapsible defaultOpen className="group/collapsible">
											<CollapsibleTrigger asChild>
												<Button
													variant={location.pathname.startsWith(item.url) ? "secondary" : "ghost"}
													className={`${isCollapsed ? 'w-12 h-12 p-0 justify-center' : 'w-full justify-start px-3'}`}
												>
													<Icon name={item.icon} className="size-4" />
													{!isCollapsed && (
														<>
															<span className="ml-2">{item.title}</span>
															<Icon 
																name="chevron-down" 
																className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" 
															/>
														</>
													)}
												</Button>
											</CollapsibleTrigger>
											{!isCollapsed && (
												<CollapsibleContent>
													<div className="ml-4 space-y-1">
														{item.items?.map((subItem) => (
															<Button
																key={subItem.title}
																variant="ghost"
																asChild
																className="w-full justify-start h-8"
															>
																<Link to={subItem.url}>
																	<span className="text-sm">{subItem.title}</span>
																</Link>
															</Button>
														))}
													</div>
												</CollapsibleContent>
											)}
										</Collapsible>
									) : (
										<Button
											variant={location.pathname === item.url ? "secondary" : "ghost"}
											asChild
											className={`${isCollapsed ? 'w-12 h-12 p-0 justify-center' : 'w-full justify-start px-3'}`}
										>
											<Link to={item.url}>
												<Icon name={item.icon} className="size-4" />
												{!isCollapsed && <span className="ml-2">{item.title}</span>}
											</Link>
										</Button>
									)}
								</div>
							))}
						</div>
					</div>
				))}
			</div>
			
			{/* Custom SidebarRail for clickable border area */}
			<CustomSidebarRail isCollapsed={isCollapsed} />
		</div>
	)
}
