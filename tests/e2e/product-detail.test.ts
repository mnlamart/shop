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
		// Ensure testCategory exists (created in beforeEach)
		if (!testCategory?.id) {
			throw new Error('testCategory was not created in beforeEach')
		}

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
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)

		// Check product name is visible
		await expect(page.getByRole('heading', { name: product.name })).toBeVisible()

		// Check product price is visible (price is now in cents)
		await expect(page.getByText(`$${(product.price / 100).toFixed(2)}`)).toBeVisible()

		// Check product description is visible
		await expect(page.getByText(product.description!)).toBeVisible()
	})

	test('should allow adding product without variants to cart', async ({ page }) => {
		
		// Ensure testCategory exists (created in beforeEach)
		if (!testCategory?.id) {
			throw new Error('testCategory was not created in beforeEach')
		}

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
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})

		await page.goto(`/shop/products/${product.slug}`)
		await page.waitForLoadState('networkidle')

		// Find and click add to cart button
		const addToCartButton = page.getByRole('button', { name: /add to cart/i })
		await expect(addToCartButton).toBeVisible({ timeout: 10000 })
		await addToCartButton.click()

		// After adding to cart, should redirect to cart page
		await expect(page).toHaveURL(/\/shop\/cart/)
	})

	test.afterEach(async () => {
		// Cleanup: Batch all operations in a transaction for better performance
		// OrderItems must be deleted before Products (Restrict constraint)
		// Products must be deleted before Categories (foreign key constraint)
		const categoryId = testCategory?.id
		
		// Delete products and related data first
		await prisma.$transaction([
			prisma.orderItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: 'SKU-',
						},
					},
				},
			}),
			// CartItems will cascade when Products are deleted, but delete explicitly for clarity
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: 'SKU-',
						},
					},
				},
			}),
			// Delete products first (before categories due to foreign key)
			prisma.product.deleteMany({
				where: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			}),
		])
		
		// Delete category separately (after products are deleted)
		if (categoryId) {
			await prisma.category
				.delete({ where: { id: categoryId } })
				.catch(() => {
					// Ignore if category was already deleted or doesn't exist
				})
		}
		
		// Reset testCategory for next test
		testCategory = undefined as any
	})
})

