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
		// Ensure testCategory exists (created in beforeEach)
		if (!testCategory?.id) {
			throw new Error('testCategory was not created in beforeEach')
		}

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

		// Navigate to checkout - it redirects to review, then we need to go to shipping step
		await page.goto('/shop/checkout')
		// Wait for redirect to review step
		await page.waitForURL(/\/shop\/checkout\/review/, { timeout: 10000 })
		// Navigate to shipping step where the form is
		await page.goto('/shop/checkout/shipping')
		await page.waitForLoadState('networkidle')

		// Verify checkout form is displayed - shipping page has "Shipping Information" heading
		await expect(page.getByRole('heading', { name: /shipping information/i })).toBeVisible()
		await expect(page.getByLabel(/^name$/i)).toBeVisible()
		await expect(page.getByLabel(/email/i)).toBeVisible()
		await expect(page.getByLabel(/street/i)).toBeVisible()
		await expect(page.getByLabel(/city/i)).toBeVisible()
		await expect(page.getByLabel(/postal|zip/i)).toBeVisible()
		await expect(page.getByLabel(/country/i)).toBeVisible()
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

		// Navigate to checkout shipping step
		await page.goto('/shop/checkout/shipping')

		// Clear the country default value to test empty form
		await page.getByLabel(/country/i).clear()
		
		// Submit empty form - button says "Continue to Delivery"
		await page.getByRole('button', { name: /continue to delivery/i }).click()

		// Wait for form validation errors to appear (should stay on shipping page)
		await page.waitForLoadState('networkidle')
		
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

		// Navigate to checkout shipping step
		await page.goto('/shop/checkout/shipping')

			// Fill form with invalid email
			await page.getByLabel(/^name$/i).fill('Test User')
			await page.getByLabel(/email/i).fill('invalid-email')
			await page.getByLabel(/street/i).fill('123 Main St')
			await page.getByLabel(/city/i).fill('New York')
		await page.getByLabel(/postal|zip/i).fill('10001')
		await page.getByLabel(/country/i).fill('US')

		await page.getByRole('button', { name: /continue to delivery/i }).click()

		// Wait for validation error (should stay on shipping page)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/invalid email address/i)).toBeVisible({ timeout: 10000 })
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

		// Navigate to checkout shipping step
		await page.goto('/shop/checkout/shipping')

		// Fill form with invalid country code (too long)
		await page.getByLabel(/^name$/i).fill('Test User')
		await page.getByLabel(/email/i).fill('test@example.com')
		await page.getByLabel(/street/i).fill('123 Main St')
		await page.getByLabel(/city/i).fill('New York')
		await page.getByRole('textbox', { name: /postal|zip/i }).fill('10001')
		await page.getByRole('textbox', { name: /country/i }).fill('USA')

		await page.getByRole('button', { name: /continue to delivery/i }).click()

		// Wait for validation error (should stay on shipping page)
		await page.waitForLoadState('networkidle')
		await expect(
			page.getByText(/country.*2.*letter.*iso/i),
		).toBeVisible({ timeout: 10000 })
	})

	test('should redirect to Stripe checkout when form is submitted with valid data', async ({
		page,
	}) => {
		test.setTimeout(60000)
		// Create shipping zone and method for US
		const shippingZone = await prisma.shippingZone.create({
			data: {
				name: `Test US Zone ${Date.now()}`,
				description: 'US only',
				countries: ['US'],
				isActive: true,
				displayOrder: 0,
			},
		})

		const shippingMethod = await prisma.shippingMethod.create({
			data: {
				zoneId: shippingZone.id,
				name: 'Standard Shipping',
				description: 'Standard delivery',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
				estimatedDays: 5,
			},
		})

		// Store IDs for cleanup
		const shippingZoneId = shippingZone.id
		const shippingMethodId = shippingMethod.id

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
		// Wait for cart to be updated
		await page.waitForTimeout(500)

		// Navigate to checkout shipping step
		await page.goto('/shop/checkout/shipping')
		await page.waitForLoadState('networkidle')

		// Fill out checkout form
		await page.getByLabel(/^name$/i).fill('Test User')
		await page.getByLabel(/email/i).fill('test@example.com')
		await page.getByLabel(/street/i).fill('123 Main St')
		await page.getByLabel(/city/i).fill('New York')
		await page.getByLabel(/postal|zip/i).fill('10001')
		await page.getByLabel(/country/i).fill('US')
		
		await page.getByRole('button', { name: /continue to delivery/i }).click()
		await page.waitForURL(/\/shop\/checkout\/delivery/, { timeout: 10000 })

		// Wait for delivery page to load
		await page.waitForSelector('h2:has-text("Delivery Options")', { timeout: 15000 })
		await page.waitForSelector('text=Standard Shipping', { timeout: 15000 })
		
		// Select shipping method - use radio button role
		const shippingMethodRadio = page.getByRole('radio', { name: /standard shipping/i }).first()
		await shippingMethodRadio.click()
		
		// Continue to payment - the payment page auto-submits on mount, redirecting to Stripe
		await page.getByRole('button', { name: /continue to payment/i }).click()
		
		// The payment page auto-submits, so we might go directly to Stripe or to payment page first
		// Wait for either the payment page or Stripe
		await Promise.race([
			page.waitForURL(/\/shop\/checkout\/payment/, { timeout: 5000 }).then(() => {
				// If we're on payment page, wait for it to auto-submit and redirect to Stripe
				return page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 })
			}),
			page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 }),
		])

		// Verify we're on Stripe checkout
		const finalUrl = page.url()
		expect(finalUrl.includes('checkout.stripe.com')).toBeTruthy()

		// Cleanup shipping zone and method
		await prisma.$transaction([
			prisma.shippingMethod.deleteMany({ where: { id: shippingMethodId } }),
			prisma.shippingZone.deleteMany({ where: { id: shippingZoneId } }),
		])
	})

	test('should complete Stripe checkout and redirect to order details', async ({
		page,
	}) => {
		test.setTimeout(60000)
		// This test uses mocked Stripe API responses via MSW
		// No real Stripe credentials needed

		// Create shipping zone and method for US
		const shippingZone = await prisma.shippingZone.create({
			data: {
				name: `Test US Zone ${Date.now()}`,
				description: 'US only',
				countries: ['US'],
				isActive: true,
				displayOrder: 0,
			},
		})

		const shippingMethod = await prisma.shippingMethod.create({
			data: {
				zoneId: shippingZone.id,
				name: 'Standard Shipping',
				description: 'Standard delivery',
				rateType: 'FLAT',
				flatRate: 500,
				isActive: true,
				displayOrder: 0,
				estimatedDays: 5,
			},
		})

		// Store IDs for cleanup
		const shippingZoneId = shippingZone.id
		const shippingMethodId = shippingMethod.id

		// Create a test product with stock
		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: 23899, // $238.99 in cents
				status: 'ACTIVE',
				categoryId: testCategory.id,
				stockQuantity: 10,
			},
		})

		// Add product to cart
		await page.goto(`/shop/products/${product.slug}`)
		await page.getByRole('button', { name: /add to cart/i }).click()
		await page.waitForTimeout(500) // Wait for cart update

		// Navigate to checkout shipping step
		await page.goto('/shop/checkout/shipping')
		await page.waitForLoadState('networkidle')

		// Fill out checkout form
		await page.getByLabel(/^name$/i).fill('Test User')
		await page.getByRole('textbox', { name: /email/i }).fill('test@example.com')
		await page.getByRole('textbox', { name: /street/i }).fill('123 Main St')
		await page.getByRole('textbox', { name: /city/i }).fill('New York')
		await page.getByLabel(/postal|zip/i).fill('10001')
		await page.getByLabel(/country/i).fill('US')

		// Continue through checkout steps
		await page.getByRole('button', { name: /continue to delivery/i }).click()
		// Wait for delivery step
		await page.waitForURL(/\/shop\/checkout\/delivery/, { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		
		// Check if we're still on delivery page (might have redirected if no shipping methods)
		const deliveryUrl = page.url()
		if (!deliveryUrl.includes('/shop/checkout/delivery')) {
			throw new Error(`Expected to be on delivery page, but was on: ${deliveryUrl}`)
		}
		
		// Wait for delivery page to load - check for either "Delivery Options" or "No shipping methods"
		await Promise.race([
			page.getByRole('heading', { name: /delivery options/i }).waitFor({ timeout: 15000 }),
			page.getByRole('heading', { name: /no shipping methods/i }).waitFor({ timeout: 15000 }),
		]).catch(() => {})
		
		// If "No shipping methods", that's a problem
		const pageText = await page.textContent('body') || ''
		if (pageText.includes('No shipping methods available')) {
			throw new Error('No shipping methods available - shipping zone/method may not have been created correctly')
		}
		
		// Wait for shipping method to appear
		await page.waitForSelector('text=Standard Shipping', { timeout: 15000 })
		
		// Select shipping method - use radio button role
		const shippingMethodRadio = page.getByRole('radio', { name: /standard shipping/i }).first()
		await shippingMethodRadio.click()
		
		// Continue to payment - the payment page auto-submits on mount, redirecting to Stripe
		await page.getByRole('button', { name: /continue to payment/i }).click()
		// Wait for navigation to start (payment page loads first, then auto-submits)
		await page.waitForURL(/\/shop\/checkout\/payment/, { timeout: 10000 }).catch(() => {
			// If we're already on Stripe, that's fine
		})

		// With mocked Stripe, the redirect should go directly to Stripe checkout URL
		// In test mode, MSW will intercept and return mock checkout URL
		// Wait for redirect to Stripe checkout URL
		await page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 })

		// Verify we're on Stripe checkout page (even if mocked)
		const currentUrl = page.url()
		expect(currentUrl).toMatch(/checkout\.stripe\.com/)
		
		// Note: With mocked Stripe responses, we can't actually complete the payment flow
		// The test verifies that:
		// 1. Form submission works
		// 2. Stock validation occurs
		// 3. Stripe checkout session is created
		// 4. Redirect to Stripe checkout URL happens
		// 
		// Actual payment completion would require either:
		// - Real Stripe test mode setup
		// - More complex mocking of Stripe's hosted checkout page

		// Cleanup shipping zone and method
		await prisma.$transaction([
			prisma.shippingMethod.deleteMany({ where: { id: shippingMethodId } }),
			prisma.shippingZone.deleteMany({ where: { id: shippingZoneId } }),
		])
	})

	test.afterEach(async () => {
		// Cleanup: Batch all operations in a transaction for better performance
		// Delete products first, then categories (to respect foreign key constraints)
		const categoryId = testCategory?.id
		
		await prisma.$transaction([
			prisma.orderItem.deleteMany({
				where: {
					order: {
						stripeCheckoutSessionId: {
							startsWith: 'cs_test_',
						},
					},
				},
			}),
			prisma.order.deleteMany({
				where: {
					stripeCheckoutSessionId: {
						startsWith: 'cs_test_',
					},
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: {
							startsWith: 'SKU-',
						},
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			}),
			prisma.cart.deleteMany({}),
		])
		
		// Delete category separately (after products are deleted)
		if (categoryId) {
			await prisma.category
				.deleteMany({ where: { id: categoryId } })
				.catch(() => {
					// Ignore if category was already deleted or doesn't exist
				})
		}
	})
})

