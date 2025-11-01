import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { data, Form, redirect } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getUserId, requireUserId } from '#app/utils/auth.server.ts'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx'
import { validateStockAvailability } from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { handleStripeError, stripe } from '#app/utils/stripe.server.ts'
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
	try {
		const userId = await requireUserId(request)
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		})
		userEmail = user?.email || undefined
	} catch {
		// User not authenticated - that's fine for guest checkout
		userEmail = undefined
	}

	return {
		cart: cartWithItems,
		currency,
		subtotal,
		userEmail,
	}
}

export async function action({ request }: Route.ActionArgs) {
	console.log('Checkout action called')
	const formData = await request.formData()
	console.log('Form data received:', Object.fromEntries(formData.entries()))
	const submission = parseWithZod(formData, {
		schema: ShippingFormSchema,
	})
	console.log('Submission status:', submission.status)

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const shippingData = submission.value

	// Get cart and user
	console.log('Getting cart...')
	const { cart } = await getOrCreateCartFromRequest(request)
	console.log('Cart found:', cart?.id, 'Items:', cart?.items.length)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Get currency
	const currency = await getStoreCurrency()
	if (!currency || !currency.code || typeof currency.code !== 'string') {
		console.error('Currency configuration error:', {
			currency,
			hasCode: !!currency?.code,
			codeType: typeof currency?.code,
		})
		invariantResponse(false, 'Currency is not properly configured', { status: 500 })
	}

	// Get user ID (optional - for guest checkout)
	const userId = await getUserId(request)

	// Validate stock availability BEFORE creating checkout session
	console.log('Validating stock...')
	await validateStockAvailability(cart.id)
	console.log('Stock validated')

	// Load cart with products and variants for checkout session
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	// Create Stripe Checkout Session
	let session
	let startTime: number | undefined
	try {
		// Validate prices before creating checkout session
		const lineItems = cartWithItems.items.map((item, index) => {
				const unitAmount =
					item.variantId && item.variant
						? item.variant.price ?? item.product.price
						: item.product.price

				console.log(`[CHECKOUT ACTION] Line item ${index}:`, {
					productName: item.product.name,
					variantId: item.variantId,
					variantPrice: item.variant?.price,
					productPrice: item.product.price,
					finalUnitAmount: unitAmount,
					quantity: item.quantity,
				})

				invariantResponse(
					unitAmount !== null && unitAmount !== undefined && unitAmount > 0,
					`Invalid price for product ${item.product.name}`,
					{ status: 400 },
				)

				const lineItem = {
					price_data: {
						currency: currency.code.toLowerCase(),
						product_data: {
							name: item.product.name,
							description: item.product.description || undefined,
						},
						unit_amount: unitAmount,
					},
					quantity: item.quantity,
				}
				console.log(`[CHECKOUT ACTION] Built line item ${index}:`, JSON.stringify(lineItem, null, 2))
				return lineItem
			})
			console.log('[CHECKOUT ACTION] All line items prepared, count:', lineItems.length)

		invariantResponse(
			lineItems.length > 0,
			'Cart must contain at least one item',
			{ status: 400 },
		)

		console.log('[CHECKOUT ACTION] ===== CREATING STRIPE SESSION =====')
		console.log('[CHECKOUT ACTION] Line items count:', lineItems.length)
		console.log('[CHECKOUT ACTION] Currency:', currency.code)
		console.log('[CHECKOUT ACTION] NODE_ENV:', process.env.NODE_ENV)
		console.log('[CHECKOUT ACTION] MOCKS:', process.env.MOCKS)
		console.log('[CHECKOUT ACTION] Stripe key starts with:', process.env.STRIPE_SECRET_KEY?.substring(0, 8))
		console.log('[CHECKOUT ACTION] Stripe key length:', process.env.STRIPE_SECRET_KEY?.length)
		console.log('[CHECKOUT ACTION] Stripe client initialized:', !!stripe)
		console.log('[CHECKOUT ACTION] Success URL:', `${getDomainUrl(request)}/shop/orders?session_id={CHECKOUT_SESSION_ID}`)
		console.log('[CHECKOUT ACTION] Cancel URL:', `${getDomainUrl(request)}/shop/checkout?canceled=true`)
		console.log('[CHECKOUT ACTION] Customer email:', shippingData.email)
		console.log('[CHECKOUT ACTION] Metadata:', {
			cartId: cart.id,
			userId: userId || '',
			shippingName: shippingData.name,
			shippingStreet: shippingData.street,
			shippingCity: shippingData.city,
			shippingState: shippingData.state || '',
			shippingPostal: shippingData.postal,
			shippingCountry: shippingData.country,
		})

		// Create Stripe checkout session with timeout protection
		// Real Stripe API calls typically complete in < 2s
		// If MSW intercepts, it completes in < 1s
		// Timeout after 30s (Stripe's default timeout) to prevent indefinite hanging
		// Note: MSW doesn't reliably intercept Stripe SDK in dev mode, so we use real test keys
		console.log('[CHECKOUT ACTION] About to call stripe.checkout.sessions.create()')
		console.log('[CHECKOUT ACTION] MSW status: If you see [MSW] logs, MSW intercepted. If not, using real Stripe API.')
		startTime = Date.now()
		console.log('[CHECKOUT ACTION] Start time:', startTime)
		const createSessionPromise = stripe.checkout.sessions.create({
			line_items: lineItems,
			mode: 'payment',
			success_url: `${getDomainUrl(request)}/shop/orders?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${getDomainUrl(request)}/shop/checkout?canceled=true`,
			customer_email: shippingData.email,
			metadata: {
				cartId: cart.id,
				userId: userId || '',
				shippingName: shippingData.name,
				shippingStreet: shippingData.street,
				shippingCity: shippingData.city,
				shippingState: shippingData.state || '',
				shippingPostal: shippingData.postal,
				shippingCountry: shippingData.country,
			},
			payment_intent_data: {
				metadata: {
					cartId: cart.id,
				},
			},
		})
		
		// Add timeout protection: Use Stripe's default 30s timeout
		// Real Stripe API should respond in < 2s, so 30s gives plenty of buffer
		// If this times out, it's likely a network/connectivity issue
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new Error(
						'Stripe API request timed out after 30 seconds. ' +
							'This usually indicates a network connectivity issue. ' +
							'Check: 1) Internet connection, 2) Stripe API status, 3) Firewall/proxy settings. ' +
							'If MSW is intercepting, you should see [MSW] logs in the terminal.',
					),
				)
			}, 30000) // 30 second timeout (matching Stripe SDK default)
		})

		console.log('[CHECKOUT ACTION] Promise created, starting race with timeout...')
		session = await Promise.race([createSessionPromise, timeoutPromise])
		const duration = Date.now() - startTime
		console.log('[CHECKOUT ACTION] ✅ Stripe session created successfully!')
		console.log('[CHECKOUT ACTION] Session ID:', session.id)
		console.log('[CHECKOUT ACTION] Session URL:', session.url)
		console.log('[CHECKOUT ACTION] Duration:', duration, 'ms')
	} catch (error) {
		const errorDuration = startTime ? Date.now() - startTime : 'unknown'
		console.error('[CHECKOUT ACTION] ❌ STRIPE SESSION CREATION FAILED ❌')
		console.error('[CHECKOUT ACTION] Duration before error:', errorDuration, 'ms')
		console.error('[CHECKOUT ACTION] Raw error:', error)
		console.error('[CHECKOUT ACTION] Error type:', typeof error)
		console.error('[CHECKOUT ACTION] Error constructor:', error?.constructor?.name)
		
		if (error instanceof Error) {
			console.error('[CHECKOUT ACTION] Error name:', error.name)
			console.error('[CHECKOUT ACTION] Error message:', error.message)
			console.error('[CHECKOUT ACTION] Error stack:', error.stack)
		}
		
		if (typeof error === 'object' && error !== null) {
			console.error('[CHECKOUT ACTION] Error keys:', Object.keys(error))
			try {
				console.error('[CHECKOUT ACTION] Error JSON:', JSON.stringify(error, null, 2))
			} catch (e) {
				console.error('[CHECKOUT ACTION] Could not stringify error:', e)
			}
		}
		
		const stripeError = handleStripeError(error)
		console.error('[CHECKOUT ACTION] Processed Stripe error:', stripeError)
		return data(
			{
				result: submission.reply({
					formErrors: [
						`Payment processing error: ${stripeError.message}. Please try again.`,
					],
				}),
			},
			{ status: 400 },
		)
	}

	console.log('[CHECKOUT ACTION] Validating session URL...')
	console.log('[CHECKOUT ACTION] Session object:', {
		id: session.id,
		url: session.url,
		status: session.status,
		payment_intent: session.payment_intent,
	})
	
	invariantResponse(
		session.url,
		'Failed to create checkout session',
		{ status: 500 },
	)

	// Log the redirect for debugging
	console.log('[CHECKOUT ACTION] ===== REDIRECTING TO STRIPE =====')
	console.log('[CHECKOUT ACTION] Redirect URL:', session.url)

	invariantResponse(
		session.url &&
			typeof session.url === 'string' &&
			(session.url.startsWith('http://') || session.url.startsWith('https://')),
		'Invalid checkout session URL',
		{ status: 500 },
	)

	// For external URLs (Stripe), return a redirect Response with Location header
	// This works better than React Router's redirect() for external URLs
	return new Response(null, {
		status: 302,
		headers: {
			Location: session.url,
		},
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout | Shop | Epic Shop' },
]

export default function Checkout({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const { cart, currency, subtotal, userEmail } = loaderData

	const [form, fields] = useForm({
		id: 'checkout-form',
		constraint: getZodConstraint(ShippingFormSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ShippingFormSchema })
		},
		shouldRevalidate: 'onBlur',
		defaultValue: {
			email: userEmail || '',
			country: 'US',
		},
	})

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

