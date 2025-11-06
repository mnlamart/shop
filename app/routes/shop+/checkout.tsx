import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { useEffect, useState } from 'react'
import { data, Form, Outlet, redirect, redirectDocument, useFetcher, useLocation } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { MondialRelayPickupSelector } from '#app/components/shipping/mondial-relay-pickup-selector.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
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
import {
	getShippingMethodsForCountry,
	getShippingCost,
} from '#app/utils/shipping.server.ts'
import { createCheckoutSession, handleStripeError } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/checkout.ts'

const ShippingFormSchema = z.object({
	addressId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string().optional(),
	), // For selecting saved address
	saveAddress: z.preprocess(
		(val) => {
			// Checkbox sends 'on' when checked, undefined when unchecked
			// Match the pattern from notifications.tsx
			return val === 'on' || val === true
		},
		z.boolean().default(false),
	), // Default to false when checkbox is unchecked (field missing from FormData)
	label: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string()
			.max(50, { error: 'Label must be less than 50 characters' })
			.trim()
			.optional(),
	), // Optional label/name for saved address
	name: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Name is required' : 'Not a string',
			})
			.min(1, { error: 'Name is required' })
			.max(100, { error: 'Name must be less than 100 characters' })
			.trim(),
	),
	email: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Email is required' : 'Not a string',
			})
			.trim()
			.toLowerCase()
			.min(1, { error: 'Email is required' })
			.pipe(z.email({ error: 'Invalid email address' })),
	),
	street: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Street address is required'
						: 'Not a string',
			})
			.min(1, { error: 'Street address is required' })
			.max(200, { error: 'Street address must be less than 200 characters' })
			.trim(),
	),
	city: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'City is required' : 'Not a string',
			})
			.min(1, { error: 'City is required' })
			.max(100, { error: 'City must be less than 100 characters' })
			.trim(),
	),
	state: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string()
			.max(100, { error: 'State must be less than 100 characters' })
			.trim()
			.optional(),
	),
	postal: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined
						? 'Postal code is required'
						: 'Not a string',
			})
			.min(1, { error: 'Postal code is required' })
			.max(20, { error: 'Postal code must be less than 20 characters' })
			.trim(),
	),
	country: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string({
				error: (issue) =>
					issue.input === undefined ? 'Country is required' : 'Not a string',
			})
			.trim()
			.toUpperCase()
			.refine((val) => val.length === 2, {
				error: 'Country must be a 2-letter ISO code (e.g., US, GB)',
			}),
	),
	shippingMethodId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string({
			error: (issue) =>
				issue.input === undefined ? 'Shipping method is required' : 'Not a string',
		}).min(1, { error: 'Shipping method is required' }),
	),
	mondialRelayPickupPointId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string().optional(),
	), // Optional - only for Mondial Relay
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

	// Get user email and saved addresses if authenticated
	let userEmail: string | undefined = undefined
	let savedAddresses: Array<{
		id: string
		name: string
		street: string
		city: string
		state: string | null
		postal: string
		country: string
		label: string | null
		isDefaultShipping: boolean
	}> = []
	let defaultShippingAddress: (typeof savedAddresses)[number] | null = null

	const userId = await getUserId(request)
	if (userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		})
		userEmail = user?.email || undefined

		// Load saved addresses
		const addresses = await prisma.address.findMany({
			where: { userId },
			orderBy: [
				{ isDefaultShipping: 'desc' },
				{ createdAt: 'desc' },
			],
		})
		savedAddresses = addresses.map((addr) => ({
			id: addr.id,
			name: addr.name,
			street: addr.street,
			city: addr.city,
			state: addr.state,
			postal: addr.postal,
			country: addr.country,
			label: addr.label,
			isDefaultShipping: addr.isDefaultShipping,
		}))
		defaultShippingAddress = savedAddresses.find((a) => a.isDefaultShipping) || null
	}

	// Get available shipping methods for default country (or US as fallback)
	const defaultCountry = defaultShippingAddress?.country || 'US'
	const shippingMethods = await getShippingMethodsForCountry(defaultCountry)

	return {
		cart: cartWithItems,
		currency,
		subtotal,
		userEmail,
		savedAddresses,
		defaultShippingAddress,
		shippingMethods,
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
	const userId = await getUserId(request)

	// If addressId is provided, load the saved address
	let finalShippingData = shippingData
	if (shippingData.addressId && userId) {
		const savedAddress = await prisma.address.findUnique({
			where: {
				id: shippingData.addressId,
				userId, // Ensure user owns this address
			},
		})

		if (savedAddress) {
			// Use saved address data
			finalShippingData = {
				...shippingData,
				name: savedAddress.name,
				street: savedAddress.street,
				city: savedAddress.city,
				state: savedAddress.state || undefined,
				postal: savedAddress.postal,
				country: savedAddress.country,
			}
		}
	}

	// If saveAddress is checked and no addressId (new address), save it
	// The preprocess converts empty string to undefined, so we check for falsy values
	// Also handle the edge case where 'new' might be submitted from the Select component
	const isNewAddress = !shippingData.addressId || shippingData.addressId === '' || shippingData.addressId === 'new'
	
	if (shippingData.saveAddress === true && isNewAddress && userId) {
		// Check if this address already exists (to avoid duplicates)
		const existingAddress = await prisma.address.findFirst({
			where: {
				userId,
				name: shippingData.name,
				street: shippingData.street,
				city: shippingData.city,
				postal: shippingData.postal,
				country: shippingData.country,
			},
		})

		if (!existingAddress) {
			await prisma.address.create({
				data: {
					userId,
					name: shippingData.name,
					street: shippingData.street,
					city: shippingData.city,
					state: shippingData.state || null,
					postal: shippingData.postal,
					country: shippingData.country,
					label: shippingData.label || null,
					type: 'SHIPPING',
					isDefaultShipping: false, // Don't auto-set as default
					isDefaultBilling: false,
				},
			})
		}
	}

	// Get cart
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Validate stock availability before creating checkout session
	try {
		await validateStockAvailability(cart.id)
	} catch (error) {
		// Stock validation errors are user-facing, not logged to Sentry
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
		// Log unexpected errors
		Sentry.captureException(error, {
			tags: { context: 'checkout-stock-validation' },
		})
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

	// Calculate subtotal
	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	// Calculate shipping cost
	const shippingCost = await getShippingCost(shippingData.shippingMethodId, subtotal)

	// Get shipping method details for metadata
	const shippingMethod = await prisma.shippingMethod.findUnique({
		where: { id: shippingData.shippingMethodId },
		include: {
			carrier: {
				select: {
					name: true,
					displayName: true,
				},
			},
		},
	})

	invariantResponse(shippingMethod, 'Shipping method not found', { status: 400 })

	// Create Stripe Checkout Session
	try {
		const domainUrl = getDomainUrl(request)
		const session = await createCheckoutSession({
			cart: cartWithItems,
			shippingInfo: {
				name: finalShippingData.name,
				email: finalShippingData.email,
				street: finalShippingData.street,
				city: finalShippingData.city,
				state: finalShippingData.state,
				postal: finalShippingData.postal,
				country: finalShippingData.country,
			},
			shippingMethodId: shippingData.shippingMethodId,
			shippingCost,
			mondialRelayPickupPointId: shippingData.mondialRelayPickupPointId,
			currency,
			domainUrl,
			userId: userId || undefined,
		})

		// Redirect to Stripe Checkout (external URL)
		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})
		// Return redirect URL in response for client-side redirect (external URLs don't work with redirectDocument from form actions)
		return data({ redirectUrl: session.url }, { status: 200 })
	} catch (error) {
		// Log Stripe errors to Sentry for monitoring
		Sentry.captureException(error, {
			tags: { context: 'checkout-session-creation' },
		})
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
	const {
		cart,
		currency,
		subtotal,
		userEmail,
		savedAddresses = [],
		defaultShippingAddress,
		shippingMethods: initialShippingMethods = [],
	} = loaderData || {}
	
	const [selectedAddressId, setSelectedAddressId] = useState<string>(
		defaultShippingAddress?.id || '',
	)
	const [useNewAddress, setUseNewAddress] = useState(!defaultShippingAddress)
	const [saveAddressChecked, setSaveAddressChecked] = useState(false)
	const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string>('')
	const [currentCountry, setCurrentCountry] = useState<string>(
		defaultShippingAddress?.country || 'US',
	)
	const [shippingMethods, setShippingMethods] = useState(initialShippingMethods)
	const [shippingCost, setShippingCost] = useState<number>(0)
	const [selectedPickupPointId, setSelectedPickupPointId] = useState<string>('')

	// Fetcher for loading shipping methods when country changes
	const shippingMethodsFetcher = useFetcher<{
		shippingMethods: typeof initialShippingMethods
	}>()

	const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId)

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
			addressId: defaultShippingAddress?.id || '',
			email: userEmail || '',
			name: defaultShippingAddress?.name || '',
			street: defaultShippingAddress?.street || '',
			city: defaultShippingAddress?.city || '',
			state: defaultShippingAddress?.state || '',
			postal: defaultShippingAddress?.postal || '',
			country: defaultShippingAddress?.country || 'US',
			label: '',
			saveAddress: undefined,
		},
	})

	// Update form fields when address is selected
	// Note: TypeScript errors below are expected - Conform's type inference doesn't handle z.preprocess
	// correctly (fields.initialValue is inferred as 'unknown'). Safe at runtime.
	// @ts-expect-error - Conform type inference limitation with z.preprocess
	const nameInput = useInputControl(fields.name)
	// @ts-expect-error
	const streetInput = useInputControl(fields.street)
	// @ts-expect-error
	const cityInput = useInputControl(fields.city)
	// @ts-expect-error
	const stateInput = useInputControl(fields.state)
	// @ts-expect-error
	const postalInput = useInputControl(fields.postal)
	// @ts-expect-error
	const countryInput = useInputControl(fields.country)
	// @ts-expect-error
	const addressIdInput = useInputControl(fields.addressId)
	// @ts-expect-error
	const saveAddressInput = useInputControl(fields.saveAddress)
	
	// Track if save address checkbox is checked for conditional label field display
	// Check both the controlled state and the form field value
	const isSaveAddressChecked = saveAddressChecked || saveAddressInput.value === 'on'
	
	useEffect(() => {
		if (selectedAddress && !useNewAddress) {
			nameInput.change(selectedAddress.name)
			streetInput.change(selectedAddress.street)
			cityInput.change(selectedAddress.city)
			stateInput.change(selectedAddress.state || '')
			postalInput.change(selectedAddress.postal)
			countryInput.change(selectedAddress.country)
			addressIdInput.change(selectedAddress.id)
			setCurrentCountry(selectedAddress.country)
		} else if (useNewAddress) {
			// IMPORTANT: Clear addressId when using new address to ensure it's empty
			addressIdInput.change('')
		}
	}, [selectedAddress, useNewAddress, nameInput, streetInput, cityInput, stateInput, postalInput, countryInput, addressIdInput])

	// Update country when form field changes
	useEffect(() => {
		const country = countryInput.value as string
		if (country && country.length === 2) {
			setCurrentCountry(country.toUpperCase())
		}
	}, [countryInput.value])

	// Fetch shipping methods when country changes
	useEffect(() => {
		if (currentCountry && currentCountry.length === 2) {
			void shippingMethodsFetcher.load(`/shop/checkout/shipping-methods?country=${currentCountry}`)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentCountry])

	// Update shipping methods when fetcher data arrives
	useEffect(() => {
		if (shippingMethodsFetcher.data?.shippingMethods) {
			setShippingMethods(shippingMethodsFetcher.data.shippingMethods)
			// Reset selected method when methods change
			setSelectedShippingMethodId('')
			setShippingCost(0)
			setSelectedPickupPointId('') // Reset pickup point when methods change
		}
	}, [shippingMethodsFetcher.data])

	// Reset pickup point when shipping method changes
	useEffect(() => {
		setSelectedPickupPointId('')
	}, [selectedShippingMethodId])

	// Calculate shipping cost when method or subtotal changes
	useEffect(() => {
		if (selectedShippingMethodId && shippingMethods.length > 0) {
			const method = shippingMethods.find((m) => m.id === selectedShippingMethodId)
			if (method) {
				let cost = 0
				switch (method.rateType) {
					case 'FLAT':
						cost = method.flatRate ?? 0
						break
					case 'FREE':
						if (
							method.freeShippingThreshold &&
							subtotal >= method.freeShippingThreshold
						) {
							cost = 0
						} else {
							cost = method.flatRate ?? 0
						}
						break
					case 'PRICE_BASED': {
						if (method.priceRates && Array.isArray(method.priceRates)) {
							const priceRates = method.priceRates as Array<{
								minPrice: number
								maxPrice: number
								rate: number
							}>
							const matchingRate = priceRates.find(
								(rate) => subtotal >= rate.minPrice && subtotal <= rate.maxPrice,
							)
							cost = matchingRate?.rate ?? 0
						}
						break
					}
					default:
						cost = 0
				}
				setShippingCost(cost)
			}
		} else {
			setShippingCost(0)
		}
	}, [selectedShippingMethodId, shippingMethods, subtotal])

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
						
						{savedAddresses.length > 0 && (
							<div className="mb-6 space-y-3">
								<label htmlFor="address-select" className="text-sm font-medium">
									Use Saved Address
								</label>
								<Select
									value={useNewAddress ? 'new' : selectedAddressId}
									onValueChange={(value) => {
										if (value === 'new') {
											setUseNewAddress(true)
											setSelectedAddressId('')
											// Clear form fields when switching to new address
											// IMPORTANT: Clear addressId FIRST to ensure it's empty
											addressIdInput.change('')
											nameInput.change('')
											streetInput.change('')
											cityInput.change('')
											stateInput.change('')
											postalInput.change('')
											countryInput.change('US')
											// Also clear saveAddress checkbox
											saveAddressInput.change(undefined)
											setSaveAddressChecked(false)
										} else {
											setUseNewAddress(false)
											setSelectedAddressId(value)
										}
									}}
								>
									<SelectTrigger id="address-select">
										<SelectValue placeholder="Select an address" />
									</SelectTrigger>
									<SelectContent>
										{savedAddresses.map((address) => (
											<SelectItem key={address.id} value={address.id}>
												{address.label || address.name}
												{address.isDefaultShipping && ' (Default)'}
											</SelectItem>
										))}
										<SelectItem value="new">Use New Address</SelectItem>
									</SelectContent>
								</Select>
								
								{selectedAddress && !useNewAddress && (
									<div className="p-4 border rounded-lg bg-muted/50">
										<p className="font-medium">{selectedAddress.name}</p>
										<p className="text-sm text-muted-foreground">
											{selectedAddress.street}
										</p>
										<p className="text-sm text-muted-foreground">
											{selectedAddress.city}
											{selectedAddress.state && `, ${selectedAddress.state}`}{' '}
											{selectedAddress.postal}
										</p>
										<p className="text-sm text-muted-foreground">
											{selectedAddress.country}
										</p>
									</div>
								)}
							</div>
						)}

						<Form method="POST" className="space-y-4" {...getFormProps(form)} noValidate>
							{/* Hidden field for addressId - ensure it's cleared when using new address */}
							<input
								type="hidden"
								name={fields.addressId.name}
								value={useNewAddress ? '' : (selectedAddressId || '')}
							/>

							{/* Show form fields only if using new address or no saved addresses */}
							{(useNewAddress || savedAddresses.length === 0) && (
								<>
									<Field
										labelProps={{
											htmlFor: fields.name.id,
											children: 'Name',
										}}
										inputProps={{
											...getInputProps(fields.name, { type: 'text' }),
											autoComplete: 'name',
											autoFocus: savedAddresses.length === 0,
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

									{/* Save address checkbox - only show for authenticated users entering new address */}
									{userEmail && ((savedAddresses.length > 0 && useNewAddress) || savedAddresses.length === 0) && (
										<>
											<div className="flex items-center space-x-2">
												<input
													{...getInputProps(fields.saveAddress, { type: 'checkbox' })}
													className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
													onChange={(e) => {
														setSaveAddressChecked(e.target.checked)
													}}
												/>
												<label
													htmlFor={fields.saveAddress.id}
													className="text-sm font-medium leading-none cursor-pointer"
												>
													Save this address for future use
												</label>
											</div>
											{/* Address label/name field - only show when saveAddress is checked */}
											{isSaveAddressChecked && (
												<Field
													labelProps={{
														htmlFor: fields.label.id,
														children: 'Address Name (Optional)',
													}}
													inputProps={{
														...getInputProps(fields.label, { type: 'text' }),
														placeholder: 'e.g., Home, Work, Office',
													}}
													errors={fields.label.errors}
												/>
											)}
										</>
									)}
								</>
							)}

							{/* If using saved address, still need email field */}
							{!useNewAddress && savedAddresses.length > 0 && (
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
							)}

							{/* Shipping Method Selection */}
							<div className="space-y-4">
								<h3 className="text-lg font-semibold">Shipping Method</h3>
								{shippingMethodsFetcher.state === 'loading' ? (
									<div className="text-sm text-muted-foreground">
										Loading shipping options...
									</div>
								) : shippingMethods.length === 0 ? (
									<div className="text-sm text-muted-foreground">
										No shipping methods available for this country.
									</div>
								) : (
									<div className="space-y-3">
										{shippingMethods.map((method) => {
											let methodCost = 0
											if (method.rateType === 'FLAT') {
												methodCost = method.flatRate ?? 0
											} else if (method.rateType === 'FREE') {
												if (
													method.freeShippingThreshold &&
													subtotal >= method.freeShippingThreshold
												) {
													methodCost = 0
												} else {
													methodCost = method.flatRate ?? 0
												}
											} else if (method.rateType === 'PRICE_BASED') {
												if (method.priceRates && Array.isArray(method.priceRates)) {
													const priceRates = method.priceRates as Array<{
														minPrice: number
														maxPrice: number
														rate: number
													}>
													const matchingRate = priceRates.find(
														(rate) =>
															subtotal >= rate.minPrice &&
															subtotal <= rate.maxPrice,
													)
													methodCost = matchingRate?.rate ?? 0
												}
											}

											return (
												<label
													key={method.id}
													className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
														selectedShippingMethodId === method.id
															? 'border-primary bg-primary/5'
															: 'border-gray-200 hover:border-gray-300'
													}`}
												>
													<input
														type="radio"
														name="shippingMethodId"
														value={method.id}
														checked={selectedShippingMethodId === method.id}
														onChange={(e) => {
															setSelectedShippingMethodId(e.target.value)
														}}
														className="mt-1 h-4 w-4 text-primary focus:ring-2 focus:ring-primary/20"
													/>
													<div className="flex-1">
														<div className="flex items-center justify-between">
															<div>
																<div className="font-medium">{method.name}</div>
																{method.carrier && (
																	<div className="text-sm text-muted-foreground">
																		{method.carrier.displayName}
																	</div>
																)}
																{method.description && (
																	<div className="text-sm text-muted-foreground mt-1">
																		{method.description}
																	</div>
																)}
																{method.estimatedDays && (
																	<div className="text-sm text-muted-foreground">
																		Estimated delivery: {method.estimatedDays} business days
																	</div>
																)}
															</div>
															<div className="font-semibold">
																{methodCost === 0
																	? 'Free'
																	: formatPrice(methodCost, currency)}
															</div>
														</div>
													</div>
												</label>
											)
										})}
									</div>
								)}
								{fields.shippingMethodId.errors && (
									<div className="text-sm text-destructive">
										{fields.shippingMethodId.errors}
									</div>
								)}
								{/* Hidden input for form submission */}
								<input
									{...getInputProps(fields.shippingMethodId, { type: 'hidden' })}
									value={selectedShippingMethodId}
								/>
							</div>

							{/* Mondial Relay Pickup Point Selector */}
							{selectedShippingMethodId && (() => {
								const selectedMethod = shippingMethods.find((m) => m.id === selectedShippingMethodId)
								const isMondialRelay = selectedMethod?.carrier?.apiProvider === 'mondial_relay'
								
								if (!isMondialRelay) return null

								const postalCode = useNewAddress || savedAddresses.length === 0
									? (Array.isArray(postalInput.value) ? postalInput.value[0] : postalInput.value) || ''
									: selectedAddress?.postal || ''
								const country = useNewAddress || savedAddresses.length === 0
									? (Array.isArray(countryInput.value) ? countryInput.value[0] : countryInput.value) || 'US'
									: selectedAddress?.country || 'US'
								const city = useNewAddress || savedAddresses.length === 0
									? (Array.isArray(cityInput.value) ? cityInput.value[0] : cityInput.value) || ''
									: selectedAddress?.city || ''

								return (
									<div className="space-y-4 mt-6">
										<h3 className="text-lg font-semibold">Pickup Point Selection</h3>
										<p className="text-sm text-muted-foreground">
											Select a Mondial Relay pickup point for your delivery.
										</p>
										<MondialRelayPickupSelector
											postalCode={postalCode}
											country={country}
											city={city}
											selectedPickupPointId={selectedPickupPointId}
											onPickupPointSelect={(pickupPoint) => {
												setSelectedPickupPointId(pickupPoint?.id || '')
											}}
											errors={fields.mondialRelayPickupPointId?.errors}
										/>
										{/* Hidden input for pickup point ID */}
										<input
											{...getInputProps(fields.mondialRelayPickupPointId, { type: 'hidden' })}
											value={selectedPickupPointId}
										/>
									</div>
								)
							})()}

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
							<div className="flex justify-between">
								<span>Shipping</span>
								<span className="font-semibold">
									{selectedShippingMethodId ? (
										shippingCost === 0 ? (
											<span className="text-green-600">Free</span>
										) : (
											formatPrice(shippingCost, currency)
										)
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</span>
							</div>
							<div className="flex justify-between text-lg font-bold border-t pt-2">
								<span>Total</span>
								<span>
									{selectedShippingMethodId
										? formatPrice(subtotal + shippingCost, currency)
										: formatPrice(subtotal, currency)}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
			</div>
		</>
	)
}
