import { useState, useRef, useEffect, useCallback } from 'react'
import { ProductImageCarouselDialog } from '#app/components/product-image-carousel-dialog.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

interface ImageScrollAreaProps {
	images: Array<{ id: string; objectKey: string; altText: string | null }>
	productName: string
}

export function ProductImageScrollArea({ images, productName }: ImageScrollAreaProps) {
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const [showLeftArrow, setShowLeftArrow] = useState(false)
	const [showRightArrow, setShowRightArrow] = useState(false)
	const [isScrollable, setIsScrollable] = useState(false)
	const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

	const checkScrollability = useCallback(() => {
		if (scrollContainerRef.current) {
			const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
			const canScroll = scrollWidth > clientWidth
			setIsScrollable(canScroll)
			setShowLeftArrow(canScroll && scrollLeft > 0)
			setShowRightArrow(canScroll && scrollLeft < scrollWidth - clientWidth - 10)
		}
	}, [])

	useEffect(() => {
		const container = scrollContainerRef.current
		if (!container) return

		// Initial check
		checkScrollability()

		// Check on resize
		const resizeObserver = new ResizeObserver(checkScrollability)
		resizeObserver.observe(container)

		return () => {
			resizeObserver.disconnect()
		}
	}, [images, checkScrollability])

	const scroll = (direction: 'left' | 'right') => {
		if (scrollContainerRef.current) {
			const scrollAmount = 400
			const newScrollLeft =
				scrollContainerRef.current.scrollLeft +
				(direction === 'left' ? -scrollAmount : scrollAmount)
			scrollContainerRef.current.scrollTo({
				left: newScrollLeft,
				behavior: 'smooth',
			})
		}
	}

	const handleScroll = useCallback(() => {
		checkScrollability()
	}, [checkScrollability])

	const getImageUrl = (objectKey: string) => {
		return `/resources/images?objectKey=${encodeURIComponent(objectKey)}`
	}

	return (
		<div className="relative">
			{/* Left Scroll Button */}
			{isScrollable && showLeftArrow && (
				<div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
					<div className="bg-gradient-to-r from-white via-white to-transparent w-16 h-full absolute"></div>
					<Button
						variant="outline"
						size="icon"
						className="ml-2 relative z-10 bg-white shadow-md hover:bg-gray-50 h-8 w-8"
						onClick={() => scroll('left')}
					>
						<Icon name="arrow-left" className="h-4 w-4" />
					</Button>
				</div>
			)}

			{/* Right Scroll Button */}
			{isScrollable && showRightArrow && (
				<div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-end">
					<div className="bg-gradient-to-l from-white via-white to-transparent w-16 h-full absolute"></div>
					<Button
						variant="outline"
						size="icon"
						className="mr-2 relative z-10 bg-white shadow-md hover:bg-gray-50 h-8 w-8"
						onClick={() => scroll('right')}
					>
						<Icon name="arrow-right" className="h-4 w-4" />
					</Button>
				</div>
			)}

			{/* Scrollable Image Container */}
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="overflow-x-auto pb-2"
				style={{
					scrollbarWidth: 'thin',
					scrollbarColor: '#d1d5db #f3f4f6',
				}}
			>
				<div className="flex gap-3 min-w-min">
					{images.map((image, index) => (
						<div
							key={image.id}
							className="relative flex-shrink-0 w-28 h-28 rounded-lg border-2 border-[#D1D5DC] overflow-hidden bg-gray-50 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
							onClick={() => setSelectedImageIndex(index)}
						>
							<img
								src={getImageUrl(image.objectKey)}
								alt={image.altText || `${productName} - Image ${index + 1}`}
								className="w-full h-full object-cover"
							/>
							<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
								<Icon
									name="magnifying-glass"
									className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity"
								/>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Image Carousel Dialog */}
			<ProductImageCarouselDialog
				images={images}
				initialIndex={selectedImageIndex}
				onClose={() => setSelectedImageIndex(null)}
				productName={productName}
			/>
		</div>
	)
}

