/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.ts'
import { getSession, commitSession, CART_SESSION_COOKIE } from '#app/utils/cart-session.server.ts'
import { getOrCreateCart, addToCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser } from '#tests/db-utils.ts'
import { loader } from './review.tsx'

describe('Checkout Review Step', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testUser: Awaited<ReturnType<typeof prisma.user.create>>

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
	})

	afterEach(async () => {
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productImage.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({})
		await prisma.user.deleteMany({})
	})

	test('loader returns cart data when cart exists', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1000, // $10.00
				sku: 'TEST-001',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create cart with item
		const cart = await getOrCreateCart({ userId: testUser.id })
		await addToCart(cart.id, product.id, null, 2)

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

		const request = new Request('http://localhost:3000/shop/checkout/review', {
			headers: {
				Cookie: cookieHeader,
			},
		})

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		expect(result).not.toBeInstanceOf(Response)
		if (result instanceof Response) {
			throw new Error('Expected data object, got Response')
		}

		expect(result).toHaveProperty('cart')
		expect(result).toHaveProperty('currency')
		expect(result).toHaveProperty('subtotal')
		expect(result.cart.items).toHaveLength(1)
		expect(result.cart.items[0]?.product.name).toBe('Test Product')
		expect(result.cart.items[0]?.quantity).toBe(2)
		expect(result.subtotal).toBe(2000) // 2 * $10.00 = $20.00
	})

	test('loader redirects to cart when cart is empty', async () => {
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

		const request = new Request('http://localhost:3000/shop/checkout/review', {
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

	test('loader works for guest users with session cart', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1500, // $15.00
				sku: 'TEST-002',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create guest cart with session
		const cart = await getOrCreateCart({ sessionId: 'test-session-id' })
		await addToCart(cart.id, product.id, null, 1)

		// Create guest session cookie - use the correct cart session storage
		const cartSession = await getSession()
		cartSession.set(CART_SESSION_COOKIE, 'test-session-id')
		const cookieHeader = await commitSession(cartSession)

		const request = new Request('http://localhost:3000/shop/checkout/review', {
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
		expect(result.cart.items).toHaveLength(1)
		expect(result.subtotal).toBe(1500) // $15.00
	})

	test('loader calculates subtotal correctly with variant prices', async () => {
		// Create product
		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				description: 'Test description',
				price: 1000, // $10.00 base price
				sku: 'TEST-003',
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Create variant with different price
		const variant = await prisma.productVariant.create({
			data: {
				productId: product.id,
				sku: 'TEST-003-VAR',
				price: 1500, // $15.00 variant price
				stockQuantity: 5,
			},
		})

		// Create cart with variant
		const cart = await getOrCreateCart({ userId: testUser.id })
		await addToCart(cart.id, product.id, variant.id, 3)

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

		const request = new Request('http://localhost:3000/shop/checkout/review', {
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

		expect(result.subtotal).toBe(4500) // 3 * $15.00 = $45.00 (uses variant price, not product price)
		expect(result.cart.items[0]?.variant?.price).toBe(1500)
	})
})

