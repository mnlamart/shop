import { Outlet } from 'react-router'
import { type BreadcrumbHandle } from '../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Addresses',
}

export default function AddressesLayout() {
	return <Outlet />
}
