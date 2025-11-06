/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import { prisma } from '#app/utils/db.server.ts'
import { createMondialRelayShipment } from './shipment.server.ts'
import * as mondialRelayApi2 from './carriers/mondial-relay-api2.server.ts'

// Mock the Mondial Relay API2 client
vi.mock('./carriers/mondial-relay-api2.server.ts', () => ({
	createShipment: vi.fn(),
}))

describe('shipment.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('creates shipment for order with Mondial Relay pickup point', async () => {
		// Create test data
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-001-${Date.now()}`,
				email: 'test@example.com',
				subtotal: 10000,
				total: 10500,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Paris',
				shippingPostal: '75001',
				shippingCountry: 'FR',
				shippingCost: 500,
				shippingMethodName: 'Mondial Relay Standard',
				shippingCarrierName: 'Mondial Relay',
				mondialRelayPickupPointId: '12345',
				mondialRelayPickupPointName: 'Test Pickup Point',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				status: 'CONFIRMED',
			},
		})

		// Mock API2 createShipment
		vi.mocked(mondialRelayApi2.createShipment).mockResolvedValueOnce({
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
			statusCode: '0',
			statusMessage: 'OK',
		})

		// Mock store address (would come from settings in real app)
		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		const result = await createMondialRelayShipment(order.id, storeAddress)

		expect(result).toEqual({
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
		})

		// Verify API was called correctly
		expect(mondialRelayApi2.createShipment).toHaveBeenCalledWith({
			shipper: {
				name: storeAddress.name,
				address: storeAddress.address1, // address2 not provided in test
				city: storeAddress.city,
				postalCode: storeAddress.postalCode,
				country: storeAddress.country,
				phone: storeAddress.phone,
				email: storeAddress.email || '',
			},
			recipient: {
				name: order.shippingName,
				address: order.shippingStreet,
				city: order.shippingCity,
				postalCode: order.shippingPostal,
				country: order.shippingCountry,
				phone: '', // Not stored in order
				email: order.email,
			},
			pickupPointId: order.mondialRelayPickupPointId!,
			weight: expect.any(Number), // Weight calculation
			reference: order.orderNumber,
		})

		// Verify order was updated
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder?.mondialRelayShipmentNumber).toBe('MR123456789')
		expect(updatedOrder?.mondialRelayLabelUrl).toBe('https://example.com/label.pdf')
	})

	test('throws error when order does not have pickup point', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-002-${Date.now()}`,
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
				// No mondialRelayPickupPointId
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

		await expect(createMondialRelayShipment(order.id, storeAddress)).rejects.toThrow(
			'Order does not have a Mondial Relay pickup point',
		)

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } })
	})

	test('throws error when order is not found', async () => {
		const storeAddress = {
			name: 'Test Store',
			address1: '456 Store St',
			city: 'Lyon',
			postalCode: '69001',
			country: 'FR',
			phone: '0123456789',
			email: 'store@example.com',
		}

		await expect(createMondialRelayShipment('non-existent-id', storeAddress)).rejects.toThrow(
			'Order not found',
		)
	})

	test('handles API errors gracefully', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-003-${Date.now()}`,
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
			},
		})

		// Mock API error
		vi.mocked(mondialRelayApi2.createShipment).mockRejectedValueOnce(
			new Error('API error: Invalid credentials'),
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

		await expect(createMondialRelayShipment(order.id, storeAddress)).rejects.toThrow(
			'Failed to create Mondial Relay shipment',
		)

		// Verify order was not updated
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder?.mondialRelayShipmentNumber).toBeNull()
		expect(updatedOrder?.mondialRelayLabelUrl).toBeNull()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } })
	})

	test('calculates weight from order items using default weight', async () => {
		// Create category first (required for product)
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: `test-product-${Date.now()}`,
				description: 'Test',
				sku: `SKU-${Date.now()}`,
				price: 5000,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-004-${Date.now()}`,
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
				items: {
					create: [
						{
							quantity: 2,
							price: 5000,
							productId: product.id,
						},
					],
				},
			},
		})

		vi.mocked(mondialRelayApi2.createShipment).mockResolvedValueOnce({
			shipmentNumber: 'MR123456789',
			labelUrl: 'https://example.com/label.pdf',
			statusCode: '0',
			statusMessage: 'OK',
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

		await createMondialRelayShipment(order.id, storeAddress)

		// Verify weight was calculated (2 items * 500g default = 1000g)
		expect(mondialRelayApi2.createShipment).toHaveBeenCalledWith(
			expect.objectContaining({
				weight: 1000, // in grams
			}),
		)

		// Cleanup
		await prisma.orderItem.deleteMany({ where: { orderId: order.id } })
		await prisma.order.delete({ where: { id: order.id } })
		await prisma.product.delete({ where: { id: product.id } })
		await prisma.category.delete({ where: { id: category.id } })
	})
})

