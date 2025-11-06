import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/notifications.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Notifications',
}

const NotificationPreferencesSchema = z.object({
	emailNotificationsEnabled: z.preprocess(
		(val) => val === 'on' || val === true,
		z.boolean().default(true),
	),
	orderUpdateEmailsEnabled: z.preprocess(
		(val) => val === 'on' || val === true,
		z.boolean().default(true),
	),
	marketingEmailsEnabled: z.preprocess(
		(val) => val === 'on' || val === true,
		z.boolean().default(false),
	),
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			emailNotificationsEnabled: true,
			orderUpdateEmailsEnabled: true,
			marketingEmailsEnabled: true,
		},
	})

	return { preferences: user }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: NotificationPreferencesSchema,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const {
		emailNotificationsEnabled,
		orderUpdateEmailsEnabled,
		marketingEmailsEnabled,
	} = submission.value

	await prisma.user.update({
		where: { id: userId },
		data: {
			emailNotificationsEnabled,
			orderUpdateEmailsEnabled,
			marketingEmailsEnabled,
		},
	})

	return redirectWithToast('/account', {
		type: 'success',
		title: 'Preferences Updated',
		description: 'Notification preferences have been saved',
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Notification Preferences | Settings | Epic Shop' },
	{ name: 'description', content: 'Manage your notification preferences' },
]

export default function Notifications({ loaderData, actionData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const { preferences } = loaderData

	const [form, fields] = useForm({
		id: 'notification-preferences-form',
		constraint: getZodConstraint(NotificationPreferencesSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: NotificationPreferencesSchema })
		},
		defaultValue: {
			emailNotificationsEnabled: preferences.emailNotificationsEnabled ? 'on' : undefined,
			orderUpdateEmailsEnabled: preferences.orderUpdateEmailsEnabled ? 'on' : undefined,
			marketingEmailsEnabled: preferences.marketingEmailsEnabled ? 'on' : undefined,
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">
						Notification Preferences
					</h1>
					<p className="text-gray-600">
						Manage how you receive notifications
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Settings
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-amber-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
							<Icon name="bell" className="w-5 h-5 text-amber-700" />
						</div>
						<CardTitle className="text-lg">Email Notifications</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<label
										htmlFor={fields.emailNotificationsEnabled.id}
										className="text-sm font-medium leading-none cursor-pointer"
									>
										Email Notifications
									</label>
									<p className="text-sm text-gray-500">
										Master switch for all email notifications
									</p>
								</div>
								<input
									{...getInputProps(fields.emailNotificationsEnabled, {
										type: 'checkbox',
									})}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<label
										htmlFor={fields.orderUpdateEmailsEnabled.id}
										className="text-sm font-medium leading-none cursor-pointer"
									>
										Order Updates
									</label>
									<p className="text-sm text-gray-500">
										Receive emails when your order status changes (shipped,
										delivered, etc.)
									</p>
								</div>
								<input
									{...getInputProps(fields.orderUpdateEmailsEnabled, {
										type: 'checkbox',
									})}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								/>
							</div>

							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<label
										htmlFor={fields.marketingEmailsEnabled.id}
										className="text-sm font-medium leading-none cursor-pointer"
									>
										Marketing Emails
									</label>
									<p className="text-sm text-gray-500">
										Receive promotional emails, special offers, and product
										updates
									</p>
								</div>
								<input
									{...getInputProps(fields.marketingEmailsEnabled, {
										type: 'checkbox',
									})}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								/>
							</div>
						</div>

						<ErrorList errors={form.errors} id={form.errorId} />

						<div className="flex gap-4 justify-end pt-6 border-t">
							<Button variant="outline" asChild type="button">
								<Link to="/account">Cancel</Link>
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? (
									<>
										<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
										Saving...
									</>
								) : (
									<>
										<Icon name="check" className="h-4 w-4 mr-2" />
										Save Preferences
									</>
								)}
							</Button>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

