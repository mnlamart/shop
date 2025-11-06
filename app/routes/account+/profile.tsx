import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Profile',
}

export default function ProfileLayout() {
	return <Outlet />
}

