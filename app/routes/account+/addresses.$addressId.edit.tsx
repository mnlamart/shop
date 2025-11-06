import { getFormProps, getInputProps, useForm, useInputControl } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, useFetcher } from 'react-router'
import { ErrorList, Field } from '#app/components/forms.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { AddressSchema } from '#app/schemas/address.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useDoubleCheck, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type BreadcrumbHandle } from '../account.tsx'
import { type Route } from './+types/addresses.$addressId.edit.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Edit Address',
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const address = await prisma.address.findUnique({
		where: { id: params.addressId },
	})

	invariantResponse(address, 'Address not found', { status: 404 })
	invariantResponse(address.userId === userId, 'Unauthorized', { status: 403 })

	return { address }
}

export async function action({ params, request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(request)
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const address = await prisma.address.findUnique({
			where: { id: params.addressId },
		})

		invariantResponse(address, 'Address not found', { status: 404 })
		invariantResponse(address.userId === userId, 'Unauthorized', { status: 403 })

		await prisma.address.delete({
			where: { id: params.addressId },
		})

		return redirectWithToast('/account/addresses', {
			type: 'success',
			title: 'Address Deleted',
			description: 'Address has been deleted',
		})
	}

	const submission = await parseWithZod(formData, {
		schema: AddressSchema,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const address = await prisma.address.findUnique({
		where: { id: params.addressId },
	})

	invariantResponse(address, 'Address not found', { status: 404 })
	invariantResponse(address.userId === userId, 'Unauthorized', { status: 403 })

	const {
		name,
		street,
		city,
		state,
		postal,
		country,
		type,
		label,
		isDefaultShipping,
		isDefaultBilling,
	} = submission.value

	// Handle default flags: if setting as default, unset all other defaults of that type
	if (isDefaultShipping) {
		await prisma.address.updateMany({
			where: {
				userId,
				isDefaultShipping: true,
				id: { not: params.addressId }, // Don't unset the current address
			},
			data: {
				isDefaultShipping: false,
			},
		})
	}

	if (isDefaultBilling) {
		await prisma.address.updateMany({
			where: {
				userId,
				isDefaultBilling: true,
				id: { not: params.addressId }, // Don't unset the current address
			},
			data: {
				isDefaultBilling: false,
			},
		})
	}

	await prisma.address.update({
		where: { id: params.addressId },
		data: {
			name,
			street,
			city,
			state: state || null,
			postal,
			country,
			type,
			label: label || null,
			isDefaultShipping,
			isDefaultBilling,
		},
	})

	return redirectWithToast('/account/addresses', {
		type: 'success',
		title: 'Address Updated',
		description: 'Address has been updated successfully',
	})
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Edit Address | Settings | Epic Shop' },
	{ name: 'description', content: 'Edit your address' },
]

export default function EditAddress({ loaderData, actionData }: Route.ComponentProps) {
	const isPending = useIsPending()
	const deleteFetcher = useFetcher()
	const dc = useDoubleCheck()
	const { address } = loaderData

	const [form, fields] = useForm({
		id: 'edit-address-form',
		constraint: getZodConstraint(AddressSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AddressSchema })
		},
		defaultValue: {
			name: address.name,
			street: address.street,
			city: address.city,
			state: address.state || '',
			postal: address.postal,
			country: address.country,
			type: address.type,
			label: address.label || '',
			isDefaultShipping: address.isDefaultShipping ? 'on' : undefined,
			isDefaultBilling: address.isDefaultBilling ? 'on' : undefined,
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Edit Address</h1>
					<p className="text-gray-600">
						Update your address information
					</p>
				</div>
				<Button variant="outline" asChild>
					<Link to="/account/addresses">
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Addresses
					</Link>
				</Button>
			</div>

			<Card className="p-6 hover:shadow-lg transition-shadow border-blue-100 bg-white/80 backdrop-blur-sm">
				<CardHeader className="p-0 pb-6">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
							<Icon name="map-pin" className="w-5 h-5 text-blue-700" />
						</div>
						<CardTitle className="text-lg">Address Details</CardTitle>
					</div>
				</CardHeader>
				<CardContent className="p-0">
					<Form method="POST" {...getFormProps(form)} className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<Field
								labelProps={{
									htmlFor: fields.name.id,
									children: 'Full Name',
								}}
								inputProps={{
									...getInputProps(fields.name, { type: 'text' }),
									autoComplete: 'name',
								}}
								errors={fields.name.errors}
							/>

							<Field
								labelProps={{
									htmlFor: fields.label.id,
									children: 'Label (optional)',
								}}
								inputProps={{
									...getInputProps(fields.label, { type: 'text' }),
									placeholder: 'e.g., Home, Work',
								}}
								errors={fields.label.errors}
							/>
						</div>

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

						<div className="grid gap-6 md:grid-cols-2">
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
						</div>

						<div className="grid gap-6 md:grid-cols-2">
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
									maxLength: 2,
								}}
								errors={fields.country.errors}
							/>
						</div>

						<AddressTypeSelect field={fields.type} />

						<div className="space-y-4">
							<div className="flex items-center space-x-2">
								<input
									{...getInputProps(fields.isDefaultShipping, { type: 'checkbox' })}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								/>
								<label
									htmlFor={fields.isDefaultShipping.id}
									className="text-sm font-medium leading-none cursor-pointer"
								>
									Set as default shipping address
								</label>
							</div>

							<div className="flex items-center space-x-2">
								<input
									{...getInputProps(fields.isDefaultBilling, { type: 'checkbox' })}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								/>
								<label
									htmlFor={fields.isDefaultBilling.id}
									className="text-sm font-medium leading-none cursor-pointer"
								>
									Set as default billing address
								</label>
							</div>
						</div>

						<ErrorList errors={form.errors} id={form.errorId} />

						<div className="flex gap-4 justify-between pt-6 border-t">
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										type="button"
										variant="destructive"
										{...dc.getButtonProps()}
									>
										<Icon name="trash" className="h-4 w-4 mr-2" />
										{dc.doubleCheck ? 'Are you sure?' : 'Delete Address'}
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Delete Address</AlertDialogTitle>
										<AlertDialogDescription>
											Are you sure you want to delete this address? This action
											cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Cancel</AlertDialogCancel>
										<deleteFetcher.Form method="POST">
											<input type="hidden" name="intent" value="delete" />
											<AlertDialogAction
												type="submit"
												disabled={deleteFetcher.state !== 'idle'}
												className="bg-destructive text-destructive-foreground hover:bg-destructive/80"
											>
												{deleteFetcher.state !== 'idle' ? 'Deleting...' : 'Delete'}
											</AlertDialogAction>
										</deleteFetcher.Form>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>

							<div className="flex gap-4">
								<Button variant="outline" asChild type="button">
									<Link to="/account/addresses">Cancel</Link>
								</Button>
								<Button type="submit" disabled={isPending}>
									{isPending ? (
										<>
											<Icon name="update" className="h-4 w-4 mr-2 animate-spin" />
											Saving...
										</>
									) : (
										<>
											<Icon name="check" className="h-4 w-4 mr-2" />
											Save Changes
										</>
									)}
								</Button>
							</div>
						</div>
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}

function AddressTypeSelect({ field }: { field: any }) {
	const input = useInputControl(field)
	
	return (
		<div className="space-y-2">
			<label htmlFor={field.id} className="text-sm font-medium">
				Address Type
			</label>
			<Select
				name={field.name}
				value={typeof input.value === 'string' ? input.value : 'SHIPPING'}
				onValueChange={(value: string) => {
					input.change(value)
				}}
			>
				<SelectTrigger id={field.id}>
					<SelectValue placeholder="Select address type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="SHIPPING">Shipping</SelectItem>
					<SelectItem value="BILLING">Billing</SelectItem>
					<SelectItem value="BOTH">Both</SelectItem>
				</SelectContent>
			</Select>
			{field.errors && (
				<div className="text-sm text-destructive">
					{field.errors}
				</div>
			)}
		</div>
	)
}

