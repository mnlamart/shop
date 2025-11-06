import { prisma } from './db.server.ts'

/**
 * Get shipping zones that contain the given country
 */
export async function getShippingZonesForCountry(country: string) {
	const zones = await prisma.shippingZone.findMany({
		where: {
			isActive: true,
		},
		orderBy: {
			displayOrder: 'asc',
		},
	})

	// Filter zones that contain this country
	// countries is stored as JSON array
	return zones.filter((zone) => {
		const countries = zone.countries as string[]
		return Array.isArray(countries) && countries.includes(country.toUpperCase())
	})
}

/**
 * Get available carriers for a given country
 * Checks both country-level and zone-level availability
 */
export async function getAvailableCarriersForCountry(country: string) {
	const zones = await getShippingZonesForCountry(country)
	const zoneIds = zones.map((z) => z.id)

	const carriers = await prisma.carrier.findMany({
		where: {
			isActive: true,
		},
		orderBy: {
			displayOrder: 'asc',
		},
	})

	// Filter carriers available for this country
	return carriers.filter((carrier) => {
		// Check country-level availability
		const availableCountries = carrier.availableCountries as string[]
		if (
			Array.isArray(availableCountries) &&
			availableCountries.includes(country.toUpperCase())
		) {
			return true
		}

		// Check zone-level availability
		const availableZoneIds = carrier.availableZoneIds as string[]
		if (
			Array.isArray(availableZoneIds) &&
			availableZoneIds.some((zoneId) => zoneIds.includes(zoneId))
		) {
			return true
		}

		return false
	})
}

/**
 * Get shipping methods available for a given zone
 */
export async function getShippingMethodsForZone(zoneId: string) {
	return prisma.shippingMethod.findMany({
		where: {
			zoneId,
			isActive: true,
		},
		include: {
			carrier: {
				select: {
					id: true,
					name: true,
					displayName: true,
					apiProvider: true,
					hasApiIntegration: true,
				},
			},
		},
		orderBy: {
			displayOrder: 'asc',
		},
	})
}

/**
 * Get all available shipping methods for a country
 * Returns methods from all zones that contain this country
 */
export async function getShippingMethodsForCountry(country: string) {
	const zones = await getShippingZonesForCountry(country)
	const allMethods = await Promise.all(
		zones.map((zone) => getShippingMethodsForZone(zone.id)),
	)

	return allMethods.flat()
}

/**
 * Calculate shipping cost for a method based on order subtotal
 */
export function calculateShippingRate(
	method: {
		rateType: string
		flatRate: number | null
		priceRates: unknown
		freeShippingThreshold: number | null
	},
	subtotal: number,
): number {
	switch (method.rateType) {
		case 'FLAT':
			return method.flatRate ?? 0

		case 'PRICE_BASED': {
			if (!method.priceRates) return 0
			const priceRates = method.priceRates as Array<{
				minPrice: number
				maxPrice: number
				rate: number
			}>
			const matchingRate = priceRates.find(
				(rate) => subtotal >= rate.minPrice && subtotal <= rate.maxPrice,
			)
			return matchingRate?.rate ?? 0
		}

		case 'FREE': {
			// If threshold is set and order meets it, shipping is free
			if (
				method.freeShippingThreshold &&
				subtotal >= method.freeShippingThreshold
			) {
				return 0
			}
			// Otherwise use flat rate if available
			return method.flatRate ?? 0
		}

		case 'WEIGHT_BASED':
			// TODO: Implement weight-based calculation when product weights are added
			return method.flatRate ?? 0

		default:
			return 0
	}
}

/**
 * Get shipping cost for a specific method ID
 */
export async function getShippingCost(
	methodId: string,
	subtotal: number,
): Promise<number> {
	const method = await prisma.shippingMethod.findUnique({
		where: { id: methodId },
	})

	if (!method || !method.isActive) {
		return 0
	}

	return calculateShippingRate(method, subtotal)
}

/**
 * Get a shipping method by ID with full details
 */
export async function getShippingMethod(methodId: string) {
	return prisma.shippingMethod.findUnique({
		where: { id: methodId },
		include: {
			carrier: true,
			zone: true,
		},
	})
}

