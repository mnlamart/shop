import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useEffect, useState } from 'react'
import { data, Form, Link, redirect, redirectDocument, useActionData, useFetcher, useLoaderData } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { MondialRelayPickupSelector } from '#app/components/shipping/mondial-relay-pickup-selector.tsx'
import { Button } from '#app/components/ui/button.tsx'
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
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import {
	getShippingCost,
} from '#app/utils/shipping.server.ts'
import { type Route } from './+types/shipping.ts'

const ShippingFormSchema = z.object({
	addressId: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z.string().optional(),
	),
	saveAddress: z.preprocess(
		(val) => {
			return val === 'on' || val === true
		},
		z.boolean().default(false),
	),
	label: z.preprocess(
		(val) => (Array.isArray(val) ? val[0] : val === '' ? undefined : val),
		z
			.string()
			.max(50, { error: 'Label must be less than 50 characters' })
			.trim()
			.optional(),
	),
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
	),
})

export async function loader({ request }: Route.LoaderArgs) {
	const checkoutData = await getCheckoutData(request)
	
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	return checkoutData
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
				userId,
			},
		})

		if (savedAddress) {
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
	const isNewAddress = !shippingData.addressId || shippingData.addressId === '' || shippingData.addressId === 'new'
	
	if (shippingData.saveAddress === true && isNewAddress && userId) {
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
					isDefaultShipping: false,
					isDefaultBilling: false,
				},
			})
		}
	}

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
		shippingData.shippingMethodId,
		subtotal,
		totalWeightGrams,
	)

	// Store shipping data in session for payment step
	// For now, we'll pass data via URL params or use a session store
	// In a production app, you'd use a proper session store or database
	
	// Redirect to payment step with shipping data
	return redirect(
		`/shop/checkout/payment?` +
		`name=${encodeURIComponent(finalShippingData.name)}&` +
		`email=${encodeURIComponent(finalShippingData.email)}&` +
		`street=${encodeURIComponent(finalShippingData.street)}&` +
		`city=${encodeURIComponent(finalShippingData.city)}&` +
		`state=${encodeURIComponent(finalShippingData.state || '')}&` +
		`postal=${encodeURIComponent(finalShippingData.postal)}&` +
		`country=${encodeURIComponent(finalShippingData.country)}&` +
		`shippingMethodId=${encodeURIComponent(shippingData.shippingMethodId)}&` +
		`shippingCost=${shippingCost}&` +
		`mondialRelayPickupPointId=${encodeURIComponent(shippingData.mondialRelayPickupPointId || '')}`
	)
}

export default function CheckoutShipping() {
	const loaderData = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	
	const {
		cart,
		currency,
		subtotal,
		userEmail,
		savedAddresses,
		defaultShippingAddress,
		shippingMethods: initialShippingMethods,
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

	const shippingMethodsFetcher = useFetcher<{
		shippingMethods: typeof initialShippingMethods
	}>()

	const selectedAddress = savedAddresses.find((a) => a.id === selectedAddressId)

	const [form, fields] = useForm({
		id: 'shipping-form',
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

	const nameInput = useInputControl(fields.name as any)
	const streetInput = useInputControl(fields.street as any)
	const cityInput = useInputControl(fields.city as any)
	const stateInput = useInputControl(fields.state as any)
	const postalInput = useInputControl(fields.postal as any)
	const countryInput = useInputControl(fields.country as any)
	const addressIdInput = useInputControl(fields.addressId as any)
	const saveAddressInput = useInputControl(fields.saveAddress as any)
	
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
			addressIdInput.change('')
			const country = Array.isArray(countryInput.value) 
				? countryInput.value[0] 
				: countryInput.value
			const countryStr = typeof country === 'string' && country.length === 2
				? country.toUpperCase()
				: 'US'
			setCurrentCountry(countryStr)
		}
	}, [selectedAddress, useNewAddress, nameInput, streetInput, cityInput, stateInput, postalInput, countryInput, addressIdInput])

	useEffect(() => {
		const country = Array.isArray(countryInput.value) 
			? countryInput.value[0] 
			: countryInput.value
		const countryStr = typeof country === 'string' ? country : ''
		if (countryStr && countryStr.length === 2) {
			setCurrentCountry(countryStr.toUpperCase())
		} else if (useNewAddress && !countryStr) {
			setCurrentCountry('US')
		}
	}, [countryInput.value, useNewAddress])

	useEffect(() => {
		if (currentCountry && currentCountry.length === 2) {
			void shippingMethodsFetcher.load(`/shop/checkout/shipping-methods?country=${currentCountry}`)
		}
	}, [currentCountry, shippingMethodsFetcher])

	useEffect(() => {
		if (shippingMethodsFetcher.data?.shippingMethods) {
			setShippingMethods(shippingMethodsFetcher.data.shippingMethods)
			setSelectedShippingMethodId('')
			setShippingCost(0)
			setSelectedPickupPointId('')
		}
	}, [shippingMethodsFetcher.data])

	useEffect(() => {
		setSelectedPickupPointId('')
	}, [selectedShippingMethodId])

	useEffect(() => {
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
			}
		} else {
			setShippingCost(0)
		}
	}, [selectedShippingMethodId, shippingMethods, subtotal])

	if (!cart || !currency) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		)
	}

	return (
		<div className="grid gap-8 lg:grid-cols-2">
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
									addressIdInput.change('')
									nameInput.change('')
									streetInput.change('')
									cityInput.change('')
									stateInput.change('')
									postalInput.change('')
									countryInput.change('US')
									setCurrentCountry('US')
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
					<input
						type="hidden"
						name={fields.addressId.name}
						value={useNewAddress ? '' : (selectedAddressId || '')}
					/>

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
						<input
							{...getInputProps(fields.shippingMethodId, { type: 'hidden' })}
							value={selectedShippingMethodId}
						/>
					</div>

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
								<input
									{...getInputProps(fields.mondialRelayPickupPointId, { type: 'hidden' })}
									value={selectedPickupPointId}
								/>
							</div>
						)
					})()}

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex justify-between pt-4">
						<Button variant="outline" asChild>
							<Link to="/shop/checkout/review">Back</Link>
						</Button>
						<StatusButton
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							type="submit"
							disabled={isPending}
						>
							Continue to Payment
						</StatusButton>
					</div>
				</Form>
			</div>

			<div>
				<h2 className="text-xl font-semibold mb-4">Order Summary</h2>
				<div className="border rounded-lg p-6 space-y-4">
					<div className="space-y-3">
						{cart.items.map((item) => {
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
	)
}

