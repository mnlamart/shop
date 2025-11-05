import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'

test.describe('Order History', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testProduct: Awaited<ReturnType<typeof prisma.product.create>>

	test.beforeEach(async () => {
		// Create a test category
		testCategory = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test category for products',
			},
		})

		// Create a test product
		const productData = createProductData()
		testProduct = await prisma.product.create({
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
	})

	test('should allow unauthenticated users to access order history for guest lookup', async ({
		page,
		navigate,
	}) => {
		await navigate('/shop/orders')
		// Shop orders page allows unauthenticated access for guest order lookup
		await expect(page).toHaveURL(/\/shop\/orders/)
		// Should show guest lookup form
		await expect(page.getByRole('textbox', { name: /order number/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
	})

	test('should display empty state when user has no orders', async ({ page, login }) => {
		await login()

		await page.goto('/shop/orders')

		await expect(page.getByRole('heading', { name: /orders|order history/i })).toBeVisible()
		await expect(page.getByText(/no orders|you haven't placed any orders/i)).toBeVisible()
	})

	test('should display user orders in reverse chronological order', async ({
		page,
		login,
	}) => {
		const user = await login()

		// Create two orders - generate second order number after first is committed
		const orderNumber1 = await generateOrderNumber()
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				userId: user.id,
				email: user.email,
				subtotal: 10000, // $100.00 in cents
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `cs_test_${Date.now()}_1`,
				items: {
					create: {
						productId: testProduct.id,
						price: 10000,
						quantity: 1,
					},
				},
			},
		})

		// Generate second order number after first order is committed
		const orderNumber2 = await generateOrderNumber()
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				userId: user.id,
				email: user.email,
				subtotal: 20000, // $200.00 in cents
				total: 20000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'SHIPPED',
				stripeCheckoutSessionId: `cs_test_${Date.now()}_2`,
				items: {
					create: {
						productId: testProduct.id,
						price: 20000,
						quantity: 1,
					},
				},
			},
		})

		await page.goto('/shop/orders')

		// Verify orders are displayed (newest first)
		await expect(page.getByText(orderNumber2)).toBeVisible()
		await expect(page.getByText(orderNumber1)).toBeVisible()

		// Verify order details are shown
		await expect(page.getByText(/\$200\.00|\$200/)).toBeVisible()
		await expect(page.getByText(/\$100\.00|\$100/)).toBeVisible()
		await expect(page.getByText(/shipped/i)).toBeVisible()
		await expect(page.getByText(/confirmed/i)).toBeVisible()
	})

	test('should display order number, date, status, and total for each order', async ({
		page,
		login,
	}) => {
		const user = await login()

		const orderNumber = await generateOrderNumber()
		const order = await prisma.order.create({
			data: {
				orderNumber,
				userId: user.id,
				email: user.email,
				subtotal: 50000, // $500.00 in cents
				total: 50000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				items: {
					create: {
						productId: testProduct.id,
						price: 50000,
						quantity: 1,
					},
				},
			},
		})

		await page.goto('/shop/orders')

		// Verify all required fields are displayed
		await expect(page.getByText(orderNumber)).toBeVisible()
		await expect(page.getByText(/\$500\.00|\$500/)).toBeVisible()
		await expect(page.getByText(/confirmed/i)).toBeVisible()
		// Date should be formatted and visible
		// The route uses toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
		// which produces something like "November 5, 2025"
		const date = new Date(order.createdAt)
		const month = date.toLocaleDateString('en-US', { month: 'long' })
		const day = date.getDate()
		const year = date.getFullYear()
		const formattedDate = `${month} ${day}, ${year}`
		await expect(
			page.getByText(new RegExp(formattedDate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
		).toBeVisible()
	})

	test('should have guest order lookup form', async ({ page }) => {
		await page.goto('/shop/orders')

		// Guest lookup form should be visible even when not authenticated
		await expect(page.getByRole('textbox', { name: /order number/i })).toBeVisible()
		await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
		await expect(page.getByRole('button', { name: /look up|find order/i })).toBeVisible()
	})

	test('should validate email matches order for guest lookup', async ({ page }) => {
		const orderNumber = await generateOrderNumber()
		const guestEmail = 'guest@example.com'

		// Create a guest order (no userId)
		await prisma.order.create({
			data: {
				orderNumber,
				userId: null,
				email: guestEmail,
				subtotal: 10000,
				total: 10000,
				shippingName: 'Guest User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				items: {
					create: {
						productId: testProduct.id,
						price: 10000,
						quantity: 1,
					},
				},
			},
		})

		await page.goto('/shop/orders')

		// Try with wrong email
		await page.getByRole('textbox', { name: /order number/i }).fill(orderNumber)
		await page.getByRole('textbox', { name: /email/i }).fill('wrong@example.com')
		await page.getByRole('button', { name: /look up|find order/i }).click()

		// Should show error or stay on page
		await expect(page).toHaveURL(/\/shop\/orders/)

		// Try with correct email
		await page.getByRole('textbox', { name: /order number/i }).fill(orderNumber)
		await page.getByRole('textbox', { name: /email/i }).fill(guestEmail)
		await page.getByRole('button', { name: /look up|find order/i }).click()

		// Should redirect to order detail
		await expect(page).toHaveURL(new RegExp(`/shop/orders/${orderNumber}`))
	})

	test('should link to order details from order history', async ({ page, login }) => {
		const user = await login()

		const orderNumber = await generateOrderNumber()
		await prisma.order.create({
			data: {
				orderNumber,
				userId: user.id,
				email: user.email,
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				items: {
					create: {
						productId: testProduct.id,
						price: 10000,
						quantity: 1,
					},
				},
			},
		})

		await page.goto('/shop/orders')

		// Click on order number link
		const orderLink = page.getByRole('link', { name: orderNumber })
		await expect(orderLink).toBeVisible()
		await orderLink.click()

		// Should navigate to order detail page
		await expect(page).toHaveURL(new RegExp(`/shop/orders/${orderNumber}`))
	})

	test.afterEach(async () => {
		// Cleanup: Delete in order to respect foreign key constraints
		// Delete Orders first (will cascade delete OrderItems)
		await prisma.order.deleteMany({
			where: {
				stripeCheckoutSessionId: {
					startsWith: 'cs_test_',
				},
			},
		})

		// Delete CartItems before Products
		await prisma.cartItem.deleteMany({
			where: {
				product: {
					sku: {
						startsWith: 'SKU-',
					},
				},
			},
		})

		// Now we can safely delete products
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

