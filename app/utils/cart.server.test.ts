import { describe, expect, test } from 'vitest'
import {
	getCart,
	createCart,
	getOrCreateCart,
	addToCart,
	updateCartItemQuantity,
	removeFromCart,
	clearCart,
	mergeGuestCartToUser,
	getCartSummary,
} from './cart.server.ts'
import { prisma } from './db.server.ts'

describe('cart.server', () => {
	test('createCart should create a new cart', async () => {
		const cart = await createCart({ sessionId: 'test-session-1' })

		expect(cart.sessionId).toBe('test-session-1')
		expect(cart.userId).toBeNull()
		expect(cart.items).toEqual([])
	})

	test('createCart should create a user cart', async () => {
		const user = await prisma.user.create({
			data: {
				email: `test+${Date.now()}@example.com`,
				username: `testuser${Date.now()}`,
			},
		})

		const cart = await createCart({ userId: user.id })

		expect(cart.userId).toBe(user.id)
		expect(cart.sessionId).toBeNull()
	})

	test('getCart should return existing cart', async () => {
		const created = await createCart({ sessionId: 'test-session-2' })
		const fetched = await getCart('test-session-2')

		expect(fetched?.id).toBe(created.id)
	})

	test('getCart should return null for non-existent cart', async () => {
		const cart = await getCart('non-existent')

		expect(cart).toBeNull()
	})

	test('getOrCreateCart should return existing cart', async () => {
		const created = await createCart({ sessionId: 'test-session-3' })
		const fetched = await getOrCreateCart({ sessionId: 'test-session-3' })

		expect(fetched.id).toBe(created.id)
	})

	test('getOrCreateCart should create new cart if not exists', async () => {
		const cart = await getOrCreateCart({ sessionId: 'test-session-4' })

		expect(cart.sessionId).toBe('test-session-4')
		expect(cart.items).toEqual([])
	})

	test('addToCart should add item without variant', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: 'test-category',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: 'test-product',
				sku: 'TEST-SKU-1',
				price: 29.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-5' })
		const updated = await addToCart(cart.id, product.id, null, 2)

		expect(updated.items).toHaveLength(1)
		expect(updated.items[0]?.productId).toBe(product.id)
		expect(updated.items[0]?.quantity).toBe(2)
	})

	test('addToCart should add item with variant', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 2',
				slug: 'test-category-2',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product 2',
				slug: 'test-product-2',
				sku: 'TEST-SKU-2',
				price: 39.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const variant = await prisma.productVariant.create({
			data: {
				productId: product.id,
				sku: 'TEST-SKU-2-M',
				price: 44.99,
				stockQuantity: 10,
			},
		})

		const cart = await createCart({ sessionId: 'test-session-6' })
		const updated = await addToCart(cart.id, product.id, variant.id, 1)

		expect(updated.items).toHaveLength(1)
		expect(updated.items[0]?.variantId).toBe(variant.id)
	})

	test('addToCart should update existing item quantity', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 3',
				slug: 'test-category-3',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product 3',
				slug: 'test-product-3',
				sku: 'TEST-SKU-3',
				price: 19.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-7' })

		// Add item first
		await addToCart(cart.id, product.id, null, 2)

		// Add same item again
		const updated = await addToCart(cart.id, product.id, null, 3)

		expect(updated.items).toHaveLength(1)
		expect(updated.items[0]?.quantity).toBe(5) // 2 + 3
	})

	test('updateCartItemQuantity should update quantity', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 4',
				slug: 'test-category-4',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product 4',
				slug: 'test-product-4',
				sku: 'TEST-SKU-4',
				price: 24.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-8' })
		const cartWithItems = await addToCart(cart.id, product.id, null, 2)

		if (!cartWithItems.items[0]) {
			throw new Error('Cart item not found')
		}

		const updated = await updateCartItemQuantity(cartWithItems.items[0].id, 5)

		if (!updated.items[0]) {
			throw new Error('Cart item not found')
		}

		expect(updated.items[0].quantity).toBe(5)
	})

	test('removeFromCart should remove item', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 5',
				slug: 'test-category-5',
			},
		})

		const product1 = await prisma.product.create({
			data: {
				name: 'Test Product 5a',
				slug: 'test-product-5a',
				sku: 'TEST-SKU-5a',
				price: 9.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const product2 = await prisma.product.create({
			data: {
				name: 'Test Product 5b',
				slug: 'test-product-5b',
				sku: 'TEST-SKU-5b',
				price: 14.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-9' })
		const cartWithItems = await addToCart(cart.id, product1.id, null, 1)
		const cartWithMore = await addToCart(cartWithItems.id, product2.id, null, 1)

		expect(cartWithMore.items).toHaveLength(2)

		const firstItem = cartWithMore.items[0]
		if (!firstItem) {
			throw new Error('Cart item not found')
		}

		const updated = await removeFromCart(firstItem.id)

		if (!updated.items) {
			throw new Error('Updated cart items missing')
		}

		expect(updated.items).toHaveLength(1)
		if (!updated.items[0]) {
			throw new Error('Cart item not found')
		}
		expect(updated.items[0].productId).toBe(product2.id)
	})

	test('clearCart should remove all items', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 6',
				slug: 'test-category-6',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product 6',
				slug: 'test-product-6',
				sku: 'TEST-SKU-6',
				price: 49.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-10' })
		const cartWithItems = await addToCart(cart.id, product.id, null, 3)

		expect(cartWithItems.items).toHaveLength(1)

		const cleared = await clearCart(cartWithItems.id)

		expect(cleared.items).toHaveLength(0)
	})

	test('mergeGuestCartToUser should merge guest cart to user', async () => {
		const user = await prisma.user.create({
			data: {
				email: `test+${Date.now()}@example.com`,
				username: `testuser${Date.now()}`,
			},
		})

		const category = await prisma.category.create({
			data: {
				name: 'Test Category 7',
				slug: 'test-category-7',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product 7',
				slug: 'test-product-7',
				sku: 'TEST-SKU-7',
				price: 34.99,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		// Create guest cart
		const guestCart = await createCart({ sessionId: 'test-session-11' })
		const guestCartWithItems = await addToCart(guestCart.id, product.id, null, 2)

		expect(guestCartWithItems.items).toHaveLength(1)

		// Merge to user
		const userCart = await mergeGuestCartToUser('test-session-11', user.id)

		expect(userCart.userId).toBe(user.id)
		expect(userCart.sessionId).toBeNull()
		expect(userCart.items).toHaveLength(1)
	})

	test('getCartSummary should calculate totals correctly', async () => {
		const category = await prisma.category.create({
			data: {
				name: 'Test Category 8',
				slug: 'test-category-8',
			},
		})

		const product1 = await prisma.product.create({
			data: {
				name: 'Test Product 8a',
				slug: 'test-product-8a',
				sku: 'TEST-SKU-8a',
				price: 10.0,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const product2 = await prisma.product.create({
			data: {
				name: 'Test Product 8b',
				slug: 'test-product-8b',
				sku: 'TEST-SKU-8b',
				price: 20.0,
				categoryId: category.id,
				status: 'ACTIVE',
			},
		})

		const cart = await createCart({ sessionId: 'test-session-12' })
		let updated = await addToCart(cart.id, product1.id, null, 2) // 2 * 10 = 20
		updated = await addToCart(updated.id, product2.id, null, 3) // 3 * 20 = 60

		const summary = await getCartSummary(updated.id)

		expect(summary.itemCount).toBe(2)
		expect(summary.totalQuantity).toBe(5)
		expect(Number(summary.subtotal)).toBe(80.0) // 20 + 60
	})
})

