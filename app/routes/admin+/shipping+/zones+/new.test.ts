/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action, loader } from './new.tsx'

// Helper to create an authenticated request
async function createAuthenticatedRequest(url: string, userId: string, method = 'GET'): Promise<Request> {
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
	})
}

describe('admin shipping zones new route', () => {
	let adminUserId: string

	beforeEach(async () => {
		const { user } = await createAdminUser()
		adminUserId = user.id
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.shippingMethod.deleteMany({})
		await prisma.shippingZone.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns empty data', async () => {
		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones/new',
			adminUserId,
		)

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).toEqual({})
	})

	test('action creates a new shipping zone', async () => {
		const formData = new FormData()
		formData.append('name', 'Test Zone')
		formData.append('description', 'Test description')
		formData.append('countries', 'FR, BE, DE')
		formData.append('displayOrder', '5')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones/new',
			adminUserId,
			'POST',
		)

		// Create a new request with form data
		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: {},
			context: {},
		})

		// Should redirect with success toast
		expect(result).toHaveProperty('headers')
		expect(result.headers.get('location')).toContain('/admin/shipping/zones/')

		// Verify zone was created
		const zones = await prisma.shippingZone.findMany({
			where: { name: 'Test Zone' },
		})
		expect(zones).toHaveLength(1)
		expect(zones[0].description).toBe('Test description')
		expect(zones[0].countries).toEqual(['FR', 'BE', 'DE'])
		expect(zones[0].displayOrder).toBe(5)
		expect(zones[0].isActive).toBe(true)
	})

	test('action validates required fields', async () => {
		const formData = new FormData()
		// Missing name

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('result')
		expect(result.result?.status).toBe('error')
	})

	test('action handles empty countries (all countries zone)', async () => {
		const formData = new FormData()
		formData.append('name', 'International Zone')
		formData.append('countries', '')
		formData.append('displayOrder', '10')
		formData.append('isActive', 'on')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones/new',
			adminUserId,
			'POST',
		)

		const requestWithFormData = new Request(request.url, {
			method: 'POST',
			headers: request.headers,
			body: formData,
		})

		const result = await action({
			request: requestWithFormData,
			params: {},
			context: {},
		})

		expect(result).toHaveProperty('headers')

		const zones = await prisma.shippingZone.findMany({
			where: { name: 'International Zone' },
		})
		expect(zones).toHaveLength(1)
		expect(zones[0].countries).toEqual([])
	})
})

