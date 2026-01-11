/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { getOrCreateCart, addToCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { loader, action } from './shipping.tsx'

vi.mock('#app/utils/shipping.server.ts', async () => {
	const actual = await import('#app/utils/shipping.server.ts')
	return {
		...actual,
		getShippingCost: vi.fn().mockResolvedValue(500), // $5.00
	}
})

describe('Checkout Shipping Step', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>
	let testZone: Awaited<ReturnType<typeof prisma.shippingZone.create>>
	let testMethod: Awaited<ReturnType<typeof prisma.shippingMethod.create>>

	beforeEach(async () => {
		// Create test category
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: 'test-category',
				description: 'Test category description',
			},
		})

		// Create test user
		testUser = await prisma.user.create({
			data: createUser(),
		})

		// Create shipping zone
		testZone = await prisma.shippingZone.create({
			data: {
				name: 'US Zone',
				countries: ['US'],
				isActive: true,
				displayOrder: 0,
			},
		})

		// Create shipping method
		testMethod = await prisma.shippingMethod.create({
			data: {
				name: 'Standard Shipping',
				zoneId: testZone.id,
				rateType: 'FLAT',
				flatRate: 500, // $5.00
				isActive: true,
				displayOrder: 0,
			},
		})
	})

	afterEach(async () => {
		await prisma.address.deleteMany({})
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productImage.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.shippingMethod.deleteMany({})
		await prisma.shippingZone.deleteMany({})
		await prisma.category.deleteMany({})
		await prisma.user.deleteMany({})
	})

	describe('loader', () => {
		test('returns checkout data when cart exists', async () => {
			// Create product
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			// Create cart with item
			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
				headers: {
					Cookie: cookieHeader,
				},
			})

			const result = await loader({
				request,
				params: {},
				context: {},
			})

		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result).toHaveProperty('cart')
		expect(result).toHaveProperty('currency')
		expect(result).toHaveProperty('subtotal')
		expect(result).toHaveProperty('savedAddresses')
		expect(result).toHaveProperty('shippingMethods')
		expect(result.cart.items).toHaveLength(1)
		})

		test('redirects to cart when cart is empty', async () => {
			// Create empty cart
			await getOrCreateCart({ userId: testUser.id })

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
				headers: {
					Cookie: cookieHeader,
				},
			})

			const result = await loader({
				request,
				params: {},
				context: {},
			})

			expect(result).toHaveProperty('status')
			if ('status' in result && result.status === 302) {
				expect(result.headers.get('location')).toBe('/shop/cart')
			}
		})

		test('includes saved addresses for authenticated users', async () => {
			// Create product
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			// Create cart with item
			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create saved address
			await prisma.address.create({
				data: {
					userId: testUser.id,
					name: 'John Doe',
					street: '123 Main St',
					city: 'New York',
					state: 'NY',
					postal: '10001',
					country: 'US',
					type: 'SHIPPING',
					isDefaultShipping: true,
				},
			})

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
				headers: {
					Cookie: cookieHeader,
				},
			})

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result.savedAddresses).toHaveLength(1)
		expect(result.savedAddresses[0]?.name).toBe('John Doe')
		expect(result.defaultShippingAddress?.name).toBe('John Doe')
		})
	})

	describe('action', () => {
		test('validates required fields', async () => {
			// Create product and cart
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Submit form with missing fields
			const formData = new FormData()
			formData.append('email', 'test@example.com')
			// Missing name, street, city, postal, country, shippingMethodId

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
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

			// data() returns DataWithResponseInit
			if ('data' in result && 'init' in result) {
				const resultData = result.data as { result?: { status?: string } }
				expect(resultData).toHaveProperty('result')
				expect(resultData.result?.status).toBe('error')
			}
		})

		test('redirects to delivery step with shipping data', async () => {
			// Create product and cart
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Submit form with valid data
			const formData = new FormData()
			formData.append('name', 'John Doe')
			formData.append('email', 'john@example.com')
			formData.append('street', '123 Main St')
			formData.append('city', 'New York')
			formData.append('state', 'NY')
			formData.append('postal', '10001')
			formData.append('country', 'US')
			formData.append('shippingMethodId', testMethod.id)
			formData.append('addressId', 'new')

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
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

			// redirect() returns a Response
			expect(result).toBeInstanceOf(Response)
			if (result instanceof Response) {
				expect(result.status).toBe(302)
				const location = result.headers.get('location')
				expect(location).toContain('/shop/checkout/delivery')
				expect(location).toContain('name=John%20Doe')
				expect(location).toContain('email=john%40example.com')
				expect(location).toContain('street=123%20Main%20St')
				expect(location).toContain('city=New%20York')
				expect(location).toContain('postal=10001')
				expect(location).toContain('country=US')
			}
		})

		test('saves address when saveAddress is checked', async () => {
			// Create product and cart
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Submit form with saveAddress checked
			const formData = new FormData()
			formData.append('name', 'Jane Doe')
			formData.append('email', 'jane@example.com')
			formData.append('street', '456 Oak Ave')
			formData.append('city', 'Los Angeles')
			formData.append('state', 'CA')
			formData.append('postal', '90001')
			formData.append('country', 'US')
			formData.append('shippingMethodId', testMethod.id)
			formData.append('addressId', 'new')
			formData.append('saveAddress', 'on')
			formData.append('label', 'Home')

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
				method: 'POST',
				headers: {
					Cookie: cookieHeader,
				},
				body: formData,
			})

			await action({
				request,
				params: {},
				context: {},
			})

			// Verify address was saved
			const savedAddresses = await prisma.address.findMany({
				where: { userId: testUser.id },
			})

			expect(savedAddresses).toHaveLength(1)
			expect(savedAddresses[0]?.name).toBe('Jane Doe')
			expect(savedAddresses[0]?.street).toBe('456 Oak Ave')
			expect(savedAddresses[0]?.label).toBe('Home')
		})

		test('uses saved address when addressId is provided', async () => {
			// Create product and cart
			const product = await prisma.product.create({
				data: {
					name: 'Test Product',
					slug: 'test-product',
					description: 'Test description',
					price: 1000,
					sku: 'TEST-001',
					status: 'ACTIVE',
					categoryId: testCategory.id,
					stockQuantity: 10,
				},
			})

			const cart = await getOrCreateCart({ userId: testUser.id })
			await addToCart(cart.id, product.id, null, 1)

			// Create saved address
			const savedAddress = await prisma.address.create({
				data: {
					userId: testUser.id,
					name: 'Saved User',
					street: '789 Pine St',
					city: 'Chicago',
					state: 'IL',
					postal: '60601',
					country: 'US',
					type: 'SHIPPING',
				},
			})

			// Create session
			const session = await prisma.session.create({
				data: {
					userId: testUser.id,
					expirationDate: getSessionExpirationDate(),
				},
			})

			const authSession = await authSessionStorage.getSession()
			authSession.set(sessionKey, session.id)
			const cookieHeader = await authSessionStorage.commitSession(authSession)

			// Submit form with addressId
			// Note: The schema requires name/street/city/postal/country for validation,
			// but when addressId is provided, the action loads the saved address and
			// overrides these form values with the saved address data.
			const formData = new FormData()
			formData.append('email', 'test@example.com')
			formData.append('name', 'Temp Name') // Required for validation, but replaced by saved address
			formData.append('street', 'Temp Street') // Required for validation, but replaced by saved address
			formData.append('city', 'Temp City') // Required for validation, but replaced by saved address
			formData.append('postal', '00000') // Required for validation, but replaced by saved address
			formData.append('country', 'US') // Required for validation, but replaced by saved address
			formData.append('shippingMethodId', testMethod.id)
			formData.append('addressId', savedAddress.id)

			const request = new Request('http://localhost:3000/shop/checkout/shipping', {
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

			// redirect() returns a Response
			expect(result).toBeInstanceOf(Response)
			if (result instanceof Response) {
				expect(result.status).toBe(302)
				const location = result.headers.get('location')
				expect(location).toContain('/shop/checkout/delivery')
				expect(location).toContain('name=Saved%20User')
				expect(location).toContain('street=789%20Pine%20St')
				expect(location).toContain('city=Chicago')
			}
		})
	})
})

