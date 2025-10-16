import { 
	useForm, 
	getFormProps, 
	getInputProps, 
	getTextareaProps,
	getFieldsetProps,
	FormProvider,
	type FieldMetadata 
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useState, useMemo, useCallback } from 'react'
import { Form, Link } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { ProductEditorSchema, type ImageFieldset, type VariantFieldset } from '#app/schemas/product.ts'
import { cn, useIsPending } from '#app/utils/misc.tsx'
import { slugify } from '#app/utils/slug.ts'

// Constants
const MAX_IMAGES = 10
const MAX_TAGS = 10
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'] as const
const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const

interface ProductEditorProps {
	categories: Array<{ id: string; name: string; parentId: string | null }>
	attributes: Array<{ id: string; name: string; values: Array<{ id: string; value: string }> }>
	product?: {
		id: string
		name: string
		slug: string
		description: string | null
		sku: string
		price: number
		currency: string
		status: string
		categoryId: string | null
		images: Array<{
			id: string
			objectKey: string
			altText: string | null
			displayOrder: number
			isPrimary: boolean
		}>
		variants: Array<{
			id: string
			sku: string
			price: number | null
			stockQuantity: number
			attributeValueIds: string[]
		}>
		tags: Array<{ tag: { name: string } }>
	}
	actionData?: {
		result?: {
			status: 'success' | 'error'
			error?: {
				formErrors?: string[]
				fieldErrors?: Record<string, string[]>
			}
		}
	}
}

export function ProductEditor({ categories, attributes, product, actionData }: ProductEditorProps) {
	const isPending = useIsPending()

	// Memoize default values to prevent hydration issues
	const defaultValue = useMemo(() => ({
		...product,
		categoryId: product?.categoryId || 'none',
		images: product?.images?.length ? product.images.map(img => ({
			...img,
			altText: img.altText ?? undefined, // Convert null to undefined
		})) : [],
		variants: product?.variants?.map(variant => ({
			...variant,
			price: variant.price ?? undefined, // Convert null to undefined
		})) ?? [],
		tags: product?.tags?.map(t => t.tag.name) ?? [],
	}), [product])

	const [form, fields] = useForm({
		id: 'product-editor',
		constraint: getZodConstraint(ProductEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProductEditorSchema })
		},
		defaultValue,
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
	})

	const imageList = fields.images.getFieldList()
	const variantList = fields.variants.getFieldList()
	const tagList = fields.tags.getFieldList()

	// Memoized event handlers to prevent unnecessary re-renders
	const handleNameBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
		const nameValue = e.currentTarget.value
		if (nameValue && !fields.slug.dirty) {
			form.update({
				name: 'slug',
				value: slugify(nameValue),
			})
		}
	}, [fields.slug.dirty, form])

	const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			const value = e.currentTarget.value.trim()
			if (value) {
				form.insert({ name: fields.tags.name, defaultValue: value })
				e.currentTarget.value = ''
			}
		}
	}, [form, fields.tags.name])

	const handleAddImage = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault()
		form.insert({
			name: fields.images.name,
			defaultValue: {
				altText: '',
				displayOrder: 0,
				isPrimary: false
			}
		})
	}, [form, fields.images.name])

	const handleRemoveImage = useCallback((index: number) => (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault()
		form.remove({ name: fields.images.name, index })
	}, [form, fields.images.name])

	const handleAddVariant = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault()
		form.insert({
			name: fields.variants.name,
			defaultValue: {
				sku: '',
				price: null,
				stockQuantity: 0,
				attributeValueIds: []
			}
		})
	}, [form, fields.variants.name])

	const handleRemoveVariant = useCallback((index: number) => (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault()
		form.remove({ name: fields.variants.name, index })
	}, [form, fields.variants.name])


	return (
		<FormProvider context={form.context}>
			<Form method="POST" {...getFormProps(form)} encType="multipart/form-data" suppressHydrationWarning>
				{/*
					This hidden submit button is here to ensure that when the user hits
					"enter" on an input field, the primary form function is submitted
					rather than the first button in the form (which is delete/add image/variant).
				*/}
				<button type="submit" className="hidden" />
				{product ? <input type="hidden" name="id" value={product.id} /> : null}
				
				<div className="space-y-8">
					{/* Basic Information Card */}
					<Card>
						<CardHeader>
							<CardTitle>Basic Information</CardTitle>
							<CardDescription>Product name, slug, and description</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor={fields.name.id}>Product Name *</Label>
									<Input
										{...getInputProps(fields.name, { type: 'text' })}
										placeholder="Enter product name"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
										suppressHydrationWarning
										onBlur={handleNameBlur}
									/>
									<ErrorList errors={fields.name.errors} />
								</div>

								<div className="space-y-2">
									<Label htmlFor={fields.slug.id}>Slug *</Label>
									<Input
										{...getInputProps(fields.slug, { type: 'text' })}
										placeholder="product-slug"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
										suppressHydrationWarning
									/>
									<ErrorList errors={fields.slug.errors} />
								</div>
							</div>

							<div className="space-y-2">
								<Label htmlFor={fields.description.id}>Description</Label>
								<Textarea
									{...getTextareaProps(fields.description)}
									placeholder="Enter product description"
									rows={4}
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.description.errors} />
							</div>
						</CardContent>
					</Card>

					{/* Pricing & Stock Card */}
					<Card>
						<CardHeader>
							<CardTitle>Pricing & Stock</CardTitle>
							<CardDescription>SKU, pricing, and currency information</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-4 md:grid-cols-3">
								<div className="space-y-2">
									<Label htmlFor={fields.sku.id}>SKU *</Label>
									<Input
										{...getInputProps(fields.sku, { type: 'text' })}
										placeholder="PRODUCT-001"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<ErrorList errors={fields.sku.errors} />
								</div>

								<div className="space-y-2">
									<Label htmlFor={fields.price.id}>Price *</Label>
									<Input
										{...getInputProps(fields.price, { type: 'number' })}
										step="0.01"
										placeholder="0.00"
										className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
									/>
									<ErrorList errors={fields.price.errors} />
								</div>

								<div className="space-y-2">
									<Label htmlFor={fields.currency.id}>Currency</Label>
									<Select {...getInputProps(fields.currency, { type: 'text' })}>
										<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
											<SelectValue placeholder="Select currency" />
										</SelectTrigger>
										<SelectContent>
											{CURRENCIES.map((currency) => (
												<SelectItem key={currency} value={currency}>
													{currency}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<ErrorList errors={fields.currency.errors} />
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Organization Card */}
					<Card>
						<CardHeader>
							<CardTitle>Organization</CardTitle>
							<CardDescription>Status, category, and tags</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-4 md:grid-cols-2">
								<div className="space-y-2">
									<Label htmlFor={fields.status.id}>Status</Label>
									<Select {...getInputProps(fields.status, { type: 'text' })}>
										<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
											<SelectValue placeholder="Select status" />
										</SelectTrigger>
										<SelectContent>
											{STATUS_OPTIONS.map((status) => (
												<SelectItem key={status} value={status}>
													{status.charAt(0) + status.slice(1).toLowerCase()}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<ErrorList errors={fields.status.errors} />
								</div>

								<div className="space-y-2">
									<Label htmlFor={fields.categoryId.id}>Category</Label>
									<Select {...getInputProps(fields.categoryId, { type: 'text' })}>
										<SelectTrigger className="transition-all duration-200 focus:ring-2 focus:ring-primary/20">
											<SelectValue placeholder="Select a category" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">No category</SelectItem>
											{categories.map((category) => (
												<SelectItem key={category.id} value={category.id}>
													{category.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<ErrorList errors={fields.categoryId.errors} />
								</div>
							</div>

							{/* Tags Section */}
							<div className="space-y-3">
								<Label>Tags</Label>
								<Input 
									placeholder="Enter tag and press Enter"
									onKeyDown={handleTagKeyDown}
								/>
								<div className="flex flex-wrap gap-2">
									{tagList.map((tagMeta, index) => (
										<Badge key={tagMeta.key} variant="secondary" className="gap-2">
											<input {...getInputProps(tagMeta, { type: 'text' })} />
											{tagMeta.value}
											<button
												type="button"
												{...form.remove.getButtonProps({ name: fields.tags.name, index })}
												className="hover:text-destructive"
											>
												<Icon name="cross-1" className="h-3 w-3" />
											</button>
										</Badge>
									))}
								</div>
								<ErrorList errors={fields.tags.errors} />
							</div>
						</CardContent>
					</Card>

					{/* Images Card */}
					<Card>
						<CardHeader>
							<CardTitle>Product Images</CardTitle>
							<CardDescription>Upload up to {MAX_IMAGES} images</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="space-y-4">
								{imageList.map((imageMeta, index) => (
									<li key={imageMeta.key} className="relative border-b pb-4">
										<button
											type="button"
											className="absolute top-0 right-0 text-destructive hover:text-destructive/80"
											onClick={handleRemoveImage(index)}
										>
											<span aria-hidden>
												<Icon name="trash" className="h-4 w-4" />
											</span>
											<span className="sr-only">
												Remove image {index + 1}
											</span>
										</button>
										<ImageChooser 
											meta={imageMeta} 
											objectKey={product?.images[index]?.objectKey}
										/>
									</li>
								))}
							</ul>
							<Button
								type="button"
								variant="outline"
								className="mt-4"
								onClick={handleAddImage}
							>
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Image
							</Button>
							<ErrorList errors={fields.images.errors} />
						</CardContent>
					</Card>

					{/* Variants Card */}
					<Card>
						<CardHeader>
							<CardTitle>Product Variants</CardTitle>
							<CardDescription>Add product variations with different attributes</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								{variantList.map((variantMeta, index) => (
									<div key={variantMeta.key} className="relative">
										<button
											type="button"
											className="absolute top-2 right-2 text-destructive z-10 hover:text-destructive/80"
											onClick={handleRemoveVariant(index)}
										>
											<span aria-hidden>
												<Icon name="trash" className="h-4 w-4" />
											</span>
											<span className="sr-only">
												Remove variant {index + 1}
											</span>
										</button>
										<VariantRow meta={variantMeta} attributes={attributes} product={product} />
									</div>
								))}
							</div>
							<Button
								type="button"
								variant="outline"
								className="mt-4"
								onClick={handleAddVariant}
							>
								<Icon name="plus" className="mr-2 h-4 w-4" />
								Add Variant
							</Button>
							<ErrorList errors={fields.variants.errors} />
						</CardContent>
					</Card>

					{/* Form Actions */}
					<div className="flex items-center justify-end space-x-4 pt-6">
						<Button variant="destructive" {...form.reset.getButtonProps()}>
							Reset
						</Button>
						<Button type="button" variant="outline" asChild>
							<Link to={product ? `/admin/products/${product.slug}` : '/admin/products'}>
								Cancel
							</Link>
						</Button>
						<StatusButton
							form={form.id}
							type="submit"
							disabled={isPending}
							status={isPending ? 'pending' : 'idle'}
						>
							{product ? 'Update Product' : 'Create Product'}
						</StatusButton>
					</div>
				</div>

				<ErrorList id={form.errorId} errors={form.errors} />
			</Form>
		</FormProvider>
	)
}

interface ImageChooserProps {
	meta: FieldMetadata<ImageFieldset>
	objectKey?: string
}

function ImageChooser({ meta, objectKey }: ImageChooserProps) {
	const fields = meta.getFieldset()
	const existingImage = Boolean(fields.id.initialValue)
	const [previewImage, setPreviewImage] = useState<string | null>(
		objectKey ? `/resources/images?objectKey=${encodeURIComponent(objectKey)}` : null
	)
	const [altText, setAltText] = useState(fields.altText.initialValue ?? '')

	return (
		<fieldset {...getFieldsetProps(meta)}>
			<div className="flex gap-3">
				<div className="w-32">
					<div className="relative size-32">
						<label htmlFor={fields.file.id} className={cn('group absolute size-32 rounded-lg', {
							'bg-accent opacity-40 focus-within:opacity-100 hover:opacity-100': !previewImage,
							'cursor-pointer focus-within:ring-2': !existingImage,
						})}>
							{previewImage ? (
								<img src={previewImage} alt={altText ?? ''} className="size-32 rounded-lg object-cover" />
							) : (
								<div className="flex size-32 items-center justify-center rounded-lg border">
									<Icon name="plus" />
								</div>
							)}
							{existingImage ? (
								<input
									{...getInputProps(fields.id, { type: 'hidden' })}
									key={fields.id.key}
								/>
							) : null}
							<input
								accept="image/*"
								className="absolute opacity-0 cursor-pointer"
								{...getInputProps(fields.file, { type: 'file' })}
								key={fields.file.key}
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (file) {
										const reader = new FileReader()
										reader.onloadend = () => setPreviewImage(reader.result as string)
										reader.readAsDataURL(file)
									}
								}}
							/>
						</label>
					</div>
				</div>
				<div className="flex-1 space-y-2">
					<div className="space-y-2">
						<Label htmlFor={fields.altText.id}>Alt Text</Label>
						<Input 
							{...getInputProps(fields.altText, { type: 'text' })}
							onChange={(e) => setAltText(e.currentTarget.value)}
						/>
						<ErrorList errors={fields.altText.errors} />
					</div>
					<div className="space-y-2">
						<Label htmlFor={fields.displayOrder.id}>Display Order</Label>
						<Input {...getInputProps(fields.displayOrder, { type: 'number' })} />
						<ErrorList errors={fields.displayOrder.errors} />
					</div>
					<div className="flex items-center space-x-2">
						<input 
							{...getInputProps(fields.isPrimary, { type: 'checkbox' })} 
							id={fields.isPrimary.id}
						/>
						<Label htmlFor={fields.isPrimary.id}>Primary Image</Label>
					</div>
				</div>
			</div>
			<div className="min-h-[32px] px-4 pt-1 pb-3">
				<ErrorList id={meta.errorId} errors={meta.errors} />
			</div>
		</fieldset>
	)
}

interface VariantRowProps {
	meta: FieldMetadata<VariantFieldset>
	attributes: Array<{
		id: string
		name: string
		values: Array<{ id: string; value: string }>
	}>
	product?: ProductEditorProps['product']
}

function VariantRow({ meta, attributes }: VariantRowProps) {
	const fields = meta.getFieldset()
	
	return (
		<fieldset {...getFieldsetProps(meta)} className="grid gap-4 p-4 border rounded-lg">
			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={fields.sku.id}>Variant SKU *</Label>
					<Input 
						{...getInputProps(fields.sku, { type: 'text' })}
						placeholder="VARIANT-001"
					/>
					<ErrorList errors={fields.sku.errors} />
				</div>
				<div className="space-y-2">
					<Label htmlFor={fields.price.id}>Price Override</Label>
					<Input 
						{...getInputProps(fields.price, { type: 'number' })} 
						step="0.01"
						placeholder="0.00"
					/>
					<ErrorList errors={fields.price.errors} />
				</div>
			</div>
			<div className="space-y-2">
				<Label htmlFor={fields.stockQuantity.id}>Stock Quantity *</Label>
				<Input 
					{...getInputProps(fields.stockQuantity, { type: 'number' })}
					placeholder="0"
				/>
				<ErrorList errors={fields.stockQuantity.errors} />
			</div>
			<div className="space-y-2">
				<Label>Attributes (Optional)</Label>
				<div className="grid gap-2 md:grid-cols-2">
					{attributes.map((attr, attrIndex) => (
						<div key={attr.id} className="space-y-1">
							<Label className="text-sm">{attr.name}</Label>
							<Select 
								name={`${fields.attributeValueIds.name}[${attrIndex}]`}
								defaultValue="none"
							>
								<SelectTrigger>
									<SelectValue placeholder={`Select ${attr.name} (optional)`} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No {attr.name}</SelectItem>
									{attr.values.map(val => (
										<SelectItem key={val.id} value={val.id}>
											{val.value}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					))}
				</div>
				<ErrorList errors={fields.attributeValueIds.errors} />
			</div>
			<div className="min-h-[32px] px-4 pt-1 pb-3">
				<ErrorList id={meta.errorId} errors={meta.errors} />
			</div>
		</fieldset>
	)
}
