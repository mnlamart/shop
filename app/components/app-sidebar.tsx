import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '#app/components/ui/collapsible.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
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
					title: 'Users',
					url: '/admin/users',
					icon: 'user' as IconName,
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
					icon: 'folder' as IconName,
					hasSubmenu: true,
					items: [
						{ title: 'All Categories', url: '/admin/categories' },
						{ title: 'Add Category', url: '/admin/categories/new' },
					],
				},
				{
					title: 'Attributes',
					url: '/admin/attributes',
					icon: 'sliders' as IconName,
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
		<nav className={`flex flex-col h-full bg-sidebar border-r transition-all duration-300 relative ${isCollapsed ? 'w-16' : 'w-64'}`}>
			<div className={`flex h-16 shrink-0 items-center border-b ${isCollapsed ? 'px-2 justify-center' : 'px-4 justify-between'}`}>
				{isCollapsed ? (
					<div className="flex aspect-square size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
						<span className="text-sm font-semibold">
							{user?.name?.charAt(0) || 'U'}
						</span>
					</div>
				) : (
					<>
						<div className="flex items-center gap-2">
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<Icon name="settings" className="size-4" aria-hidden="true" />
							</div>
							<div className="grid text-left text-sm leading-tight">
								<span className="truncate font-semibold">Epic Shop</span>
								<span className="truncate text-xs text-sidebar-foreground/70">Enterprise</span>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex aspect-square size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
								<span className="text-sm font-semibold">
									{user?.name?.charAt(0) || 'U'}
								</span>
							</div>
						</div>
					</>
				)}
			</div>
			<div className={`flex-1 overflow-auto ${isCollapsed ? 'p-2' : 'p-3'}`}>
				{navData.navMain.map((group) => (
					<div key={group.title} className="mb-4">
						{!isCollapsed && (
							<div className="px-3 py-2 text-xs font-medium text-sidebar-foreground/70">
								{group.title}
							</div>
						)}
						<div className={`space-y-1 ${isCollapsed ? 'space-y-2' : ''}`}>
							{group.items.map((item) => {
								const isItemActive = location.pathname === item.url || (item.hasSubmenu && location.pathname.startsWith(item.url))
								
								return (
									<div key={item.title}>
										{item.hasSubmenu ? (
											<Collapsible defaultOpen className="group/collapsible">
												<div className="flex items-center gap-0 group/item rounded-md">
													<Button
														variant={isItemActive ? "secondary" : "ghost"}
														asChild
														className={`${isCollapsed ? 'w-full h-10 p-2 justify-center' : 'flex-1 justify-start px-3 py-2 h-10'} transition-colors hover:!bg-muted rounded-md`}
														aria-label={isCollapsed ? item.title : undefined}
													>
														<Link to={item.url} className="flex items-center w-full">
															<Icon name={item.icon} className="size-4 flex-shrink-0" aria-hidden="true" />
															{!isCollapsed && <span className="ml-2 font-medium">{item.title}</span>}
														</Link>
													</Button>
													{!isCollapsed && (
														<CollapsibleTrigger asChild>
															<Button
																variant="ghost"
																size="sm"
																className="h-10 w-8 p-0 flex-shrink-0 transition-colors hover:!bg-muted rounded-md"
																aria-label="Toggle submenu"
																onClick={(e) => {
																	e.stopPropagation()
																}}
															>
																<Icon 
																	name="chevron-down" 
																	className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" 
																	aria-hidden="true"
																/>
															</Button>
														</CollapsibleTrigger>
													)}
												</div>
												{!isCollapsed && (
													<CollapsibleContent className="overflow-hidden transition-all duration-200 ease-in-out">
														<div className="ml-4 space-y-0.5 mt-1 pb-1">
															{item.items?.map((subItem) => {
																const isSubItemActive = location.pathname === subItem.url
																return (
																	<Button
																		key={subItem.title}
																		variant={isSubItemActive ? "secondary" : "ghost"}
																		asChild
																		className={`w-full justify-start h-8 px-3 text-sm transition-colors hover:!bg-muted rounded-md`}
																	>
																		<Link to={subItem.url} className="flex items-center w-full">
																			<span className={isSubItemActive ? 'font-medium' : ''}>{subItem.title}</span>
																		</Link>
																	</Button>
																)
															})}
														</div>
													</CollapsibleContent>
												)}
											</Collapsible>
										) : (
											<Button
												variant={isItemActive ? "secondary" : "ghost"}
												asChild
												className={`${isCollapsed ? 'w-full h-10 p-2 justify-center' : 'w-full justify-start px-3 py-2 h-10'} transition-colors hover:!bg-muted rounded-md`}
											>
												<Link to={item.url} aria-label={isCollapsed ? item.title : undefined} className="flex items-center w-full">
													<Icon name={item.icon} className="size-4 flex-shrink-0" aria-hidden="true" />
													{!isCollapsed && <span className="ml-2 font-medium">{item.title}</span>}
												</Link>
											</Button>
										)}
									</div>
								)
							})}
						</div>
					</div>
				))}
			</div>
			
			{/* Custom SidebarRail for clickable border area */}
			<CustomSidebarRail isCollapsed={isCollapsed} />
		</nav>
	)
}
