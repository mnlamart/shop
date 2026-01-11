import { useForm, getFormProps, getInputProps, FormProvider, getCollectionProps } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, data } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { handlePrismaError } from '#app/utils/prisma-error.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { EmailSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/$userId_.edit.ts'

const UserEditSchema = z.object({
	id: z.string({
		error: (issue) =>
			issue.input === undefined ? 'ID is required' : 'Not a string',
	}),
	name: z
		.string()
		.transform((val) => (val && val.trim() ? val.trim() : null))
		.refine(
			(val) => {
				// Allow null (empty), or validate length if string
				if (val === null) return true
				return val.length >= 3 && val.length <= 40
			},
			{
				message: 'Name must be between 3 and 40 characters, or empty',
			},
		),
	email: EmailSchema,
	username: UsernameSchema,
	roleIds: z.preprocess(
		(val) => {
			// Handle FormData - unchecked checkboxes won't be in FormData at all
			// parseFormData will convert FormData.getAll() to array, or undefined if missing
			if (val === undefined || val === null) return []
			if (Array.isArray(val)) return val.filter(Boolean) // Filter out empty strings
			if (typeof val === 'string' && val) return [val]
			return []
		},
		z.array(z.string()),
	),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: {
				select: {
					id: true,
					name: true,
					description: true,
				},
			},
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	// Get all available roles for the role selection
	const roles = await prisma.role.findMany({
		select: {
			id: true,
			name: true,
			description: true,
		},
		orderBy: { name: 'asc' },
	})

	return { user, roles }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	
	const submission = await parseWithZod(formData, {
		schema: UserEditSchema.superRefine(async (data, ctx) => {
			// Check email uniqueness (excluding current user)
			const existingEmail = await prisma.user.findFirst({
				where: {
					email: data.email,
					id: { not: data.id },
				},
			})
			if (existingEmail) {
				ctx.addIssue({
					code: 'custom',
					message: 'A user already exists with this email',
					path: ['email'],
				})
			}

			// Check username uniqueness (excluding current user)
			const existingUsername = await prisma.user.findFirst({
				where: {
					username: data.username,
					id: { not: data.id },
				},
			})
			if (existingUsername) {
				ctx.addIssue({
					code: 'custom',
					message: 'A user already exists with this username',
					path: ['username'],
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { id, name, email, username, roleIds } = submission.value

	try {
		await prisma.$transaction(async (tx) => {
			// Update user fields and roles
			await tx.user.update({
				where: { id },
				data: {
					name: name || null,
					email,
					username,
					roles: {
						set: [], // Clear existing roles
						connect: roleIds.map((roleId) => ({ id: roleId })), // Connect new roles
					},
				},
			})
		})

		return redirectWithToast(`/admin/users/${id}`, {
			type: 'success',
			title: 'User Updated',
			description: `User "${name || username}" updated successfully`,
		})
	} catch (error) {
		return handlePrismaError(error)
	}
}

export const meta: Route.MetaFunction = ({ loaderData }) => {
	if (!loaderData?.user) {
		return [{ title: 'User Not Found | Admin | Epic Shop' }]
	}
	return [
		{
			title: `Edit ${loaderData.user.name || loaderData.user.username} | Admin | Epic Shop`,
		},
		{
			name: 'description',
			content: `Edit user: ${loaderData.user.email}`,
		},
	]
}

export default function EditUser({ loaderData, actionData }: Route.ComponentProps) {
	const { user, roles } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'user-edit-form',
		constraint: getZodConstraint(UserEditSchema),
		lastResult: actionData && 'result' in actionData ? actionData.result : undefined,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: UserEditSchema })
		},
		defaultValue: {
			id: user.id,
			name: user.name || '',
			email: user.email,
			username: user.username,
			// @ts-expect-error - Conform's type inference doesn't properly handle z.preprocess for arrays.
			// The roleIds field uses z.preprocess to convert FormData to string[], but Conform infers it as string.
			// This is safe because getCollectionProps correctly handles the array type at runtime.
			roleIds: user.roles.map((r) => r.id),
		},
		shouldRevalidate: 'onBlur',
	})

	const roleCheckboxes = getCollectionProps(fields.roleIds, {
		type: 'checkbox',
		options: roles.map((r) => r.id),
	})

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Edit User</h1>
					<p className="text-muted-foreground">
						Update user: {user.name || user.username}
					</p>
				</div>
				<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
					<Link to={`/admin/users/${user.id}`}>
						<Icon name="arrow-left" className="mr-2" />
						Cancel
					</Link>
				</Button>
			</div>

			<FormProvider context={form.context}>
				<Form method="POST" className="space-y-8" {...getFormProps(form)}>
					<input {...getInputProps(fields.id, { type: 'hidden' })} value={user.id} />

					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<h2 className="text-xl">User Information</h2>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-3">
									<Label htmlFor={fields.name.id} className="text-sm font-medium">
										Name
									</Label>
									<Input
										{...getInputProps(fields.name, { type: 'text' })}
										aria-label="Name"
										placeholder="Enter user name (optional)"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<ErrorList errors={fields.name.errors} />
								</div>

								<div className="space-y-3">
									<Label htmlFor={fields.email.id} className="text-sm font-medium">
										Email *
									</Label>
									<Input
										{...getInputProps(fields.email, { type: 'email' })}
										placeholder="Enter email address"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
										aria-label="Email"
									/>
									<ErrorList errors={fields.email.errors} />
								</div>
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.username.id} className="text-sm font-medium">
									Username *
								</Label>
								<Input
									{...getInputProps(fields.username, { type: 'text' })}
									placeholder="Enter username"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									aria-label="Username"
								/>
								<ErrorList errors={fields.username.errors} />
							</div>

							<div className="space-y-3">
								<Label className="text-sm font-medium">Roles</Label>
								<div className="space-y-3">
									{roles.map((role) => {
										const checkboxProps = roleCheckboxes.find(
											(props) => props.value === role.id,
										)
										if (!checkboxProps) return null

										return (
											<RoleCheckbox
												key={role.id}
												role={role}
												checkboxProps={checkboxProps}
											/>
										)
									})}
								</div>
								<ErrorList errors={fields.roleIds.errors} />
							</div>
						</CardContent>
					</Card>

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex items-center justify-end space-x-4">
						<Button type="button" variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
							<Link to={`/admin/users/${user.id}`}>Cancel</Link>
						</Button>
						<StatusButton
							type="submit"
							disabled={isPending}
							status={isPending ? 'pending' : form.status ?? 'idle'}
							className="transition-all duration-200 hover:shadow-md"
						>
							{isPending ? 'Saving...' : 'Save Changes'}
						</StatusButton>
					</div>
				</Form>
			</FormProvider>
		</div>
	)
}

function RoleCheckbox({
	role,
	checkboxProps,
}: {
	role: { id: string; name: string; description: string | null }
	checkboxProps: {
		id: string
		name: string
		value: string
		defaultChecked?: boolean
	}
}) {
	return (
		<div className="flex items-center space-x-2">
			<input
				type="checkbox"
				{...checkboxProps}
				defaultChecked={checkboxProps.defaultChecked ?? false}
				className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
			/>
			<Label
				htmlFor={checkboxProps.id}
				className="text-sm font-normal cursor-pointer"
			>
				{role.name}
				{role.description && (
					<span className="ml-2 text-xs text-muted-foreground">
						({role.description})
					</span>
				)}
			</Label>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
			<Icon name="question-mark-circled" className="h-12 w-12 text-muted-foreground" />
			<h2 className="text-xl font-semibold">User Not Found</h2>
			<p className="text-muted-foreground text-center">
				The user you are trying to edit does not exist.
			</p>
			<Button asChild>
				<Link to="/admin/users">Back to Users</Link>
			</Button>
		</div>
	)
}

