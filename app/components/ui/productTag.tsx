import { getInputProps, type FieldMetadata } from '@conform-to/react'
import { Badge, type BadgeProps } from './badge'
import { Button } from './button'
import { Icon } from './icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

/**
 * Props for the ProductTag component
 */
type ProductTagProps = BadgeProps & {
	tag: FieldMetadata<string>
	removeButtonProps: React.ButtonHTMLAttributes<HTMLButtonElement>
	hasError?: boolean
	errorMessage?: string
}

/**
 * ProductTag component for displaying and managing product tags with validation
 * 
 * @param props - Component props including tag field, remove button props, error handling
 * @returns A badge-style component with tag value and remove button
 */
const ProductTag = ({
	tag,
	removeButtonProps,
	hasError,
	errorMessage,
	className,
	...rest
}: ProductTagProps) => {
	return (
		<Badge 
			className={className} 
			{...rest}
		>
			<input
				{...getInputProps(tag, { type: 'hidden' })}
			/>
			{hasError && errorMessage && (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Icon name="question-mark-circled" className="size-3 mr-1 text-white bg-destructive rounded-full cursor-help" />
						</TooltipTrigger>
						<TooltipContent>
							<p>{errorMessage}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}
			{tag.defaultValue}
			<Button
				variant="ghost"
				size="icon"
				className="size-5 ml-1"
				aria-label="Remove tag"
				{...removeButtonProps}
			>
				<Icon name="trash" className="size-3" />
			</Button>
		</Badge>
	)
}

export default ProductTag