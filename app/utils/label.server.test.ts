/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import * as mondialRelayApi2 from './carriers/mondial-relay-api2.server.ts'
import { getMondialRelayLabel, createMondialRelayShipmentAndLabel } from './label.server.ts'
import * as shipmentServer from './shipment.server.ts'

// Mock the API clients
vi.mock('./carriers/mondial-relay-api2.server.ts', () => ({
	getLabel: vi.fn(),
}))

vi.mock('./shipment.server.ts', () => ({
	createMondialRelayShipment: vi.fn(),
}))

describe('label.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('returns label blob for order with shipment number', async () => {
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
		vi.mocked(mondialRelayApi2.getLabel).mockResolvedValueOnce(mockLabelBlob)

		const result = await getMondialRelayLabel(order.id)

		expect(result).toEqual(mockLabelBlob)
		expect(mondialRelayApi2.getLabel).toHaveBeenCalledWith('MR123456789')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('throws error when order does not have shipment number', async () => {
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
				// No mondialRelayShipmentNumber
			},
		})

		await expect(getMondialRelayLabel(order.id)).rejects.toThrow(
			'Order does not have a Mondial Relay shipment number',
		)

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('throws error when order is not found', async () => {
		await expect(getMondialRelayLabel('non-existent-id')).rejects.toThrow('Order not found')
	})

	test('handles API errors gracefully', async () => {
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

		vi.mocked(mondialRelayApi2.getLabel).mockRejectedValueOnce(
			new Error('API error: Label not found'),
		)

		await expect(getMondialRelayLabel(order.id)).rejects.toThrow('Failed to retrieve label')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('creates shipment and returns label for order without shipment', async () => {
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

		const mockShipmentResult = {
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
		}

		const mockLabelBlob = new Blob(['PDF content'], { type: 'application/pdf' })

		vi.mocked(shipmentServer.createMondialRelayShipment).mockResolvedValueOnce(
			mockShipmentResult,
		)
		vi.mocked(mondialRelayApi2.getLabel).mockResolvedValueOnce(mockLabelBlob)

		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		const result = await createMondialRelayShipmentAndLabel(order.id, storeAddress)

		expect(result).toEqual(mockLabelBlob)
		expect(shipmentServer.createMondialRelayShipment).toHaveBeenCalledWith(
			order.id,
			storeAddress,
		)
		expect(mondialRelayApi2.getLabel).toHaveBeenCalledWith('MR123456789')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})
})

