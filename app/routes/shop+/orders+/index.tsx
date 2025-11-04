import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { getGuestOrder, getUserOrders } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { type Route } from './+types/index.ts'

const GuestOrderLookupSchema = z.object({
	orderNumber: z.string().min(1, 'Order number is required').trim(),
	email: z.string().min(1, 'Email is required').email('Invalid email address').trim().toLowerCase(),
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)

	// If user is authenticated, get their orders
	if (userId) {
		const orders = await getUserOrders(userId)
		return { orders, userId, isAuthenticated: true }
	}

	// If not authenticated, return empty orders
	return { orders: [], userId: null, isAuthenticated: false }
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
	return redirect(`/shop/orders/${orderNumber}?email=${encodeURIComponent(email)}`)
}

function getStatusBadgeVariant(status: string) {
	switch (status) {
		case 'CONFIRMED':
			return 'default'
		case 'SHIPPED':
			return 'success'
		case 'DELIVERED':
			return 'success'
		case 'CANCELLED':
			return 'destructive'
		case 'PENDING':
			return 'secondary'
		default:
			return 'secondary'
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order History | Shop | Epic Shop' },
]

export default function OrderHistory({ loaderData, actionData }: Route.ComponentProps) {
	const { orders, isAuthenticated } = loaderData
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
					<p className="text-muted-foreground">
						{isAuthenticated
							? `View and track your orders (${orders.length} total)`
							: 'Look up your order by order number and email'}
					</p>
				</div>
			</div>

			{/* Guest Order Lookup Form */}
			{!isAuthenticated && (
				<Card>
					<CardHeader>
						<CardTitle>Look Up Order</CardTitle>
					</CardHeader>
					<CardContent>
						<Form method="POST" {...getFormProps(form)}>
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
							<div className="mt-4">
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
			)}

			{/* Authenticated User Orders */}
			{isAuthenticated && (
				<>
					{orders.length === 0 ? (
						<Card>
							<CardContent className="py-12 text-center">
								<p className="text-lg text-muted-foreground mb-4">
									You haven't placed any orders yet.
								</p>
								<Button asChild>
									<Link to="/shop">Start Shopping</Link>
								</Button>
							</CardContent>
						</Card>
					) : (
						<div className="space-y-4">
							{orders.map((order) => (
								<Card key={order.id} className="transition-shadow hover:shadow-md">
									<CardContent className="pt-6">
										<div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
											<div className="flex-1">
												<div className="flex items-center gap-3 mb-2">
													<Link
														to={`/shop/orders/${order.orderNumber}`}
														className="font-semibold text-lg text-primary hover:underline"
													>
														{order.orderNumber}
													</Link>
													<Badge variant={getStatusBadgeVariant(order.status)}>
														{order.status}
													</Badge>
												</div>
												<p className="text-sm text-muted-foreground">
													{new Date(order.createdAt).toLocaleDateString('en-US', {
														year: 'numeric',
														month: 'long',
														day: 'numeric',
													})}
												</p>
												{order.items.length > 0 && (
													<p className="text-sm text-muted-foreground mt-1">
														{order.items.length} item{order.items.length !== 1 ? 's' : ''}
													</p>
												)}
											</div>
											<div className="text-right">
												<p className="text-xl font-bold">
													{formatPrice(order.total)}
												</p>
												<Button variant="outline" size="sm" asChild className="mt-2">
													<Link to={`/shop/orders/${order.orderNumber}`}>
														View Details
													</Link>
												</Button>
											</div>
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					)}
				</>
			)}
		</div>
	)
}

