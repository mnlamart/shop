import { describe, expect, test, beforeEach, afterEach } from 'vitest'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { UNCATEGORIZED_CATEGORY_ID } from './category.ts'
import { prisma } from './db.server.ts'
import { validateStockAvailability } from './order.server.ts'

describe('validateStockAvailability', () => {
	let categoryId: string
	let productId: string
	let variantId: string
	let cartId: string

	beforeEach(async () => {
		// Create test category (use upsert to handle case where cleanup didn't run)
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

		// Create test product using utility
		const productData = createProductData()
		productData.categoryId = categoryId
		// Price in cents (utility returns dollars)
		productData.price = Math.round(productData.price * 100)
		
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

		// Create test variant with stock using utility
		const variantData = createVariantData(productData.sku)
		variantData.stockQuantity = 10 // Override for test consistency
		
		const variant = await prisma.productVariant.create({
			data: {
				productId,
				sku: variantData.sku,
				stockQuantity: variantData.stockQuantity,
			},
		})
		variantId = variant.id

		// Create test cart
		const cart = await prisma.cart.create({
			data: {
				sessionId: `session-${Date.now()}`,
			},
		})
		cartId = cart.id
	})

	afterEach(async () => {
		// Cleanup - delete in reverse order of creation
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({
			where: { id: categoryId },
		})
	})

	test('should validate stock availability when sufficient stock exists', async () => {
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5, // Requesting 5, have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when insufficient stock', async () => {
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 15, // Requesting 15, only have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should handle deleted variant gracefully', async () => {
		// Create a variant and cart item
		const tempVariant = await prisma.productVariant.create({
			data: {
				productId,
				sku: `TEMP-${Date.now()}`,
				stockQuantity: 10,
			},
		})

		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: tempVariant.id,
				quantity: 5,
			},
		})

		// Delete the variant - due to onDelete: SetNull, variantId becomes null
		await prisma.productVariant.delete({
			where: { id: tempVariant.id },
		})

		// Reload cart to get updated variantId (now null)
		const cart = await prisma.cart.findUnique({
			where: { id: cartId },
			include: { items: true },
		})

		// Cart item should now have variantId = null (due to onDelete: SetNull)
		expect(cart?.items[0]?.variantId).toBeNull()

		// Validation should pass because products without variants and no stockQuantity are unlimited
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should validate product-level stock when product has no variants', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Update product to have stock quantity
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 10 },
		})

		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 5, // Requesting 5, have 10 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when product-level stock is insufficient', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Update product to have stock quantity
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 3 },
		})

		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 5, // Requesting 5, only have 3 in stock
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should handle product without variant and no stockQuantity as unlimited', async () => {
		// Delete the variant to make this a product without variants
		await prisma.productVariant.delete({
			where: { id: variantId },
		})

		// Product has no stockQuantity set (null)
		// Add item without variant
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: null,
				quantity: 1,
			},
		})

		// Should not throw for products without variants and no stockQuantity (unlimited)
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should prioritize variant stock over product stock when variant exists', async () => {
		// Set product stock to a low amount
		await prisma.product.update({
			where: { id: productId },
			data: { stockQuantity: 2 },
		})

		// Variant has more stock (10)
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5, // Requesting 5, variant has 10
			},
		})

		// Should use variant stock, not product stock
		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should handle multiple items with mixed stock availability', async () => {
		// Create second variant
		const variant2 = await prisma.productVariant.create({
			data: {
				productId,
				sku: `VARIANT-2-${Date.now()}`,
				stockQuantity: 3,
			},
		})

		// Item 1: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5,
			},
		})

		// Item 2: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: variant2.id,
				quantity: 2,
			},
		})

		await expect(validateStockAvailability(cartId)).resolves.not.toThrow()
	})

	test('should throw error when any item has insufficient stock', async () => {
		// Create second variant
		const variant2 = await prisma.productVariant.create({
			data: {
				productId,
				sku: `VARIANT-2-${Date.now()}`,
				stockQuantity: 3,
			},
		})

		// Item 1: Sufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 5,
			},
		})

		// Item 2: Insufficient stock
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: variant2.id,
				quantity: 5, // Requesting 5, only have 3
			},
		})

		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Insufficient stock',
		)
	})

	test('should throw error when cart is empty', async () => {
		await expect(validateStockAvailability(cartId)).rejects.toThrow(
			'Cart is empty',
		)
	})

	test('should throw error when cart does not exist', async () => {
		await expect(validateStockAvailability('non-existent-cart')).rejects.toThrow()
	})
})

