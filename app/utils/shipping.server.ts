import { prisma } from './db.server.ts'

export async function getShippingZonesForCountry(country: string) {
	const zones = await prisma.shippingZone.findMany({
		where: {
			isActive: true,
		},
		orderBy: {
			displayOrder: 'asc',
		},
	})

	// countries is a JSON column of ISO country codes — filter in code since SQLite has no array ops.
	return zones.filter((zone) => {
		const countries = zone.countries as string[]
		return Array.isArray(countries) && countries.includes(country.toUpperCase())
	})
}

/**
 * Available carriers for a country, checking both country-level and zone-level availability.
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

	return carriers.filter((carrier) => {
		const availableCountries = carrier.availableCountries as string[]
		if (
			Array.isArray(availableCountries) &&
			availableCountries.includes(country.toUpperCase())
		) {
			return true
		}

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
 * Shipping methods from every zone that contains this country.
 */
export async function getShippingMethodsForCountry(country: string) {
	const zones = await getShippingZonesForCountry(country)
	const allMethods = await Promise.all(
		zones.map((zone) => getShippingMethodsForZone(zone.id)),
	)

	return allMethods.flat()
}

/**
 * Cost based on rate type. WEIGHT_BASED falls back to flatRate when weight is unknown
 * or no rate band matches. FREE checks freeShippingThreshold against subtotal.
 */
export function calculateShippingRate(
	method: {
		rateType: string
		flatRate: number | null
		weightRates: unknown
		priceRates: unknown
		freeShippingThreshold: number | null
	},
	subtotal: number,
	totalWeightGrams?: number,
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
			if (
				method.freeShippingThreshold &&
				subtotal >= method.freeShippingThreshold
			) {
				return 0
			}
			return method.flatRate ?? 0
		}

		case 'WEIGHT_BASED': {
			if (!method.weightRates || totalWeightGrams === undefined) {
				return method.flatRate ?? 0
			}
			const weightRates = method.weightRates as Array<{
				minWeightGrams: number
				maxWeightGrams: number | null
				rateCents: number
			}>
			const matchingRate = weightRates.find((rate) => {
				const inMinRange = totalWeightGrams >= rate.minWeightGrams
				const inMaxRange =
					rate.maxWeightGrams === null || totalWeightGrams <= rate.maxWeightGrams
				return inMinRange && inMaxRange
			})
			return matchingRate?.rateCents ?? method.flatRate ?? 0
		}

		default:
			return 0
	}
}

export async function getShippingCost(
	methodId: string,
	subtotal: number,
	totalWeightGrams?: number,
): Promise<number> {
	const method = await prisma.shippingMethod.findUnique({
		where: { id: methodId },
	})

	if (!method || !method.isActive) {
		return 0
	}

	return calculateShippingRate(method, subtotal, totalWeightGrams)
}

export async function getShippingMethod(methodId: string) {
	return prisma.shippingMethod.findUnique({
		where: { id: methodId },
		include: {
			carrier: true,
			zone: true,
		},
	})
}


