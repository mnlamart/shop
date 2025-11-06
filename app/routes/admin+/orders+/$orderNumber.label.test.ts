/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import { prisma } from '#app/utils/db.server.ts'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { loader } from './$orderNumber.label.ts'
import * as labelServer from '#app/utils/label.server.ts'

// Mock the label server
vi.mock('#app/utils/label.server.ts', () => ({
	getMondialRelayLabel: vi.fn(),
	createMondialRelayShipmentAndLabel: vi.fn(),
}))

describe('label route', () => {
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

		consoleError.mockImplementation(() => {})
	})

	afterEach(async () => {
		await prisma.order.deleteMany({ where: {} })
		await prisma.user.deleteMany({ where: { id: testUser.id } })
		consoleError.mockClear()
		vi.clearAllMocks()
	})

	test('returns label PDF for order with shipment number', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-LABEL-${Date.now()}`,
				email: 'test@example.com',
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

		const mockLabelBlob = new Blob(['PDF content'], { type: 'application/pdf' })
		vi.mocked(labelServer.getMondialRelayLabel).mockResolvedValueOnce(mockLabelBlob)

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
			`http://localhost:3000/admin/orders/${order.orderNumber}/label`,
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

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.headers.get('Content-Type')).toBe('application/pdf')
			expect(result.headers.get('Content-Disposition')).toContain(`label-${order.orderNumber}.pdf`)
			const blob = await result.blob()
			expect(blob.type).toBe('application/pdf')
		}
	})

	test('creates shipment and label when create=true and order has pickup point', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-LABEL-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				mondialRelayPickupPointId: '12345',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
				// No mondialRelayShipmentNumber
			},
		})

		const mockLabelBlob = new Blob(['PDF content'], { type: 'application/pdf' })
		vi.mocked(labelServer.createMondialRelayShipmentAndLabel).mockResolvedValueOnce(mockLabelBlob)

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
			`http://localhost:3000/admin/orders/${order.orderNumber}/label?create=true`,
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

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.headers.get('Content-Type')).toBe('application/pdf')
		}
	})

	test('returns error when order does not have pickup point and create=true', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-LABEL-${Date.now()}`,
				email: 'test@example.com',
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
				// No mondialRelayPickupPointId or mondialRelayShipmentNumber
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
			`http://localhost:3000/admin/orders/${order.orderNumber}/label?create=true`,
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

		expect(result).toBeInstanceOf(Response)
		if (result instanceof Response) {
			expect(result.status).toBe(400)
			const json = await result.json()
			expect(json.error).toBe('Order does not have a Mondial Relay pickup point')
		}
	})
})

