import { getFormProps, getInputProps, useForm, type SubmissionResult } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import { data, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { twoFAVerificationType } from '#app/routes/account+/security+/two-factor.tsx'
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc, useIsPending } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/account.index.ts'
import { type BreadcrumbHandle } from './account.tsx'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Profile',
}

const ProfileFormSchema = z.object({
	name: NameSchema.nullable().default(null),
	username: UsernameSchema,
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			image: {
				select: { objectKey: true },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
					orders: true,
				},
			},
		},
	})

	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	return {
		user,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
		orderCount: user._count.orders,
	}
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'
const deleteDataActionIntent = 'delete-data'

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
		}
		case deleteDataActionIntent: {
			return deleteDataAction({ request, userId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: 'custom',
					message: 'A user already exists with this username',
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { username, name } = submission.value

	// Verify user exists before updating (handles race conditions in tests)
	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true },
	})
	if (!existingUser) {
		return data(
			{ result: { status: 'error' as const, error: [{ message: 'User not found' }] } },
			{ status: 404 },
		)
	}

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			name: name,
			username: username,
		},
	})

	return {
		result: submission.reply(),
	}
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	invariantResponse(
		sessionId,
		'You must be authenticated to sign out of other sessions',
	)
	await prisma.session.deleteMany({
		where: {
			userId,
			id: { not: sessionId },
		},
	})
	return { status: 'success' } as const
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: 'Data Deleted',
		description: 'All of your data has been deleted',
	})
}

export default function AccountPage({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<Card className="p-8" style={{ borderRadius: '14px' }}>
			<h2 className="text-base font-normal mb-6" style={{ fontSize: '16px', lineHeight: '1.5em', color: '#0A0A0A' }}>Profile Information</h2>
			
			<div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8">
				{/* Avatar */}
				<div className="relative group">
					<div className="w-32 h-32 rounded-full" style={{ backgroundColor: '#ECECF0', padding: '4px' }}>
						<div className="w-full h-full rounded-full bg-white flex items-center justify-center overflow-hidden" style={{ padding: '8px' }}>
							<Img
								src={getUserImgSrc(loaderData.user.image?.objectKey)}
								alt={loaderData.user.name ?? loaderData.user.username}
								className="w-full h-full object-contain rounded-full"
								width={832}
								height={832}
								isAboveFold
							/>
						</div>
					</div>
					<Button
						asChild
						className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center shadow-md hover:opacity-90 transition-opacity p-0"
						style={{ backgroundColor: '#030213', color: '#FFFFFF' }}
					>
						<Link
							preventScrollReset
							to="/account/profile/photo"
							title="Change profile photo"
							aria-label="Change profile photo"
						>
							<Icon name="camera" className="w-5 h-5" />
						</Link>
					</Button>
				</div>

				<div className="flex-1 w-full">
					<p className="text-sm mb-4" style={{ color: '#717182' }}>
						This is your personal space. Update your profile picture and information to make it truly yours.
					</p>
				</div>
			</div>

			<UpdateProfile loaderData={loaderData} actionData={actionData} />
		</Card>
	)
}

function UpdateProfile({
	loaderData,
	actionData,
}: {
	loaderData: Route.ComponentProps['loaderData']
	actionData?: Route.ComponentProps['actionData']
}) {
	const fetcher = useFetcher<typeof profileUpdateAction>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: actionData && 'result' in actionData 
			? (actionData.result as SubmissionResult<string[]> | undefined)
			: (fetcher.data?.result as SubmissionResult<string[]> | undefined),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProfileFormSchema })
		},
		defaultValue: {
			username: loaderData.user.username,
			name: loaderData.user.name,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<input type="hidden" name="intent" value={profileUpdateActionIntent} />
			<div className="space-y-6">
				<div className="grid md:grid-cols-2 gap-6">
					<div className="space-y-2">
						<label htmlFor={fields.username.id} className="block text-sm" style={{ color: '#717182' }}>Username</label>
						<input
							{...getInputProps(fields.username, { type: 'text' })}
							className="w-full px-3 py-1 rounded-lg border-0"
							style={{ backgroundColor: '#F3F3F5', color: '#0A0A0A' }}
							aria-label="Username"
						/>
						{fields.username.errors && (
							<p className="text-sm text-red-600 mt-1">{fields.username.errors[0]}</p>
						)}
					</div>
					<div className="space-y-2">
						<label htmlFor={fields.name.id} className="block text-sm" style={{ color: '#717182' }}>Display Name</label>
						<input
							{...getInputProps(fields.name, { type: 'text' })}
							className="w-full px-3 py-1 rounded-lg border-0"
							style={{ backgroundColor: '#F3F3F5', color: '#0A0A0A' }}
							aria-label="Display Name"
						/>
						{fields.name.errors && (
							<p className="text-sm text-red-600 mt-1">{fields.name.errors[0]}</p>
						)}
					</div>
				</div>

				<div className="space-y-2">
					<label htmlFor="bio" className="block text-sm" style={{ color: '#717182' }}>Bio</label>
					<textarea
						id="bio"
						placeholder="Tell us a bit about yourself..."
						className="w-full px-3 py-2 rounded-lg border-0 resize-none"
						style={{ backgroundColor: '#F3F3F5', color: '#717182' }}
						rows={4}
						aria-label="Bio"
					/>
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />

				<div className="flex justify-end">
					<Button 
						type="submit"
						disabled={isPending || fetcher.state !== 'idle'}
						className="px-8 py-2 rounded-lg"
						style={{ backgroundColor: '#030213', color: '#FFFFFF' }}
					>
						{isPending || fetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
					</Button>
				</div>
			</div>
		</fetcher.Form>
	)
}
