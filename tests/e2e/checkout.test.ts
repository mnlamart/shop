import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'

test.describe('Checkout', () => {
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

	test('should redirect to cart when checkout page accessed with empty cart', async ({
		page,
		navigate,
	}) => {
		await navigate('/shop/checkout')
		await expect(page).toHaveURL(/\/shop\/cart/)
	})

	test('should display checkout form when cart has items', async ({ page }) => {
		// Create a test product
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Navigate to checkout
		await page.goto('/shop/checkout')

		// Verify checkout form is displayed
		await expect(page.getByRole('heading', { name: /checkout/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /^name/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /street/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /city/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /postal|zip/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /country/i })).toBeVisible()
	})

	test('should show validation errors when submitting empty form', async ({
		page,
	}) => {
		// Create a test product and add to cart
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		await page.goto('/shop/checkout')

		// Clear the country default value to test empty form
		await page.getByRole('textbox', { name: /country/i }).clear()
		
		// Submit empty form
		const submitPromise = page.waitForURL(/\/shop\/checkout/)
		await page.getByRole('button', { name: /proceed to checkout/i }).click()
		await submitPromise

		// Wait for form validation errors to appear
		// Check that at least some validation errors are displayed
		await expect(page.getByText(/name is required/i)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/email is required/i)).toBeVisible()
		await expect(page.getByText(/street address is required/i)).toBeVisible()
	})

	test('should show validation error for invalid email format', async ({
		page,
	}) => {
		// Create a test product and add to cart
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		await page.goto('/shop/checkout')

		// Fill form with invalid email
		await page.getByRole('textbox', { name: /^name/i }).fill('Test User')
		await page.getByRole('textbox', { name: /email/i }).fill('invalid-email')
		await page.getByRole('textbox', { name: /street/i }).fill('123 Main St')
		await page.getByRole('textbox', { name: /city/i }).fill('New York')
		await page.getByRole('textbox', { name: /postal|zip/i }).fill('10001')
		await page.getByRole('textbox', { name: /country/i }).fill('US')

		await page.getByRole('button', { name: /proceed to checkout/i }).click()

		// Verify email validation error
		await expect(page).toHaveURL(/\/shop\/checkout/)
		await expect(page.getByText(/invalid email address/i)).toBeVisible()
	})

	test('should show validation error for invalid country code', async ({
		page,
	}) => {
		// Create a test product and add to cart
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		await page.goto('/shop/checkout')

		// Fill form with invalid country code (too long)
		await page.getByRole('textbox', { name: /^name/i }).fill('Test User')
		await page.getByRole('textbox', { name: /email/i }).fill('test@example.com')
		await page.getByRole('textbox', { name: /street/i }).fill('123 Main St')
		await page.getByRole('textbox', { name: /city/i }).fill('New York')
		await page.getByRole('textbox', { name: /postal|zip/i }).fill('10001')
		await page.getByRole('textbox', { name: /country/i }).fill('USA')

		await page.getByRole('button', { name: /proceed to checkout/i }).click()

		// Verify country validation error appears
		await expect(page).toHaveURL(/\/shop\/checkout/)
		await expect(
			page.getByText(/country.*2.*letter.*iso/i),
		).toBeVisible({ timeout: 10000 })
	})

	test.afterEach(async () => {
		// Cleanup: Delete test products, categories, and carts
		await prisma.cartItem.deleteMany({
			where: {
				product: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			},
		})

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

		await prisma.cart.deleteMany({})
	})
})

