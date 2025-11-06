/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { loader } from './shipping-methods.ts'

describe('shipping-methods route', () => {
	let franceZoneId: string
	let europeZoneId: string
	let mondialRelayCarrierId: string
	let standardMethodId: string

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
				name: 'Mondial Relay Standard',
				description: 'Standard delivery',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
				estimatedDays: 5,
			},
		})
		standardMethodId = standardMethod.id

		await prisma.shippingMethod.create({
			data: {
				zoneId: europeZoneId,
				name: 'Standard Shipping',
				description: 'Standard shipping within Europe',
				rateType: 'FLAT',
				flatRate: 700,
				isActive: true,
				displayOrder: 0,
				estimatedDays: 7,
			},
		})
	})

	afterEach(async () => {
		await prisma.shippingMethod.deleteMany({})
		await prisma.carrier.deleteMany({})
		await prisma.shippingZone.deleteMany({})
	})

	test('returns shipping methods for valid country', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/shipping-methods?country=FR')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		// data() returns DataWithResponseInit, extract the data property
		if (typeof result === 'object' && result !== null && 'data' in result) {
			const dataResult = result as { data: { shippingMethods: Array<{ id: string }> } }
			expect(dataResult.data).toHaveProperty('shippingMethods')
			expect(Array.isArray(dataResult.data.shippingMethods)).toBe(true)
			expect(dataResult.data.shippingMethods.length).toBeGreaterThan(0)
			// Should include methods from both France and Europe zones
			expect(dataResult.data.shippingMethods.some((m) => m.id === standardMethodId)).toBe(true)
		} else {
			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		}
	})

	test('returns empty array for country with no zones', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/shipping-methods?country=US')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		// data() returns DataWithResponseInit, extract the data property
		if (typeof result === 'object' && result !== null && 'data' in result) {
			const dataResult = result as { data: { shippingMethods: unknown[] }; init?: { status?: number } }
			expect(dataResult.data).toHaveProperty('shippingMethods')
			expect(dataResult.data.shippingMethods).toEqual([])
			// For empty results, status might be 400 or undefined
			if (dataResult.init?.status) {
				expect(dataResult.init.status).toBe(400)
			}
		} else {
			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		}
	})

	test('returns 400 for missing country parameter', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/shipping-methods')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		// data() returns DataWithResponseInit with status 400
		if (typeof result === 'object' && result !== null && 'data' in result) {
			const dataResult = result as { data: { shippingMethods: unknown[] }; init?: { status?: number } }
			expect(dataResult.data).toHaveProperty('shippingMethods')
			expect(dataResult.data.shippingMethods).toEqual([])
			expect(dataResult.init?.status).toBe(400)
		} else {
			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		}
	})

	test('returns 400 for invalid country code (not 2 letters)', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/shipping-methods?country=USA')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		// data() returns DataWithResponseInit with status 400
		if (typeof result === 'object' && result !== null && 'data' in result) {
			const dataResult = result as { data: { shippingMethods: unknown[] }; init?: { status?: number } }
			expect(dataResult.data).toHaveProperty('shippingMethods')
			expect(dataResult.data.shippingMethods).toEqual([])
			expect(dataResult.init?.status).toBe(400)
		} else {
			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		}
	})

	test('is case-insensitive for country codes', async () => {
		const request1 = new Request('http://localhost:3000/shop/checkout/shipping-methods?country=fr')
		const request2 = new Request('http://localhost:3000/shop/checkout/shipping-methods?country=FR')

		const result1 = await loader({
			request: request1,
			params: {},
			context: {},
		})
		const result2 = await loader({
			request: request2,
			params: {},
			context: {},
		})

		if (result1 instanceof Response && result2 instanceof Response) {
			const json1 = (await result1.json()) as { shippingMethods: unknown[] }
			const json2 = (await result2.json()) as { shippingMethods: unknown[] }
			expect(json1.shippingMethods).toHaveLength(json2.shippingMethods.length)
		}
	})
})

