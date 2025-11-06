import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { data, redirect, Form, Link } from 'react-router'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	checkIsCommonPassword,
	getPasswordHash,
	requireUserId,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/user-validation.ts'
import { type BreadcrumbHandle } from '../../account.tsx'
import { type Route } from './+types/password.create.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Create Password',
}

const CreatePasswordForm = PasswordAndConfirmPasswordSchema

async function requireNoPassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (password) {
		throw redirect('/account/security/password')
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		async: true,
		schema: CreatePasswordForm.superRefine(async ({ password }, ctx) => {
			const isCommonPassword = await checkIsCommonPassword(password)
			if (isCommonPassword) {
				ctx.addIssue({
					path: ['password'],
					code: 'custom',
					message: 'Password is too common',
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{
				result: submission.reply({
					hideFields: ['password', 'confirmPassword'],
				}),
			},
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { password } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				create: {
					hash: await getPasswordHash(password),
				},
			},
		},
	})

	return redirect(`/account`, { status: 302 })
}

export default function CreatePasswordRoute({
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'password-create-form',
		constraint: getZodConstraint(CreatePasswordForm),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreatePasswordForm })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Create Password</h1>
					<p className="text-gray-600">
						Set a password for your account
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
							<Icon name="lock-closed" className="w-5 h-5 text-red-700" />
						</div>
						<CardTitle className="text-lg">Password</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						<Field
							labelProps={{ children: 'New Password' }}
							inputProps={{
								...getInputProps(fields.password, { type: 'password' }),
								autoComplete: 'new-password',
							}}
							errors={fields.password.errors}
						/>
						<Field
							labelProps={{ children: 'Confirm New Password' }}
							inputProps={{
								...getInputProps(fields.confirmPassword, {
									type: 'password',
								}),
								autoComplete: 'new-password',
							}}
							errors={fields.confirmPassword.errors}
						/>
						<ErrorList id={form.errorId} errors={form.errors} />
						<div className="flex gap-4 justify-end pt-6 border-t">
							<Button variant="outline" asChild type="button">
								<Link to="/account">Cancel</Link>
							</Button>
							<StatusButton
								type="submit"
								status={isPending ? 'pending' : (form.status ?? 'idle')}
							>
								Create Password
							</StatusButton>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
