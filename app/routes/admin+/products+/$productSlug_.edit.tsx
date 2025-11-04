import { getFormProps, getInputProps, getTextareaProps, useForm, getFieldsetProps, type FieldMetadata } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4'
import { invariantResponse } from '@epic-web/invariant'
import { useRef, useState } from 'react'
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
import { type Route } from './+types/$productSlug_.edit.ts'

export { action } from './__edit.server.tsx'

/**
 * Loads product data for editing
 * 
 * @param params - Route parameters containing the product slug
 * @param request - HTTP request object
 * @returns Product data with all relations (images, variants, tags), categories, and attributes
 * @throws {invariantResponse} If product is not found (404)
 */
export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')

	// Get existing product with all relations
	const product = await prisma.product.findUnique({
		where: { slug: params.productSlug },
		include: {
			images: {
				orderBy: { displayOrder: 'asc' },
			},
			variants: {
				include: {
					attributeValues: {
						include: {
							attributeValue: {
								include: { attribute: true },
							},
						},
					},
				},
			},
			tags: {
				include: {
					tag: true,
				},
			},
		},
	})

	invariantResponse(product, 'Product not found', { status: 404 })

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
		product: {
			...product,
			price: Number(product.price),
			variants: product.variants.map(variant => ({
				...variant,
				price: variant.price ? Number(variant.price) : null,
				attributeValueIds: variant.attributeValues.map(av => av.attributeValueId),
			})),
		},
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
 * Generates metadata for the edit product page
 * 
 * @param data - Route data containing product information
 * @returns Array of meta tags for the page
 */
export const meta: Route.MetaFunction = ({ data }: any) => [
	{ title: `Edit ${data?.product.name} | Admin | Epic Shop` },
	{ name: 'description', content: `Edit product: ${data?.product.name}` },
]

/**
 * EditProduct component for editing product information
 * 
 * @param loaderData - Product data loaded from the loader function
 * @param actionData - Result data from form submissions
 * @returns React component with product edit form
 */
export default function EditProduct({ loaderData, actionData }: Route.ComponentProps) {
	const { product, categories, attributes } = loaderData
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'product-edit-form',
		constraint: getZodConstraint(productSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: productSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			id: product.id,
			name: product.name,
			slug: product.slug,
			description: product.description || '',
			sku: product.sku,
			price: product.price,
			status: product.status,
			categoryId: product.categoryId,
			tags: product.tags.map(pt => pt.tag.name),
			images: product.images.map(img => ({
				id: img.id,
				altText: img.altText,
			})),
			variants: product.variants.map(variant => ({
				id: variant.id,
				sku: variant.sku,
				price: variant.price,
				stockQuantity: variant.stockQuantity,
				attributeValueIds: variant.attributeValueIds,
			})),
		},
	})

	const newTagInputRef = useRef<HTMLInputElement>(null)
	const tags = fields.tags.getFieldList()
	const imageList = fields.images.getFieldList()
	const variantList = fields.variants.getFieldList()

	return (
		<div className="space-y-8 animate-slide-top">
			<div>
				<h1 className="text-2xl font-normal tracking-tight text-foreground">Edit Product</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Update product: {product.name}
				</p>
			</div>
			<Form
				method="POST"
				{...getFormProps(form)}
				encType="multipart/form-data"
				className="space-y-6"
			>
				<button type="submit" className="hidden" />
				<input type="hidden" name="id" value={product.id} />
				
				{/* Basic Information, Organization & Pricing Card */}
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Basic Information, Organization & Pricing</CardTitle>
						<CardDescription>Product details, status, categorization, and pricing information</CardDescription>
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
							<div className="space-y-2">
								<Label>Tags</Label>
								<div className="space-y-3">
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
									<div className="flex gap-2">
										<Input
											ref={newTagInputRef}
											placeholder="Enter tag name"
											className="flex-1"
											onKeyDown={(e) => {
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
											}}
										/>
										<Button
											type="button"
											variant="outline"
											onClick={() => {
												if (newTagInputRef.current?.value.trim()) {
													form.insert({
														name: fields.tags.name,
														defaultValue: newTagInputRef.current.value.trim(),
													})
													newTagInputRef.current.value = ''
												}
											}}
										>
											Add Tag
										</Button>
									</div>
									<ErrorList errors={fields.tags.errors} />
								</div>
							</div>
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

				{/* Product Images Card */}
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Product Images</CardTitle>
						<CardDescription>Upload up to 10 images for your product</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="space-y-3">
							<Label>Images</Label>
							<ul className="flex flex-col gap-4">
								{imageList.map((imageMeta, index) => {
									const image = imageMeta.getFieldset()
									const imageId = image.id.value
									const imageObj = product.images.find(img => img.id === imageId)
									const objectKey = imageObj?.objectKey
									
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
												objectKey={objectKey}
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
							<Icon name="plus" className="mr-2 h-4 w-4" />
							Add Image
						</Button>
						<ErrorList errors={fields.images.errors} />
					</CardContent>
				</Card>

				{/* Product Variants Card */}
				<Card className="rounded-[14px]">
					<CardHeader>
						<CardTitle className="text-base font-normal text-foreground">Product Variants</CardTitle>
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
									<VariantRow meta={variantMeta} attributes={attributes} />
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
						<Link to={`/admin/products/${product.slug}`}>Cancel</Link>
					</Button>
					<StatusButton
						form={form.id}
						type="submit"
						disabled={isPending}
						status={isPending ? 'pending' : 'idle'}
						className="transition-all duration-200 hover:shadow-sm"
					>
						Update Product
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

