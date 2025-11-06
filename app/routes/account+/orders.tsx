import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Orders',
}

export default function OrdersLayout() {
	return <Outlet />
}
