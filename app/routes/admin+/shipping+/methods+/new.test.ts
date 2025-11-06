/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action, loader } from './new.tsx'

// Helper to create an authenticated request
async function createAuthenticatedRequest(
	url: string,
	userId: string,
	method = 'GET',
	formData?: FormData,
): Promise<Request> {
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
		method,
		headers: {
			Cookie: cookie,
		},
		body: formData,
	})
}

describe('admin shipping methods new route', () => {
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

	test('loader returns zones and carriers', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods/new',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('zones')
		expect(result).toHaveProperty('carriers')
		expect(result.zones).toHaveLength(1)
		expect(result.carriers).toHaveLength(1)
		expect(result.zones[0]?.id).toBe(zoneId)
		expect(result.carriers[0]?.id).toBe(carrierId)
	})

	test('action creates a new flat rate shipping method', async () => {
		const formData = new FormData()
		formData.append('name', 'Test Method')
		formData.append('description', 'Test description')
		formData.append('zoneId', zoneId)
		formData.append('carrierId', carrierId)
		formData.append('rateType', 'FLAT')
		formData.append('flatRate', '5.00')
		formData.append('displayOrder', '0')
		formData.append('estimatedDays', '5')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods/new',
			adminUserId,
			'POST',
			formData,
		)

		const result = await action({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}
		expect(result.headers.get('location')).toContain('/admin/shipping/methods/')

		// Verify method was created
		const methods = await prisma.shippingMethod.findMany({
			where: { name: 'Test Method' },
		})
		expect(methods).toHaveLength(1)
		expect(methods[0]?.description).toBe('Test description')
		expect(methods[0]?.zoneId).toBe(zoneId)
		expect(methods[0]?.carrierId).toBe(carrierId)
		expect(methods[0]?.rateType).toBe('FLAT')
		expect(methods[0]?.flatRate).toBe(500) // Converted to cents
		expect(methods[0]?.estimatedDays).toBe(5)
		expect(methods[0]?.isActive).toBe(true)
	})

	test('action creates a free shipping method', async () => {
		const formData = new FormData()
		formData.append('name', 'Free Shipping')
		formData.append('zoneId', zoneId)
		formData.append('rateType', 'FREE')
		formData.append('freeShippingThreshold', '50.00')
		formData.append('displayOrder', '0')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods/new',
			adminUserId,
			'POST',
			formData,
		)

		const result = await action({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}

		const methods = await prisma.shippingMethod.findMany({
			where: { name: 'Free Shipping' },
		})
		expect(methods).toHaveLength(1)
		expect(methods[0]?.rateType).toBe('FREE')
		expect(methods[0]?.freeShippingThreshold).toBe(5000) // Converted to cents
	})

	test('action validates required fields', async () => {
		const formData = new FormData()
		// Missing name and zoneId

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods/new',
			adminUserId,
			'POST',
			formData,
		)

		const result = await action({
			request,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('result')
		if (!('result' in result)) {
			throw new Error('Expected result to have result property')
		}
		expect(result.result?.status).toBe('error')
	})
})

