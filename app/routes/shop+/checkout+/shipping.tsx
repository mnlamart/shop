import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useEffect, useState } from 'react'
import { data, Form, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
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
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { formatPrice } from '#app/utils/price.ts'
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

	// Redirect to delivery step with address information only
	return redirect(
		`/shop/checkout/delivery?` +
		`name=${encodeURIComponent(finalShippingData.name)}&` +
		`email=${encodeURIComponent(finalShippingData.email)}&` +
		`street=${encodeURIComponent(finalShippingData.street)}&` +
		`city=${encodeURIComponent(finalShippingData.city)}&` +
		`state=${encodeURIComponent(finalShippingData.state || '')}&` +
		`postal=${encodeURIComponent(finalShippingData.postal)}&` +
		`country=${encodeURIComponent(finalShippingData.country)}`
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
	} = loaderData || {}
	
	const [selectedAddressId, setSelectedAddressId] = useState<string>(
		defaultShippingAddress?.id || '',
	)
	const [useNewAddress, setUseNewAddress] = useState(!defaultShippingAddress)
	const [saveAddressChecked, setSaveAddressChecked] = useState(false)

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
		} else if (useNewAddress) {
			addressIdInput.change('')
		}
	}, [selectedAddress, useNewAddress, nameInput, streetInput, cityInput, stateInput, postalInput, countryInput, addressIdInput])

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
							Continue to Delivery
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

					<div className="border-t pt-4">
						<div className="flex justify-between text-lg font-semibold">
							<span>Subtotal</span>
							<span>{formatPrice(subtotal, currency)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

