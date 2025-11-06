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

describe('admin shipping zones index route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.shippingMethod.deleteMany({})
		await prisma.carrier.deleteMany({})
		await prisma.shippingZone.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns all shipping zones', async () => {
		// Create test zones
		const zone1 = await prisma.shippingZone.create({
			data: {
				name: 'Test Zone 1',
				description: 'Test description 1',
				countries: ['FR', 'BE'],
				isActive: true,
				displayOrder: 0,
			},
		})

		const zone2 = await prisma.shippingZone.create({
			data: {
				name: 'Test Zone 2',
				description: 'Test description 2',
				countries: ['DE', 'IT'],
				isActive: true,
				displayOrder: 1,
			},
		})

		// Create a method for zone1 to test count
		await prisma.shippingMethod.create({
			data: {
				zoneId: zone1.id,
				name: 'Test Method',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('zones')
		expect(result.zones).toHaveLength(2)
		expect(result.zones[0]).toHaveProperty('id')
		expect(result.zones[0]).toHaveProperty('name')
		expect(result.zones[0]).toHaveProperty('countries')
		expect(result.zones[0]).toHaveProperty('_count')
		expect(result.zones[0]._count.methods).toBe(1)
		expect(result.zones[1]._count.methods).toBe(0)
	})

	test('loader returns zones ordered by displayOrder then name', async () => {
		await prisma.shippingZone.create({
			data: {
				name: 'Zone B',
				countries: ['FR'],
				isActive: true,
				displayOrder: 1,
			},
		})

		await prisma.shippingZone.create({
			data: {
				name: 'Zone A',
				countries: ['DE'],
				isActive: true,
				displayOrder: 0,
			},
		})

		await prisma.shippingZone.create({
			data: {
				name: 'Zone C',
				countries: ['IT'],
				isActive: true,
				displayOrder: 1,
			},
		})

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result.zones).toHaveLength(3)
		expect(result.zones[0].name).toBe('Zone A') // displayOrder 0
		expect(result.zones[1].name).toBe('Zone B') // displayOrder 1, alphabetically first
		expect(result.zones[2].name).toBe('Zone C') // displayOrder 1, alphabetically second
	})
})

