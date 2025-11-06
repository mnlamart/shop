/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { fulfillOrder } from './fulfillment.server.ts'
import * as shipmentServer from './shipment.server.ts'
import * as shippingEmailServer from './shipping-email.server.tsx'

// Mock the shipment server
vi.mock('./shipment.server.ts', () => ({
	createMondialRelayShipment: vi.fn(),
}))

// Mock the shipping email server
vi.mock('./shipping-email.server.tsx', () => ({
	sendShippingConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}))

describe('fulfillment.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('creates shipment for order with Mondial Relay pickup point', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-FULFILL-${Date.now()}`,
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
				shippingCarrierName: 'Mondial Relay',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const mockShipmentResult = {
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
		}

		// Mock to also update the order in database
		vi.mocked(shipmentServer.createMondialRelayShipment).mockImplementationOnce(
			async (orderId: string) => {
				await prisma.order.update({
					where: { id: orderId },
					data: {
						mondialRelayShipmentNumber: mockShipmentResult.shipmentNumber,
						mondialRelayLabelUrl: mockShipmentResult.labelUrl,
					},
				})
				return mockShipmentResult
			},
		)

		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		await fulfillOrder(order.id, storeAddress)

		expect(shipmentServer.createMondialRelayShipment).toHaveBeenCalledWith(
			order.id,
			storeAddress,
		)

		// Verify order was updated with shipment info
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder?.mondialRelayShipmentNumber).toBe('MR123456789')
		expect(updatedOrder?.mondialRelayLabelUrl).toBe('https://example.com/label.pdf')
		expect(updatedOrder?.status).toBe('SHIPPED')

		// Verify shipping confirmation email was sent
		expect(shippingEmailServer.sendShippingConfirmationEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(shippingEmailServer.sendShippingConfirmationEmail).mock
			.calls[0]
		expect(emailCall).toBeDefined()
		if (!emailCall) throw new Error('Expected email call to be defined')
		expect(emailCall[0]?.orderNumber).toBe(order.orderNumber)
		expect(emailCall[0]?.shipmentNumber).toBe('MR123456789')
		expect(emailCall[1]).toBe('test@example.com') // email address

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('skips shipment creation for order without Mondial Relay', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-FULFILL-${Date.now()}`,
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
				// No Mondial Relay fields
			},
		})

		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		await fulfillOrder(order.id, storeAddress)

		// Should not call shipment creation
		expect(shipmentServer.createMondialRelayShipment).not.toHaveBeenCalled()

		// Should not send shipping email
		expect(shippingEmailServer.sendShippingConfirmationEmail).not.toHaveBeenCalled()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('handles shipment creation errors gracefully', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-FULFILL-${Date.now()}`,
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
				shippingCarrierName: 'Mondial Relay',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		vi.mocked(shipmentServer.createMondialRelayShipment).mockRejectedValueOnce(
			new Error('API error'),
		)

		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		// Should not throw - errors are logged but don't fail fulfillment
		await fulfillOrder(order.id, storeAddress)

		// Order should still exist
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder).toBeTruthy()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('skips if order already has shipment', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-FULFILL-${Date.now()}`,
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
				mondialRelayShipmentNumber: 'MR123456789', // Already has shipment
				shippingCarrierName: 'Mondial Relay',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		await fulfillOrder(order.id, storeAddress)

		// Should not call shipment creation if already has shipment
		expect(shipmentServer.createMondialRelayShipment).not.toHaveBeenCalled()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})
})

