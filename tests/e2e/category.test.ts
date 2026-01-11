import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Category Page', () => {
	test.afterEach(async () => {
		// Cleanup: Batch all operations in a transaction for better performance
		// OrderItems must be deleted before Products (Restrict constraint)
		await prisma.$transaction([
			prisma.orderItem.deleteMany({}),
			prisma.cartItem.deleteMany({}),
			prisma.cart.deleteMany({}),
			prisma.product.deleteMany({}),
			prisma.category.deleteMany({}),
		])
	})

	test('should display products filtered by category', async ({ page }) => {
		// Create two test categories
		const category1 = await prisma.category.create({
			data: {
				name: 'Electronics',
				slug: `electronics-${Date.now()}`,
			},
		})

		const category2 = await prisma.category.create({
			data: {
				name: 'Clothing',
				slug: `clothing-${Date.now()}`,
			},
		})

		// Create products in different categories
		const product1Data = createProductData()
		const product1 = await prisma.product.create({
			data: {
				name: 'Laptop',
				slug: product1Data.slug,
				description: product1Data.description,
				sku: product1Data.sku,
				price: product1Data.price,
				categoryId: category1.id,
				status: 'ACTIVE',
			},
		})

		const product2Data = createProductData()
		const product2 = await prisma.product.create({
			data: {
				name: 'Shirt',
				slug: product2Data.slug,
				description: product2Data.description,
				sku: product2Data.sku,
				price: product2Data.price,
				categoryId: category2.id,
				status: 'ACTIVE',
			},
		})

		// Navigate to category1 page
		await page.goto(`/shop/categories/${category1.slug}`)

		// Should show only product1 (from category1)
		await expect(page.getByRole('heading', { name: product1.name })).toBeVisible()
		await expect(page.getByRole('heading', { name: product2.name })).not.toBeVisible()

		// Navigate to category2 page
		await page.goto(`/shop/categories/${category2.slug}`)

		// Should show only product2 (from category2)
		await expect(page.getByRole('heading', { name: product2.name })).toBeVisible()
		await expect(page.getByRole('heading', { name: product1.name })).not.toBeVisible()
	})

	test('should show empty state when category has no products', async ({ page }) => {
		// Create empty category
		const category = await prisma.category.create({
			data: {
				name: 'Empty Category',
				slug: `empty-${Date.now()}`,
			},
		})

		await page.goto(`/shop/categories/${category.slug}`)

		// Should show empty state message
		await expect(page.getByText(/no products/i)).toBeVisible()
	})

	test('should display category name and description', async ({ page }) => {
		// Create category with description
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-${Date.now()}`,
				description: 'This is a test category description',
			},
		})

		await page.goto(`/shop/categories/${category.slug}`)

		// Should show category name and description
		await expect(page.getByRole('heading', { name: category.name })).toBeVisible()
		await expect(page.getByText(category.description!)).toBeVisible()
	})

	test('should allow filtering by category within category page', async ({ page }) => {
		// Create two categories
		const category1 = await prisma.category.create({
			data: {
				name: 'Category A',
				slug: `category-a-${Date.now()}`,
			},
		})

		const category2 = await prisma.category.create({
			data: {
				name: 'Category B',
				slug: `category-b-${Date.now()}`,
			},
		})

		// Create products in both categories
		const product1Data = createProductData()
		const product1 = await prisma.product.create({
			data: {
				name: 'Product A1',
				slug: product1Data.slug,
				description: product1Data.description,
				sku: product1Data.sku,
				price: product1Data.price,
				categoryId: category1.id,
				status: 'ACTIVE',
			},
		})

		const product2Data = createProductData()
		const product2 = await prisma.product.create({
			data: {
				name: 'Product B1',
				slug: product2Data.slug,
				description: product2Data.description,
				sku: product2Data.sku,
				price: product2Data.price,
				categoryId: category2.id,
				status: 'ACTIVE',
			},
		})

		// Navigate to category1 page
		await page.goto(`/shop/categories/${category1.slug}`)

		// Wait for page to load
		await page.waitForLoadState('networkidle')

		// Initially should show only category1 products
		await expect(page.getByRole('heading', { name: product1.name })).toBeVisible()

		// Change filter to category2
		const filterSelect = page.getByLabel(/filter by category/i)
		await filterSelect.selectOption(category2.id)
		
		// Wait for the filter to update the products
		await page.waitForTimeout(500)
		await page.waitForLoadState('networkidle')

		// Should now show only category2 products
		await expect(page.getByRole('heading', { name: product2.name })).toBeVisible()
		// Product A1 should not be visible
		await expect(page.getByRole('heading', { name: product1.name })).not.toBeVisible()
	})
})

