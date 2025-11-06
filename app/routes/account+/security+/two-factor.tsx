import { Outlet } from 'react-router'
import { type VerificationTypes } from '#app/routes/_auth+/verify.tsx'
import { type BreadcrumbHandle } from '../../account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Two-Factor Authentication',
}

export const twoFAVerificationType = '2fa' satisfies VerificationTypes

export default function TwoFactorRoute() {
	return <Outlet />
}
