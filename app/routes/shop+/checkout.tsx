import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect } from 'react'
import { data, Form, redirect } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx'
import {
	StockValidationError,
	validateStockAvailability,
} from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { createCheckoutSession, handleStripeError } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/checkout.ts'

const ShippingFormSchema = z.object({
	name: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'Name is required' : 'Not a string',
		})
		.min(1, 'Name is required')
		.max(100, 'Name must be less than 100 characters')
		.trim(),
	email: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'Email is required' : 'Not a string',
		})
		.trim()
		.toLowerCase()
		.min(1, 'Email is required')
		.pipe(z.email({ error: 'Invalid email address' })),
	street: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? 'Street address is required'
					: 'Not a string',
		})
		.min(1, 'Street address is required')
		.max(200, 'Street address must be less than 200 characters')
		.trim(),
	city: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'City is required' : 'Not a string',
		})
		.min(1, 'City is required')
		.max(100, 'City must be less than 100 characters')
		.trim(),
	state: z
		.string()
		.max(100, 'State must be less than 100 characters')
		.trim()
		.optional(),
	postal: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? 'Postal code is required'
					: 'Not a string',
		})
		.min(1, 'Postal code is required')
		.max(20, 'Postal code must be less than 20 characters')
		.trim(),
	country: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'Country is required' : 'Not a string',
		})
		.trim()
		.toUpperCase()
		.refine((val) => val.length === 2, {
			message: 'Country must be a 2-letter ISO code (e.g., US, GB)',
		}),
})

export async function loader({ request }: Route.LoaderArgs) {
	const { cart } = await getOrCreateCartFromRequest(request)

	if (!cart || cart.items.length === 0) {
		return redirect('/shop/cart')
	}

	// Load cart with full product details for display
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							description: true,
							price: true,
							images: {
								select: { objectKey: true, altText: true },
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							sku: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	// Get user email if authenticated (for pre-filling)
	let userEmail: string | undefined = undefined
	const userId = await getUserId(request)
	if (userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		})
		userEmail = user?.email || undefined
	}

	return {
		cart: cartWithItems,
		currency,
		subtotal,
		userEmail,
	}
}

export async function action({ request }: Route.ActionArgs) {
	console.log('[CHECKOUT] Action started')
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ShippingFormSchema,
	})

	if (submission.status !== 'success') {
		console.log('[CHECKOUT] Form validation failed:', submission.status)
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const shippingData = submission.value
	console.log('[CHECKOUT] Form validated successfully:', {
		name: shippingData.name,
		email: shippingData.email,
		city: shippingData.city,
	})

	// Get cart
	console.log('[CHECKOUT] Getting cart from request')
	const { cart } = await getOrCreateCartFromRequest(request)
	console.log('[CHECKOUT] Cart retrieved:', { cartId: cart?.id, itemCount: cart?.items.length })
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Validate stock availability before creating checkout session
	console.log('[CHECKOUT] Validating stock availability for cart:', cart.id)
	try {
		await validateStockAvailability(cart.id)
		console.log('[CHECKOUT] Stock validation passed')
	} catch (error) {
		console.error('[CHECKOUT] Stock validation failed:', error)
		if (error instanceof StockValidationError) {
			const stockMessages = error.issues.map(
				(issue) =>
					`${issue.productName}: Only ${issue.available} available, ${issue.requested} requested`,
			)
			return data(
				{
					result: submission.reply({
						formErrors: ['Insufficient stock:', ...stockMessages],
					}),
				},
				{ status: 400 },
			)
		}
		throw error
	}

	// Get cart with full product details for checkout session
	console.log('[CHECKOUT] Loading cart with full product details')
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							description: true,
							price: true,
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							sku: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })
	console.log('[CHECKOUT] Cart with items loaded:', {
		cartId: cartWithItems.id,
		items: cartWithItems.items.map((item) => ({
			productId: item.productId,
			productName: item.product.name,
			price: item.variant?.price ?? item.product.price,
			quantity: item.quantity,
		})),
	})

	// Get currency
	console.log('[CHECKOUT] Getting currency')
	const currency = await getStoreCurrency()
	console.log('[CHECKOUT] Currency:', currency?.code)
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	// Get user ID (optional - guest checkout supported)
	const userId = await getUserId(request)
	console.log('[CHECKOUT] User ID:', userId || 'guest')

	// Create Stripe Checkout Session
	console.log('[CHECKOUT] Creating Stripe checkout session')
	try {
		const domainUrl = getDomainUrl(request)
		console.log('[CHECKOUT] Domain URL:', domainUrl)
		const session = await createCheckoutSession({
			cart: cartWithItems,
			shippingInfo: {
				name: shippingData.name,
				email: shippingData.email,
				street: shippingData.street,
				city: shippingData.city,
				state: shippingData.state,
				postal: shippingData.postal,
				country: shippingData.country,
			},
			currency,
			domainUrl,
			userId,
		})

		console.log('[CHECKOUT] Stripe session created:', {
			sessionId: session.id,
			url: session.url,
			status: session.status,
		})

		// Redirect to Stripe Checkout (external URL)
		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})
		console.log('[CHECKOUT] Redirecting to Stripe:', session.url)
		console.log('[CHECKOUT] Session URL type:', typeof session.url)
		console.log('[CHECKOUT] Session URL length:', session.url?.length)
		// Return redirect URL in response for client-side redirect (external URLs don't work with redirectDocument from form actions)
		return data({ redirectUrl: session.url }, { status: 200 })
	} catch (error) {
		console.error('[CHECKOUT] Error caught in try-catch block:', {
			error,
			errorType: error instanceof Error ? error.constructor.name : typeof error,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		})
		const stripeError = handleStripeError(error)
		console.error('[CHECKOUT] Stripe checkout session creation failed:', {
			error: stripeError,
			originalError: error,
			stack: error instanceof Error ? error.stack : undefined,
		})

		return data(
			{
				result: submission.reply({
					formErrors: [
						`Payment processing failed: ${stripeError.message}. Please try again.`,
					],
				}),
			},
			{ status: 500 },
		)
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout | Shop | Epic Shop' },
]

export default function Checkout({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const { cart, currency, subtotal, userEmail } = loaderData || {}

	const [form, fields] = useForm({
		id: 'checkout-form',
		constraint: getZodConstraint(ShippingFormSchema),
		lastResult: actionData && 'result' in actionData ? actionData.result : undefined,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ShippingFormSchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			email: userEmail || '',
			country: 'US',
		},
	})

	// Handle external redirect to Stripe Checkout
	useEffect(() => {
		console.log('[CHECKOUT] useEffect triggered, actionData:', actionData)
		if (actionData && 'redirectUrl' in actionData && actionData.redirectUrl) {
			console.log('[CHECKOUT] Client-side redirect to Stripe:', actionData.redirectUrl)
			window.location.href = actionData.redirectUrl
		}
	}, [actionData])

	return (
		<div className="container py-8">
			<h1 className="text-3xl font-bold tracking-tight mb-6">Checkout</h1>

			<div className="grid gap-8 lg:grid-cols-2">
				{/* Checkout Form */}
				<div>
					<h2 className="text-xl font-semibold mb-4">Shipping Information</h2>
					<Form method="POST" className="space-y-4" {...getFormProps(form)} noValidate>
						<Field
							labelProps={{
								htmlFor: fields.name.id,
								children: 'Name',
							}}
							inputProps={{
								...getInputProps(fields.name, { type: 'text' }),
								autoComplete: 'name',
								autoFocus: true,
							}}
							errors={fields.name.errors}
						/>

						<Field
							labelProps={{
								htmlFor: fields.email.id,
								children: 'Email',
							}}
							inputProps={{
								...getInputProps(fields.email, { type: 'email' }),
								autoComplete: 'email',
							}}
							errors={fields.email.errors}
						/>

						<Field
							labelProps={{
								htmlFor: fields.street.id,
								children: 'Street Address',
							}}
							inputProps={{
								...getInputProps(fields.street, { type: 'text' }),
								autoComplete: 'street-address',
							}}
							errors={fields.street.errors}
						/>

						<Field
							labelProps={{
								htmlFor: fields.city.id,
								children: 'City',
							}}
							inputProps={{
								...getInputProps(fields.city, { type: 'text' }),
								autoComplete: 'address-level2',
							}}
							errors={fields.city.errors}
						/>

						<Field
							labelProps={{
								htmlFor: fields.state.id,
								children: 'State / Province',
							}}
							inputProps={{
								...getInputProps(fields.state, { type: 'text' }),
								autoComplete: 'address-level1',
							}}
							errors={fields.state.errors}
						/>

						<div className="grid grid-cols-2 gap-4">
							<Field
								labelProps={{
									htmlFor: fields.postal.id,
									children: 'Postal Code',
								}}
								inputProps={{
									...getInputProps(fields.postal, { type: 'text' }),
									autoComplete: 'postal-code',
								}}
								errors={fields.postal.errors}
							/>

							<Field
								labelProps={{
									htmlFor: fields.country.id,
									children: 'Country',
								}}
								inputProps={{
									...getInputProps(fields.country, { type: 'text' }),
									autoComplete: 'country',
									placeholder: 'US (2-letter code)',
								}}
								errors={fields.country.errors}
							/>
						</div>

						<ErrorList errors={form.errors} id={form.errorId} />

						<StatusButton
							className="w-full"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							type="submit"
							disabled={isPending}
						>
							Proceed to Checkout
						</StatusButton>
					</Form>
				</div>

				{/* Order Summary */}
				<div>
					<h2 className="text-xl font-semibold mb-4">Order Summary</h2>
					<div className="border rounded-lg p-6 space-y-4">
						<div className="space-y-3">
							{cart.items.map((item: (typeof cart.items)[0]) => {
								const price = item.variant?.price ?? item.product.price
								const itemTotal = (price ?? 0) * item.quantity
								return (
									<div key={item.id} className="flex justify-between">
										<div className="flex-1">
											<p className="font-medium">{item.product.name}</p>
											{item.variant && (
												<p className="text-sm text-muted-foreground">
													SKU: {item.variant.sku}
												</p>
											)}
											<p className="text-sm text-muted-foreground">
												Qty: {item.quantity}
											</p>
										</div>
										<p className="font-medium">
											{formatPrice(itemTotal, currency)}
										</p>
									</div>
								)
							})}
						</div>

						<div className="border-t pt-4 space-y-2">
							<div className="flex justify-between">
								<span>Subtotal</span>
								<span className="font-semibold">
									{formatPrice(subtotal, currency)}
								</span>
							</div>
							<div className="flex justify-between text-lg font-bold">
								<span>Total</span>
								<span>{formatPrice(subtotal, currency)}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

