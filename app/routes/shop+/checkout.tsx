import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect } from 'react'
import { data, Form, Outlet, redirect, redirectDocument, useLocation } from 'react-router'
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
	const url = new URL(request.url)
	const pathname = url.pathname
	
	// Don't run checkout loader logic if we're on the success page
	// React Router runs parent loaders even for child routes, so we need to skip
	if (pathname === '/shop/checkout/success') {
		// Return empty data - the success page will handle everything
		return {
			cart: null,
			currency: null,
			subtotal: 0,
			userEmail: undefined,
			canceled: false,
		}
	}
	
	// Check if this is a redirect from Stripe success page
	// If user has session_id in URL but lands on checkout page, redirect to success page
	const sessionId = url.searchParams.get('session_id')
	if (sessionId) {
		return redirectDocument(`/shop/checkout/success?session_id=${sessionId}`)
	}
	
	const { cart } = await getOrCreateCartFromRequest(request)

	// If cart is empty or doesn't exist, redirect to cart page
	// This handles cases where cart was deleted after successful checkout
	if (!cart || cart.items.length === 0) {
		return redirect('/shop/cart')
	}

	// Check if user canceled Stripe checkout
	const canceled = url.searchParams.get('canceled') === 'true'

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
		canceled,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ShippingFormSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const shippingData = submission.value

	// Get cart
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Validate stock availability before creating checkout session
	try {
		await validateStockAvailability(cart.id)
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

	// Get currency
	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	// Get user ID (optional - guest checkout supported)
	const userId = await getUserId(request)

	// Create Stripe Checkout Session
	try {
		const domainUrl = getDomainUrl(request)
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

		// Redirect to Stripe Checkout (external URL)
		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})
		// Return redirect URL in response for client-side redirect (external URLs don't work with redirectDocument from form actions)
		return data({ redirectUrl: session.url }, { status: 200 })
	} catch (error) {
		console.error('[CHECKOUT] Error creating checkout session:', error)
		const stripeError = handleStripeError(error)

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
	
	// Call hooks unconditionally (React rules)
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
		if (actionData && 'redirectUrl' in actionData && actionData.redirectUrl) {
			// Show loading state before redirect
			window.location.href = actionData.redirectUrl
		}
	}, [actionData])
	
	const location = useLocation()
	const isSuccessPage = location.pathname === '/shop/checkout/success'
	
	// If we're on the success page, render the outlet for the child route
	if (isSuccessPage) {
		return <Outlet />
	}
	
	// If we don't have cart/currency data, show loading or error
	if (!cart || !currency) {
		return (
			<div className="container py-8">
				<div className="text-center">
					<p className="text-muted-foreground">Loading checkout...</p>
				</div>
			</div>
		)
	}

	// Show loading overlay when redirecting
	const isRedirecting = actionData && 'redirectUrl' in actionData && actionData.redirectUrl

	return (
		<>
			{isRedirecting && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
					<div className="text-center">
						<div className="mb-4 inline-block animate-spin">
							<svg
								className="h-8 w-8 text-primary"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								></circle>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						</div>
						<p className="text-lg font-semibold">Redirecting to payment...</p>
					</div>
				</div>
			)}
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
		</>
	)
}
