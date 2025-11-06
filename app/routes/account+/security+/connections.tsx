import { invariantResponse } from '@epic-web/invariant'
import { useState } from 'react'
import { data, Link, useFetcher } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { resolveConnectionData } from '#app/utils/connections.server.ts'
import {
	ProviderConnectionForm,
	type ProviderName,
	ProviderNameSchema,
	providerIcons,
	providerNames,
} from '#app/utils/connections.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { pipeHeaders } from '#app/utils/headers.server.js'
import { makeTimings } from '#app/utils/timing.server.ts'
import { createToastHeaders } from '#app/utils/toast.server.ts'
import { type BreadcrumbHandle } from '../../account.tsx'
import { type Route } from './+types/connections.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Connections',
}

async function userCanDeleteConnections(userId: string) {
	const user = await prisma.user.findUnique({
		select: {
			password: { select: { userId: true } },
			_count: { select: { connections: true } },
		},
		where: { id: userId },
	})
	// user can delete their connections if they have a password
	if (user?.password) return true
	// users have to have more than one remaining connection to delete one
	return Boolean(user?._count.connections && user?._count.connections > 1)
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const timings = makeTimings('profile connections loader')
	const rawConnections = await prisma.connection.findMany({
		select: { id: true, providerName: true, providerId: true, createdAt: true },
		where: { userId },
	})
	const connections: Array<{
		providerName: ProviderName
		id: string
		displayName: string
		link?: string | null
		createdAtFormatted: string
	}> = []
	for (const connection of rawConnections) {
		const r = ProviderNameSchema.safeParse(connection.providerName)
		if (!r.success) continue
		const providerName = r.data
		const connectionData = await resolveConnectionData(
			providerName,
			connection.providerId,
			{ timings },
		)
		connections.push({
			...connectionData,
			providerName,
			id: connection.id,
			createdAtFormatted: connection.createdAt.toLocaleString(),
		})
	}

	return data(
		{
			connections,
			canDeleteConnections: await userCanDeleteConnections(userId),
		},
		{ headers: { 'Server-Timing': timings.toString() } },
	)
}

export const headers: Route.HeadersFunction = pipeHeaders

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	invariantResponse(
		formData.get('intent') === 'delete-connection',
		'Invalid intent',
	)
	invariantResponse(
		await userCanDeleteConnections(userId),
		'You cannot delete your last connection unless you have a password.',
	)
	const connectionId = formData.get('connectionId')
	invariantResponse(typeof connectionId === 'string', 'Invalid connectionId')
	await prisma.connection.delete({
		where: {
			id: connectionId,
			userId: userId,
		},
	})
	const toastHeaders = await createToastHeaders({
		title: 'Deleted',
		description: 'Your connection has been deleted.',
	})
	return data({ status: 'success' } as const, { headers: toastHeaders })
}

export default function Connections({ loaderData }: Route.ComponentProps) {
	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Manage Connections</h1>
					<p className="text-gray-600">
						Connect or disconnect social accounts
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Settings
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-red-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center">
							<Icon name="link-2" className="w-5 h-5 text-red-700" />
						</div>
						<CardTitle className="text-lg">Social Connections</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0 space-y-6">
					{loaderData.connections.length ? (
						<div className="space-y-4">
							<p className="text-gray-900">Here are your current connections:</p>
							<ul className="flex flex-col gap-4">
								{loaderData.connections.map((c) => (
									<li key={c.id}>
										<Connection
											connection={c}
											canDelete={loaderData.canDeleteConnections}
										/>
									</li>
								))}
							</ul>
						</div>
					) : (
						<p className="text-gray-600">You don't have any connections yet.</p>
					)}
					<div className="border-t pt-6">
						<p className="text-gray-900 mb-4">Connect a new account:</p>
						<div className="flex flex-col gap-3">
							{providerNames.map((providerName) => (
								<ProviderConnectionForm
									key={providerName}
									type="Connect"
									providerName={providerName}
								/>
							))}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function Connection({
	connection,
	canDelete,
}: {
	connection: Route.ComponentProps['loaderData']['connections'][number]
	canDelete: boolean
}) {
	const deleteFetcher = useFetcher<typeof action>()
	const [infoOpen, setInfoOpen] = useState(false)
	const icon = providerIcons[connection.providerName]
	return (
		<div className="flex justify-between gap-2">
			<span className={`inline-flex items-center gap-1.5`}>
				{icon}
				<span>
					{connection.link ? (
						<a href={connection.link} className="underline">
							{connection.displayName}
						</a>
					) : (
						connection.displayName
					)}{' '}
					({connection.createdAtFormatted})
				</span>
			</span>
			{canDelete ? (
				<deleteFetcher.Form method="POST">
					<input name="connectionId" value={connection.id} type="hidden" />
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<StatusButton
									name="intent"
									value="delete-connection"
									variant="destructive"
									size="sm"
									status={
										deleteFetcher.state !== 'idle'
											? 'pending'
											: (deleteFetcher.data?.status ?? 'idle')
									}
								>
									<Icon name="cross-1" />
								</StatusButton>
							</TooltipTrigger>
							<TooltipContent>Disconnect this account</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</deleteFetcher.Form>
			) : (
				<TooltipProvider>
					<Tooltip open={infoOpen} onOpenChange={setInfoOpen}>
						<TooltipTrigger onClick={() => setInfoOpen(true)}>
							<Icon name="question-mark-circled"></Icon>
						</TooltipTrigger>
						<TooltipContent>
							You cannot delete your last connection unless you have a password.
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}
		</div>
	)
}
