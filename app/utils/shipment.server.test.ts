/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import * as mondialRelayApi2 from './carriers/mondial-relay-api2.server.ts'
import { createMondialRelayShipment } from './shipment.server.ts'

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
			pickupPointCountry: order.shippingCountry, // Now required for Location attribute
			weight: expect.any(Number), // Weight calculation
			value: order.total, // Shipment value in cents
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

	test('calculates weight from order items using product and variant weights', async () => {
		// Create category first (required for product)
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test',
			},
		})

		// Create product with weight
		const product1 = await prisma.product.create({
			data: {
				name: 'Test Product 1',
				slug: `test-product-1-${Date.now()}`,
				description: 'Test',
				sku: `SKU-1-${Date.now()}`,
				price: 5000,
				status: 'ACTIVE',
				weightGrams: 300, // Product weight
				categoryId: category.id,
			},
		})

		// Create product without weight (should use default)
		const product2 = await prisma.product.create({
			data: {
				name: 'Test Product 2',
				slug: `test-product-2-${Date.now()}`,
				description: 'Test',
				sku: `SKU-2-${Date.now()}`,
				price: 3000,
				status: 'ACTIVE',
				// No weightGrams - should use default
				categoryId: category.id,
			},
		})

		// Create variant with weight
		const variant = await prisma.productVariant.create({
			data: {
				productId: product2.id,
				sku: `SKU-VAR-${Date.now()}`,
				price: 3500,
				stockQuantity: 10,
				weightGrams: 750, // Variant weight (overrides product weight)
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
							productId: product1.id, // Product with weight: 300g
							// No variant
						},
						{
							quantity: 1,
							price: 3500,
							productId: product2.id, // Product without weight
							variantId: variant.id, // Variant with weight: 750g
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

		// Verify weight was calculated correctly:
		// - Product1: 2 items * 300g = 600g
		// - Product2 with variant: 1 item * 750g = 750g
		// - Total: 1350g (but minimum is 100g, so should be 1350g)
		expect(mondialRelayApi2.createShipment).toHaveBeenCalledWith(
			expect.objectContaining({
				weight: 1350, // (2 * 300) + (1 * 750) = 1350g
			}),
		)

		// Cleanup
		await prisma.orderItem.deleteMany({ where: { orderId: order.id } })
		await prisma.order.delete({ where: { id: order.id } })
		await prisma.productVariant.delete({ where: { id: variant.id } })
		await prisma.product.delete({ where: { id: product1.id } })
		await prisma.product.delete({ where: { id: product2.id } })
		await prisma.category.delete({ where: { id: category.id } })
	})
})

