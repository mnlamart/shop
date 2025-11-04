import { useForm, getFormProps, getInputProps } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$attributeId_.edit.ts'

const AttributeEditSchema = z.object({
	id: z.string(),
	name: z.string().min(1, { error: 'Name is required' }).max(50, {
		error: 'Name must be less than 50 characters',
	}),
	values: z.string().min(1, { error: 'At least one value is required' }),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const attribute = await prisma.attribute.findUnique({
		where: { id: params.attributeId },
		include: {
			values: {
				orderBy: { displayOrder: 'asc' },
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
		},
	})

	invariantResponse(attribute, 'Attribute not found', { status: 404 })

	return { attribute }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: AttributeEditSchema.superRefine(async (data, ctx) => {
			// Check name uniqueness (excluding current attribute)
			const existingAttribute = await prisma.attribute.findFirst({
				where: {
					name: data.name,
					id: { not: data.id },
				},
			})
			if (existingAttribute) {
				ctx.addIssue({
					code: 'custom',
					message: 'Attribute name already exists',
					path: ['name'],
				})
			}

			// Parse and validate values
			const values = data.values.split(',').map(v => v.trim()).filter(Boolean)
			if (values.length === 0) {
				ctx.addIssue({
					code: 'custom',
					message: 'At least one value is required',
					path: ['values'],
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

	const { id, name, values } = submission.value
	const valuesArray = values.split(',').map(v => v.trim()).filter(Boolean)

	// Get current attribute to check if it has variants
	const currentAttribute = await prisma.attribute.findUnique({
		where: { id },
		include: {
			values: {
				include: {
					_count: {
						select: { variants: true },
					},
				},
			},
		},
	})

	if (!currentAttribute) {
		return {
			result: submission.reply({
				formErrors: ['Attribute not found'],
			}),
		}
	}

	// Check if any values are in use
	const hasVariants = currentAttribute.values.some(value => value._count.variants > 0)
	if (hasVariants) {
		return {
			result: submission.reply({
				formErrors: ['Cannot edit attribute that is used in product variants'],
			}),
		}
	}

	// Update attribute and its values
	await prisma.$transaction(async (tx) => {
		// Update attribute name
		await tx.attribute.update({
			where: { id },
			data: { name },
		})

		// Delete existing values
		await tx.attributeValue.deleteMany({
			where: { attributeId: id },
		})

		// Create new values
		await tx.attributeValue.createMany({
			data: valuesArray.map((value: string, index: number) => ({
				attributeId: id,
				value,
				displayOrder: index,
			})),
		})
	})

	return redirectWithToast(`/admin/attributes/${id}`, {
		type: 'success',
		title: 'Success',
		description: 'Attribute updated successfully',
	})
}

export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `Edit ${data?.attribute.name} | Attributes | Admin | Epic Shop` },
	{ name: 'description', content: `Edit attribute: ${data?.attribute.name}` },
]

export default function AttributeEdit({ loaderData }: Route.ComponentProps) {
	const { attribute } = loaderData
	const isPending = useIsPending()
	const hasVariants = attribute.values.some((value: any) => value._count.variants > 0)

	const [form, fields] = useForm({
		id: 'attribute-edit-form',
		constraint: getZodConstraint(AttributeEditSchema),
		lastResult: (loaderData as any).result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AttributeEditSchema })
		},
		defaultValue: {
			id: attribute.id,
			name: attribute.name,
			values: attribute.values.map((value: any) => value.value).join(', '),
		},
	})

	return (
		<div className="space-y-8 animate-slide-top">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-normal tracking-tight text-foreground">Edit Attribute</h1>
					<p className="text-sm text-muted-foreground mt-1">
						Update attribute information and values
					</p>
				</div>
				<Button variant="outline" asChild className="h-9 rounded-lg font-medium">
					<Link to={`/admin/attributes/${attribute.id}`}>
						<Icon name="arrow-left" className="h-4 w-4 mr-2" />
						Back to Attribute
					</Link>
				</Button>
			</div>

			<Card className="rounded-[14px]">
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-base font-normal text-foreground">Attribute Details</CardTitle>
						{hasVariants && (
							<Badge variant="warning">In Use</Badge>
						)}
					</div>
					{hasVariants && (
						<p className="text-sm text-amber-600 dark:text-amber-400">
							⚠️ This attribute is used in product variants and cannot be edited.
						</p>
					)}
				</CardHeader>
				<CardContent>
					<Form method="POST" {...getFormProps(form)}>
						<input type="hidden" name="id" value={attribute.id} />
						
						<div className="grid gap-6">
							{/* Name field */}
							<div className="space-y-2">
								<Label htmlFor={fields.name.id}>Attribute Name</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="e.g., Size, Color, Material"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									disabled={hasVariants}
								/>
								<ErrorList errors={fields.name.errors} />
							</div>

							{/* Values field */}
							<div className="space-y-2">
								<Label htmlFor={fields.values.id}>Values</Label>
								<Textarea
									{...getInputProps(fields.values, { type: 'text' })}
									placeholder="e.g., Small, Medium, Large (comma-separated)"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									rows={4}
									disabled={hasVariants}
								/>
								<p className="text-xs text-muted-foreground">
									Enter values separated by commas. For example: "XS, S, M, L, XL" or "Red, Blue, Green"
								</p>
								<ErrorList errors={fields.values.errors} />
							</div>
						</div>

						{/* Action buttons */}
						<div className="flex gap-4 justify-end mt-8 pt-6 border-t">
							<Button variant="outline" asChild>
								<Link to={`/admin/attributes/${attribute.id}`}>
									Cancel
								</Link>
							</Button>
							<Button 
								type="submit" 
								disabled={isPending || hasVariants}
								className="transition-all duration-200"
							>
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
					</Form>
				</CardContent>
			</Card>
		</div>
	)
}
