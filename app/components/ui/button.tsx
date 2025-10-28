import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#app/utils/misc.tsx'

/**
 * Button variant styles using class-variance-authority
 */
const buttonVariants = cva(
	'ring-ring ring-offset-background inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-2 outline-hidden transition-colors focus-within:ring-2 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/80',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/80',
				outline:
					'border-input bg-background hover:bg-accent hover:text-accent-foreground border',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-10 px-4 py-2',
				wide: 'px-24 py-5',
				sm: 'h-9 rounded-md px-3',
				lg: 'h-11 rounded-md px-8',
				pill: 'px-12 py-3 leading-3',
				icon: 'size-10',
				iconSmall: 'size-5'
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

/**
 * Type for button variant props
 */
export type ButtonVariant = VariantProps<typeof buttonVariants>

/**
 * Button component with multiple variants and sizes
 * 
 * @param props - Button props including React button props and variant props
 * @param props.asChild - If true, renders as a Slot (polymorphic component)
 * @param props.variant - Button style variant (default, destructive, outline, etc.)
 * @param props.size - Button size (default, wide, sm, lg, pill, icon, iconSmall)
 * @param props.className - Additional CSS classes
 * @returns A button element with applied variant styles
 */
const Button = ({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<'button'> &
	ButtonVariant & {
		asChild?: boolean
	}) => {
	const Comp = asChild ? Slot : 'button'
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

export { Button, buttonVariants }
