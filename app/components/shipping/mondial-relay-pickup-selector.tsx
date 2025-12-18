/**
 * Mondial Relay Pickup Point Selector Component
 * 
 * Allows users to search for and select a Mondial Relay pickup point (Point Relais®)
 */

import { useState, useMemo } from 'react'
import { useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { type PickupPoint } from '#app/utils/carriers/mondial-relay-api1.server.ts'

interface MondialRelayPickupSelectorProps {
	postalCode: string
	country: string
	city?: string
	selectedPickupPointId?: string
	onPickupPointSelect: (pickupPoint: PickupPoint | null) => void
	errors?: Array<string | null | undefined>
}

export function MondialRelayPickupSelector({
	postalCode,
	country,
	city,
	selectedPickupPointId,
	onPickupPointSelect,
	errors,
}: MondialRelayPickupSelectorProps) {
	const [searchPostalCode, setSearchPostalCode] = useState(postalCode)
	const [searchCity, setSearchCity] = useState(city || '')
	const [userSelectedPoint, setUserSelectedPoint] = useState<PickupPoint | null>(null)

	const pickupPointsFetcher = useFetcher<{
		pickupPoints?: PickupPoint[]
		error?: string
		message?: string
		details?: Array<{ path: string[]; message: string }>
	}>()

	// Derive selected point from props and fetcher data (replaces useEffect)
	// When selectedPickupPointId prop changes, find the matching point from fetched data
	const propSelectedPoint = useMemo(() => {
		if (selectedPickupPointId && pickupPointsFetcher.data?.pickupPoints) {
			return pickupPointsFetcher.data.pickupPoints.find(
				(p) => p.id === selectedPickupPointId,
			) || null
		}
		return null
	}, [selectedPickupPointId, pickupPointsFetcher.data?.pickupPoints])

	// Use prop-selected point if available, otherwise use user-selected point
	// This handles both prop-driven selection and user interaction
	const displaySelectedPoint = propSelectedPoint || userSelectedPoint

	// Call callback when prop-selected point changes (handled in event handlers, not render)
	const handlePointSelect = (point: PickupPoint | null) => {
		setUserSelectedPoint(point)
		onPickupPointSelect(point)
	}

	// Function to trigger search (replaces useEffect auto-search)
	const triggerSearch = () => {
		// Only search if we have a valid postal code (at least 2 characters) and country code
		if (
			searchPostalCode &&
			searchPostalCode.length >= 2 &&
			country &&
			country.length === 2
		) {
			const params = new URLSearchParams({
				postalCode: searchPostalCode,
				country: country.toUpperCase(),
			})
			if (searchCity) {
				params.append('city', searchCity)
			}
			pickupPointsFetcher.load(`/shop/checkout/pickup-points?${params.toString()}`).catch((error) => {
				// Error is handled by the fetcher's error state
				console.error('Failed to load pickup points:', error)
			})
		}
	}

	const pickupPoints = pickupPointsFetcher.data?.pickupPoints || []
	const isLoading = pickupPointsFetcher.state === 'loading'
	const hasError = pickupPointsFetcher.data?.error

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="pickup-search-postal">Search Pickup Points</Label>
				<div className="flex gap-2">
					<div className="flex-1">
						<Input
							id="pickup-search-postal"
							type="text"
							placeholder="Postal code (e.g., 75001)"
							value={searchPostalCode}
							onChange={(e) => setSearchPostalCode(e.target.value)}
							className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
						/>
					</div>
					{country === 'FR' && (
						<div className="flex-1">
							<Input
								type="text"
								placeholder="City (optional)"
								value={searchCity}
								onChange={(e) => setSearchCity(e.target.value)}
								className="transition-all duration-200 focus:ring-2 focus:ring-primary/20"
							/>
						</div>
					)}
					<Button
						type="button"
						variant="outline"
						onClick={triggerSearch}
						disabled={isLoading || !searchPostalCode || !country}
						className="transition-all duration-200"
					>
						<Icon name="magnifying-glass" className="h-4 w-4" />
					</Button>
				</div>
				<ErrorList errors={errors} />
			</div>

			{isLoading && (
				<div className="text-center py-4 text-muted-foreground">
					<Icon name="update" className="h-6 w-6 animate-spin mx-auto mb-2" />
					<p>Searching for pickup points...</p>
				</div>
			)}

			{hasError && (
				<div className="p-4 border border-destructive/50 rounded-lg bg-destructive/10">
					<p className="text-sm font-semibold text-destructive mb-1">
						{pickupPointsFetcher.data?.error || 'Failed to search pickup points'}
					</p>
					{pickupPointsFetcher.data?.message && (
						<p className="text-xs text-destructive/80">
							{pickupPointsFetcher.data.message}
						</p>
					)}
				</div>
			)}

			{!isLoading && !hasError && pickupPoints.length > 0 && (
				<div className="space-y-2 max-h-96 overflow-y-auto">
					{pickupPoints.map((point) => (
						<Card
							key={point.id}
							className={`cursor-pointer transition-all duration-200 ${
								displaySelectedPoint?.id === point.id
									? 'border-primary ring-2 ring-primary/20'
									: 'hover:border-primary/50'
							}`}
							onClick={() => handlePointSelect(point)}
						>
							<CardContent className="p-4">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2 mb-2">
											<h4 className="font-semibold">{point.name}</h4>
											{displaySelectedPoint?.id === point.id && (
												<Icon name="check" className="h-4 w-4 text-primary" />
											)}
										</div>
										<p className="text-sm text-muted-foreground mb-1">{point.address}</p>
										<p className="text-sm text-muted-foreground">
											{point.postalCode} {point.city}, {point.country}
										</p>
										{point.distance && (
											<p className="text-xs text-muted-foreground mt-1">
												{point.distance}m away
											</p>
										)}
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{!isLoading && !hasError && pickupPoints.length === 0 && searchPostalCode && (
				<div className="text-center py-8 text-muted-foreground">
					<p>No pickup points found for this location.</p>
					<p className="text-sm mt-2">Try a different postal code or city.</p>
				</div>
			)}

			{displaySelectedPoint && (
				<div className="p-4 border rounded-lg bg-muted/50">
					<div className="flex items-start justify-between">
						<div>
							<p className="font-semibold text-sm mb-1">Selected Pickup Point</p>
							<p className="text-sm">{displaySelectedPoint.name}</p>
							<p className="text-xs text-muted-foreground">
								{displaySelectedPoint.address}, {displaySelectedPoint.postalCode} {displaySelectedPoint.city}
							</p>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => handlePointSelect(null)}
							className="transition-all duration-200"
						>
							<Icon name="cross-1" className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

