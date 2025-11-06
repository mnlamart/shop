import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider, useInputControl } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Prisma } from '@prisma/client'
import { Form, useSearchParams } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const ShippingMethodSchema = z.object({
	name: z
		.string({
			error: (issue) =>
				issue.input === undefined ? 'Name is required' : 'Not a string',
		})
		.min(1, { error: 'Name is required' })
		.max(100, { error: 'Name must be less than 100 characters' }),
	description: z
		.string()
		.max(500, { error: 'Description must be less than 500 characters' })
		.optional(),
	zoneId: z.string().min(1, { error: 'Zone is required' }),
	carrierId: z.string().optional(),
	rateType: z.enum(['FLAT', 'WEIGHT_BASED', 'PRICE_BASED', 'FREE']),
	flatRate: z.preprocess(
		(val) => {
			if (val === '' || val === null || val === undefined) return null
			const num = Number(val)
			return isNaN(num) ? null : Math.round(num * 100) // Convert to cents
		},
		z.number().int().min(0).nullable().optional(),
	),
	weightRates: z
		.string()
		.optional()
		.transform((val) => {
			if (!val || val.trim() === '') return null
			try {
				return JSON.parse(val)
			} catch {
				return null
			}
		}),
	priceRates: z
		.string()
		.optional()
		.transform((val) => {
			if (!val || val.trim() === '') return null
			try {
				return JSON.parse(val)
			} catch {
				return null
			}
		}),
	freeShippingThreshold: z.preprocess(
		(val) => {
			if (val === '' || val === null || val === undefined) return null
			const num = Number(val)
			return isNaN(num) ? null : Math.round(num * 100) // Convert to cents
		},
		z.number().int().min(0).nullable().optional(),
	),
	displayOrder: z.preprocess(
		(val) => {
			if (val === '' || val === null || val === undefined) return 0
			const num = Number(val)
			return isNaN(num) ? 0 : num
		},
		z.number().int().min(0).default(0),
	),
	estimatedDays: z.preprocess(
		(val) => {
			if (val === '' || val === null || val === undefined) return null
			const num = Number(val)
			return isNaN(num) ? null : num
		},
		z.number().int().min(1).nullable().optional(),
	),
	isActive: z.preprocess(
		(val) => val === 'on' || val === true || val === 'true',
		z.boolean().default(true),
	),
})

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: ShippingMethodSchema.superRefine(async (data, ctx) => {
			// Validate zone exists
			const zone = await prisma.shippingZone.findUnique({
				where: { id: data.zoneId },
			})
			if (!zone) {
				ctx.addIssue({
					code: 'custom',
					message: 'Shipping zone not found',
					path: ['zoneId'],
				})
			}

			// Validate carrier exists if provided
			if (data.carrierId) {
				const carrier = await prisma.carrier.findUnique({
					where: { id: data.carrierId },
				})
				if (!carrier) {
					ctx.addIssue({
						code: 'custom',
						message: 'Carrier not found',
						path: ['carrierId'],
					})
				}
			}

			// Validate rate type specific fields
			if (data.rateType === 'FLAT' && (!data.flatRate || data.flatRate <= 0)) {
				ctx.addIssue({
					code: 'custom',
					message: 'Flat rate is required and must be greater than 0',
					path: ['flatRate'],
				})
			}

			if (data.rateType === 'WEIGHT_BASED') {
				if (!data.weightRates || !Array.isArray(data.weightRates) || data.weightRates.length === 0) {
					ctx.addIssue({
						code: 'custom',
						message: 'Weight rates are required',
						path: ['weightRates'],
					})
				}
			}

			if (data.rateType === 'PRICE_BASED') {
				if (!data.priceRates || !Array.isArray(data.priceRates) || data.priceRates.length === 0) {
					ctx.addIssue({
						code: 'custom',
						message: 'Price rates are required',
						path: ['priceRates'],
					})
				}
			}

			// Check uniqueness: method name must be unique per carrier
			const existingMethod = await prisma.shippingMethod.findFirst({
				where: {
					name: data.name,
					carrierId: data.carrierId || null,
				},
			})
			if (existingMethod) {
				ctx.addIssue({
					code: 'custom',
					message: 'A method with this name already exists for this carrier',
					path: ['name'],
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const {
		name,
		description,
		zoneId,
		carrierId,
		rateType,
		flatRate,
		weightRates,
		priceRates,
		freeShippingThreshold,
		displayOrder,
		estimatedDays,
		isActive,
	} = submission.value

	const method = await prisma.shippingMethod.create({
		data: {
			name,
			description: description || null,
			zoneId,
			carrierId: carrierId || null,
			rateType,
			flatRate: rateType === 'FLAT' ? flatRate : null,
			weightRates: rateType === 'WEIGHT_BASED' ? (weightRates as Prisma.InputJsonValue) : null,
			priceRates: rateType === 'PRICE_BASED' ? (priceRates as Prisma.InputJsonValue) : null,
			freeShippingThreshold: rateType === 'FREE' ? freeShippingThreshold : null,
			displayOrder,
			estimatedDays: estimatedDays || null,
			isActive,
		},
	})

	return redirectWithToast(`/admin/shipping/methods/${method.id}`, {
		description: 'Shipping method created successfully',
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const url = new URL(request.url)
	const zoneId = url.searchParams.get('zoneId')

	// Get all zones and carriers for selection
	const zones = await prisma.shippingZone.findMany({
		where: { isActive: true },
		orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
		select: { id: true, name: true },
	})

	const carriers = await prisma.carrier.findMany({
		where: { isActive: true },
		orderBy: [{ displayOrder: 'asc' }, { displayName: 'asc' }],
		select: { id: true, name: true, displayName: true },
	})

	return { zones, carriers, defaultZoneId: zoneId || null }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Shipping Method | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new shipping method' },
]

function CarrierSelect({
	field,
	carriers,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof ShippingMethodSchema>>>[1]['carrierId']
	carriers: Array<{ id: string; name: string; displayName: string }>
}) {
	const input = useInputControl(field)

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : 'none'}
			onValueChange={(value: string) => {
				input.change(value === 'none' ? '' : value)
			}}
		>
			<SelectTrigger
				className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
				aria-label="Carrier"
			>
				<SelectValue placeholder="No carrier (generic method)" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">No carrier (generic method)</SelectItem>
				{carriers.map((carrier) => (
					<SelectItem key={carrier.id} value={carrier.id}>
						{carrier.displayName}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

function ZoneSelect({
	field,
	zones,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof ShippingMethodSchema>>>[1]['zoneId']
	zones: Array<{ id: string; name: string }>
}) {
	const input = useInputControl(field)

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : ''}
			onValueChange={(value: string) => {
				input.change(value)
			}}
		>
			<SelectTrigger
				className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
				aria-label="Shipping zone"
			>
				<SelectValue placeholder="Select a zone" />
			</SelectTrigger>
			<SelectContent>
				{zones.map((zone) => (
					<SelectItem key={zone.id} value={zone.id}>
						{zone.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

function RateTypeSelect({
	field,
}: {
	field: ReturnType<typeof useForm<z.infer<typeof ShippingMethodSchema>>>[1]['rateType']
}) {
	const input = useInputControl(field)

	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : ''}
			onValueChange={(value: string) => {
				input.change(value)
			}}
		>
			<SelectTrigger
				className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
				aria-label="Rate type"
			>
				<SelectValue placeholder="Select rate type" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="FLAT">Flat Rate</SelectItem>
				<SelectItem value="WEIGHT_BASED">Weight-Based</SelectItem>
				<SelectItem value="PRICE_BASED">Price-Based</SelectItem>
				<SelectItem value="FREE">Free Shipping</SelectItem>
			</SelectContent>
		</Select>
	)
}

function MethodForm({
	zones,
	carriers,
	defaultZoneId,
	actionData,
}: {
	zones: Route.ComponentProps['loaderData']['zones']
	carriers: Route.ComponentProps['loaderData']['carriers']
	defaultZoneId: string | null
	actionData?: Route.ComponentProps['actionData']
}) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'method-form',
		constraint: getZodConstraint(ShippingMethodSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ShippingMethodSchema })
		},
		defaultValue: {
			name: '',
			description: '',
			zoneId: defaultZoneId || '',
			carrierId: '',
			rateType: 'FLAT' as const,
			flatRate: '',
			weightRates: '',
			priceRates: '',
			freeShippingThreshold: '',
			displayOrder: '0',
			estimatedDays: '',
			isActive: 'on',
		},
		shouldRevalidate: 'onBlur',
	})

	const rateType = form.getFieldset().rateType?.value || 'FLAT'

	return (
		<FormProvider context={form.context}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Method Information</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.name.id} className="text-sm font-medium">
									Method Name *
								</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="e.g., Standard Shipping, Express Delivery"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.name.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.displayOrder.id} className="text-sm font-medium">
									Display Order
								</Label>
								<Input
									{...getInputProps(fields.displayOrder, { type: 'number' })}
									placeholder="0"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									Lower numbers appear first. Default: 0
								</p>
								<ErrorList errors={fields.displayOrder.errors} />
							</div>
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.description.id} className="text-sm font-medium">
								Description
							</Label>
							<Textarea
								{...getTextareaProps(fields.description)}
								placeholder="Optional description of this shipping method"
								rows={3}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<ErrorList errors={fields.description.errors} />
						</div>

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.zoneId.id} className="text-sm font-medium">
									Shipping Zone *
								</Label>
								<ZoneSelect field={fields.zoneId} zones={zones} />
								<ErrorList errors={fields.zoneId.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.carrierId.id} className="text-sm font-medium">
									Carrier (Optional)
								</Label>
								<CarrierSelect field={fields.carrierId} carriers={carriers} />
								<p className="text-xs text-muted-foreground">
									Select a carrier if this method is specific to a shipping provider
								</p>
								<ErrorList errors={fields.carrierId.errors} />
							</div>
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.rateType.id} className="text-sm font-medium">
								Rate Type *
							</Label>
							<RateTypeSelect field={fields.rateType} />
							<ErrorList errors={fields.rateType.errors} />
						</div>

						{/* Conditional fields based on rate type */}
						{rateType === 'FLAT' && (
							<div className="space-y-3">
								<Label htmlFor={fields.flatRate.id} className="text-sm font-medium">
									Flat Rate (€) *
								</Label>
								<Input
									{...getInputProps(fields.flatRate, { type: 'number', step: '0.01' })}
									placeholder="0.00"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									Fixed shipping cost in euros (e.g., 5.00 for €5.00)
								</p>
								<ErrorList errors={fields.flatRate.errors} />
							</div>
						)}

						{rateType === 'WEIGHT_BASED' && (
							<div className="space-y-3">
								<Label htmlFor={fields.weightRates.id} className="text-sm font-medium">
									Weight Rates (JSON) *
								</Label>
								<Textarea
									{...getTextareaProps(fields.weightRates)}
									placeholder='[{"minWeight": 0, "maxWeight": 500, "rate": 500}, {"minWeight": 500, "maxWeight": 1000, "rate": 1000}]'
									rows={5}
									className="font-mono text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									JSON array of weight ranges. Weight in grams, rate in cents. Example:{' '}
									<code className="bg-muted px-1 py-0.5 rounded">
										{`[{"minWeight": 0, "maxWeight": 500, "rate": 500}]`}
									</code>
								</p>
								<ErrorList errors={fields.weightRates.errors} />
							</div>
						)}

						{rateType === 'PRICE_BASED' && (
							<div className="space-y-3">
								<Label htmlFor={fields.priceRates.id} className="text-sm font-medium">
									Price Rates (JSON) *
								</Label>
								<Textarea
									{...getTextareaProps(fields.priceRates)}
									placeholder='[{"minPrice": 0, "maxPrice": 5000, "rate": 500}, {"minPrice": 5000, "maxPrice": 10000, "rate": 1000}]'
									rows={5}
									className="font-mono text-sm transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									JSON array of price ranges. Price and rate in cents. Example:{' '}
									<code className="bg-muted px-1 py-0.5 rounded">
										{`[{"minPrice": 0, "maxPrice": 5000, "rate": 500}]`}
									</code>
								</p>
								<ErrorList errors={fields.priceRates.errors} />
							</div>
						)}

						{rateType === 'FREE' && (
							<div className="space-y-3">
								<Label htmlFor={fields.freeShippingThreshold.id} className="text-sm font-medium">
									Free Shipping Threshold (€)
								</Label>
								<Input
									{...getInputProps(fields.freeShippingThreshold, { type: 'number', step: '0.01' })}
									placeholder="0.00"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									Minimum order total in euros for free shipping (optional). If not set, shipping is
									always free.
								</p>
								<ErrorList errors={fields.freeShippingThreshold.errors} />
							</div>
						)}

						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.estimatedDays.id} className="text-sm font-medium">
									Estimated Delivery Days
								</Label>
								<Input
									{...getInputProps(fields.estimatedDays, { type: 'number' })}
									placeholder="e.g., 5"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<p className="text-xs text-muted-foreground">
									Estimated delivery time in business days (optional)
								</p>
								<ErrorList errors={fields.estimatedDays.errors} />
							</div>
						</div>

						<div className="flex items-center space-x-2">
							<input
								{...getInputProps(fields.isActive, { type: 'checkbox' })}
								className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								defaultChecked={true}
							/>
							<Label htmlFor={fields.isActive.id} className="text-sm font-medium cursor-pointer">
								Active (method will be available for selection)
							</Label>
						</div>
						<ErrorList errors={fields.isActive.errors} />
					</CardContent>
				</Card>

				{/* Actions */}
				<div className="flex items-center justify-end space-x-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => window.history.back()}
						className="transition-all duration-200 hover:shadow-sm"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						disabled={isPending}
						className="transition-all duration-200 hover:shadow-md"
					>
						{isPending ? 'Creating...' : 'Create Method'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

export default function NewShippingMethod({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Create New Shipping Method
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Define a shipping method with rates and configuration
				</p>
			</div>

			<MethodForm
				zones={loaderData.zones}
				carriers={loaderData.carriers}
				defaultZoneId={loaderData.defaultZoneId}
				actionData={actionData}
			/>
		</div>
	)
}

