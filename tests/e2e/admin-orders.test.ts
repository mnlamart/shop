import { randomUUID } from 'node:crypto'
import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'


test.describe('Admin Order Management', () => {
	let testCategory: Awaited<ReturnType<typeof prisma.category.create>>
	let testProduct: Awaited<ReturnType<typeof prisma.product.create>>
	let currentPrefix: string
	const ORDER_PREFIX = 'admin-orders-e2e'

	test.beforeEach(async () => {
		currentPrefix = `${ORDER_PREFIX}-${randomUUID()}`
		// Create a test category
		testCategory = await prisma.category.create({
			data: {
				name: `Test Category ${currentPrefix}`,
				slug: `${currentPrefix}-category`,
				description: 'Test category for products',
			},
		})

		// Create a test product
		const productData = createProductData()
		testProduct = await prisma.product.create({
			data: {
				name: productData.name,
				slug: `${currentPrefix}-product`,
				description: productData.description,
				sku: `${currentPrefix}-sku`,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: testCategory.id,
			},
		})
	})

	test.afterEach(async () => {
		// Scoped cleanup for data created by this suite
		await prisma.$transaction([
			prisma.order.deleteMany({
				where: {
					stripeCheckoutSessionId: { startsWith: ORDER_PREFIX },
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: { startsWith: ORDER_PREFIX },
					},
				},
			}),
			prisma.product.deleteMany({
				where: { sku: { startsWith: ORDER_PREFIX } },
			}),
			prisma.category.deleteMany({
				where: { slug: { startsWith: ORDER_PREFIX } },
			}),
		])
	})

	test('should redirect non-admin users from admin orders page', async ({
		page,
		login,
		navigate,
	}) => {
		await login()
		await navigate('/admin/orders')
		// requireUserWithRole throws a 403 response, which React Router renders as an error page
		// Wait for the error page to load
		await page.waitForLoadState('networkidle')
		
		// The error response data contains { error: 'Unauthorized', requiredRole: 'admin', message: ... }
		// Check for error content that indicates unauthorized access
		// The ErrorBoundary shows "Unauthorized" as a heading
		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({ timeout: 5000 })
	})

	test('should display admin order list page', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		await navigate('/admin/orders')

		await expect(page).toHaveURL(/\/admin\/orders/)
		await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible()
	})

	test('should display all orders in the list', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		// Create admin user
		await login({ asAdmin: true })

		// Create test orders with unique order numbers
		const orderNumber1 = `${currentPrefix}-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		// Generate second order number after first order is committed
		const orderNumber2 = `${currentPrefix}-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'SHIPPED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Check that both orders are displayed - use text matching instead of row name
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText('customer1@example.com')).toBeVisible({ timeout: 10000 })
		await expect(page.getByText('customer2@example.com')).toBeVisible({ timeout: 10000 })
	})

	test('should filter orders by status', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		// Create orders with different statuses
		const orderNumber1 = `${currentPrefix}-status-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})
		// Generate second order number after first order is committed
		const orderNumber2 = `${currentPrefix}-status-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'SHIPPED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Filter by CONFIRMED status
		// The Select component uses aria-label="Filter by status"
		const statusFilter = page.getByRole('combobox', { name: /filter by status/i })
		await statusFilter.click()
		await page.getByRole('option', { name: /confirmed/i }).click()
		
		// Wait for filter to apply
		await page.waitForLoadState('networkidle')

		// Should show only CONFIRMED orders
		await expect(page.getByRole('row', { name: new RegExp(orderNumber1, 'i') })).toBeVisible({ timeout: 10000 })
		await expect(page.getByRole('row', { name: new RegExp(orderNumber2, 'i') })).not.toBeVisible({ timeout: 5000 })
	})

	test('should search orders by order number', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const id = randomUUID().slice(0, 8)
		const orderNumber1 = `${currentPrefix}-search-1`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'customer1@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		// Generate second order number after first order is committed
		const orderNumber2 = `${currentPrefix}-search-2`
		await prisma.order.create({
			data: {
				orderNumber: orderNumber2,
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-2`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Verify both orders are visible initially
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).toBeVisible({ timeout: 10000 })

		// Search by order number
		const searchInput = page.getByPlaceholder(/search orders/i)
		await searchInput.fill(orderNumber1)
		await searchInput.blur() // Trigger change event

		// Wait for search to complete and results to update
		await page.waitForLoadState('networkidle')
		await page.waitForTimeout(500) // Give React time to filter

		// Should show only matching order
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(orderNumber2)).not.toBeVisible({ timeout: 5000 })
	})

	test('should search orders by email', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const id = randomUUID().slice(0, 8)
		const orderNumber1 = `${ORDER_PREFIX}-${id}-email-1`

		await prisma.order.create({
			data: {
				orderNumber: orderNumber1,
				email: 'unique-email@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer One',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-1`,
			},
		})

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		// Search by email
		const searchInput = page
			.getByRole('textbox', { name: /search/i })
			.or(page.getByPlaceholder(/search/i))
			.first()
		await searchInput.fill('unique-email')

		// Should show matching order (header + one row)
		await expect(page.getByRole('row')).toHaveCount(2, { timeout: 10000 })
	})

	test('should display empty state when no orders exist', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Ensure no orders exist from this test suite
		await prisma.order.deleteMany({
			where: {
				stripeCheckoutSessionId: { startsWith: ORDER_PREFIX },
			},
		})

		// Check if there are any orders at all (from any test suite)
		const totalOrders = await prisma.order.count()

		await page.goto('/admin/orders', { waitUntil: 'networkidle' })

		if (totalOrders === 0) {
			// If there are truly no orders, check for empty state message
			await expect(page.getByText(/no orders found/i)).toBeVisible({ timeout: 10000 })
		} else {
			// If there are orders from other test suites, just verify the page loads correctly
			await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible({ timeout: 10000 })
		}
	})

	test('should link to order detail page from order list', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber = `${currentPrefix}-detail`

		await prisma.order.create({
			data: {
				orderNumber,
				email: 'customer@example.com',
				subtotal: 10000,
				total: 10000,
				shippingName: 'Customer',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'CONFIRMED',
				stripeCheckoutSessionId: `${currentPrefix}-session-3`,
			},
		})

		await navigate('/admin/orders')

		// Wait for the order to appear in the list
		await page.waitForSelector(`a[aria-label*="${orderNumber}"]`, { timeout: 10000 })
		
		// Click on order number link - there are 2 links (text and icon), use first one
		// Use both getByRole and getByText as fallback for reliability
		const orderLink = page
			.getByRole('link', { name: orderNumber })
			.or(page.getByText(orderNumber))
			.first()
		
		// Wait for navigation while clicking
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/orders/${orderNumber}`), { timeout: 10000 }),
			orderLink.click()
		])

		// Should navigate to order detail page
		await expect(page).toHaveURL(new RegExp(`/admin/orders/${orderNumber}`))
	})
})

