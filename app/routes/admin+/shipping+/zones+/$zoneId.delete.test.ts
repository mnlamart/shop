/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action } from './$zoneId.delete.ts'

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

describe('admin shipping zones delete route', () => {
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

	test('action deletes a shipping zone', async () => {
		const zone = await prisma.shippingZone.create({
			data: {
				name: 'Test Zone to Delete',
				countries: ['FR'],
				isActive: true,
				displayOrder: 0,
			},
		})

		const formData = new FormData()
		formData.append('zoneId', zone.id)

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/shipping/zones/${zone.id}/delete`,
			adminUserId,
			'POST',
			formData,
		)

		const result = await action({
			request,
			params: { zoneId: zone.id },
			context: {},
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}
		expect(result.headers.get('location')).toBe('/admin/shipping/zones')

		// Verify zone was deleted
		const deletedZone = await prisma.shippingZone.findUnique({
			where: { id: zone.id },
		})
		expect(deletedZone).toBeNull()
	})

	test('action deletes zone and cascades to methods', async () => {
		const zone = await prisma.shippingZone.create({
			data: {
				name: 'Test Zone with Methods',
				countries: ['FR'],
				isActive: true,
				displayOrder: 0,
			},
		})

		const method = await prisma.shippingMethod.create({
			data: {
				zoneId: zone.id,
				name: 'Test Method',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		const formData = new FormData()
		formData.append('zoneId', zone.id)

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/shipping/zones/${zone.id}/delete`,
			adminUserId,
			'POST',
			formData,
		)

		await action({
			request,
			params: { zoneId: zone.id },
			context: {},
		})

		// Verify zone was deleted
		const deletedZone = await prisma.shippingZone.findUnique({
			where: { id: zone.id },
		})
		expect(deletedZone).toBeNull()

		// Verify method was cascade deleted
		const deletedMethod = await prisma.shippingMethod.findUnique({
			where: { id: method.id },
		})
		expect(deletedMethod).toBeNull()
	})

	test('action returns 404 for non-existent zone', async () => {
		const formData = new FormData()
		formData.append('zoneId', 'non-existent-id')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/zones/non-existent-id/delete',
			adminUserId,
			'POST',
			formData,
		)

		await expect(
			action({
				request,
				params: { zoneId: 'non-existent-id' },
				context: {},
			}),
		).rejects.toThrow()
	})
})

