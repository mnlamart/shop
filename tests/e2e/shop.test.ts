import { prisma } from '#app/utils/db.server.ts'
import { test, expect } from '../playwright-utils.ts'

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
		await page.goto('/shop')
		const categoryCards = page.getByTestId('category-card')
		await expect(categoryCards.first()).toBeVisible()
	})

	test.afterEach(async () => {
		// Cleanup: Use transaction for consistency (even with single operation)
		await prisma.$transaction([
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
