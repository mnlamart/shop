import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider, useInputControl } from '@conform-to/react'
import { parseWithZod, getZodConstraint  } from '@conform-to/zod/v4'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form  } from 'react-router'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { slugify } from '#app/utils/slug.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/new.ts'

const CategorySchema = z.object({
	name: z.string().min(1, { error: 'Name is required' }).max(100, {
		error: 'Name must be less than 100 characters',
	}),
	slug: z.string().min(1, { error: 'Slug is required' }).max(100, {
		error: 'Slug must be less than 100 characters',
	}).regex(/^[a-z0-9-]+$/, {
		error: 'Slug can only contain lowercase letters, numbers, and hyphens',
	}),
	description: z.string().max(500, {
		error: 'Description must be less than 500 characters',
	}).optional(),
	parentId: z.string(),
})

export async function action({ request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: CategorySchema.superRefine(async (data, ctx) => {
			// Check slug uniqueness
			const existingCategory = await prisma.category.findFirst({
				where: { slug: data.slug },
			})
			if (existingCategory) {
				ctx.addIssue({
					code: 'custom',
					message: 'Slug already exists',
					path: ['slug'],
				})
			}

			// Check parent exists if provided
			if (data.parentId) {
				const parent = await prisma.category.findUnique({
					where: { id: data.parentId },
				})
				if (!parent) {
					ctx.addIssue({
						code: 'custom',
						message: 'Parent category not found',
						path: ['parentId'],
					})
				}
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return {
			result: submission.reply(),
		}
	}

	const { name, slug, description, parentId } = submission.value

	const category = await prisma.category.create({
		data: {
			name,
			slug,
			description: description || null,
			parentId: parentId || null,
		},
	})

	return redirectWithToast(`/admin/categories/${category.slug}`, {
		description: 'Category created successfully',
	})
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get all categories for parent selection
	const categories = await prisma.category.findMany({
		select: { id: true, name: true, parentId: true },
		orderBy: { name: 'asc' },
	})

	return { categories }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'New Category | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new category' },
]

function CategoryForm({ categories, actionData }: { categories: any[], actionData?: any }) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'category-form',
		constraint: getZodConstraint(CategorySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CategorySchema })
		},
		defaultValue: {
			name: '',
			slug: '',
			description: '',
			parentId: '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FormProvider context={form.context}>
			<Form
				method="POST"
				className="space-y-8"
				{...getFormProps(form)}
			>
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Category Information</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-3">
								<Label htmlFor={fields.name.id} className="text-sm font-medium">Category Name *</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="Enter category name"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									onBlur={(e) => {
										const nameValue = e.currentTarget.value
										if (nameValue && !fields.slug.dirty) {
											form.update({
												name: 'slug',
												value: slugify(nameValue)
											})
										}
									}}
								/>
								<ErrorList errors={fields.name.errors} />
							</div>

							<div className="space-y-3">
								<Label htmlFor={fields.slug.id} className="text-sm font-medium">Slug *</Label>
								<Input
									{...getInputProps(fields.slug, { type: 'text' })}
									placeholder="category-slug"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.slug.errors} />
							</div>
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.description.id} className="text-sm font-medium">Description</Label>
							<Textarea
								{...getTextareaProps(fields.description)}
								placeholder="Enter category description"
								rows={3}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
							<ErrorList errors={fields.description.errors} />
						</div>

						<div className="space-y-3">
							<Label htmlFor={fields.parentId.id} className="text-sm font-medium">Parent Category</Label>
							<CategorySelect
								field={fields.parentId}
								categories={categories}
							/>
							<ErrorList errors={fields.parentId.errors} />
						</div>
					</CardContent>
				</Card>

				{/* Actions */}
				<div className="flex items-center justify-end space-x-4">
					<Button variant="outline" className="transition-all duration-200 hover:shadow-sm">
						Cancel
					</Button>
					<Button type="submit" disabled={isPending} className="transition-all duration-200 hover:shadow-md">
						{isPending ? 'Creating...' : 'Create Category'}
					</Button>
				</div>
			</Form>
		</FormProvider>
	)
}

function CategorySelect({
	field,
	categories,
}: {
	field: any
	categories: Array<{ id: string; name: string; parentId: string | null }>
}) {
	const input = useInputControl(field)
	
	return (
		<Select
			value={typeof input.value === 'string' && input.value ? input.value : 'none'}
			onValueChange={(value: string) => {
				input.change(value === 'none' ? '' : value)
			}}
		>
			<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
				<SelectValue placeholder="No parent (root category)" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="none">No parent (root category)</SelectItem>
				{categories.map((cat) => (
					<SelectItem key={cat.id} value={cat.id}>
						{cat.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}

export default function NewCategory({ loaderData, actionData }: Route.ComponentProps) {
	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Create New Category</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Add a new category to organize your products
				</p>
			</div>

			<CategoryForm categories={loaderData.categories} actionData={actionData} />
		</div>
	)
}
