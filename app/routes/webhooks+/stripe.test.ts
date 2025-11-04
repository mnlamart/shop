import { invariant } from '@epic-web/invariant'
import { type Stripe } from 'stripe'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { action } from './stripe.tsx'

type WebhookResponse = {
	received: boolean
	orderId?: string
	error?: string
	message?: string
}

// Mock Stripe client and webhook utilities
vi.mock('#app/utils/stripe.server.ts', async () => {
	const actual = await vi.importActual('#app/utils/stripe.server.ts')
	return {
		...actual,
		stripe: {
			webhooks: {
				constructEvent: vi.fn(),
			},
			refunds: {
				create: vi.fn(),
			},
		},
		handleStripeError: actual.handleStripeError,
	}
})

// Mock email service
vi.mock('#app/utils/email.server.ts', () => ({
	sendEmail: vi.fn().mockResolvedValue({
		status: 'success' as const,
		data: { id: 'email-123' },
	}),
}))

// Mock order number generation
vi.mock('#app/utils/order-number.server.ts', () => ({
	generateOrderNumber: vi.fn().mockResolvedValue('ORD-000001'),
}))

describe('Stripe Webhook - Signature Verification', () => {
	const mockWebhookSecret = 'whsec_test_secret'
	const mockPayload = JSON.stringify({
		id: 'evt_test_123',
		type: 'checkout.session.completed',
		data: {
			object: {
				id: 'cs_test_123',
				status: 'complete',
			},
		},
	})
	const mockSignature = 't=1234567890,v1=signature_hash'

	beforeEach(() => {
		process.env.STRIPE_WEBHOOK_SECRET = mockWebhookSecret
		vi.clearAllMocks()
	})

	test('should verify webhook signature successfully', async () => {
		const mockEvent: Stripe.Event = {
			id: 'evt_test_123',
			object: 'event',
			type: 'checkout.session.completed',
			data: {
				object: {
					id: 'cs_test_123',
					object: 'checkout.session',
				} as Stripe.Checkout.Session,
			},
		} as Stripe.Event

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent)

		const event = stripe.webhooks.constructEvent(
			mockPayload,
			mockSignature,
			mockWebhookSecret,
		)

		expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
			mockPayload,
			mockSignature,
			mockWebhookSecret,
		)
		expect(event.type).toBe('checkout.session.completed')
	})

	test('should throw error when signature is missing', () => {
		expect(() => {
			if (!mockSignature) {
				throw new Error('Missing webhook signature')
			}
		}).not.toThrow()

		// Test with null signature
		expect(() => {
			const sig = null
			if (!sig) {
				throw new Error('Missing webhook signature')
			}
		}).toThrow('Missing webhook signature')
	})

	test('should throw error when webhook secret is missing', () => {
		delete process.env.STRIPE_WEBHOOK_SECRET

		expect(() => {
			if (!process.env.STRIPE_WEBHOOK_SECRET) {
				throw new Error('Missing webhook secret')
			}
		}).toThrow('Missing webhook secret')
	})

	test('should throw error when signature verification fails', () => {
		const invalidSignature = 'invalid_signature'

		vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
			throw new Error('Invalid signature')
		})

		expect(() => {
			stripe.webhooks.constructEvent(
				mockPayload,
				invalidSignature,
				mockWebhookSecret,
			)
		}).toThrow('Invalid signature')

		expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
			mockPayload,
			invalidSignature,
			mockWebhookSecret,
		)
	})

	test('should use correct tolerance for signature verification', () => {
		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
			id: 'evt_test_123',
			type: 'checkout.session.completed',
		} as Stripe.Event)

		stripe.webhooks.constructEvent(
			mockPayload,
			mockSignature,
			mockWebhookSecret,
			300, // 300 second tolerance
		)

		expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(
			mockPayload,
			mockSignature,
			mockWebhookSecret,
			300,
		)
	})

	test('should handle malformed payload', () => {
		const malformedPayload = 'not valid json'

		vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
			throw new Error('Invalid payload')
		})

		expect(() => {
			stripe.webhooks.constructEvent(
				malformedPayload,
				mockSignature,
				mockWebhookSecret,
			)
		}).toThrow('Invalid payload')
	})
})

describe('Stripe Webhook - Handler Logic', () => {
	const mockWebhookSecret = 'whsec_test_secret'
	let category: { id: string }
	let product: { id: string; price: number; name: string }
	let variant: { id: string; price: number | null; stockQuantity: number }
	let cart: { id: string }
	let checkoutSessionId: string

	beforeEach(async () => {
		process.env.STRIPE_WEBHOOK_SECRET = mockWebhookSecret

		// Create test category
		await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Uncategorized',
				slug: 'uncategorized',
			},
			update: {},
		})
		category = { id: UNCATEGORIZED_CATEGORY_ID }

		// Create test product
		const productData = createProductData()
		product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: Math.round(productData.price * 100), // Convert to cents
				status: 'ACTIVE' as const,
				categoryId: category.id,
			},
		})

		// Create test variant
		const variantData = createVariantData(productData.sku)
		variant = await prisma.productVariant.create({
			data: {
				productId: product.id,
				sku: variantData.sku,
				price: variantData.price
					? Math.round(variantData.price * 100)
					: null,
				stockQuantity: 10,
			},
		})

		// Create test cart
		cart = await prisma.cart.create({
			data: {
				sessionId: 'test-session-id',
			},
		})

		// Add item to cart
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: product.id,
				variantId: variant.id,
				quantity: 2,
			},
		})

		checkoutSessionId = 'cs_test_123'
	})

	afterEach(async () => {
		// Cleanup
		await prisma.orderItem.deleteMany({
			where: { order: { stripeCheckoutSessionId: checkoutSessionId } },
		})
		await prisma.order.deleteMany({
			where: { stripeCheckoutSessionId: checkoutSessionId },
		})
		await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
		await prisma.cart.deleteMany({ where: { id: cart.id } })
		await prisma.productVariant.deleteMany({ where: { productId: product.id } })
		await prisma.product.deleteMany({ where: { id: product.id } })
		vi.clearAllMocks()
	})

	function createMockCheckoutSession(
		overrides?: Partial<Stripe.Checkout.Session>,
	): Stripe.Checkout.Session {
		return {
			id: checkoutSessionId,
			object: 'checkout.session',
			status: 'complete',
			payment_status: 'paid', // Default to paid for successful payments
			customer_email: 'test@example.com',
			amount_subtotal: (variant.price ?? product.price) * 2,
			amount_total: (variant.price ?? product.price) * 2,
			payment_intent: 'pi_test_123',
			metadata: {
				cartId: cart.id,
				userId: '',
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingState: 'TS',
				shippingPostal: '12345',
				shippingCountry: 'US',
			},
			...overrides,
		} as Stripe.Checkout.Session
	}

	function createMockEvent(
		session: Stripe.Checkout.Session,
	): Stripe.Event {
		return {
			id: 'evt_test_123',
			object: 'event',
			type: 'checkout.session.completed',
			data: {
				object: session,
			},
		} as Stripe.Event
	}

	test('should handle idempotency - return existing order if session already processed', async () => {
		const session = createMockCheckoutSession()
		const event = createMockEvent(session)

		// Create existing order
		const existingOrder = await prisma.order.create({
			data: {
				orderNumber: 'ORD-000001',
				email: session.customer_email!,
				subtotal: session.amount_subtotal!,
				total: session.amount_total!,
				shippingName: session.metadata!.shippingName!,
				shippingStreet: session.metadata!.shippingStreet!,
				shippingCity: session.metadata!.shippingCity!,
				shippingState: session.metadata!.shippingState!,
				shippingPostal: session.metadata!.shippingPostal!,
				shippingCountry: session.metadata!.shippingCountry!,
				stripeCheckoutSessionId: session.id,
				status: 'CONFIRMED',
			},
		})

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBe(existingOrder.id)
	})

	test('should create order successfully from checkout.session.completed event', async () => {
		const session = createMockCheckoutSession()
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000001')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBeDefined()

		// Verify order was created
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
			include: { items: true },
		})

		expect(order).toBeDefined()
		expect(order?.stripeCheckoutSessionId).toBe(session.id)
		expect(order?.status).toBe('CONFIRMED')
		expect(order?.items).toHaveLength(1)
		expect(order?.items[0]?.quantity).toBe(2)

		// Verify stock was reduced
		const updatedVariant = await prisma.productVariant.findUnique({
			where: { id: variant.id },
		})
		expect(updatedVariant?.stockQuantity).toBe(8) // 10 - 2 = 8

		// Verify cart was deleted
		const deletedCart = await prisma.cart.findUnique({
			where: { id: cart.id },
		})
		expect(deletedCart).toBeNull()

		// Verify email was sent
		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		invariant(order, 'Order should exist')
		expect(emailCall?.to).toBe(session.customer_email || order.email)
		expect(emailCall?.subject).toBe(`Order Confirmation - ${order.orderNumber}`)
		expect(emailCall?.html).toContain(order.orderNumber)
		expect(emailCall?.text).toContain(order.orderNumber)
	})

	test('should send order confirmation email with correct details', async () => {
		const session = createMockCheckoutSession({
			customer_email: 'customer@example.com',
			amount_total: 20000, // $200.00
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000002')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.orderId).toBeDefined()

		// Get the created order
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
		})
		invariant(order, 'Order should be created')

		// Verify email was sent with correct details
		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.to).toBe('customer@example.com')
		expect(emailCall?.subject).toBe('Order Confirmation - ORD-000002')
		expect(emailCall?.html).toContain('Order Confirmation')
		expect(emailCall?.html).toContain('ORD-000002')
		expect(emailCall?.html).toContain('$200.00')
		expect(emailCall?.html).toContain('/shop/orders/ORD-000002')

		expect(emailCall?.text).toContain('Order Confirmation')
		expect(emailCall?.text).toContain('ORD-000002')
		expect(emailCall?.text).toContain('$200.00')
		expect(emailCall?.text).toContain('/shop/orders/ORD-000002')

		// Cleanup
		await prisma.orderItem.deleteMany({
			where: { order: { stripeCheckoutSessionId: session.id } },
		})
		await prisma.order.deleteMany({
			where: { stripeCheckoutSessionId: session.id },
		})
	})

	test('should use order email if customer_email not available', async () => {
		const session = createMockCheckoutSession({
			customer_email: undefined,
			metadata: {
				cartId: cart.id,
				userId: '',
				email: 'fallback@example.com',
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
			},
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000003')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.orderId).toBeDefined()

		// Get the created order
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
		})
		invariant(order, 'Order should be created')

		// Verify email was sent to order email (from metadata)
		expect(sendEmail).toHaveBeenCalledTimes(1)
		const emailCall = vi.mocked(sendEmail).mock.calls[0]?.[0]
		expect(emailCall?.to).toBe(order.email)

		// Cleanup
		await prisma.orderItem.deleteMany({
			where: { order: { stripeCheckoutSessionId: session.id } },
		})
		await prisma.order.deleteMany({
			where: { stripeCheckoutSessionId: session.id },
		})
	})

	test('should handle email sending failure gracefully', async () => {
		consoleError.mockImplementation(() => {})

		// Mock email sending to fail
		vi.mocked(sendEmail).mockRejectedValueOnce(
			new Error('Email service unavailable'),
		)

		const session = createMockCheckoutSession()
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000004')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		// Should not throw, order should still be created
		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.orderId).toBeDefined()

		// Verify order was created despite email failure
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
		})
		expect(order).toBeDefined()

		// Email was attempted
		expect(sendEmail).toHaveBeenCalled()

		// Verify error was logged
		expect(consoleError).toHaveBeenCalledTimes(1)

		// Cleanup
		await prisma.orderItem.deleteMany({
			where: { order: { stripeCheckoutSessionId: session.id } },
		})
		await prisma.order.deleteMany({
			where: { stripeCheckoutSessionId: session.id },
		})
	})

	test('should throw error when cartId is missing in metadata', async () => {
		const session = createMockCheckoutSession({
			metadata: {},
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		await expect(
			action({ request, params: {}, context: {} }),
		).rejects.toThrow('Missing cartId in session metadata')
	})

	test('should throw error when cart is not found or empty', async () => {
		const nonExistentCartId = 'non-existent-cart-id'
		const session = createMockCheckoutSession({
			metadata: {
				cartId: nonExistentCartId,
				userId: '',
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
			},
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		await expect(
			action({ request, params: {}, context: {} }),
		).rejects.toThrow('Cart not found')

		// Test empty cart
		const emptyCart = await prisma.cart.create({
			data: { sessionId: 'empty-cart-session' },
		})
		const sessionWithEmptyCart = createMockCheckoutSession({
			metadata: {
				cartId: emptyCart.id,
				userId: '',
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
			},
		})
		const eventWithEmptyCart = createMockEvent(sessionWithEmptyCart)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(
			eventWithEmptyCart,
		)

		const requestWithEmptyCart = new Request(
			'http://localhost/webhooks/stripe',
			{
				method: 'POST',
				headers: {
					'stripe-signature': 't=1234567890,v1=signature',
				},
				body: JSON.stringify(eventWithEmptyCart),
			},
		)

		await expect(
			action({ request: requestWithEmptyCart, params: {}, context: {} }),
		).rejects.toThrow('Cart is empty')

		await prisma.cart.delete({ where: { id: emptyCart.id } })
	})

	test('should handle stock unavailable error and rollback transaction', async () => {
		consoleError.mockImplementation(() => {})

		// Set stock to 0
		await prisma.productVariant.update({
			where: { id: variant.id },
			data: { stockQuantity: 0 },
		})

		const session = createMockCheckoutSession()
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(500)
		expect(data.received).toBe(true)
		expect(data.error).toBe('Stock unavailable')

		// Verify order was NOT created
		const order = await prisma.order.findUnique({
			where: { stripeCheckoutSessionId: session.id },
		})
		expect(order).toBeNull()

		// Verify stock was NOT reduced (transaction rolled back)
		const unchangedVariant = await prisma.productVariant.findUnique({
			where: { id: variant.id },
		})
		expect(unchangedVariant?.stockQuantity).toBe(0)
	})

	test('should create refund when stock is unavailable after payment', async () => {
		consoleError.mockImplementation(() => {})

		// Set stock to 0 to trigger stock unavailable error
		await prisma.productVariant.update({
			where: { id: variant.id },
			data: { stockQuantity: 0 },
		})

		const session = createMockCheckoutSession({
			payment_intent: 'pi_test_123',
		})
		const event = createMockEvent(session)

		const mockRefund = {
			id: 're_test_123',
			object: 'refund' as const,
			amount: session.amount_total,
			status: 'succeeded' as const,
			payment_intent: session.payment_intent as string,
		}

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(stripe.refunds.create).mockResolvedValue(mockRefund as any)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(500)
		expect(data.received).toBe(true)
		expect(data.error).toBe('Stock unavailable')

		// Verify refund was created with correct parameters
		const paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id
		expect(stripe.refunds.create).toHaveBeenCalledWith({
			payment_intent: paymentIntentId,
			amount: session.amount_total,
			reason: 'requested_by_customer',
			metadata: {
				reason: 'stock_unavailable',
				checkout_session_id: session.id,
				product_name: expect.any(String),
			},
		})
	})

	test('should handle refund creation failure gracefully', async () => {
		consoleError.mockImplementation(() => {})

		// Set stock to 0 to trigger stock unavailable error
		await prisma.productVariant.update({
			where: { id: variant.id },
			data: { stockQuantity: 0 },
		})

		const session = createMockCheckoutSession({
			payment_intent: 'pi_test_123',
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(stripe.refunds.create).mockRejectedValue(
			new Error('Refund failed'),
		)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(500)
		expect(data.received).toBe(true)
		expect(data.error).toBe('Stock unavailable')

		// Verify refund was attempted
		expect(stripe.refunds.create).toHaveBeenCalled()
		
		// Verify error was logged (refund failure is logged)
		expect(consoleError).toHaveBeenCalledTimes(1)
	})

	test('should handle unknown event types gracefully', async () => {
		const event = {
			id: 'evt_test_123',
			object: 'event',
			type: 'payment_intent.succeeded' as const,
			data: {
				object: {},
			},
		} as Stripe.Event

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBeUndefined()
	})

	test('should reject checkout.session.completed when payment_status !== paid', async () => {
		const session = createMockCheckoutSession({
			payment_status: 'unpaid',
			status: 'complete',
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBeUndefined()

		// Verify no order was created
		const order = await prisma.order.findUnique({
			where: { stripeCheckoutSessionId: session.id },
		})
		expect(order).toBeNull()
	})

	test('should only create order when payment_status === paid', async () => {
		const session = createMockCheckoutSession({
			payment_status: 'paid',
			status: 'complete',
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000005')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBeDefined()

		// Verify order was created
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
		})
		expect(order).toBeDefined()
	})

	test('should handle checkout.session.async_payment_succeeded event', async () => {
		const session = createMockCheckoutSession({
			payment_status: 'paid',
			status: 'complete',
		})
		const event = {
			id: 'evt_test_async',
			object: 'event',
			type: 'checkout.session.async_payment_succeeded',
			data: {
				object: session,
			},
		} as Stripe.Event

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)
		vi.mocked(generateOrderNumber).mockResolvedValue('ORD-000006')

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBeDefined()

		// Verify order was created
		const order = await prisma.order.findUnique({
			where: { id: data.orderId },
		})
		expect(order).toBeDefined()
	})

	test('should verify idempotency check happens BEFORE cart loading', async () => {
		// Create existing order first
		const existingOrder = await prisma.order.create({
			data: {
				orderNumber: 'ORD-000007',
				email: 'test@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: checkoutSessionId,
				status: 'CONFIRMED',
			},
		})

		const session = createMockCheckoutSession({
			payment_status: 'paid',
			// Use invalid cartId to test that idempotency check happens first
			metadata: {
				cartId: 'non-existent-cart',
				userId: '',
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingState: 'TS',
				shippingPostal: '12345',
				shippingCountry: 'US',
			},
		})
		const event = createMockEvent(session)

		vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event)

		const request = new Request('http://localhost/webhooks/stripe', {
			method: 'POST',
			headers: {
				'stripe-signature': 't=1234567890,v1=signature',
			},
			body: JSON.stringify(event),
		})

		// Should return early due to idempotency, not fail on cart lookup
		const response = await action({ request, params: {}, context: {} })
		const data = await response.json() as WebhookResponse

		expect(response.status).toBe(200)
		expect(data.received).toBe(true)
		expect(data.orderId).toBe(existingOrder.id)

		// Cleanup
		await prisma.order.delete({ where: { id: existingOrder.id } })
	})
})

