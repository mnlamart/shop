import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

const SHOP_CATEGORY_PREFIX = 'shop-e2e-category-'
const SHOP_PRODUCT_PREFIX = 'shop-e2e-product-'

test.describe('Shop Home Page', () => {
	test.describe.configure({ mode: 'serial' })

	test('should display welcome message', async ({ page }) => {
		await page.goto('/shop')
		await expect(page.getByRole('heading', { name: /welcome to our shop/i })).toBeVisible()
	})

	test('should have browse all products link', async ({ page }) => {
		await page.goto('/shop')
		await expect(page.getByRole('link', { name: /browse all products/i })).toBeVisible()
	})

	test('should display category cards', async ({ page }) => {
		const unique = randomUUID()
		const categoryName = `Test Category ${unique.slice(0, 6)}`
		const categorySlug = `${SHOP_CATEGORY_PREFIX}${unique}`
		const productSlug = `${SHOP_PRODUCT_PREFIX}${unique}`
		const productSku = `SHOP-E2E-${unique}`

		// Create a category with a product so it's displayed
		const category = await prisma.category.create({
			data: {
				name: categoryName,
				slug: categorySlug,
				description: 'Test category description',
			},
		})
		
		// Create a product in this category so the category is displayed
		const productData = createProductData()
		await prisma.product.create({
			data: {
				name: productData.name,
				slug: productSlug,
				description: productData.description,
				sku: productSku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})
		
		await page.goto('/shop')
		await page.waitForLoadState('networkidle')
		// Use accessible query - category cards are links to category pages
		// Find any category link (they contain category names)
		const categoryLink = page.getByRole('link', { name: new RegExp(categoryName, 'i') })
		await expect(categoryLink).toBeVisible({ timeout: 10000 })
	})

	test.afterEach(async () => {
		// Cleanup: Delete products first to avoid foreign key constraints, then categories
		await prisma.$transaction([
			prisma.product.deleteMany({
				where: {
					category: {
						slug: {
							startsWith: SHOP_CATEGORY_PREFIX,
						},
					},
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: {
						startsWith: SHOP_CATEGORY_PREFIX,
					},
				},
			}),
		])
	})
})
