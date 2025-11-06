import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import {
	getShippingZonesForCountry,
	getAvailableCarriersForCountry,
	getShippingMethodsForZone,
	getShippingMethodsForCountry,
	calculateShippingRate,
	getShippingCost,
	getShippingMethod,
} from './shipping.server.ts'

describe('shipping.server', () => {
	let franceZoneId: string
	let europeZoneId: string
	let mondialRelayCarrierId: string
	let standardMethodId: string
	let expressMethodId: string
	let freeShippingMethodId: string

	beforeEach(async () => {
		// Create shipping zones
		const franceZone = await prisma.shippingZone.create({
			data: {
				name: `Test France Zone ${Date.now()}`,
				description: 'France only',
				countries: ['FR'],
				isActive: true,
				displayOrder: 0,
			},
		})
		franceZoneId = franceZone.id

		const europeZone = await prisma.shippingZone.create({
			data: {
				name: `Test Europe Zone ${Date.now()}`,
				description: 'European Union',
				countries: ['FR', 'DE', 'IT', 'ES', 'BE'],
				isActive: true,
				displayOrder: 1,
			},
		})
		europeZoneId = europeZone.id

		// Create carrier
		const carrier = await prisma.carrier.create({
			data: {
				name: `test_mondial_relay_${Date.now()}`,
				displayName: 'Mondial Relay',
				description: 'Test carrier',
				availableCountries: ['FR'],
				availableZoneIds: [franceZoneId],
				hasApiIntegration: true,
				apiProvider: 'mondial_relay',
				isActive: true,
				displayOrder: 0,
			},
		})
		mondialRelayCarrierId = carrier.id

		// Create shipping methods
		const standardMethod = await prisma.shippingMethod.create({
			data: {
				carrierId: mondialRelayCarrierId,
				zoneId: franceZoneId,
				name: 'Standard Shipping',
				description: 'Standard delivery',
				rateType: 'FLAT',
				flatRate: 500, // €5.00 in cents
				isActive: true,
				displayOrder: 0,
				estimatedDays: 5,
			},
		})
		standardMethodId = standardMethod.id

		const expressMethod = await prisma.shippingMethod.create({
			data: {
				carrierId: mondialRelayCarrierId,
				zoneId: franceZoneId,
				name: 'Express Shipping',
				description: 'Express delivery',
				rateType: 'FLAT',
				flatRate: 1000, // €10.00 in cents
				isActive: true,
				displayOrder: 1,
				estimatedDays: 2,
			},
		})
		expressMethodId = expressMethod.id

		const freeMethod = await prisma.shippingMethod.create({
			data: {
				zoneId: europeZoneId,
				name: 'Free Shipping',
				description: 'Free shipping over €50',
				rateType: 'FREE',
				freeShippingThreshold: 5000, // €50.00 in cents
				flatRate: 700, // Fallback rate
				isActive: true,
				displayOrder: 2,
				estimatedDays: 7,
			},
		})
		freeShippingMethodId = freeMethod.id
	})

	afterEach(async () => {
		// Cleanup in reverse order
		await prisma.shippingMethod.deleteMany({})
		await prisma.carrier.deleteMany({})
		await prisma.shippingZone.deleteMany({})
	})

	describe('getShippingZonesForCountry', () => {
		test('should return zones containing the country', async () => {
			const zones = await getShippingZonesForCountry('FR')

			expect(zones.length).toBeGreaterThan(0)
			expect(zones.some((z) => z.id === franceZoneId)).toBe(true)
			expect(zones.some((z) => z.id === europeZoneId)).toBe(true)
		})

		test('should return empty array for country not in any zone', async () => {
			const zones = await getShippingZonesForCountry('US')

			expect(zones).toEqual([])
		})

		test('should only return active zones', async () => {
			// Create inactive zone
			await prisma.shippingZone.create({
				data: {
					name: `Test Inactive Zone ${Date.now()}`,
					countries: ['FR'],
					isActive: false,
					displayOrder: 10,
				},
			})

			const zones = await getShippingZonesForCountry('FR')

			expect(zones.every((z) => z.isActive)).toBe(true)
		})

		test('should be case-insensitive', async () => {
			const zones1 = await getShippingZonesForCountry('fr')
			const zones2 = await getShippingZonesForCountry('FR')

			expect(zones1).toHaveLength(zones2.length)
		})
	})

	describe('getAvailableCarriersForCountry', () => {
		test('should return carriers available for country', async () => {
			const carriers = await getAvailableCarriersForCountry('FR')

			expect(carriers.length).toBeGreaterThan(0)
			expect(carriers.some((c) => c.id === mondialRelayCarrierId)).toBe(true)
		})

		test('should check country-level availability', async () => {
			const carriers = await getAvailableCarriersForCountry('FR')

			const mondialRelay = carriers.find((c) => c.id === mondialRelayCarrierId)
			expect(mondialRelay).toBeDefined()
		})

		test('should check zone-level availability', async () => {
			// Create carrier available via zone
			const zoneCarrier = await prisma.carrier.create({
				data: {
					name: `test_zone_carrier_${Date.now()}`,
					displayName: 'Zone Carrier',
					availableCountries: [],
					availableZoneIds: [europeZoneId],
					isActive: true,
					displayOrder: 1,
				},
			})

			const carriers = await getAvailableCarriersForCountry('DE')

			expect(carriers.some((c) => c.id === zoneCarrier.id)).toBe(true)

			await prisma.carrier.delete({ where: { id: zoneCarrier.id } })
		})

		test('should only return active carriers', async () => {
			const inactiveCarrier = await prisma.carrier.create({
				data: {
					name: `test_inactive_${Date.now()}`,
					displayName: 'Inactive Carrier',
					availableCountries: ['FR'],
					availableZoneIds: [],
					isActive: false,
					displayOrder: 10,
				},
			})

			const carriers = await getAvailableCarriersForCountry('FR')

			expect(carriers.some((c) => c.id === inactiveCarrier.id)).toBe(false)

			await prisma.carrier.delete({ where: { id: inactiveCarrier.id } })
		})
	})

	describe('getShippingMethodsForZone', () => {
		test('should return methods for zone', async () => {
			const methods = await getShippingMethodsForZone(franceZoneId)

			expect(methods.length).toBeGreaterThan(0)
			expect(methods.some((m) => m.id === standardMethodId)).toBe(true)
			expect(methods.some((m) => m.id === expressMethodId)).toBe(true)
		})

		test('should include carrier information', async () => {
			const methods = await getShippingMethodsForZone(franceZoneId)

			const standardMethod = methods.find((m) => m.id === standardMethodId)
			expect(standardMethod?.carrier).toBeDefined()
			expect(standardMethod?.carrier?.id).toBe(mondialRelayCarrierId)
		})

		test('should only return active methods', async () => {
			const inactiveMethod = await prisma.shippingMethod.create({
				data: {
					zoneId: franceZoneId,
					name: 'Inactive Method',
					rateType: 'FLAT',
					flatRate: 300,
					isActive: false,
					displayOrder: 10,
				},
			})

			const methods = await getShippingMethodsForZone(franceZoneId)

			expect(methods.some((m) => m.id === inactiveMethod.id)).toBe(false)

			await prisma.shippingMethod.delete({ where: { id: inactiveMethod.id } })
		})

		test('should order by displayOrder', async () => {
			const methods = await getShippingMethodsForZone(franceZoneId)

			for (let i = 1; i < methods.length; i++) {
				expect(methods[i]?.displayOrder).toBeGreaterThanOrEqual(
					methods[i - 1]?.displayOrder ?? 0,
				)
			}
		})
	})

	describe('getShippingMethodsForCountry', () => {
		test('should return methods from all zones containing country', async () => {
			const methods = await getShippingMethodsForCountry('FR')

			expect(methods.length).toBeGreaterThan(0)
			expect(methods.some((m) => m.id === standardMethodId)).toBe(true)
			expect(methods.some((m) => m.id === freeShippingMethodId)).toBe(true)
		})

		test('should return empty array for country with no zones', async () => {
			const methods = await getShippingMethodsForCountry('US')

			expect(methods).toEqual([])
		})
	})

	describe('calculateShippingRate', () => {
		test('should calculate FLAT rate correctly', () => {
			const method = {
				rateType: 'FLAT',
				flatRate: 500,
				priceRates: null,
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 1000)

			expect(cost).toBe(500)
		})

		test('should return 0 for FLAT rate with null flatRate', () => {
			const method = {
				rateType: 'FLAT',
				flatRate: null,
				priceRates: null,
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 1000)

			expect(cost).toBe(0)
		})

		test('should calculate PRICE_BASED rate correctly', () => {
			const method = {
				rateType: 'PRICE_BASED',
				flatRate: null,
				priceRates: [
					{ minPrice: 0, maxPrice: 5000, rate: 500 },
					{ minPrice: 5001, maxPrice: 10000, rate: 1000 },
					{ minPrice: 10001, maxPrice: 999999, rate: 0 },
				],
				freeShippingThreshold: null,
			}

			expect(calculateShippingRate(method, 3000)).toBe(500)
			expect(calculateShippingRate(method, 7500)).toBe(1000)
			expect(calculateShippingRate(method, 15000)).toBe(0)
		})

		test('should return 0 for PRICE_BASED with no matching range', () => {
			const method = {
				rateType: 'PRICE_BASED',
				flatRate: null,
				priceRates: [{ minPrice: 0, maxPrice: 5000, rate: 500 }],
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 10000)

			expect(cost).toBe(0)
		})

		test('should calculate FREE rate with threshold met', () => {
			const method = {
				rateType: 'FREE',
				flatRate: 700,
				priceRates: null,
				freeShippingThreshold: 5000,
			}

			const cost = calculateShippingRate(method, 6000)

			expect(cost).toBe(0)
		})

		test('should calculate FREE rate with threshold not met', () => {
			const method = {
				rateType: 'FREE',
				flatRate: 700,
				priceRates: null,
				freeShippingThreshold: 5000,
			}

			const cost = calculateShippingRate(method, 3000)

			expect(cost).toBe(700)
		})

		test('should handle FREE rate without threshold', () => {
			const method = {
				rateType: 'FREE',
				flatRate: 700,
				priceRates: null,
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 1000)

			expect(cost).toBe(700)
		})

		test('should handle WEIGHT_BASED rate (fallback to flatRate)', () => {
			const method = {
				rateType: 'WEIGHT_BASED',
				flatRate: 500,
				priceRates: null,
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 1000)

			expect(cost).toBe(500)
		})

		test('should return 0 for unknown rate type', () => {
			const method = {
				rateType: 'UNKNOWN',
				flatRate: 500,
				priceRates: null,
				freeShippingThreshold: null,
			}

			const cost = calculateShippingRate(method, 1000)

			expect(cost).toBe(0)
		})
	})

	describe('getShippingCost', () => {
		test('should return cost for valid method', async () => {
			const cost = await getShippingCost(standardMethodId, 1000)

			expect(cost).toBe(500)
		})

		test('should return 0 for inactive method', async () => {
			const inactiveMethod = await prisma.shippingMethod.create({
				data: {
					zoneId: franceZoneId,
					name: 'Inactive Test Method',
					rateType: 'FLAT',
					flatRate: 500,
					isActive: false,
					displayOrder: 10,
				},
			})

			const cost = await getShippingCost(inactiveMethod.id, 1000)

			expect(cost).toBe(0)

			await prisma.shippingMethod.delete({ where: { id: inactiveMethod.id } })
		})

		test('should return 0 for non-existent method', async () => {
			const cost = await getShippingCost('non-existent-id', 1000)

			expect(cost).toBe(0)
		})

		test('should calculate FREE rate correctly', async () => {
			const costBelowThreshold = await getShippingCost(freeShippingMethodId, 3000)
			const costAboveThreshold = await getShippingCost(freeShippingMethodId, 6000)

			expect(costBelowThreshold).toBe(700) // Fallback rate
			expect(costAboveThreshold).toBe(0) // Free shipping
		})
	})

	describe('getShippingMethod', () => {
		test('should return method with carrier and zone', async () => {
			const method = await getShippingMethod(standardMethodId)

			expect(method).toBeDefined()
			expect(method?.id).toBe(standardMethodId)
			expect(method?.carrier).toBeDefined()
			expect(method?.zone).toBeDefined()
		})

		test('should return null for non-existent method', async () => {
			const method = await getShippingMethod('non-existent-id')

			expect(method).toBeNull()
		})

		test('should include carrier for carrier-based method', async () => {
			const method = await getShippingMethod(standardMethodId)

			expect(method?.carrier?.id).toBe(mondialRelayCarrierId)
		})

		test('should include zone information', async () => {
			const method = await getShippingMethod(standardMethodId)

			expect(method?.zone?.id).toBe(franceZoneId)
		})
	})
})

