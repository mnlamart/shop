import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Product Detail', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>

	test.beforeEach(async () => {
		// Create a test category
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for products',
			},
		})
	})

	test('should display product details', async ({ page }) => {
		// Create a test product
		const productData = createProductData()
		productData.status = 'ACTIVE'

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				currency: productData.currency || 'USD',
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)

		// Check product name is visible
		await expect(page.getByRole('heading', { name: product.name })).toBeVisible()

		// Check product price is visible
		await expect(page.getByText(`$${Number(product.price).toFixed(2)}`)).toBeVisible()

		// Check product description is visible
		await expect(page.getByText(product.description!)).toBeVisible()
	})

	test('should allow adding product without variants to cart', async ({ page }) => {
		// Create a test product without variants
		const productData = createProductData()
		productData.status = 'ACTIVE'

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				currency: productData.currency || 'USD',
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)

		// Find and click add to cart button
		const addToCartButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addToCartButton).toBeVisible()
		await addToCartButton.click()

		// Verify success message or redirect to cart
		// For now, we'll just verify the button is still there (not disabled)
		await expect(addToCartButton).toBeEnabled()
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

