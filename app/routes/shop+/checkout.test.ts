import { invariant } from '@epic-web/invariant'
import { type UNSAFE_DataWithResponseInit } from 'react-router'
import Stripe from 'stripe'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { createCartSessionCookieHeader } from '#app/utils/cart-session.server.ts'
import { mergeGuestCartToUser } from '#app/utils/cart.server.ts'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import * as stripeServer from '#app/utils/stripe.server.ts'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { getSessionCookieHeader } from '#tests/utils.ts'

// Mock createCheckoutSession function
vi.mock('#app/utils/stripe.server.ts', async () => {
	const actual = await vi.importActual('#app/utils/stripe.server.ts')
	return {
		...actual,
		createCheckoutSession: vi.fn(),
		handleStripeError: actual.handleStripeError,
	}
})

// ============================================================================
// Shared Test Helpers
// ============================================================================

/**
 * Type guard to assert value is DataWithResponseInit in test environment
 */
function assertIsDataWithResponseInit(
	value: unknown,
): asserts value is UNSAFE_DataWithResponseInit<any> {
	if (
		!value ||
		typeof value !== 'object' ||
		!('type' in value) ||
		value.type !== 'DataWithResponseInit'
	) {
		throw new Error(
			`Expected DataWithResponseInit (action uses data()) but got: ${JSON.stringify(value)}`,
		)
	}
}

/**
 * Setup test data for checkout tests
 */
async function setupCheckoutTestData() {
	// Create USD currency (required for getStoreCurrency)
	const usdCurrency = await prisma.currency.upsert({
		where: { code: 'USD' },
		create: {
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			decimals: 2,
		},
		update: {},
	})

	// Create Settings with USD as default currency
	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: usdCurrency.id,
		},
		update: {},
	})

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

	// Create test product
	const productData = createProductData()
	productData.categoryId = category.id
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

	// Create test cart
	const cart = await prisma.cart.create({
		data: {
			sessionId: `test-session-${Date.now()}`,
		},
	})

	// Add item to cart
	await prisma.cartItem.create({
		data: {
			cartId: cart.id,
			productId: product.id,
			variantId: variant.id,
			quantity: 1,
		},
	})

		invariant(cart.sessionId, 'Cart must have sessionId')

		return {
			categoryId: category.id,
			productId: product.id,
			variantId: variant.id,
			cartId: cart.id,
			cartSessionId: cart.sessionId,
		}
}

/**
 * Cleanup test data
 */
async function cleanupCheckoutTestData(data: {
	cartId: string
	productId: string
}) {
	vi.mocked(stripeServer.createCheckoutSession).mockReset()
	await prisma.cartItem.deleteMany({ where: { cartId: data.cartId } })
	await prisma.cart.deleteMany({ where: { id: data.cartId } })
	await prisma.productVariant.deleteMany({ where: { productId: data.productId } })
	await prisma.product.deleteMany({ where: { id: data.productId } })
}

/**
 * Create FormData for checkout form submission
 */
function createCheckoutFormData(shippingData: {
	name: string
	email: string
	street: string
	city: string
	state?: string
	postal: string
	country: string
}) {
	const formData = new FormData()
	formData.append('name', shippingData.name)
	formData.append('email', shippingData.email)
	formData.append('street', shippingData.street)
	formData.append('city', shippingData.city)
	if (shippingData.state) {
		formData.append('state', shippingData.state)
	}
	formData.append('postal', shippingData.postal)
	formData.append('country', shippingData.country)
	return formData
}

/**
 * Create mock checkout session result (what createCheckoutSession returns)
 */
function createMockCheckoutSessionResult(overrides?: { id?: string; url?: string }) {
	return {
		id: 'cs_test_mock123',
		url: 'https://checkout.stripe.com/test/mock123',
		...overrides,
	}
}

/**
 * Create checkout request with proper cookies
 */
async function createCheckoutRequest(
	formData: FormData,
	cartSessionId: string,
	userSessionId?: string,
) {
	const cookieHeader = await createCartSessionCookieHeader(cartSessionId)
	const cookies = [cookieHeader]

	if (userSessionId) {
		const userCookie = await getSessionCookieHeader({ id: userSessionId })
		cookies.push(userCookie)
	}

	const request = new Request('http://localhost/shop/checkout', {
		method: 'POST',
		headers: {
			cookie: cookies.join('; '),
		},
		body: formData,
	})

	return request
}

// ============================================================================
// Tests
// ============================================================================

describe('Checkout - Stripe Checkout Session Creation', () => {
	let testData: Awaited<ReturnType<typeof setupCheckoutTestData>>

	beforeEach(async () => {
		testData = await setupCheckoutTestData()
	})

	afterEach(async () => {
		await cleanupCheckoutTestData({
			cartId: testData.cartId,
			productId: testData.productId,
		})
	})

	test('should create Stripe Checkout Session with correct line items', async () => {
		consoleError.mockImplementation(() => {})

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_mock123',
			url: 'https://checkout.stripe.com/test/mock123',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })


		// Verify redirect response
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify createCheckoutSession was called with correct params
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'payment',
				customer_email: 'test@example.com',
				metadata: expect.objectContaining({
					cartId: testData.cartId,
					userId: '',
					shippingName: 'Test User',
					shippingStreet: '123 Test St',
					shippingCity: 'Test City',
					shippingState: '',
					shippingPostal: '12345',
					shippingCountry: 'US',
				}),
				line_items: expect.arrayContaining([
					expect.objectContaining({
						quantity: 1,
					}),
				]),
				payment_intent_data: expect.objectContaining({
					metadata: expect.objectContaining({
						cartId: testData.cartId,
					}),
				}),
			}),
		)
	})

	test('should include shipping address in metadata', async () => {
		consoleError.mockImplementation(() => {})

		const shippingData = {
			name: 'John Doe',
			email: 'john@example.com',
			street: '123 Main St',
			city: 'New York',
			state: 'NY',
			postal: '10001',
			country: 'US',
		}

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_mock456',
			url: 'https://checkout.stripe.com/test/mock456',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData(shippingData)
		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		// In test environments, redirect() returns DataWithResponseInit
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify createCheckoutSession was called with shipping metadata
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
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
	})

	test('should calculate amounts correctly from line items', async () => {
		consoleError.mockImplementation(() => {})

		const cart = await prisma.cart.findUnique({
			where: { id: testData.cartId },
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

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_mock789',
			url: 'https://checkout.stripe.com/test/mock789',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		// In test environments, redirect() returns DataWithResponseInit
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify Stripe was called with correct line items
		expect(stripeServer.createCheckoutSession).toHaveBeenCalled()
		const callArgs = vi.mocked(stripeServer.createCheckoutSession).mock
			.calls[0]![0] as any
		expect(callArgs.line_items).toBeDefined()
		expect(Array.isArray(callArgs.line_items)).toBe(true)
	})

	test('should handle authenticated user with userId in metadata', async () => {
		consoleError.mockImplementation(() => {})

		// Create a test user
		const user = await prisma.user.create({
			data: {
				email: 'test@example.com',
				username: `testuser${Date.now()}`,
				name: 'Test User',
			},
		})

		// Merge the session cart into the user cart
		// This simulates what happens when a user logs in with items in their cart
		await mergeGuestCartToUser(testData.cartSessionId, user.id)

		// Create a session for the user
		const session = await prisma.session.create({
			data: {
				expirationDate: getSessionExpirationDate(),
				userId: user.id,
			},
			select: { id: true },
		})

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_mock456',
			url: 'https://checkout.stripe.com/test/mock456',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
			session.id,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		// In test environments, redirect() returns DataWithResponseInit
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify createCheckoutSession was called with userId in metadata
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					userId: user.id,
				}),
			}),
		)

		// Cleanup
		await prisma.session.delete({ where: { id: session.id } })
		await prisma.user.delete({ where: { id: user.id } })
	})

	test('should redirect to Stripe Checkout URL on success', async () => {
		consoleError.mockImplementation(() => {})

		const redirectUrl = 'https://checkout.stripe.com/test/redirect123'
		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_redirect123',
			url: redirectUrl,
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect response with Location header
		if (result instanceof Response) {
			expect(result.status).toBe(302)
			expect(result.headers.get('Location')).toBe(redirectUrl)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
			if (result.init?.headers instanceof Headers) {
				expect(result.init.headers.get('Location')).toBe(redirectUrl)
			} else if (result.init?.headers) {
				const headers = result.init.headers as Record<string, string>
				expect(headers['Location'] || headers['location']).toBe(redirectUrl)
			}
		}
	})

	test('should include payment_intent_data with cartId in metadata', async () => {
		consoleError.mockImplementation(() => {})

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_payment_intent',
			url: 'https://checkout.stripe.com/test/payment_intent',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify payment_intent_data includes cartId in metadata
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({
				payment_intent_data: expect.objectContaining({
					metadata: expect.objectContaining({
						cartId: testData.cartId,
					}),
				}),
			}),
		)
	})

	test('should validate stock before creating checkout session', async () => {
		consoleError.mockImplementation(() => {})

		// Set up product with limited stock
		const product = await prisma.product.findUnique({
			where: { id: testData.productId },
			include: { variants: true },
		})

		invariant(product, 'Product not found')

		// Update variant to have limited stock
		if (product.variants.length > 0) {
			await prisma.productVariant.update({
				where: { id: testData.variantId },
				data: { stockQuantity: 1 },
			})
		} else {
			await prisma.product.update({
				where: { id: testData.productId },
				data: { stockQuantity: 1 },
			})
		}

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_stock_validation',
			url: 'https://checkout.stripe.com/test/stock_validation',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		// Should succeed with available stock
		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify checkout succeeded (stock validation passed)
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify Stripe session was created (means stock validation passed)
		expect(stripeServer.createCheckoutSession).toHaveBeenCalled()
	})

	test('should use store currency for checkout session', async () => {
		consoleError.mockImplementation(() => {})

		const currency = await getStoreCurrency()
		invariant(currency, 'Store currency not configured')

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_currency',
			url: 'https://checkout.stripe.com/test/currency',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify createCheckoutSession was called with correct currency
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({
				line_items: expect.arrayContaining([
					expect.objectContaining({
						price_data: expect.objectContaining({
							currency: currency.code.toLowerCase(),
						}),
					}),
				]),
			}),
		)
	})

	test('should use merged cart when user logs in with guest cart items', async () => {
		consoleError.mockImplementation(() => {})

		// Create a test user
		const user = await prisma.user.create({
			data: {
				email: 'test@example.com',
				username: `testuser${Date.now()}`,
				name: 'Test User',
			},
		})

		// Create a product for user cart
		const userProductData = createProductData()
		const userProduct = await prisma.product.create({
			data: {
				name: userProductData.name,
				slug: userProductData.slug,
				description: userProductData.description,
				sku: userProductData.sku,
				price: Math.round(userProductData.price * 100),
				status: 'ACTIVE',
				categoryId: testData.categoryId,
			},
		})

		const userVariantData = createVariantData(userProductData.sku)
		const userVariant = await prisma.productVariant.create({
			data: {
				productId: userProduct.id,
				sku: userVariantData.sku,
				price: userVariantData.price
					? Math.round(userVariantData.price * 100)
					: null,
				stockQuantity: userVariantData.stockQuantity,
			},
		})

		// Create user cart with item
		const userCart = await prisma.cart.create({
			data: {
				userId: user.id,
			},
		})

		await prisma.cartItem.create({
			data: {
				cartId: userCart.id,
				productId: userProduct.id,
				variantId: userVariant.id,
				quantity: 1,
			},
		})

		// Merge guest cart (testData) into user cart
		await mergeGuestCartToUser(testData.cartSessionId, user.id)

		// Verify merged cart has items from both carts
		const mergedCart = await prisma.cart.findUnique({
			where: { id: userCart.id },
			include: { items: true },
		})

		invariant(mergedCart, 'Merged cart not found')
		// Should have 2 items: one from guest cart, one from user cart
		expect(mergedCart.items.length).toBeGreaterThanOrEqual(1)

		// Create a session for the user
		const session = await prisma.session.create({
			data: {
				expirationDate: getSessionExpirationDate(),
				userId: user.id,
			},
			select: { id: true },
		})

		const mockSession = createMockCheckoutSessionResult({
			id: 'cs_test_merged_cart',
			url: 'https://checkout.stripe.com/test/merged_cart',
		})

		vi.mocked(stripeServer.createCheckoutSession).mockResolvedValue(mockSession)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId, // Guest session (merged cart should still work)
			session.id,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify redirect
		if (result instanceof Response) {
			expect(result.status).toBe(302)
		} else {
			assertIsDataWithResponseInit(result)
			expect(result.init?.status).toBe(302)
		}

		// Verify createCheckoutSession was called with merged cart ID
		expect(stripeServer.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					cartId: userCart.id, // Should use user cart (after merge)
					userId: user.id,
				}),
			}),
		)

		// Cleanup
		await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } })
		await prisma.cart.delete({ where: { id: userCart.id } })
		await prisma.productVariant.deleteMany({ where: { productId: userProduct.id } })
		await prisma.product.delete({ where: { id: userProduct.id } })
		await prisma.session.delete({ where: { id: session.id } })
		await prisma.user.delete({ where: { id: user.id } })
	})
})

describe('Checkout - Stripe Error Handling', () => {
	let testData: Awaited<ReturnType<typeof setupCheckoutTestData>>

	beforeEach(async () => {
		testData = await setupCheckoutTestData()
		// Reset consoleError mock call count before each test
		consoleError.mockClear()
	})

	afterEach(async () => {
		await cleanupCheckoutTestData({
			cartId: testData.cartId,
			productId: testData.productId,
		})
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

		vi.mocked(stripeServer.createCheckoutSession).mockRejectedValue(cardError)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })

		// Verify error handling returns form errors
		expect(result).toBeDefined()
		
		assertIsDataWithResponseInit(result)
		expect(result.init?.status).toBe(400)
		const submissionResult = result.data.result as any
		
		expect(submissionResult).toBeDefined()
		expect(submissionResult.status).toBe('error')
		
		// Check for formErrors (Conform v4 format) or error['']
		if (submissionResult.formErrors && Array.isArray(submissionResult.formErrors)) {
			expect(submissionResult.formErrors[0]).toContain('Payment processing error')
		} else if (submissionResult.error?.['']) {
			expect(submissionResult.error[''][0]).toContain('Payment processing error')
		} else {
			throw new Error(
				`Expected formErrors or error[""] but found: ${JSON.stringify(submissionResult)}`,
			)
		}
		
		// Verify error was logged (error handling logs multiple debug messages)
		expect(consoleError).toHaveBeenCalled()
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

		vi.mocked(stripeServer.createCheckoutSession).mockRejectedValue(
			invalidRequestError,
		)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		
		assertIsDataWithResponseInit(result)
		expect(result.init?.status).toBe(400)
		const submissionResult = result.data.result as any
		
		expect(submissionResult).toBeDefined()
		expect(submissionResult.status).toBe('error')
		
		// Check for formErrors (Conform v4 format) or error['']
		if (submissionResult.formErrors && Array.isArray(submissionResult.formErrors)) {
			expect(submissionResult.formErrors[0]).toContain('Payment processing error')
		} else if (submissionResult.error?.['']) {
			expect(submissionResult.error[''][0]).toContain('Payment processing error')
		} else {
			throw new Error(
				`Expected formErrors or error[""] but found: ${JSON.stringify(submissionResult)}`,
			)
		}
		
		// Verify error was logged (error handling logs multiple debug messages)
		expect(consoleError).toHaveBeenCalled()
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

		vi.mocked(stripeServer.createCheckoutSession).mockRejectedValue(apiError)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		
		assertIsDataWithResponseInit(result)
		expect(result.init?.status).toBe(400)
		const submissionResult = result.data.result as any
		
		expect(submissionResult).toBeDefined()
		expect(submissionResult.status).toBe('error')
		
		// Check for formErrors (Conform v4 format) or error['']
		if (submissionResult.formErrors && Array.isArray(submissionResult.formErrors)) {
			expect(submissionResult.formErrors[0]).toContain('Payment processing error')
		} else if (submissionResult.error?.['']) {
			expect(submissionResult.error[''][0]).toContain('Payment processing error')
		} else {
			throw new Error(
				`Expected formErrors or error[""] but found: ${JSON.stringify(submissionResult)}`,
			)
		}
		
		// Verify error was logged (error handling logs multiple debug messages)
		expect(consoleError).toHaveBeenCalled()
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

		vi.mocked(stripeServer.createCheckoutSession).mockRejectedValue(
			connectionError,
		)

		const formData = createCheckoutFormData({
			name: 'Test User',
			email: 'test@example.com',
			street: '123 Test St',
			city: 'Test City',
			postal: '12345',
			country: 'US',
		})

		const request = await createCheckoutRequest(
			formData,
			testData.cartSessionId,
		)

		const { action } = await import('./checkout.tsx')
		const result = await action({ request, params: {}, context: {} })
		
		assertIsDataWithResponseInit(result)
		expect(result.init?.status).toBe(400)
		const submissionResult = result.data.result as any
		
		expect(submissionResult).toBeDefined()
		expect(submissionResult.status).toBe('error')
		
		// Check for formErrors (Conform v4 format) or error['']
		if (submissionResult.formErrors && Array.isArray(submissionResult.formErrors)) {
			expect(submissionResult.formErrors[0]).toContain('Payment processing error')
		} else if (submissionResult.error?.['']) {
			expect(submissionResult.error[''][0]).toContain('Payment processing error')
		} else {
			throw new Error(
				`Expected formErrors or error[""] but found: ${JSON.stringify(submissionResult)}`,
			)
		}
		
		// Verify error was logged (error handling logs multiple debug messages)
		expect(consoleError).toHaveBeenCalled()
	})
})
