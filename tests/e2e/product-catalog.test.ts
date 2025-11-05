import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Product Catalog', () => {
	test('product catalog should display products page', async ({ page }) => {
		await page.goto('/shop/products')
		await expect(page.getByRole('heading', { name: /products/i })).toBeVisible()
	})

	test('product catalog should support search by name', async ({ page }) => {
		await page.goto('/shop/products')
		const searchInput = page.getByPlaceholder(/search products by name/i)
		await expect(searchInput).toBeVisible()
	})

	test('product catalog should support filtering by category', async ({ page }) => {
		await page.goto('/shop/products')
		const categoryFilter = page.getByRole('combobox', { name: /category/i })
		await expect(categoryFilter).toBeVisible()
	})

	test('product catalog should display product cards', async ({ page }) => {
		// Create a test category
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for products',
			},
		})

		// Create a test product
		const productData = createProductData()
		productData.status = 'ACTIVE'

		await prisma.product.create({
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

		await page.goto('/shop/products')
		const productCards = page.getByTestId('product-card')
		await expect(productCards.first()).toBeVisible()
	})

	test.afterEach(async () => {
		// Cleanup: Delete in order to respect foreign key constraints
		// OrderItems must be deleted before Products (Restrict constraint)
		await prisma.orderItem.deleteMany({
			where: {
				product: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			},
		})
		// CartItems will cascade when Products are deleted, but delete explicitly for clarity
		await prisma.cartItem.deleteMany({
			where: {
				product: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			},
		})
		// Now we can safely delete products
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
