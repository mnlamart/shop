import { randomUUID } from 'node:crypto'
import { type TestInfo } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'
import { createProductData } from '../product-utils.ts'

const CART_CATEGORY_PREFIX = 'cart-e2e-category-'
const CART_PRODUCT_PREFIX = 'cart-e2e-product-'
const CART_SKU_PREFIX = 'CART-E2E-'

function getTestPrefix(testInfo: TestInfo) {
	return testInfo.testId.replace(/\W+/g, '-').toLowerCase()
}

async function createTestCategory(testPrefix: string) {
	return prisma.category.create({
		data: {
			name: `Test Category ${testPrefix.slice(-8)}`,
			slug: `${CART_CATEGORY_PREFIX}${testPrefix}-${randomUUID()}`,
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
			slug: `${CART_PRODUCT_PREFIX}${testPrefix}-${uniqueId}`,
			description: productData.description,
			sku: `${CART_SKU_PREFIX}${testPrefix}-${uniqueId}`,
			price: productData.price,
			status: 'ACTIVE',
			categoryId,
		},
	})
}

test.describe('Shopping Cart', () => {
	test.describe.configure({ mode: 'serial' })
	test('should display empty cart message when cart is empty', async ({ page }) => {
		await page.goto('/shop/cart')
		await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible()
		await expect(page.getByText(/your cart is empty/i)).toBeVisible()
	})

	test('should display cart items when cart has products', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Create test category
		const category = await createTestCategory(testPrefix)

		// Create test product
		const product = await createTestProduct(category.id, testPrefix)

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Navigate to cart page
		await page.goto('/shop/cart')
		
		// Verify cart page displays the item
		await expect(page.getByRole('heading', { name: /shopping cart/i })).toBeVisible()
		await expect(page.getByText(product.name)).toBeVisible()
	})

	test('should allow updating cart item quantity', async ({ page }, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Create test category
		const category = await createTestCategory(testPrefix)

		// Create test product
		const product = await createTestProduct(category.id, testPrefix)

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()

		// Navigate to cart page
		await page.goto('/shop/cart')
		await page.waitForLoadState('networkidle')
		
		// Update quantity - use label for quantity input
		const quantityInput = page.getByLabel(/quantity/i).first()
		await expect(quantityInput).toBeVisible({ timeout: 10000 })
		await quantityInput.fill('2')
		
		// Verify update button exists
		await expect(page.getByRole('button', { name: /update/i })).toBeVisible()
	})

	test.afterEach(async ({}, testInfo) => {
		const testPrefix = getTestPrefix(testInfo)
		// Cleanup only data created for this test prefix
		await prisma.$transaction([
			prisma.orderItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: `${CART_SKU_PREFIX}${testPrefix}-`,
						},
					},
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: `${CART_SKU_PREFIX}${testPrefix}-`,
						},
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: {
						startsWith: `${CART_SKU_PREFIX}${testPrefix}-`,
					},
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: {
						startsWith: `${CART_CATEGORY_PREFIX}${testPrefix}-`,
					},
				},
			}),
		])
	})
})

