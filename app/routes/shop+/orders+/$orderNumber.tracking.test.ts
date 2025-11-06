/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import * as trackingServer from '#app/utils/tracking.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { loader } from './$orderNumber.tracking.ts'

// Mock the tracking server
vi.mock('#app/utils/tracking.server.ts', () => ({
	getMondialRelayTrackingInfo: vi.fn(),
}))

describe('tracking route', () => {
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>

	beforeEach(async () => {
		testUser = await prisma.user.create({
			data: {
				email: `test-${Date.now()}@example.com`,
				username: `testuser-${Date.now()}`,
			},
		})
		consoleError.mockImplementation(() => {})
	})

	afterEach(async () => {
		await prisma.order.deleteMany({ where: { userId: testUser.id } })
		await prisma.user.deleteMany({ where: { id: testUser.id } })
		consoleError.mockClear()
		vi.clearAllMocks()
	})

	test('returns tracking info for authenticated user order', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
				userId: testUser.id,
				email: testUser.email,
				subtotal: 10000,
				total: 10500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				mondialRelayShipmentNumber: 'MR123456789',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'SHIPPED',
			},
		})

		const mockTrackingInfo = {
			status: 'En cours de livraison',
			statusCode: 'LI',
			events: [
				{
					date: new Date('2024-01-01T10:00:00Z'),
					description: 'Prise en charge',
					location: 'AGENCE PARIS',
				},
			],
		}

		vi.mocked(trackingServer.getMondialRelayTrackingInfo).mockResolvedValueOnce(
			mockTrackingInfo,
		)

		// Create session
		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request(
			`http://localhost:3000/shop/orders/${order.orderNumber}/tracking`,
			{
				headers: {
					Cookie: cookieHeader,
				},
			},
		)

		const result = await loader({
			request,
			params: { orderNumber: order.orderNumber },
			context: {},
		})

		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data as { trackingInfo?: typeof mockTrackingInfo }
			expect(responseData.trackingInfo).toEqual(mockTrackingInfo)
		} else {
			throw new Error('Expected result to have data property')
		}
	})

	test('returns error when order does not have shipment number', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
				userId: testUser.id,
				email: testUser.email,
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 0,
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
				// No mondialRelayShipmentNumber
			},
		})

		const session = await prisma.session.create({
			data: {
				userId: testUser.id,
				expirationDate: getSessionExpirationDate(),
			},
		})

		const authSession = await authSessionStorage.getSession()
		authSession.set(sessionKey, session.id)
		const cookieHeader = await authSessionStorage.commitSession(authSession)

		const request = new Request(
			`http://localhost:3000/shop/orders/${order.orderNumber}/tracking`,
			{
				headers: {
					Cookie: cookieHeader,
				},
			},
		)

		const result = await loader({
			request,
			params: { orderNumber: order.orderNumber },
			context: {},
		})

		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data as { error?: string }
			expect(responseData.error).toBe('Order does not have a Mondial Relay shipment')
		} else {
			throw new Error('Expected result to have data property')
		}
	})
})

