import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect, useState } from 'react'
import { Form, redirect, redirectDocument, useLoaderData } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { MondialRelayPickupSelector } from '#app/components/shipping/mondial-relay-pickup-selector.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { getShippingCost, getShippingMethodsForCountry } from '#app/utils/shipping.server.ts'
import { type Route } from './+types/delivery.ts'

const DeliveryFormSchema = z.object({
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
	),
})

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	
	// Get address data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')

	// Validate required address fields
	if (!name || !email || !street || !city || !postal || !country) {
		return redirectDocument('/shop/checkout/shipping')
	}

	// Get checkout data for cart summary
	const checkoutData = await getCheckoutData(request)
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	// Get shipping methods for the country
	const shippingMethods = await getShippingMethodsForCountry(country.toUpperCase())

	return {
		cart: checkoutData.cart,
		currency: checkoutData.currency,
		subtotal: checkoutData.subtotal,
		shippingInfo: {
			name,
			email,
			street,
			city,
			state: state || undefined,
			postal,
			country,
		},
		shippingMethods,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const url = new URL(request.url)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: DeliveryFormSchema,
	})

	if (submission.status !== 'success') {
		return redirect(url.pathname + url.search)
	}

	// Get address data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')

	// Validate required address fields
	if (!name || !email || !street || !city || !postal || !country) {
		return redirect('/shop/checkout/shipping')
	}

	const shippingMethodId = submission.value.shippingMethodId
	const mondialRelayPickupPointId = submission.value.mondialRelayPickupPointId || ''

	// Get cart for weight calculation
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })

	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							price: true,
							weightGrams: true,
						},
					},
					variant: {
						select: {
							price: true,
							weightGrams: true,
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

	const DEFAULT_WEIGHT_GRAMS = 500
	const totalWeightGrams = cartWithItems.items.reduce((sum, item) => {
		const itemWeight =
			item.variant?.weightGrams ??
			item.product.weightGrams ??
			DEFAULT_WEIGHT_GRAMS
		return sum + itemWeight * item.quantity
	}, 0)

	const shippingCost = await getShippingCost(
		shippingMethodId,
		subtotal,
		totalWeightGrams,
	)

	// Redirect to payment step with all data
	return redirect(
		`/shop/checkout/payment?` +
		`name=${encodeURIComponent(name)}&` +
		`email=${encodeURIComponent(email)}&` +
		`street=${encodeURIComponent(street)}&` +
		`city=${encodeURIComponent(city)}&` +
		`state=${encodeURIComponent(state || '')}&` +
		`postal=${encodeURIComponent(postal)}&` +
		`country=${encodeURIComponent(country)}&` +
		`shippingMethodId=${encodeURIComponent(shippingMethodId)}&` +
		`shippingCost=${shippingCost}&` +
		`mondialRelayPickupPointId=${encodeURIComponent(mondialRelayPickupPointId)}`
	)
}

export const meta: Route.MetaFunction = () => [{ title: 'Delivery | Checkout' }]

export default function CheckoutDelivery() {
	const loaderData = useLoaderData<typeof loader>()
	const isPending = useIsPending()

	// Initialize hooks before early return
	const [selectedShippingMethodId, setSelectedShippingMethodId] = useState<string>('')
	const [shippingMethods, setShippingMethods] = useState(loaderData?.shippingMethods || [])
	const [shippingCost, setShippingCost] = useState<number>(0)
	const [selectedPickupPointId, setSelectedPickupPointId] = useState<string>('')
	const [mondialRelayCarrierId, setMondialRelayCarrierId] = useState<string | undefined>(undefined)

	const [form, fields] = useForm({
		id: 'delivery-form',
		constraint: getZodConstraint(DeliveryFormSchema),
		lastResult: undefined, // Action only redirects, doesn't return form errors
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: DeliveryFormSchema })
		},
		defaultValue: {
			shippingMethodId: '',
			mondialRelayPickupPointId: '',
		},
	})

	const shippingMethodInput = useInputControl(fields.shippingMethodId as any)
	const pickupPointInput = useInputControl(fields.mondialRelayPickupPointId as any)

	// Update shipping methods when loaderData changes
	useEffect(() => {
		if (loaderData?.shippingMethods) {
			setShippingMethods(loaderData.shippingMethods)
		}
	}, [loaderData?.shippingMethods])

	useEffect(() => {
		if (!loaderData) return
		
		const subtotal = loaderData.subtotal
		if (selectedShippingMethodId && shippingMethods.length > 0) {
			const method = shippingMethods.find((m) => m.id === selectedShippingMethodId)
			if (method) {
				// Calculate shipping cost based on method rate type
				let cost = 0
				if (method.rateType === 'FLAT') {
					cost = method.flatRate ?? 0
				} else if (method.rateType === 'FREE') {
					if (
						method.freeShippingThreshold &&
						subtotal >= method.freeShippingThreshold
					) {
						cost = 0
					} else {
						cost = method.flatRate ?? 0
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
						cost = matchingRate?.rate ?? 0
					}
				}
				setShippingCost(cost)

				// Check if this is a Mondial Relay method
				if (method.carrier?.apiProvider === 'mondial_relay') {
					setMondialRelayCarrierId(method.carrier.id)
				} else {
					setMondialRelayCarrierId(undefined)
					setSelectedPickupPointId('')
				}
			}
		} else {
			setShippingCost(0)
			setMondialRelayCarrierId(undefined)
			setSelectedPickupPointId('')
		}
	}, [selectedShippingMethodId, shippingMethods, loaderData])

	if (!loaderData) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		)
	}

	const {
		currency,
		subtotal,
		shippingInfo,
	} = loaderData

	const total = subtotal + shippingCost

	return (
		<div className="space-y-6">
			<div className="rounded-lg border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Delivery Options</h2>
				<p className="text-muted-foreground mb-6">
					Select your preferred shipping method.
				</p>

				<Form method="POST" className="space-y-6" {...getFormProps(form)}>
					<div className="space-y-4">
						<h3 className="text-lg font-semibold">Shipping Method</h3>
						{shippingMethods.length === 0 ? (
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
													shippingMethodInput.change(e.target.value)
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
						<input
							{...getInputProps(fields.shippingMethodId, { type: 'hidden' })}
							value={selectedShippingMethodId}
						/>
					</div>

					{/* Mondial Relay Pickup Point Selector */}
					{mondialRelayCarrierId && selectedShippingMethodId && (
						<div className="space-y-4 mt-6">
							<h3 className="text-lg font-semibold">Pickup Point Selection</h3>
							<p className="text-sm text-muted-foreground">
								Select a Mondial Relay pickup point for your delivery.
							</p>
							<MondialRelayPickupSelector
								postalCode={shippingInfo.postal}
								country={shippingInfo.country}
								city={shippingInfo.city}
								selectedPickupPointId={selectedPickupPointId}
								onPickupPointSelect={(pickupPoint) => {
									const id = pickupPoint?.id || ''
									setSelectedPickupPointId(id)
									pickupPointInput.change(id)
								}}
								errors={fields.mondialRelayPickupPointId?.errors}
							/>
							<input
								{...getInputProps(fields.mondialRelayPickupPointId, { type: 'hidden' })}
								value={selectedPickupPointId}
							/>
						</div>
					)}

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex justify-between pt-4">
						<Button variant="outline" asChild>
							<a href={`/shop/checkout/shipping?${new URLSearchParams({
								name: shippingInfo.name,
								email: shippingInfo.email,
								street: shippingInfo.street,
								city: shippingInfo.city,
								state: shippingInfo.state || '',
								postal: shippingInfo.postal,
								country: shippingInfo.country,
							}).toString()}`}>
								Back to Shipping
							</a>
						</Button>
						<StatusButton
							type="submit"
							status={isPending ? 'pending' : 'idle'}
							disabled={Boolean(isPending || !selectedShippingMethodId || (mondialRelayCarrierId && !selectedPickupPointId))}
						>
							Continue to Payment
						</StatusButton>
					</div>
				</Form>
			</div>

			<div className="rounded-lg border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Order Summary</h2>
				<div className="space-y-2">
					<div className="flex justify-between">
						<span>Subtotal</span>
						<span>{formatPrice(subtotal, currency)}</span>
					</div>
					<div className="flex justify-between">
						<span>Shipping</span>
						<span>
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
					<div className="flex justify-between text-lg font-semibold border-t pt-2">
						<span>Total</span>
						<span>
							{selectedShippingMethodId
								? formatPrice(total, currency)
								: formatPrice(subtotal, currency)}
						</span>
					</div>
				</div>
			</div>

			<div className="rounded-lg border bg-card p-6">
				<h2 className="mb-4 text-xl font-semibold">Shipping Details</h2>
				<p>
					{shippingInfo.name}
					<br />
					{shippingInfo.street}
					<br />
					{shippingInfo.city}, {shippingInfo.state && `${shippingInfo.state}, `}
					{shippingInfo.postal}
					<br />
					{shippingInfo.country}
				</p>
				<p className="mt-2 text-muted-foreground">{shippingInfo.email}</p>
			</div>
		</div>
	)
}
