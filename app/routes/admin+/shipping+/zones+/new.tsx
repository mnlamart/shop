import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const ShippingZoneSchema = z.object({
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
	countries: z
		.string()
		.optional()
		.transform((val) => {
			if (!val || val.trim() === '') return []
			// Split by comma, trim, filter empty, uppercase
			return val
				.split(',')
				.map((c) => c.trim().toUpperCase())
				.filter((c) => c.length === 2)
		}),
	displayOrder: z.preprocess(
		(val) => {
			if (val === '' || val === null || val === undefined) return 0
			const num = Number(val)
			return isNaN(num) ? 0 : num
		},
		z.number().int().min(0).default(0),
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
		schema: ShippingZoneSchema,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { name, description, countries, displayOrder, isActive } = submission.value

	const zone = await prisma.shippingZone.create({
		data: {
			name,
			description: description || null,
			countries: countries as string[],
			displayOrder,
			isActive,
		},
	})

	return redirectWithToast(`/admin/shipping/zones/${zone.id}`, {
		description: 'Shipping zone created successfully',
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	return {}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Shipping Zone | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new shipping zone' },
]

function ZoneForm({ actionData }: { actionData?: Route.ComponentProps['actionData'] }) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'zone-form',
		constraint: getZodConstraint(ShippingZoneSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ShippingZoneSchema })
		},
		defaultValue: {
			name: '',
			description: '',
			countries: '',
			displayOrder: '0',
			isActive: 'on',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<Card className="rounded-[14px]">
					<CardHeader>
						<h2 className="text-base font-normal text-foreground">Zone Information</h2>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.name.id} className="text-sm font-medium">
									Zone Name *
								</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="e.g., Europe, France, International"
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
								placeholder="Optional description of this shipping zone"
								rows={3}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<ErrorList errors={fields.description.errors} />
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.countries.id} className="text-sm font-medium">
								Countries (ISO 2-letter codes)
							</Label>
							<Input
								{...getInputProps(fields.countries, { type: 'text' })}
								placeholder="FR, BE, DE, IT, ES (comma-separated)"
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<p className="text-xs text-muted-foreground">
								Enter ISO 2-letter country codes separated by commas (e.g., FR, BE, DE). Leave
								empty for "all countries".
							</p>
							<ErrorList errors={fields.countries.errors} />
						</div>

						<div className="flex items-center space-x-2">
							<input
								{...getInputProps(fields.isActive, { type: 'checkbox' })}
								className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary/20"
								defaultChecked={true}
							/>
							<Label htmlFor={fields.isActive.id} className="text-sm font-medium cursor-pointer">
								Active (zone will be available for shipping)
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
						{isPending ? 'Creating...' : 'Create Zone'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

export default function NewShippingZone({ actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">
					Create New Shipping Zone
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Define a geographic region for shipping configuration
				</p>
			</div>

			<ZoneForm actionData={actionData} />
		</div>
	)
}

