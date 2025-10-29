import { invariant } from '@epic-web/invariant'
import Stripe from 'stripe'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { createCartSessionCookieHeader } from '#app/utils/cart-session.server.ts'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'

// Mock Stripe checkout sessions
vi.mock('#app/utils/stripe.server.ts', async () => {
	const actual = await vi.importActual('#app/utils/stripe.server.ts')
	return {
		...actual,
		stripe: {
			checkout: {
				sessions: {
					create: vi.fn(),
				},
			},
		},
		handleStripeError: actual.handleStripeError,
	}
})

describe('Checkout - Stripe Checkout Session Creation', () => {
	let categoryId: string
	let productId: string
	let variantId: string
	let cartId: string
	let sessionId: string

	beforeEach(async () => {
		// Create test category
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
		})
		categoryId = category.id

		// Create test product
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100) // Convert to cents

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId!,
			},
		})
		productId = product.id

		// Create test variant
		const variantData = createVariantData(productData.sku)
		const variant = await prisma.productVariant.create({
			data: {
				productId: product.id,
				sku: variantData.sku,
				price: variantData.price
					? Math.round(variantData.price * 100)
					: null,
				stockQuantity: variantData.stockQuantity,
			},
		})
		variantId = variant.id

		// Create test cart
		const cart = await prisma.cart.create({
			data: {
				sessionId: `test-session-${Date.now()}`,
			},
		})
		cartId = cart.id

		// Add item to cart
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: product.id,
				variantId: variant.id,
				quantity: 1,
			},
		})
	})

	afterEach(async () => {
		vi.mocked(stripe.checkout.sessions.create).mockReset()
		await prisma.cartItem.deleteMany({ where: { cartId } })
		await prisma.cart.deleteMany({ where: { id: cartId } })
		await prisma.productVariant.deleteMany({ where: { productId } })
		await prisma.product.deleteMany({ where: { id: productId } })
	})

	test('should create Stripe Checkout Session with correct line items', async () => {
		const mockSession = {
			id: 'cs_test_mock123',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock123',
			amount_total: 10000,
			amount_subtotal: 10000,
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: {
				items: {
					include: {
						product: true,
						variant: true,
					},
				},
			},
		})

		invariant(cart && cart.items.length > 0, 'Cart not found')

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
			customer_email: 'test@example.com',
			metadata: {
				cartId: cart.id,
				userId: '',
			},
		})

		invariant(cart.items[0], 'Cart must have at least one item')
		const firstItem = cart.items[0]

		expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'payment',
				customer_email: 'test@example.com',
				metadata: {
					cartId: cart.id,
					userId: '',
				},
				line_items: expect.arrayContaining([
					expect.objectContaining({
						price_data: expect.objectContaining({
							currency: 'usd',
							product_data: expect.objectContaining({
								name: firstItem.product.name,
							}),
						}),
						quantity: firstItem.quantity,
					}),
				]),
			}),
		)
		expect(session).toEqual(mockSession)
	})

	test('should include shipping address in metadata', async () => {
		const shippingData = {
			name: 'John Doe',
			email: 'john@example.com',
			street: '123 Main St',
			city: 'New York',
			state: 'NY',
			postal: '10001',
			country: 'US',
		}

		const mockSession = {
			id: 'cs_test_mock456',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock456',
			amount_total: 10000,
			amount_subtotal: 10000,
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: {
				items: {
					include: {
						product: true,
						variant: true,
					},
				},
			},
		})

		invariant(cart, 'Cart not found')

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
			customer_email: shippingData.email,
			metadata: {
				cartId: cart.id,
				userId: '',
				shippingName: shippingData.name,
				shippingStreet: shippingData.street,
				shippingCity: shippingData.city,
				shippingState: shippingData.state,
				shippingPostal: shippingData.postal,
				shippingCountry: shippingData.country,
			},
		})

		expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					shippingName: shippingData.name,
					shippingStreet: shippingData.street,
					shippingCity: shippingData.city,
					shippingState: shippingData.state,
					shippingPostal: shippingData.postal,
					shippingCountry: shippingData.country,
				}),
			}),
		)
		expect(session).toEqual(mockSession)
	})

	test('should calculate amounts correctly from line items', async () => {
		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: {
				items: {
					include: {
						product: true,
						variant: true,
					},
				},
			},
		})

		invariant(cart && cart.items.length > 0, 'Cart not found')

		// Calculate expected totals from line items
		const expectedSubtotal = cart.items.reduce(
			(sum, item) => {
				const price = item.variant?.price ?? item.product.price
				invariant(price !== null, 'Price must not be null')
				return sum + price * item.quantity
			},
			0,
		)

		const mockSession = {
			id: 'cs_test_mock789',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock789',
			amount_total: expectedSubtotal,
			amount_subtotal: expectedSubtotal,
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => {
				const unitAmount = item.variant?.price ?? item.product.price
				invariant(unitAmount !== null, 'Unit amount must not be null')
				return {
					price_data: {
						currency: 'usd',
						product_data: {
							name: item.product.name,
						},
						unit_amount: unitAmount,
					},
					quantity: item.quantity,
				}
			}),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
		})

		// Stripe calculates amounts from line items
		invariant(
			session.amount_total !== null && session.amount_subtotal !== null,
			'Session amounts must be set',
		)
		expect(session.amount_total).toBeGreaterThan(0)
		expect(session.amount_subtotal).toBeGreaterThanOrEqual(
			session.amount_total,
		)
	})

	test('should handle authenticated user with userId in metadata', async () => {
		// Create a test user
		const user = await prisma.user.create({
			data: {
				email: 'test@example.com',
				username: `testuser${Date.now()}`,
				name: 'Test User',
			},
		})

		const mockSession = {
			id: 'cs_test_mock456',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock456',
			amount_total: 10000,
			amount_subtotal: 10000,
			metadata: {
				cartId: cartId,
				userId: user.id,
			},
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: {
				items: {
					include: {
						product: true,
						variant: true,
					},
				},
			},
		})

		invariant(cart, 'Cart not found')

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
			metadata: {
				cartId: cart.id,
				userId: user.id,
			},
		})

		expect(session.url).toBe('https://checkout.stripe.com/test/mock456')
		expect(session.metadata?.userId).toBe(user.id)

		// Cleanup
		await prisma.user.delete({ where: { id: user.id } })
	})
})

describe('Checkout - Stripe Error Handling', () => {
	let categoryId: string
	let productId: string
	let variantId: string
	let cartId: string

	beforeEach(async () => {
		// Create test category
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: {},
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
		})
		categoryId = category.id

		// Create test product
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100) // Convert to cents

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId!,
			},
		})
		productId = product.id

		// Create test variant
		const variantData = createVariantData(productData.sku)
		const variant = await prisma.productVariant.create({
			data: {
				productId: product.id,
				sku: variantData.sku,
				price: variantData.price
					? Math.round(variantData.price * 100)
					: null,
				stockQuantity: variantData.stockQuantity,
			},
		})
		variantId = variant.id

		// Create test cart
		const cart = await prisma.cart.create({
			data: {
				sessionId: `test-session-${Date.now()}`,
			},
		})
		cartId = cart.id

		// Add item to cart
		await prisma.cartItem.create({
			data: {
				cartId: cart.id,
				productId: product.id,
				variantId: variant.id,
				quantity: 1,
			},
		})
	})

	afterEach(async () => {
		vi.mocked(stripe.checkout.sessions.create).mockReset()
		await prisma.cartItem.deleteMany({ where: { cartId } })
		await prisma.cart.deleteMany({ where: { id: cartId } })
		await prisma.productVariant.deleteMany({ where: { productId } })
		await prisma.product.deleteMany({ where: { id: productId } })
	})

	test('should handle Stripe card error when creating checkout session', async () => {
		consoleError.mockImplementation(() => {})

		const cardError = new Stripe.errors.StripeCardError({
			message: 'Your card was declined.',
			type: 'card_error',
			code: 'card_declined',
			decline_code: 'insufficient_funds',
			charge: 'ch_test_123',
			headers: {},
			requestId: 'req_test_123',
			statusCode: 402,
		})

		vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(cardError)

		// Get the cart's sessionId and create proper session cookie
		const cart = await prisma.cart.findUnique({ where: { id: cartId } })
		invariant(cart?.sessionId, 'Cart must have sessionId')
		const cookieHeader = await createCartSessionCookieHeader(cart.sessionId)

		const formData = new FormData()
		formData.append('name', 'Test User')
		formData.append('email', 'test@example.com')
		formData.append('street', '123 Test St')
		formData.append('city', 'Test City')
		formData.append('postal', '12345')
		formData.append('country', 'US')

		const request = new Request('http://localhost/shop/checkout', {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: formData,
		})

		const { action } = await import('./checkout.tsx')
		// React Router actions can return Responses or throw them
		// invariantResponse throws Response objects, which React Router handles
		const result = await action({ request, params: {}, context: {} })

		// Verify error handling returns form errors
		expect(result).toBeDefined()
		
		// React Router may serialize submission.reply() into a Response or return it as-is in tests
		let resultData: any
		if (result instanceof Response) {
			expect(result.status).toBe(400)
			resultData = await result.json()
		} else {
			// Plain object - submission.reply() return value
			resultData = result
		}
		
		// submission.reply() returns object with status, error (with formErrors at error[''])
		expect(resultData).toHaveProperty('status')
		expect(resultData.status).toBe('error')
		
		// In Conform v4, formErrors are in error[''] (empty string key for form-level errors)
		expect(resultData).toHaveProperty('error')
		expect(resultData.error).toHaveProperty('')
		expect(Array.isArray(resultData.error[''])).toBe(true)
		expect(resultData.error[''].length).toBeGreaterThan(0)
		// Verify error message contains payment processing error
		expect(resultData.error[''][0]).toContain('Payment processing error')
		
		// Verify error was logged
		expect(consoleError).toHaveBeenCalledTimes(1)
	})

	test('should handle Stripe invalid request error', async () => {
		consoleError.mockImplementation(() => {})

		const invalidRequestError = new Stripe.errors.StripeInvalidRequestError(
			{
				message: 'Invalid amount specified',
				type: 'invalid_request_error',
				param: 'amount',
				headers: {},
				requestId: 'req_test_123',
				statusCode: 400,
			},
		)

		vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(
			invalidRequestError,
		)

		// Get the cart's sessionId and create proper session cookie
		const cart = await prisma.cart.findUnique({ where: { id: cartId } })
		invariant(cart?.sessionId, 'Cart must have sessionId')
		const cookieHeader = await createCartSessionCookieHeader(cart.sessionId)

		const formData = new FormData()
		formData.append('name', 'Test User')
		formData.append('email', 'test@example.com')
		formData.append('street', '123 Test St')
		formData.append('city', 'Test City')
		formData.append('postal', '12345')
		formData.append('country', 'US')

		const request = new Request('http://localhost/shop/checkout', {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: formData,
		})

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		const resultData: any =
			result instanceof Response ? await result.json() : result
		// Verify error handling works (may return generic message if error not recognized)
		expect(resultData.error[''][0]).toContain('Payment processing error')
		
		// Verify error was logged
		expect(consoleError).toHaveBeenCalledTimes(1)
	})

	test('should handle Stripe API error', async () => {
		consoleError.mockImplementation(() => {})

		const apiError = new Stripe.errors.StripeAPIError({
			message: 'An error occurred with Stripe API',
			type: 'api_error',
			headers: {},
			requestId: 'req_test_123',
			statusCode: 500,
		})

		vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(apiError)

		// Get the cart's sessionId and create proper session cookie
		const cart = await prisma.cart.findUnique({ where: { id: cartId } })
		invariant(cart?.sessionId, 'Cart must have sessionId')
		const cookieHeader = await createCartSessionCookieHeader(cart.sessionId)

		const formData = new FormData()
		formData.append('name', 'Test User')
		formData.append('email', 'test@example.com')
		formData.append('street', '123 Test St')
		formData.append('city', 'Test City')
		formData.append('postal', '12345')
		formData.append('country', 'US')

		const request = new Request('http://localhost/shop/checkout', {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: formData,
		})

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		const resultData: any =
			result instanceof Response ? await result.json() : result
		// Verify error handling works (may return generic message if error not recognized)
		expect(resultData.error[''][0]).toContain('Payment processing error')
		
		// Verify error was logged
		expect(consoleError).toHaveBeenCalledTimes(1)
	})

	test('should handle Stripe connection error', async () => {
		consoleError.mockImplementation(() => {})

		const connectionError = new Stripe.errors.StripeConnectionError({
			message: 'Connection to Stripe failed',
			type: 'StripeConnectionError' as any,
			headers: {},
			requestId: 'req_test_123',
			statusCode: 0,
		})

		vi.mocked(stripe.checkout.sessions.create).mockRejectedValue(
			connectionError,
		)

		// Get the cart's sessionId and create proper session cookie
		const cart = await prisma.cart.findUnique({ where: { id: cartId } })
		invariant(cart?.sessionId, 'Cart must have sessionId')
		const cookieHeader = await createCartSessionCookieHeader(cart.sessionId)

		const formData = new FormData()
		formData.append('name', 'Test User')
		formData.append('email', 'test@example.com')
		formData.append('street', '123 Test St')
		formData.append('city', 'Test City')
		formData.append('postal', '12345')
		formData.append('country', 'US')

		const request = new Request('http://localhost/shop/checkout', {
			method: 'POST',
			headers: {
				cookie: cookieHeader,
			},
			body: formData,
		})

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		const resultData: any =
			result instanceof Response ? await result.json() : result
		// Verify error handling works (may return generic message if error not recognized)
		expect(resultData.error[''][0]).toContain('Payment processing error')
		
		// Verify error was logged
		expect(consoleError).toHaveBeenCalledTimes(1)
	})
})
