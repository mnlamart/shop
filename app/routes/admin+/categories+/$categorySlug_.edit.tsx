import { useForm, getFormProps, getInputProps, getTextareaProps, FormProvider, useInputControl } from '@conform-to/react'
import { parseWithZod, getZodConstraint } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { Form, Link, data } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { CategorySchema } from '#app/schemas/category.ts'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { slugify } from '#app/utils/slug.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$categorySlug_.edit.ts'

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	const category = await prisma.category.findUnique({
		where: { slug: params.categorySlug },
		include: {
			parent: { select: { id: true, name: true, slug: true } },
			_count: { select: { children: true } },
		},
	})

	invariantResponse(category, 'Category not found', { status: 404 })

	// Get all categories for parent selection (exclude current and its children)
	const allCategories = await prisma.category.findMany({
		where: {
			id: { not: category.id },
			parentId: { not: category.id },
		},
		select: { id: true, name: true, parentId: true },
		orderBy: { name: 'asc' },
	})

	return { category, categories: allCategories }
}

export async function action({ params: _params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')

	const formData = await parseFormData(request)
	const submission = await parseWithZod(formData, {
		schema: CategorySchema.superRefine(async (data, ctx) => {
			// Check slug uniqueness (excluding current category)
			const existingCategory = await prisma.category.findFirst({
				where: {
					slug: data.slug,
					id: { not: data.id },
				},
			})
			if (existingCategory) {
				ctx.addIssue({
					code: 'custom',
					message: 'Slug already exists',
					path: ['slug'],
				})
			}

			// Check parent exists and prevent circular reference
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
				// Prevent setting self as parent
				if (data.parentId === data.id) {
					ctx.addIssue({
						code: 'custom',
						message: 'Cannot set category as its own parent',
						path: ['parentId'],
					})
				}
			}

			// Allow editing uncategorized category but warn about slug changes
			const currentCategory = await prisma.category.findUnique({
				where: { id: data.id },
			})
			if (currentCategory?.id === UNCATEGORIZED_CATEGORY_ID && data.slug !== 'uncategorized') {
				// Allow slug change but it's not recommended
				console.warn('Admin is changing the slug of the uncategorized category')
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: submission.status === 'error' ? 400 : 200 })
	}

	const { id, name, slug, description, parentId } = submission.value

	await prisma.category.update({
		where: { id },
		data: {
			name,
			slug,
			description: description || null,
			parentId: parentId || null,
		},
	})

	return redirectWithToast(`/admin/categories`, {
		description: `Category "${name}" updated successfully`,
	})
}

export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `Edit ${data?.category.name} | Admin | Epic Shop` },
	{ name: 'description', content: `Edit category: ${data?.category.name}` },
]

export default function EditCategory({ loaderData, actionData }: Route.ComponentProps) {
	const { category, categories } = loaderData
	const isPending = useIsPending()
	const isUncategorized = category.id === UNCATEGORIZED_CATEGORY_ID

	const [form, fields] = useForm({
		id: 'category-edit-form',
		constraint: getZodConstraint(CategorySchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CategorySchema })
		},
		defaultValue: {
			id: category.id,
			name: category.name,
			slug: category.slug,
			description: category.description || '',
			parentId: category.parent?.id || '',
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="space-y-8 animate-slide-top">
			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-3 mb-2">
						<h1 className="text-3xl font-bold tracking-tight">Edit Category</h1>
						{isUncategorized && (
							<Badge variant="warning">System Category</Badge>
						)}
					</div>
					<p className="text-muted-foreground">
						Update category: {category.name}
						{isUncategorized && (
							<span className="block mt-1 text-sm text-amber-600 dark:text-amber-400">
								⚠️ This is a system category. Products without a category will be assigned to this one.
							</span>
						)}
					</p>
				</div>
				<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
					<Link to={`/admin/categories/${category.slug}`}>Cancel</Link>
				</Button>
			</div>

			<FormProvider context={form.context}>
				<Form method="POST" className="space-y-8" {...getFormProps(form)}>
					<input type="hidden" name="id" value={category.id} />
					
					<Card className="transition-shadow duration-200 hover:shadow-md">
						<CardHeader>
							<h2 className="text-xl">Category Information</h2>
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
											if (nameValue && !fields.slug.dirty && !isUncategorized) {
												form.update({
													name: 'slug',
													value: slugify(nameValue),
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
									{isUncategorized && (
										<p className="text-xs text-amber-600 dark:text-amber-400">
											⚠️ This is a system category. Consider keeping the slug as "uncategorized" for consistency.
										</p>
									)}
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

					<div className="flex items-center justify-end space-x-4">
						<Button type="button" variant="outline" asChild className="transition-all duration-200 hover:shadow-sm">
							<Link to={`/admin/categories/${category.slug}`}>Cancel</Link>
						</Button>
						<Button type="submit" disabled={isPending} className="transition-all duration-200 hover:shadow-md">
							{isPending ? 'Saving...' : 'Save Changes'}
						</Button>
					</div>
				</Form>
			</FormProvider>
		</div>
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
			<SelectTrigger aria-label="Parent category">
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