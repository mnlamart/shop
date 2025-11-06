/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createAdminUser } from '#tests/user-utils.ts'
import { action } from './$methodId.delete.ts'

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

describe('admin shipping methods delete route', () => {
	let adminUserId: string
	let zoneId: string

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
	})

	afterEach(async () => {
		await prisma.session.deleteMany({})
		await prisma.order.deleteMany({})
		await prisma.shippingMethod.deleteMany({})
		await prisma.carrier.deleteMany({})
		await prisma.shippingZone.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('action deletes a shipping method', async () => {
		const method = await prisma.shippingMethod.create({
			data: {
				zoneId,
				name: 'Test Method to Delete',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
			},
		})

		const formData = new FormData()
		formData.append('methodId', method.id)

		const request = await createAuthenticatedRequest(
			`http://localhost:3000/admin/shipping/methods/${method.id}/delete`,
			adminUserId,
			'POST',
			formData,
		)

		const result = await action({
			request,
			params: { methodId: method.id },
			context: {},
		})

		expect(result).toHaveProperty('headers')
		if (!('headers' in result)) {
			throw new Error('Expected result to have headers')
		}
		expect(result.headers.get('location')).toBe('/admin/shipping/methods')

		// Verify method was deleted
		const deletedMethod = await prisma.shippingMethod.findUnique({
			where: { id: method.id },
		})
		expect(deletedMethod).toBeNull()
	})

	test('action returns 404 for non-existent method', async () => {
		const formData = new FormData()
		formData.append('methodId', 'non-existent-id')

		const request = await createAuthenticatedRequest(
			'http://localhost:3000/admin/shipping/methods/non-existent-id/delete',
			adminUserId,
			'POST',
			formData,
		)

		await expect(
			action({
				request,
				params: { methodId: 'non-existent-id' },
				context: {},
			}),
		).rejects.toThrow()
	})
})

