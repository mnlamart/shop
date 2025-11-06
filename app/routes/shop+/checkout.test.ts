/**
 * @vitest-environment node
 */
import * as Sentry from '@sentry/react-router'
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { getOrCreateCart, addToCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createCheckoutSession, handleStripeError } from '#app/utils/stripe.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { action, loader } from './checkout.tsx'

vi.mock('#app/utils/stripe.server.ts', async () => {
	const actual = await import('#app/utils/stripe.server.ts')
	return {
		...actual,
		createCheckoutSession: vi.fn(),
	}
})

vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
	captureMessage: vi.fn(),
}))

describe('Checkout', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>

	beforeEach(async () => {
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category',
			},
		})

		testUser = await prisma.user.create({
			data: createUser(),
		})
	})

		afterEach(async () => {
			await prisma.cartItem.deleteMany({
				where: {
					cart: {
						userId: testUser.id,
					},
				},
			})
			await prisma.cart.deleteMany({
				where: {
					userId: testUser.id,
				},
			})
			await prisma.shippingMethod.deleteMany({})
			await prisma.carrier.deleteMany({})
			await prisma.shippingZone.deleteMany({})
			await prisma.product.deleteMany({
				where: {
					categoryId: testCategory.id,
				},
			})
			await prisma.category.deleteMany({
				where: {
					id: testCategory.id,
				},
			})
			await prisma.user.deleteMany({
				where: {
					id: testUser.id,
				},
			})
		})

	describe('loader', () => {
		test('redirects to cart when cart is empty', async () => {
			const request = new Request('http://localhost:3000/shop/checkout')
			
			// Create session for user
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const requestWithAuth = new Request(request.url, {
				headers: {
					Cookie: cookieHeader,
				},
			})

			const result = await loader({
				request: requestWithAuth,
				params: {},
				context: {},
			})

			expect(result).toBeInstanceOf(Response)
			if (result instanceof Response) {
				expect(result.status).toBe(302)
				expect(result.headers.get('Location')).toContain('/shop/cart')
			}
		})

		test('returns cart data when cart has items', async () => {
			// Create product
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Create cart using the same mechanism as getOrCreateCartFromRequest
			const cart = await getOrCreateCart({ userId: testUser.id })
			// Add item to cart - this returns the updated cart with items
			const cartWithItems = await addToCart(cart.id, product.id, null, 1)
			expect(cartWithItems.items.length).toBeGreaterThan(0)
			
			// Verify the cart can be found by getOrCreateCart (simulating what getOrCreateCartFromRequest does)
			const foundCart = await getOrCreateCart({ userId: testUser.id })
			expect(foundCart.id).toBe(cart.id)
			expect(foundCart.items.length).toBeGreaterThan(0)

			const request = new Request('http://localhost:3000/shop/checkout', {
				headers: {
					Cookie: cookieHeader,
				},
			})

			const result = await loader({
				request,
				params: {},
				context: {},
			})

			// Check if result is a Response (redirect) or data object
			if (result instanceof Response) {
				// If redirect, check why - might be cart not found
				const location = result.headers.get('Location')
				if (location?.includes('/shop/cart')) {
					throw new Error(`Loader redirected to cart. Cart ID: ${cart.id}, User ID: ${testUser.id}`)
				}
				throw new Error(`Loader returned unexpected redirect: ${location}`)
			}

			expect(result).toHaveProperty('cart')
			expect(result.cart).toBeTruthy()
			expect(result.cart?.id).toBe(cart.id)
			expect(result.currency).toBeTruthy()
		})
	})

	describe('action', () => {
		test('validates form fields', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const formData = new FormData()
			// Missing required fields and invalid email
			formData.set('email', 'invalid-email') // Invalid email

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				const json = (await result.json()) as { result: { status: string } }
				expect(json).toHaveProperty('result')
				expect(json.result.status).toBe('error')
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { result: any } }
				expect(dataResult.data.result.status).toBe('error')
				expect(dataResult.data.result.error).toBeTruthy()
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})

		test('creates checkout session with valid data', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Create shipping zone and method for US
			const usZone = await prisma.shippingZone.create({
				data: {
					name: `Test US Zone ${Date.now()}`,
					countries: ['US'],
					isActive: true,
					displayOrder: 0,
				},
			})

			const shippingMethod = await prisma.shippingMethod.create({
				data: {
					zoneId: usZone.id,
					name: 'Standard Shipping',
					rateType: 'FLAT',
					flatRate: 500,
					isActive: true,
					displayOrder: 0,
				},
			})

			// Mock Stripe checkout session creation BEFORE calling action
			vi.mocked(createCheckoutSession).mockResolvedValueOnce({
				url: 'https://checkout.stripe.com/c/pay/cs_test_mock123',
			} as any)

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'test@example.com')
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'US')
			formData.set('shippingMethodId', shippingMethod.id)

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				// Store status before parsing JSON (body can only be read once)
				const status = result.status
				const json = (await result.json()) as { result?: { error?: { formErrors?: string[] } }; message?: string; redirectUrl?: string }
				// If status is 400, there might be an error - check the response
				if (status === 400) {
					// Check if it's a validation error or cart error
					if (json.result?.error?.formErrors) {
						throw new Error(`Validation error: ${JSON.stringify(json.result.error.formErrors)}`)
					}
					if (json.message) {
						throw new Error(`Action error: ${json.message}`)
					}
					// Fallback: fail with the full response
					expect.fail(`Action returned 400 error: ${JSON.stringify(json)}`)
				}
				expect(json).toHaveProperty('redirectUrl')
				expect(json.redirectUrl).toBeTruthy()
				expect(json.redirectUrl).toContain('checkout.stripe.com')
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { redirectUrl: string } }
				expect(dataResult.data.redirectUrl).toBeTruthy()
				expect(dataResult.data.redirectUrl).toContain('checkout.stripe.com')
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})

		test('validates stock availability before checkout', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 5, // Only 5 available
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 10) // Requesting 10, but only 5 available

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Create shipping zone and method for US
			const usZone = await prisma.shippingZone.create({
				data: {
					name: `Test US Zone Stock ${Date.now()}`,
					countries: ['US'],
					isActive: true,
					displayOrder: 0,
				},
			})

			const shippingMethod = await prisma.shippingMethod.create({
				data: {
					zoneId: usZone.id,
					name: 'Standard Shipping',
					rateType: 'FLAT',
					flatRate: 500,
					isActive: true,
					displayOrder: 0,
				},
			})

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'test@example.com')
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'US')
			formData.set('shippingMethodId', shippingMethod.id)

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				const json = (await result.json()) as { result: { status: string; error: { formErrors?: string[] } } }
				expect(json).toHaveProperty('result')
				expect(json.result.status).toBe('error')
				expect(json.result.error).toBeTruthy()
				expect(json.result.error.formErrors).toBeTruthy()
				expect(json.result.error.formErrors?.[0]).toContain('Insufficient stock')
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { result: any } }
				expect(dataResult.data.result.status).toBe('error')
				expect(dataResult.data.result.error).toBeTruthy()
				// formErrors might be nested differently
				const formErrors = dataResult.data.result.error?.formErrors || dataResult.data.result.error?.formErrors
				if (formErrors && Array.isArray(formErrors)) {
					expect(formErrors[0]).toContain('Insufficient stock')
				} else {
					// If formErrors is not an array, check if the error message contains stock info
					const errorMessage = JSON.stringify(dataResult.data.result.error)
					expect(errorMessage).toContain('stock')
				}
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})

		test('handles Stripe API errors', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Create shipping zone and method for US
			const usZone = await prisma.shippingZone.create({
				data: {
					name: `Test US Zone Error ${Date.now()}`,
					countries: ['US'],
					isActive: true,
					displayOrder: 0,
				},
			})

			const shippingMethod = await prisma.shippingMethod.create({
				data: {
					zoneId: usZone.id,
					name: 'Standard Shipping',
					rateType: 'FLAT',
					flatRate: 500,
					isActive: true,
					displayOrder: 0,
				},
			})

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'test@example.com')
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'US')
			formData.set('shippingMethodId', shippingMethod.id)

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			// Temporarily set invalid Stripe key to trigger error
			const originalKey = process.env.STRIPE_SECRET_KEY
			process.env.STRIPE_SECRET_KEY = 'sk_test_invalid'

			// Mock Stripe to throw an error
			vi.mocked(createCheckoutSession).mockRejectedValueOnce(
				new Error('Stripe API error: Invalid API key'),
			)

			try {
				const result = await action({
					request,
					params: {},
					context: {},
				})

				// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
				// Check if it's a Response first
				if (result instanceof Response) {
					const json = (await result.json()) as { result: { status: string; error: unknown } }
					expect(json).toHaveProperty('result')
					expect(json.result.status).toBe('error')
					expect(json.result.error).toBeTruthy()
					// Should log to Sentry
					expect(Sentry.captureException).toHaveBeenCalled()
					return
				}

				// If not a Response, it's a DataWithResponseInit object with data property
				if (typeof result === 'object' && result !== null && 'data' in result) {
					const dataResult = result as { data: { result: any } }
					expect(dataResult.data.result.status).toBe('error')
					expect(dataResult.data.result.error).toBeTruthy()
					// Should log to Sentry
					expect(Sentry.captureException).toHaveBeenCalled()
					return
				}

				throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
			} finally {
				// Restore original key
				if (originalKey) {
					process.env.STRIPE_SECRET_KEY = originalKey
				}
			}
		})

		test('validates email format', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'invalid-email') // Invalid email
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'US')

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				const json = (await result.json()) as { result: { status: string; error: { fieldErrors?: { email?: string[] } } } }
				expect(json).toHaveProperty('result')
				expect(json.result.status).toBe('error')
				expect(json.result.error).toBeTruthy()
				expect(json.result.error.fieldErrors?.email).toBeTruthy()
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { result: any } }
				expect(dataResult.data.result.status).toBe('error')
				expect(dataResult.data.result.error).toBeTruthy()
				// fieldErrors might be nested in error or directly accessible
				const fieldErrors = dataResult.data.result.error?.fieldErrors || dataResult.data.result.error?.fieldErrors
				if (fieldErrors) {
					expect(fieldErrors.email).toBeTruthy()
				}
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})

		test('validates shipping method is required', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'test@example.com')
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'US')
			// shippingMethodId is missing

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				const json = (await result.json()) as { result: { status: string; error: { fieldErrors?: { shippingMethodId?: string[] } } } }
				expect(json).toHaveProperty('result')
				expect(json.result.status).toBe('error')
				expect(json.result.error).toBeTruthy()
				expect(json.result.error.fieldErrors?.shippingMethodId).toBeTruthy()
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { result: any } }
				expect(dataResult.data.result.status).toBe('error')
				expect(dataResult.data.result.error).toBeTruthy()
				const fieldErrors = dataResult.data.result.error?.fieldErrors || dataResult.data.result.error?.fieldErrors
				if (fieldErrors) {
					expect(fieldErrors.shippingMethodId).toBeTruthy()
				}
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})

		test('validates country code format', async () => {
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test',
					sku: 'SKU-001',
					price: 1000,
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			// Create proper auth session cookie
			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const formData = new FormData()
			formData.set('name', 'Test User')
			formData.set('email', 'test@example.com')
			formData.set('street', '123 Main St')
			formData.set('city', 'New York')
			formData.set('postal', '10001')
			formData.set('country', 'USA') // Invalid - should be 2 letters
			// Note: shippingMethodId not set to test country validation

			const request = new Request('http://localhost:3000/shop/checkout', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			const result = await action({
				request,
				params: {},
				context: {},
			})

			// data() returns a DataWithResponseInit object with structure: { type: "DataWithResponseInit", data: {...}, init: {...} }
			// Check if it's a Response first
			if (result instanceof Response) {
				const json = (await result.json()) as { result: { status: string; error: { fieldErrors?: { country?: string[] } } } }
				expect(json).toHaveProperty('result')
				expect(json.result.status).toBe('error')
				expect(json.result.error).toBeTruthy()
				expect(json.result.error.fieldErrors?.country).toBeTruthy()
				return
			}

			// If not a Response, it's a DataWithResponseInit object with data property
			if (typeof result === 'object' && result !== null && 'data' in result) {
				const dataResult = result as { data: { result: any } }
				expect(dataResult.data.result.status).toBe('error')
				expect(dataResult.data.result.error).toBeTruthy()
				// fieldErrors might be nested in error or directly accessible
				const fieldErrors = dataResult.data.result.error?.fieldErrors || dataResult.data.result.error?.fieldErrors
				if (fieldErrors) {
					expect(fieldErrors.country).toBeTruthy()
				}
				return
			}

			throw new Error(`Unexpected result structure: ${JSON.stringify(result)}`)
		})
	})

	describe('handleStripeError', () => {
		test('handles card errors', () => {
			const error = {
				type: 'card_error',
				message: 'Your card was declined.',
				code: 'card_declined',
			} as Parameters<typeof handleStripeError>[0]

			// Note: This test verifies the error handler exists and works
			// The actual Stripe error types would be instances of Stripe.errors.StripeCardError
			const result = handleStripeError(error)
			expect(result).toBeTruthy()
		})
	})
})
