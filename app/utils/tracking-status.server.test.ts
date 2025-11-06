/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import * as orderServer from './order.server.ts'
import { syncOrderStatusFromTracking, syncMultipleOrdersFromTracking } from './tracking-status.server.ts'
import * as trackingServer from './tracking.server.ts'

// Mock the tracking and order servers
vi.mock('./tracking.server.ts', () => ({
	getMondialRelayTrackingInfo: vi.fn(),
}))

vi.mock('./order.server.ts', () => ({
	updateOrderStatus: vi.fn().mockResolvedValue(undefined),
}))

describe('tracking-status.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	describe('syncOrderStatusFromTracking', () => {
		test('updates order to DELIVERED when tracking shows delivered', async () => {
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

			vi.mocked(trackingServer.getMondialRelayTrackingInfo).mockResolvedValueOnce({
				status: 'Livré',
				statusCode: '4',
				events: [
					{
						date: new Date(),
						description: 'Colis livré au point relais',
						location: 'Paris',
					},
				],
			})

			// Mock updateOrderStatus to actually update the database
			vi.mocked(orderServer.updateOrderStatus).mockImplementationOnce(async (orderId, status) => {
				await prisma.order.update({
					where: { id: orderId },
					data: { status },
				})
			})

			const result = await syncOrderStatusFromTracking(order.id)

			expect(result.updated).toBe(true)
			expect(result.newStatus).toBe('DELIVERED')
			expect(orderServer.updateOrderStatus).toHaveBeenCalledWith(order.id, 'DELIVERED', undefined)

			// Verify order was updated
			const updatedOrder = await prisma.order.findUnique({
				where: { id: order.id },
			})
			expect(updatedOrder?.status).toBe('DELIVERED')

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
		})

		test('does not update if order is already DELIVERED', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: `TEST-ALREADY-DELIVERED-${Date.now()}`,
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
					status: 'DELIVERED',
				},
			})

			const result = await syncOrderStatusFromTracking(order.id)

			expect(result.updated).toBe(false)
			expect(result.message).toContain('already DELIVERED')
			expect(trackingServer.getMondialRelayTrackingInfo).not.toHaveBeenCalled()
			expect(orderServer.updateOrderStatus).not.toHaveBeenCalled()

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
		})

		test('does not update if package is not yet delivered', async () => {
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

			vi.mocked(trackingServer.getMondialRelayTrackingInfo).mockResolvedValueOnce({
				status: 'En transit',
				statusCode: '2',
				events: [
					{
						date: new Date(),
						description: 'Colis en cours de transport',
						location: 'Lyon',
					},
				],
			})

			const result = await syncOrderStatusFromTracking(order.id)

			expect(result.updated).toBe(false)
			expect(result.message).toContain('not yet delivered')
			expect(orderServer.updateOrderStatus).not.toHaveBeenCalled()

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
		})

		test('handles orders without Mondial Relay tracking', async () => {
			const order = await prisma.order.create({
				data: {
					orderNumber: `TEST-NO-TRACKING-${Date.now()}`,
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

			const result = await syncOrderStatusFromTracking(order.id)

			expect(result.updated).toBe(false)
			expect(result.message).toContain('does not have Mondial Relay tracking')
			expect(trackingServer.getMondialRelayTrackingInfo).not.toHaveBeenCalled()

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
		})

		test('handles tracking API errors gracefully', async () => {
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
					mondialRelayShipmentNumber: 'MR123456789',
					stripeCheckoutSessionId: `cs_test_${Date.now()}`,
					status: 'SHIPPED',
				},
			})

			vi.mocked(trackingServer.getMondialRelayTrackingInfo).mockRejectedValueOnce(
				new Error('API error: Invalid shipment number'),
			)

			const result = await syncOrderStatusFromTracking(order.id)

			expect(result.updated).toBe(false)
			expect(result.message).toContain('Failed to sync tracking status')
			expect(orderServer.updateOrderStatus).not.toHaveBeenCalled()

			// Cleanup
			await prisma.order.delete({ where: { id: order.id } }).catch(() => {})
		})
	})

	describe('syncMultipleOrdersFromTracking', () => {
		test('syncs multiple orders and returns summary', async () => {
			const order1 = await prisma.order.create({
				data: {
					orderNumber: `TEST-BATCH-1-${Date.now()}`,
					email: 'test1@example.com',
					subtotal: 10000,
					total: 10500,
					shippingName: 'Test User 1',
					shippingStreet: '123 Test St',
					shippingCity: 'Paris',
					shippingPostal: '75001',
					shippingCountry: 'FR',
					shippingCost: 500,
					shippingCarrierName: 'Mondial Relay',
					mondialRelayShipmentNumber: 'MR111111111',
					stripeCheckoutSessionId: `cs_test_1_${Date.now()}`,
					status: 'SHIPPED',
				},
			})

			const order2 = await prisma.order.create({
				data: {
					orderNumber: `TEST-BATCH-2-${Date.now()}`,
					email: 'test2@example.com',
					subtotal: 10000,
					total: 10500,
					shippingName: 'Test User 2',
					shippingStreet: '456 Test St',
					shippingCity: 'Lyon',
					shippingPostal: '69001',
					shippingCountry: 'FR',
					shippingCost: 500,
					shippingCarrierName: 'Mondial Relay',
					mondialRelayShipmentNumber: 'MR222222222',
					stripeCheckoutSessionId: `cs_test_2_${Date.now()}`,
					status: 'SHIPPED',
				},
			})

			vi.mocked(trackingServer.getMondialRelayTrackingInfo)
				.mockResolvedValueOnce({
					status: 'Livré',
					statusCode: '4',
					events: [{ date: new Date(), description: 'Colis livré' }],
				})
				.mockResolvedValueOnce({
					status: 'En transit',
					statusCode: '2',
					events: [{ date: new Date(), description: 'En cours de transport' }],
				})

			const summary = await syncMultipleOrdersFromTracking([order1.id, order2.id])

			expect(summary.total).toBe(2)
			expect(summary.updated).toBe(1)
			expect(summary.skipped).toBe(1)
			expect(summary.failed).toBe(0)
			expect(summary.results).toHaveLength(2)

			// Cleanup
			await prisma.order.deleteMany({
				where: { id: { in: [order1.id, order2.id] } },
			}).catch(() => {})
		})
	})
})

