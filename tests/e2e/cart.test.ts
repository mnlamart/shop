import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Shopping Cart', () => {
	test('should display empty cart message when cart is empty', async ({ page }) => {
		await page.goto('/shop/cart')
		await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible()
		await expect(page.getByText(/your cart is empty/i)).toBeVisible()
	})

	test('should display cart items when cart has products', async ({ page }) => {
		// Create test category
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for products',
			},
		})

		// Create test product
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Navigate to cart page
		await page.goto('/shop/cart')
		
		// Verify cart page displays the item
		await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible()
		await expect(page.getByText(product.name)).toBeVisible()
	})

	test('should allow updating cart item quantity', async ({ page }) => {
		// Create test category
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for products',
			},
		})

		// Create test product
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Navigate to cart page
		await page.goto('/shop/cart')
		
		// Update quantity
		const quantityInput = page.getByRole('spinbutton', { name: /quantity/i })
		await expect(quantityInput).toBeVisible()
		await quantityInput.fill('2')
		
		// Verify update button exists
		await expect(page.getByRole('button', { name: /update/i })).toBeVisible()
	})

	test.afterEach(async () => {
		// Cleanup: Delete test products and categories
		await prisma.product.deleteMany({
			where: {
				sku: {
					startsWith: 'SKU-',
				},
			},
		})

		await prisma.category.deleteMany({
			where: {
				slug: {
					startsWith: 'test-category-',
				},
			},
		})
	})
})

