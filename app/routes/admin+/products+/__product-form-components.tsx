import {
	getFieldsetProps,
	getInputProps,
	type FieldMetadata,
} from '@conform-to/react'
import { useState } from 'react'
import { ErrorList } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import { type ImageFieldset, type VariantFieldset } from '#app/schemas/product.ts'
import { cn, getProductImgSrc } from '#app/utils/misc.tsx'

interface ImageChooserProps {
	meta: FieldMetadata<ImageFieldset>
	objectKey?: string
}

export function ImageChooser({ meta, objectKey }: ImageChooserProps) {
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

interface VariantRowProps {
	meta: FieldMetadata<VariantFieldset>
	attributes: Array<{
		id: string
		name: string
		values: Array<{ id: string; value: string }>
	}>
}

export function VariantRow({ meta, attributes }: VariantRowProps) {
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
								<SelectTrigger aria-label={`Select ${attr.name}`}>
									<SelectValue placeholder={`Select ${attr.name} (optional)`} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No {attr.name}</SelectItem>
									{attr.values.map((val) => (
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
