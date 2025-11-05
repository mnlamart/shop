import { useState, useEffect, useCallback } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { ScrollArea } from '#app/components/ui/scroll-area.tsx'

interface ImageCarouselDialogProps {
	images: Array<{ id: string; objectKey: string; altText: string | null }>
	initialIndex: number | null
	onClose: () => void
	productName: string
}

export function ProductImageCarouselDialog({
	images,
	initialIndex,
	onClose,
	productName,
}: ImageCarouselDialogProps) {
	const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0)

	const goToPrevious = useCallback(() => {
		setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
	}, [images.length])

	const goToNext = useCallback(() => {
		setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
	}, [images.length])

	const goToImage = useCallback((index: number) => {
		setCurrentIndex(index)
	}, [])

	// Update current index when initialIndex changes
	useEffect(() => {
		if (initialIndex !== null) {
			setCurrentIndex(initialIndex)
		}
	}, [initialIndex])

	// Keyboard navigation
	useEffect(() => {
		if (initialIndex === null) return

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			} else if (e.key === 'ArrowLeft') {
				e.preventDefault()
				goToPrevious()
			} else if (e.key === 'ArrowRight') {
				e.preventDefault()
				goToNext()
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [initialIndex, onClose, goToPrevious, goToNext])

	// Prevent body scroll when carousel is open
	useEffect(() => {
		if (initialIndex !== null) {
			document.body.style.overflow = 'hidden'
			return () => {
				document.body.style.overflow = ''
			}
		}
	}, [initialIndex])

	const getImageUrl = (objectKey: string) => {
		return `/resources/images?objectKey=${encodeURIComponent(objectKey)}`
	}

	if (initialIndex === null) return null

	const currentImage = images[currentIndex]
	if (!currentImage) return null

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
				style={{ animation: 'var(--animate-fade-in)' }}
				onClick={onClose}
			/>

			{/* Carousel Container */}
			<div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
				<div
					className="relative pointer-events-auto max-w-7xl w-full"
					style={{ animation: 'var(--animate-zoom-in-95)' }}
				>
					{/* Close Button */}
					<Button
						variant="ghost"
						size="icon"
						className="absolute -top-4 -right-4 z-50 bg-white hover:bg-gray-100 text-gray-900 rounded-full shadow-xl border-2 border-gray-200 h-10 w-10"
						onClick={onClose}
					>
						<Icon name="cross-1" className="w-5 h-5" />
					</Button>

					{/* Image Counter */}
					<div className="absolute -top-4 left-1/2 -translate-x-1/2 z-50 bg-white px-4 py-2 rounded-full shadow-xl border-2 border-gray-200">
						<span className="text-sm text-gray-700">
							{currentIndex + 1} / {images.length}
						</span>
					</div>

					{/* Main Carousel */}
					<div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg shadow-2xl p-12 pt-12 pb-4">
						{/* Main Image */}
						<div className="relative flex items-center justify-center mb-6">
							{/* Previous Button */}
							{images.length > 1 && (
								<Button
									variant="outline"
									size="icon"
									className="absolute left-4 bg-white hover:bg-gray-100 text-gray-900 border-2 border-gray-200 shadow-xl w-12 h-12 z-10"
									onClick={goToPrevious}
								>
									<Icon name="arrow-left" className="w-5 h-5" />
								</Button>
							)}

							{/* Image */}
							<div className="flex items-center justify-center">
								<img
									src={getImageUrl(currentImage.objectKey)}
									alt={currentImage.altText || `${productName} - Image ${currentIndex + 1}`}
									className="max-w-[65vw] max-h-[55vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
								/>
							</div>

							{/* Next Button */}
							{images.length > 1 && (
								<Button
									variant="outline"
									size="icon"
									className="absolute right-4 bg-white hover:bg-gray-100 text-gray-900 border-2 border-gray-200 shadow-xl w-12 h-12 z-10"
									onClick={goToNext}
								>
									<Icon name="arrow-right" className="w-5 h-5" />
								</Button>
							)}
						</div>

						{/* Thumbnail Carousel */}
						<div className="mt-6">
							<ScrollArea orientation="horizontal" className="w-full">
								<div className="flex gap-2 justify-center min-w-max py-3">
									{images.map((image, index) => (
										<button
											key={image.id}
											onClick={() => goToImage(index)}
											className={`relative w-20 h-20 rounded-lg overflow-hidden transition-all flex-shrink-0 ${
												index === currentIndex
													? 'ring-4 ring-primary ring-offset-2 ring-offset-gray-100 scale-105 shadow-lg'
													: 'ring-2 ring-gray-300 hover:ring-gray-400 opacity-60 hover:opacity-100'
											}`}
										>
											<img
												src={getImageUrl(image.objectKey)}
												alt={image.altText || `Thumbnail ${index + 1}`}
												className="w-full h-full object-cover"
											/>
										</button>
									))}
								</div>
							</ScrollArea>
						</div>
					</div>
				</div>
			</div>
		</>
	)
}

