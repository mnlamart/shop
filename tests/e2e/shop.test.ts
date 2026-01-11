import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

test.describe('Shop Home Page', () => {
	test.beforeEach(async () => {
		// Create a test category
		await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category description',
			},
		})
	})

	test('should display welcome message', async ({ page }) => {
		await page.goto('/shop')
		await expect(page.getByRole('heading', { name: /welcome to our shop/i })).toBeVisible()
	})

	test('should have browse all products link', async ({ page }) => {
		await page.goto('/shop')
		await expect(page.getByRole('link', { name: /browse all products/i })).toBeVisible()
	})

	test('should display category cards', async ({ page }) => {
		// Create a category with a product so it's displayed
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category description',
			},
		})
		
		// Create a product in this category so the category is displayed
		const productData = createProductData()
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
		
		await page.goto('/shop')
		await page.waitForLoadState('networkidle')
		// Use accessible query - category cards are links to category pages
		// Find any category link (they contain category names)
		const categoryLink = page.getByRole('link', { name: new RegExp(category.name, 'i') })
		await expect(categoryLink).toBeVisible({ timeout: 10000 })
		
		// Cleanup
		await prisma.$transaction([
			prisma.product.deleteMany({ where: { categoryId: category.id } }),
			prisma.category.deleteMany({ where: { id: category.id } }),
		])
	})

	test.afterEach(async () => {
		// Cleanup: Delete products first to avoid foreign key constraints, then categories
		await prisma.$transaction([
			prisma.product.deleteMany({
				where: {
					category: {
						slug: {
							startsWith: 'test-category-',
						},
					},
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: {
						startsWith: 'test-category-',
					},
				},
			}),
		])
	})
})
