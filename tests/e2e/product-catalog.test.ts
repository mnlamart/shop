import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

const CATALOG_CATEGORY_PREFIX = 'catalog-e2e-category-'
const CATALOG_PRODUCT_PREFIX = 'catalog-e2e-product-'
const CATALOG_SKU_PREFIX = 'CATALOG-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${CATALOG_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
			description: 'Test category for products',
		},
	})
}

async function createTestProduct(categoryId: string, testPrefix: string) {
	const productData = createProductData()
	const uniqueId = randomUUID()
	return prisma.product.create({
		data: {
			name: productData.name,
			slug: `${CATALOG_PRODUCT_PREFIX}${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${CATALOG_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: productData.price,
			status: 'ACTIVE',
			categoryId,
		},
	})
}

test.describe('Product Catalog', () => {
	test.describe.configure({ mode: 'serial' })
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

	test('product catalog should display product cards', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Create a test category
		const category = await createTestCategory(testPrefix)

		// Create a test product
		const product = await createTestProduct(category.id, testPrefix)

		await page.goto('/shop/products')
		// Wait for products to load
		await page.waitForLoadState('networkidle')
		// Use accessible query - product cards are links to product detail pages
		// Find the link that contains the product name
		const productLink = page.getByRole('link', { name: new RegExp(product.name, 'i') })
		await expect(productLink).toBeVisible({ timeout: 10000 })
	})

	test.afterEach(async ({}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Scoped cleanup for data created by this suite
		await prisma.$transaction([
			prisma.orderItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: `${CATALOG_SKU_PREFIX}${testPrefix}-`,
						},
					},
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: `${CATALOG_SKU_PREFIX}${testPrefix}-`,
						},
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: {
						startsWith: `${CATALOG_SKU_PREFIX}${testPrefix}-`,
					},
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: {
						startsWith: `${CATALOG_CATEGORY_PREFIX}${testPrefix}-`,
					},
				},
			}),
		])
	})
})
