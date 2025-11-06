/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import * as mondialRelayApi1 from './carriers/mondial-relay-api1.server.ts'
import { getMondialRelayTrackingInfo } from './tracking.server.ts'

// Mock the Mondial Relay API1 client
vi.mock('./carriers/mondial-relay-api1.server.ts', () => ({
	getTrackingInfo: vi.fn(),
}))

describe('tracking.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('returns tracking info for order with Mondial Relay shipment', async () => {
		// Create test order
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
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

		// Mock API1 getTrackingInfo
		const mockTrackingInfo = {
			status: 'En cours de livraison',
			statusCode: 'LI',
			events: [
				{
					date: new Date('2024-01-01T10:00:00Z'),
					description: 'Prise en charge',
					location: 'AGENCE PARIS',
				},
				{
					date: new Date('2024-01-02T14:30:00Z'),
					description: 'En transit',
					location: 'CENTRE DE TRI',
				},
			],
		}

		vi.mocked(mondialRelayApi1.getTrackingInfo).mockResolvedValueOnce(mockTrackingInfo)

		const result = await getMondialRelayTrackingInfo(order.id)

		expect(result).toEqual(mockTrackingInfo)
		expect(mondialRelayApi1.getTrackingInfo).toHaveBeenCalledWith('MR123456789')

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } })
	})

	test('throws error when order does not have shipment number', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
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

		await expect(getMondialRelayTrackingInfo(order.id)).rejects.toThrow(
			'Order does not have a Mondial Relay shipment number',
		)

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {
			// Order might already be deleted
		})
	})

	test('throws error when order is not found', async () => {
		await expect(getMondialRelayTrackingInfo('non-existent-id')).rejects.toThrow(
			'Order not found',
		)
	})

	test('handles API errors gracefully', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
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

		// Mock API error
		vi.mocked(mondialRelayApi1.getTrackingInfo).mockRejectedValueOnce(
			new Error('API error: Invalid shipment number'),
		)

		await expect(getMondialRelayTrackingInfo(order.id)).rejects.toThrow(
			'Failed to get tracking info',
		)

		// Error is logged to Sentry, not console.error
		// The API1 client may log errors, but our service uses Sentry

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {
			// Order might already be deleted
		})
	})

	test('returns empty events array when no tracking events', async () => {
		const order = await prisma.order.create({
			data: {
				orderNumber: `TEST-TRACK-${Date.now()}`,
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

		const mockTrackingInfo = {
			status: 'Unknown',
			statusCode: '0',
			events: [],
		}

		vi.mocked(mondialRelayApi1.getTrackingInfo).mockResolvedValueOnce(mockTrackingInfo)

		const result = await getMondialRelayTrackingInfo(order.id)

		expect(result).toEqual(mockTrackingInfo)
		expect(result.events).toHaveLength(0)

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {
			// Order might already be deleted
		})
	})
})

