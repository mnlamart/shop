/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, vi } from 'vitest'
import { sendShippingConfirmationEmail } from './shipping-email.server.tsx'
import { sendEmail } from './email.server.ts'

// Mock the email service
vi.mock('./email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success',
		data: { id: 'test-email-id' },
	}),
}))

describe('shipping-email.server', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('sendShippingConfirmationEmail', () => {
		test('sends shipping confirmation email with all details', async () => {
			const emailData = {
				orderNumber: 'ORD-123456',
				customerName: 'John Doe',
				carrierName: 'Mondial Relay',
				shipmentNumber: 'MR123456789',
				pickupPointName: 'Test Pickup Point',
				trackingUrl: 'https://example.com/track/MR123456789',
			}

			await sendShippingConfirmationEmail(emailData, 'customer@example.com')

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe('customer@example.com')
			expect(call[0]?.subject).toBe('Your Order ORD-123456 Has Shipped')
			expect(call[0]?.react).toBeDefined()
		})

		test('sends email without optional fields', async () => {
			const emailData = {
				orderNumber: 'ORD-789012',
				customerName: 'Jane Smith',
				carrierName: 'Mondial Relay',
				shipmentNumber: 'MR987654321',
			}

			await sendShippingConfirmationEmail(emailData, 'jane@example.com')

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			expect(call[0]?.to).toBe('jane@example.com')
			expect(call[0]?.subject).toBe('Your Order ORD-789012 Has Shipped')
		})

		test('uses request to get domain URL when provided', async () => {
			const emailData = {
				orderNumber: 'ORD-345678',
				customerName: 'Test User',
				carrierName: 'Mondial Relay',
				shipmentNumber: 'MR111222333',
			}

			const request = new Request('https://example.com/webhook', {
				method: 'POST',
			})

			await sendShippingConfirmationEmail(emailData, 'test@example.com', request)

			expect(sendEmail).toHaveBeenCalledTimes(1)
			const call = vi.mocked(sendEmail).mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')

			// Verify react component is passed (which will contain the orderDetailsUrl)
			expect(call[0]?.react).toBeDefined()
		})

		test('handles email sending errors gracefully', async () => {
			vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Email service error'))

			const emailData = {
				orderNumber: 'ORD-999999',
				customerName: 'Error User',
				carrierName: 'Mondial Relay',
				shipmentNumber: 'MR999888777',
			}

			await expect(
				sendShippingConfirmationEmail(emailData, 'error@example.com'),
			).rejects.toThrow('Email service error')

			expect(sendEmail).toHaveBeenCalledTimes(1)
		})
	})
})

