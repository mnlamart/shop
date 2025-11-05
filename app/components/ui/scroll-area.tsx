import * as React from 'react'
import { cn } from '#app/utils/misc.tsx'

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
	orientation?: 'horizontal' | 'vertical'
}

export function ScrollArea({
	className,
	orientation = 'vertical',
	children,
	...props
}: ScrollAreaProps) {
	const viewportRef = React.useRef<HTMLDivElement>(null)
	const [isScrollable, setIsScrollable] = React.useState(false)

	React.useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport) return

		const checkScrollable = () => {
			if (orientation === 'horizontal') {
				setIsScrollable(viewport.scrollWidth > viewport.clientWidth)
			} else {
				setIsScrollable(viewport.scrollHeight > viewport.clientHeight)
			}
		}

		checkScrollable()
		
		// Check on resize
		const resizeObserver = new ResizeObserver(checkScrollable)
		resizeObserver.observe(viewport)

		return () => {
			resizeObserver.disconnect()
		}
	}, [orientation, children])

	return (
		<div
			data-slot="scroll-area"
			className={cn('relative overflow-hidden', className)}
			{...props}
		>
			<div
				ref={viewportRef}
				data-slot="scroll-area-viewport"
				className={cn(
					'h-full w-full rounded-[inherit]',
					orientation === 'horizontal' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden',
					!isScrollable && 'overflow-hidden',
				)}
				style={
					isScrollable
						? {
								scrollbarWidth: 'thin',
								scrollbarColor: '#d1d5db #f3f4f6',
							}
						: {}
				}
			>
				{children}
			</div>
		</div>
	)
}

