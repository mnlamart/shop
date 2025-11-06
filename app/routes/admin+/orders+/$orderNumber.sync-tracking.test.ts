/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import * as trackingStatusServer from '#app/utils/tracking-status.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { action } from './$orderNumber.sync-tracking.ts'

// Mock the tracking status server
vi.mock('#app/utils/tracking-status.server.ts', () => ({
	syncOrderStatusFromTracking: vi.fn(),
}))

describe('admin order sync-tracking', () => {
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>

	beforeEach(async () => {
		testUser = await prisma.user.create({
			data: {
				email: `test-${Date.now()}@example.com`,
				username: `testuser-${Date.now()}`,
			},
		})

		// Create admin role and assign to user
		const adminRole = await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin' },
		})

		await prisma.user.update({
			where: { id: testUser.id },
			data: {
				roles: {
					connect: { id: adminRole.id },
				},
			},
		})

		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	test('syncs tracking status and updates order', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-SYNC-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				shippingCarrierName: 'Mondial Relay',
				mondialRelayShipmentNumber: 'MR123456789',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'SHIPPED',
			},
		})

		vi.mocked(trackingStatusServer.syncOrderStatusFromTracking).mockResolvedValueOnce({
			updated: true,
			newStatus: 'DELIVERED',
			message: 'Order status updated to DELIVERED based on tracking information',
		})

		// Create session in database
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		// Create auth session
		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('https://example.com/admin/orders/TEST/sync-tracking', {
			method: 'POST',
			headers: {
				Cookie: cookieHeader,
			},
		})

		const result = await action({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		expect(trackingStatusServer.syncOrderStatusFromTracking).toHaveBeenCalledWith(
			order.id,
			request,
		)

		const resultData = 'data' in result ? result.data : result
		expect(resultData).toHaveProperty('success', true)
		expect(resultData).toHaveProperty('updated', true)
		expect(resultData).toHaveProperty('newStatus', 'DELIVERED')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('returns info when tracking shows not yet delivered', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-NOT-DELIVERED-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				shippingCarrierName: 'Mondial Relay',
				mondialRelayShipmentNumber: 'MR123456789',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'SHIPPED',
			},
		})

		vi.mocked(trackingStatusServer.syncOrderStatusFromTracking).mockResolvedValueOnce({
			updated: false,
			message: 'Package not yet delivered. Status: En transit',
		})

		// Create session in database
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		// Create auth session
		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request('https://example.com/admin/orders/TEST/sync-tracking', {
			method: 'POST',
			headers: {
				Cookie: cookieHeader,
			},
		})

		const result = await action({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		const resultData = 'data' in result ? result.data : result
		expect(resultData).toHaveProperty('success', false)
		expect(resultData).toHaveProperty('updated', false)
		expect(resultData).toHaveProperty('message')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})
})

