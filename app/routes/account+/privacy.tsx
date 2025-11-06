import { data } from 'react-router'
import { Link, useFetcher } from 'react-router'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/privacy.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Privacy & Data',
}

const deleteDataActionIntent = 'delete-data'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	switch (intent) {
		case deleteDataActionIntent: {
			return deleteDataAction({ userId })
		}
		default: {
			return data({ status: 'error', submission: null } as const, { status: 400 })
		}
	}
}

async function deleteDataAction({ userId }: { userId: string }) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: 'Data Deleted',
		description: 'All of your data has been deleted',
	})
}

function SettingItem({ 
	icon, 
	title, 
	description, 
	to,
	danger = false,
	reloadDocument = false,
	download,
}: { 
	icon: React.ReactNode; 
	title: string; 
	description: string;
	to: string;
	danger?: boolean;
	reloadDocument?: boolean;
	download?: string;
}) {
	return (
		<Link
			to={to}
			reloadDocument={reloadDocument}
			download={download}
			className="w-full text-left p-4 rounded-lg transition-colors group flex items-start gap-4 border border-transparent hover:border-[rgba(0,0,0,0.1)] hover:bg-[#F3F3F5]"
		>
			<div className={`mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform ${danger ? '' : ''}`} style={{ color: danger ? '#DC2626' : '#717182' }}>
				{icon}
			</div>
			<div className="flex-1 min-w-0">
				<div className="mb-1" style={{ color: danger ? '#DC2626' : '#0A0A0A' }}>
					{title}
				</div>
				<div className="text-sm" style={{ color: danger ? '#DC2626' : '#717182' }}>
					{description}
				</div>
			</div>
			<Icon name="arrow-right" className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: danger ? '#DC2626' : '#717182' }} />
		</Link>
	)
}

function DeleteData() {
	const dc = useDoubleCheck()
	const fetcher = useFetcher<typeof deleteDataAction>()

	return (
		<div className="w-full text-left p-4 rounded-lg transition-colors group flex items-start gap-4 border border-transparent hover:border-[rgba(220,38,38,0.5)] hover:bg-[rgba(220,38,38,0.05)]">
			<div className="mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" style={{ color: '#DC2626' }}>
				<Icon name="trash" className="w-5 h-5" />
			</div>
			<div className="flex-1 min-w-0">
				<fetcher.Form method="POST" className="inline">
					<StatusButton
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: deleteDataActionIntent,
						})}
						variant={dc.doubleCheck ? 'destructive' : 'ghost'}
						status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
						className="h-auto p-0 hover:bg-transparent"
						style={{ color: '#DC2626' }}
					>
						{dc.doubleCheck ? `Are you sure?` : `Delete Your Account`}
					</StatusButton>
				</fetcher.Form>
				<div className="text-sm mt-1" style={{ color: '#DC2626' }}>
					Permanently delete your account and all associated data
				</div>
			</div>
		</div>
	)
}

export default function PrivacyPage() {
	return (
		<div className="space-y-6">
			<Card className="p-8">
				<h2 className="mb-2" style={{ fontSize: '16px', lineHeight: '1.5em', fontWeight: 400, color: '#0A0A0A' }}>
					Privacy & Data
				</h2>
				<p className="text-sm mb-6" style={{ color: '#717182' }}>
					Manage your data and privacy settings
				</p>

				<div className="space-y-2">
					<SettingItem 
						icon={<Icon name="download" className="w-5 h-5" />}
						title="Download Your Data"
						description="Request an export of all your account data"
						to="/resources/download-user-data"
						reloadDocument
						download="my-epic-notes-data.json"
					/>
				</div>
			</Card>

			<Card className="p-8" style={{ borderColor: 'rgba(220,38,38,0.5)', backgroundColor: 'rgba(220,38,38,0.05)' }}>
				<h2 className="mb-2" style={{ fontSize: '16px', lineHeight: '1.5em', fontWeight: 400, color: '#DC2626' }}>
					Danger Zone
				</h2>
				<p className="text-sm mb-6" style={{ color: 'rgba(220,38,38,0.8)' }}>
					Irreversible actions that will permanently affect your account
				</p>

				<div className="space-y-2">
					<DeleteData />
				</div>
			</Card>
		</div>
	)
}

