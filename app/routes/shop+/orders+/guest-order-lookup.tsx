import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { data, Form, redirect } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { useIsPending } from '#app/utils/misc.tsx'
import { getGuestOrder } from '#app/utils/order.server.ts'
import { type Route } from './+types/index.ts'

const GuestOrderLookupSchema = z.object({
	orderNumber: z.string({
		error: (issue) =>
			issue.input === undefined ? 'Order number is required' : 'Not a string',
	}).min(1, { error: 'Order number is required' }).trim(),
	email: z.string({
		error: (issue) =>
			issue.input === undefined ? 'Email is required' : 'Not a string',
	}).min(1, { error: 'Email is required' }).email({ error: 'Invalid email address' }).trim().toLowerCase(),
})

export async function loader(_args: Route.LoaderArgs) {
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: GuestOrderLookupSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { orderNumber, email } = submission.value

	// Look up guest order
	const order = await getGuestOrder(orderNumber, email)

	if (!order) {
		return data(
			{
				result: submission.reply({
					formErrors: [
						'Order not found. Please check your order number and email address.',
					],
				}),
			},
			{ status: 404 },
		)
	}

	// Redirect to order detail page with email query param for guest access
	// Guest orders can be viewed at /shop/orders/$orderNumber
	return redirect(`/shop/orders/${orderNumber}?email=${encodeURIComponent(email)}`)
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order History | Shop | Epic Shop' },
]

export default function GuestOrderLookup({ actionData }: Route.ComponentProps) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'guest-order-lookup-form',
		constraint: getZodConstraint(GuestOrderLookupSchema),
		lastResult: actionData && 'result' in actionData ? actionData.result : undefined,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: GuestOrderLookupSchema })
		},
		defaultValue: {
			orderNumber: '',
			email: '',
		},
	})

	return (
		<div className="container mx-auto px-4 py-8 space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Order History</h1>
					<p className="text-gray-600">
						Look up your order by order number and email
					</p>
				</div>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-pink-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-100 to-pink-200 flex items-center justify-center">
							<Icon name="package" className="w-5 h-5 text-pink-700" />
						</div>
						<CardTitle className="text-lg">Look Up Order</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						<div className="grid gap-4 md:grid-cols-2">
						<Field
							labelProps={{
								htmlFor: fields.orderNumber.id,
								children: 'Order Number',
							}}
							inputProps={{
								...getInputProps(fields.orderNumber, { type: 'text' }),
								placeholder: 'ORD-000001',
								autoFocus: true,
							}}
							errors={fields.orderNumber.errors}
						/>
						<Field
							labelProps={{
								htmlFor: fields.email.id,
								children: 'Email',
							}}
							inputProps={{
								...getInputProps(fields.email, { type: 'email' }),
								placeholder: 'your.email@example.com',
								autoComplete: 'email',
							}}
							errors={fields.email.errors}
						/>
						</div>
						<ErrorList errors={form.errors} id={form.errorId} />
						<div className="flex justify-end pt-6 border-t">
							<StatusButton
								status={isPending ? 'pending' : form.status ?? 'idle'}
								type="submit"
								disabled={isPending}
							>
								Look Up Order
							</StatusButton>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

