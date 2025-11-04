import { getFormProps, getInputProps, getTextareaProps, useForm, getFieldsetProps, type FieldMetadata } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { useRef, useState, useCallback } from 'react'
import { Form, Link } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import ProductTag from '#app/components/ui/productTag.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { CURRENCIES, PRODUCT_STATUSES } from '#app/schemas/constants'
import { productSchema, type ImageFieldset, type VariantFieldset } from '#app/schemas/product.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending, cn, getProductImgSrc } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { type Route } from './+types/new.ts'

export { action } from './__new.server.tsx'

/**
 * Loads categories and attributes for the new product form
 * 
 * @param request - HTTP request object
 * @returns Categories and attributes data for form dropdowns
 */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get categories and attributes for the form
	const [categories, attributes] = await Promise.all([
		prisma.category.findMany({
			select: { id: true, name: true, parentId: true },
			orderBy: { name: 'asc' },
		}),
		prisma.attribute.findMany({
			include: {
				values: {
					orderBy: { displayOrder: 'asc' },
				},
			},
			orderBy: { displayOrder: 'asc' },
		}),
	])

	return {
		categories,
		attributes: attributes.map(attr => ({
			id: attr.id,
			name: attr.name,
			values: attr.values.map(value => ({
				id: value.id,
				value: value.value,
			})),
		})),
	}
}

/**
 * Generates metadata for the new product page
 * 
 * @returns Array of meta tags for the page
 */
export const meta: Route.MetaFunction = () => [
	{ title: 'New Product | Admin | Epic Shop' },
	{ name: 'description', content: 'Create a new product' },
]

const productWithoutIdSchema = productSchema.omit({ id: true })

/**
 * NewProduct component for creating a new product
 * 
 * @param loaderData - Categories and attributes data loaded from the loader function
 * @param actionData - Result data from form submissions
 * @returns React component with product creation form
 */
export default function NewProduct({ loaderData, actionData }: Route.ComponentProps) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'product-form',
		constraint: getZodConstraint(productWithoutIdSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: productWithoutIdSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			images: [{}],
		},
	})


	const newTagInputRef = useRef<HTMLInputElement>(null)

	const tags = fields.tags.getFieldList()
	const variantList = fields.variants.getFieldList()

	const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			if (e.currentTarget.value.trim()) {
				form.insert({
					name: fields.tags.name,
					defaultValue: e.currentTarget.value.trim(),
				})
				e.currentTarget.value = ''
			}
		}
	}, [form, fields.tags.name])

	const handleAddTag = useCallback(() => {
		if (newTagInputRef.current?.value.trim()) {
			form.insert({
				name: fields.tags.name,
				defaultValue: newTagInputRef.current.value.trim(),
			})
			newTagInputRef.current.value = ''
		}
	}, [form, fields.tags.name])

	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Create New Product</h1>
				<p className="text-muted-foreground">
					Add a new product to your catalog
				</p>
			</div>
			<Form
				method="POST"
				{...getFormProps(form)}
				encType="multipart/form-data"
				className="space-y-6"
			>
				{/*
					This hidden submit button is here to ensure that when the user hits
					"enter" on an input field, the primary form function is submitted
					rather than the first button in the form (which is delete/add image or tags).
				*/}
				<button type="submit" className="hidden" />
				{/* Basic Information Card */}
				<Card>
					<CardHeader>
						<CardTitle>Basic Information</CardTitle>
						<CardDescription>Product name, slug, and description</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor={fields.name.id}>Name *</Label>
								<Input
									{...getInputProps(fields.name, { type: 'text' })}
									placeholder="Enter product name"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
								/>
								<ErrorList errors={fields.name.errors} />
							</div>
							<div className="space-y-2">
								<Label htmlFor={fields.slug.id}>Slug *</Label>
								<Input
									{...getInputProps(fields.slug, { type: 'text' })}
									placeholder="product-slug"
									className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
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
						<div className="space-y-2">
							<Label>Tags</Label>
							<div className="space-y-3">
								{/* Display existing tags */}
								{tags.length > 0 && (
									<div className="flex flex-wrap gap-2">
										{tags.map((tag, index) => (
											<div key={tag.key} className="flex items-center">
												
												<ProductTag
													tag={tag}
													variant={tag.errors ? "destructive" : "secondary"}
													hasError={!!tag.errors}
													errorMessage={tag.errors?.join(', ')}
													removeButtonProps={form.remove.getButtonProps({
														name: fields.tags.name,
														index,
													})}
												/>
											</div>
										))}
									</div>
								)}

								{/* Add new tag input */}
								<div className="flex gap-2">
									<Input
										ref={newTagInputRef}
										placeholder="Enter tag name"
										className="flex-1"
										onKeyDown={handleTagKeyDown}
									/>
									<Button
										type="button"
										variant="outline"
										onClick={handleAddTag}
									>
										Add Tag
									</Button>
								</div>
								<ErrorList errors={fields.tags.errors} />
							</div>
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
										{PRODUCT_STATUSES.map((status) => (
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
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
									<SelectContent>
										{loaderData.categories.map((category) => (
											<SelectItem key={category.id} value={category.id}>
												{category.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<ErrorList errors={fields.categoryId.errors} />
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Images Card */}
				<Card>
					<CardHeader>
						<CardTitle>Product Images</CardTitle>
						<CardDescription>Upload up to 10 images for your product</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-3">
							<Label>Images</Label>
							<ul className="flex flex-col gap-4">
								{fields.images.getFieldList().map((imageMeta, index) => {
									return (
										<li
											key={imageMeta.key}
											className="border-muted-foreground relative border-b-2"
										>
											<button
												className="text-foreground-destructive absolute top-0 right-0"
												{...form.remove.getButtonProps({
													name: fields.images.name,
													index,
												})}
											>
												<span aria-hidden>
													<Icon name="cross-1" />
												</span>{' '}
												<span className="sr-only">
													Remove image {index + 1}
												</span>
											</button>
											<ImageChooser
												meta={imageMeta as FieldMetadata<ImageFieldset>}
												objectKey={undefined}
											/>
										</li>
									)
								})}
							</ul>
						</div>
						<Button
							variant="outline"
							{...form.insert.getButtonProps({ name: fields.images.name })}
						>
							<span aria-hidden>
								<Icon name="plus">Image</Icon>
							</span>{' '}
							<span className="sr-only">Add image</span>
						</Button>
						<ErrorList errors={fields.images.errors} />
					</CardContent>
				</Card>

				{/* Product Variants Card */}
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
										className="absolute top-2 right-2 text-destructive z-10 hover:text-destructive/80"
										{...form.remove.getButtonProps({ name: fields.variants.name, index })}
									>
										<span aria-hidden>
											<Icon name="trash" className="h-4 w-4" />
										</span>
										<span className="sr-only">
											Remove variant {index + 1}
										</span>
									</button>
									<VariantRow meta={variantMeta} attributes={loaderData.attributes} />
								</div>
							))}
						</div>
						<Button
							variant="outline"
							className="mt-4"
							{...form.insert.getButtonProps({ 
								name: fields.variants.name,
								defaultValue: {
									sku: '',
									price: null,
									stockQuantity: 0,
									attributeValueIds: []
								}
							})}
						>
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Variant
						</Button>
						<ErrorList errors={fields.variants.errors} />
					</CardContent>
				</Card>

				<ErrorList id={form.errorId} errors={form.errors} />

				{/* Form Actions */}
				<div className="flex items-center justify-end space-x-4 pt-6">
					<Button asChild variant="outline" className="transition-all duration-200 hover:shadow-sm">
						<Link to="/admin/products">Cancel</Link>
					</Button>
					<StatusButton
						form={form.id}
						type="submit"
						disabled={isPending}
						status={isPending ? 'pending' : 'idle'}
						className="transition-all duration-200 hover:shadow-sm"
					>
						Create Product
					</StatusButton>
				</div>
			</Form>
		</div>
	)
}

/**
 * Props for the ImageChooser component
 * 
 * @property meta - Field metadata for the image
 * @property objectKey - Optional S3 object key for existing images
 */
interface ImageChooserProps {
	meta: FieldMetadata<ImageFieldset>
	objectKey?: string
}

/**
 * ImageChooser component for selecting and previewing product images
 * 
 * @param meta - Field metadata for the image fieldset
 * @param objectKey - Optional S3 object key for displaying existing images
 * @returns A form fieldset with image upload and alt text input
 */
function ImageChooser({ meta, objectKey }: ImageChooserProps) {
	const fields = meta.getFieldset()
	const existingImage = Boolean(fields.id.initialValue)
	const [previewImage, setPreviewImage] = useState<string | null>(
		objectKey ? getProductImgSrc(objectKey) : null,
	)
	const [altText, setAltText] = useState(fields.altText.initialValue ?? '')

	return (
		<fieldset {...getFieldsetProps(meta)}>
			<div className="flex gap-3">
				<div className="w-32">
					<div className="relative size-32">
						<label
							htmlFor={fields.file.id}
							className={cn('group absolute size-32 rounded-lg', {
								'bg-accent opacity-40 focus-within:opacity-100 hover:opacity-100':
									!previewImage,
								'cursor-pointer focus-within:ring-2': !existingImage,
							})}
						>
							{previewImage ? (
								<div className="relative">
									{existingImage && !previewImage.startsWith('data:') ? (
										<img
											src={previewImage}
											alt={altText ?? ''}
											className="size-32 rounded-lg object-cover"
											width={512}
											height={512}
										/>
									) : (
										<img
											src={previewImage}
											alt={altText ?? ''}
											className="size-32 rounded-lg object-cover"
										/>
									)}
									{existingImage ? null : (
										<div className="bg-secondary text-secondary-foreground pointer-events-none absolute -top-0.5 -right-0.5 rotate-12 rounded-sm px-2 py-1 text-xs shadow-md">
											new
										</div>
									)}
								</div>
							) : (
								<div className="border-muted-foreground text-muted-foreground flex size-32 items-center justify-center rounded-lg border text-4xl">
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
								aria-label="Image"
								className="absolute top-0 left-0 z-0 size-32 cursor-pointer opacity-0"
								onChange={(event) => {
									const file = event.target.files?.[0]

									if (file) {
										const reader = new FileReader()
										reader.onloadend = () => {
											setPreviewImage(reader.result as string)
										}
										reader.readAsDataURL(file)
									} else {
										setPreviewImage(null)
									}
								}}
								accept="image/*"
								{...getInputProps(fields.file, { type: 'file' })}
								key={fields.file.key}
							/>
						</label>
					</div>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList id={fields.file.errorId} errors={fields.file.errors} />
					</div>
				</div>
				<div className="flex-1">
					<Label htmlFor={fields.altText.id}>Alt Text</Label>
					<Textarea
						onChange={(e) => setAltText(e.currentTarget.value)}
						{...getInputProps(fields.altText, { type: 'text' })}
						key={fields.altText.key}
					/>
					<div className="min-h-[32px] px-4 pt-1 pb-3">
						<ErrorList
							id={fields.altText.errorId}
							errors={fields.altText.errors}
						/>
					</div>
				</div>
			</div>
			<div className="min-h-[32px] px-4 pt-1 pb-3">
				<ErrorList id={meta.errorId} errors={meta.errors} />
			</div>
		</fieldset>
	)
}

/**
 * Props for the VariantRow component
 * 
 * @property meta - Field metadata for the variant
 * @property attributes - Array of available product attributes with their values
 */
interface VariantRowProps {
	meta: FieldMetadata<VariantFieldset>
	attributes: Array<{
		id: string
		name: string
		values: Array<{ id: string; value: string }>
	}>
}

/**
 * VariantRow component for editing a single product variant
 * 
 * @param meta - Field metadata for the variant fieldset
 * @param attributes - Available product attributes with their values
 * @returns A form fieldset with variant information (SKU, price, stock, attributes)
 */
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
