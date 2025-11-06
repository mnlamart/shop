/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { loader } from './index.tsx'

// Helper to create an authenticated request
async function createAuthenticatedRequest(url: string, userId: string): Promise<Request> {
	const session = await prisma.session.create({
		data: {
			userId,
			expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
		},
	})

	const authSession = await authSessionStorage.getSession()
	authSession.set('sessionId', session.id)
	const cookie = await authSessionStorage.commitSession(authSession)

	return new Request(url, {
		headers: {
			Cookie: cookie,
		},
	})
}

describe('admin shipping methods index route', () => {
	let adminUserId: string
	let zoneId: string
	let carrierId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id

		const zone = await prisma.shippingZone.create({
			data: {
				name: 'Test Zone',
				countries: ['FR'],
				isActive: true,
				displayOrder: 0,
			},
		})
		zoneId = zone.id

		const carrier = await prisma.carrier.create({
			data: {
				name: `test_carrier_${Date.now()}`,
				displayName: 'Test Carrier',
				availableCountries: ['FR'],
				availableZoneIds: [zoneId],
				isActive: true,
				displayOrder: 0,
			},
		})
		carrierId = carrier.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.shippingMethod.deleteMany({})
		await prisma.carrier.deleteMany({})
		await prisma.shippingZone.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns all shipping methods', async () => {
		const method1 = await prisma.shippingMethod.create({
			data: {
				zoneId,
				carrierId,
				name: 'Method 1',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		const method2 = await prisma.shippingMethod.create({
			data: {
				zoneId,
				name: 'Method 2',
				rateType: 'FLAT',
				flatRate: 700,
				isActive: true,
				displayOrder: 1,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('methods')
		expect(result.methods).toHaveLength(2)
		expect(result.methods[0]).toHaveProperty('id')
		expect(result.methods[0]).toHaveProperty('name')
		expect(result.methods[0]).toHaveProperty('carrier')
		expect(result.methods[0]).toHaveProperty('zone')
		expect(result.methods[0]).toHaveProperty('_count')
		expect(result.methods[0].carrier?.displayName).toBe('Test Carrier')
		expect(result.methods[1].carrier).toBeNull() // Generic method
	})

	test('loader returns methods ordered by zone displayOrder, then method displayOrder, then name', async () => {
		const zone2 = await prisma.shippingZone.create({
			data: {
				name: 'Zone 2',
				countries: ['DE'],
				isActive: true,
				displayOrder: 1,
			},
		})

		// Create methods in different zones with different display orders
		await prisma.shippingMethod.create({
			data: {
				zoneId: zone2.id,
				name: 'Zone 2 Method',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		await prisma.shippingMethod.create({
			data: {
				zoneId,
				name: 'Zone 1 Method B',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 1,
			},
		})

		await prisma.shippingMethod.create({
			data: {
				zoneId,
				name: 'Zone 1 Method A',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.methods).toHaveLength(3)
		expect(result.methods[0].name).toBe('Zone 1 Method A') // Zone 1, displayOrder 0
		expect(result.methods[1].name).toBe('Zone 1 Method B') // Zone 1, displayOrder 1
		expect(result.methods[2].name).toBe('Zone 2 Method') // Zone 2, displayOrder 0
	})
})

