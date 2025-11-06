/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import { prisma } from '#app/utils/db.server.ts'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { action } from './$orderNumber.create-shipment.ts'
import * as shipmentServer from '#app/utils/shipment.server.ts'
import * as shippingEmailServer from '#app/utils/shipping-email.server.tsx'

// Mock the shipment and email services
vi.mock('#app/utils/shipment.server.ts', () => ({
	createMondialRelayShipment: vi.fn(),
}))

vi.mock('#app/utils/shipping-email.server.tsx', () => ({
	sendShippingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

describe('admin order create-shipment', () => {
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

	test('creates shipment for valid order', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-CREATE-SHIP-${Date.now()}`,
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
				mondialRelayPickupPointId: '12345',
				mondialRelayPickupPointName: 'Test Pickup Point',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const mockShipmentResult = {
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
		}

		vi.mocked(shipmentServer.createMondialRelayShipment).mockImplementationOnce(
			async (orderId: string) => {
				await prisma.order.update({
					where: { id: orderId },
					data: {
						mondialRelayShipmentNumber: mockShipmentResult.shipmentNumber,
						mondialRelayLabelUrl: mockShipmentResult.labelUrl,
						status: 'SHIPPED',
					},
				})
				return mockShipmentResult
			},
		)

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

		const request = new Request('https://example.com/admin/orders/TEST/create-shipment', {
			method: 'POST',
			headers: {
				Cookie: cookieHeader,
			},
		})

		const result = await action({
			params: { orderNumber: order.orderNumber },
			request,
		} as any)

		expect(shipmentServer.createMondialRelayShipment).toHaveBeenCalledTimes(1)

		// Extract data from DataWithResponseInit
		const resultData = 'data' in result ? result.data : result
		expect(resultData).toHaveProperty('success', true)
		expect(resultData).toHaveProperty('shipmentNumber', 'MR123456789')

		// Verify order was updated
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder?.mondialRelayShipmentNumber).toBe('MR123456789')
		expect(updatedOrder?.status).toBe('SHIPPED')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('returns error when order does not have pickup point', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-NO-PICKUP-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 0,
				shippingCarrierName: 'Mondial Relay',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
				// No pickup point
			},
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

		const request = new Request('https://example.com/admin/orders/TEST/create-shipment', {
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
		expect(resultData).toHaveProperty('error', 'Order does not have a Mondial Relay pickup point')
		expect(shipmentServer.createMondialRelayShipment).not.toHaveBeenCalled()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('returns error when shipment already exists', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-EXISTS-${Date.now()}`,
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
				mondialRelayPickupPointId: '12345',
				mondialRelayShipmentNumber: 'MR999888777',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'SHIPPED',
			},
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

		const request = new Request('https://example.com/admin/orders/TEST/create-shipment', {
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
		expect(resultData).toHaveProperty('error', 'Shipment already exists')
		expect(shipmentServer.createMondialRelayShipment).not.toHaveBeenCalled()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('handles shipment creation errors gracefully', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-ERROR-${Date.now()}`,
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
				mondialRelayPickupPointId: '12345',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		vi.mocked(shipmentServer.createMondialRelayShipment).mockRejectedValueOnce(
			new Error('API error: Invalid credentials'),
		)

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

		const request = new Request('https://example.com/admin/orders/TEST/create-shipment', {
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
		expect(resultData).toHaveProperty('error', 'Failed to create shipment')
		if ('message' in resultData && typeof resultData.message === 'string') {
			expect(resultData.message).toContain('API error')
		}

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})
})

