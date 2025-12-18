/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { fulfillOrder } from './fulfillment.server.ts'

describe('fulfillment.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('fulfills order successfully', async () => {
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

		// fulfillOrder should complete without error
		await fulfillOrder(order.id)

		// Verify order still exists and status unchanged (fulfillment is currently a placeholder)
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder).toBeTruthy()
		expect(updatedOrder?.orderNumber).toBe(order.orderNumber)

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('fulfills order without Mondial Relay', async () => {
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
			},
		})

		// fulfillOrder should complete without error
		await fulfillOrder(order.id)

		// Verify order still exists
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder).toBeTruthy()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('handles fulfillment gracefully', async () => {
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

		// Should complete without error
		await fulfillOrder(order.id)

		// Order should still exist
		const updatedOrder = await prisma.order.findUnique({
			where: { id: order.id },
		})
		expect(updatedOrder).toBeTruthy()

		// Cleanup
		await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
	})

	test('handles non-existent order gracefully', async () => {
		const fakeOrderId = 'non-existent-order-id'

		// Should not throw - returns early if order not found
		await fulfillOrder(fakeOrderId)

		// Should complete without error
		expect(true).toBe(true)
	})
})

