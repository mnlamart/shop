import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'


test.describe('Admin Order Management', () => {
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

	test.afterEach(async () => {
		// Clean up test data - batch all operations in a transaction for better performance
		const categoryId = testCategory?.id
		
		// Delete products and related data first
		await prisma.$transaction([
			// Delete Orders first (will cascade delete OrderItems)
			prisma.order.deleteMany({
				where: {
					orderNumber: { startsWith: 'ORD-' },
				},
			}),
			// Delete CartItems before Products
			...(categoryId
				? [
						prisma.cartItem.deleteMany({
							where: {
								product: {
									categoryId: categoryId,
								},
							},
						}),
						prisma.product.deleteMany({
							where: { categoryId: categoryId },
						}),
					]
				: [
						prisma.cartItem.deleteMany({}),
						prisma.product.deleteMany({}),
					]),
			prisma.user.deleteMany({
				where: { username: { startsWith: 'admin' } },
			}),
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

		// Create test orders - generate second order number after first is committed
		const orderNumber1 = await generateOrderNumber()
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
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
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

		await navigate('/admin/orders')

		// Check that both orders are displayed
		await expect(page.getByText(orderNumber1)).toBeVisible()
		await expect(page.getByText(orderNumber2)).toBeVisible()
		await expect(page.getByText('customer1@example.com')).toBeVisible()
		await expect(page.getByText('customer2@example.com')).toBeVisible()
	})

	test('should filter orders by status', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		// Create orders with different statuses
		const orderNumber1 = await generateOrderNumber()
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
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
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

		await navigate('/admin/orders')

		// Filter by CONFIRMED status
		// The Select component uses aria-label="Filter by status"
		const statusFilter = page.getByRole('combobox', { name: /filter by status/i })
		await statusFilter.click()
		await page.getByRole('option', { name: /confirmed/i }).click()

		// Should show only CONFIRMED orders
		await expect(page.getByText(orderNumber1)).toBeVisible()
		await expect(page.getByText(orderNumber2)).not.toBeVisible()
	})

	test('should search orders by order number', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber1 = await generateOrderNumber()
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
				email: 'customer2@example.com',
				subtotal: 20000,
				total: 20000,
				shippingName: 'Customer Two',
				shippingStreet: '456 Test Ave',
				shippingCity: 'Test City',
				shippingPostal: '54321',
				shippingCountry: 'US',
				status: 'CONFIRMED',
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

		await navigate('/admin/orders')
		await page.waitForLoadState('networkidle')

		// Verify both orders are visible initially
		await expect(page.getByText(orderNumber1)).toBeVisible()
		await expect(page.getByText(orderNumber2)).toBeVisible()

		// Search by order number
		const searchInput = page.getByPlaceholder(/search orders/i)
		await searchInput.fill(orderNumber1)
		await searchInput.blur() // Trigger change event

		// Wait for React to update the filtered list
		await page.waitForTimeout(300)

		// Should show only matching order
		await expect(page.getByText(orderNumber1)).toBeVisible({ timeout: 5000 })
		// Second order should not be visible - wait for it to disappear
		await expect(page.getByText(orderNumber2)).not.toBeVisible({ timeout: 5000 })
		await expect(page.getByText(orderNumber1)).toBeVisible()
		await expect(page.getByText(orderNumber2)).not.toBeVisible()
	})

	test('should search orders by email', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber1 = await generateOrderNumber()

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

		await navigate('/admin/orders')

		// Search by email
		const searchInput = page
			.getByRole('textbox', { name: /search/i })
			.or(page.getByPlaceholder(/search/i))
			.first()
		await searchInput.fill('unique-email')

		// Should show matching order
		await expect(page.getByText(orderNumber1)).toBeVisible()
		await expect(page.getByText('unique-email@example.com')).toBeVisible()
	})

	test('should display empty state when no orders exist', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		await navigate('/admin/orders')

		// The page shows two separate messages: "No orders found." and "You haven't received any orders yet."
		// Use a more specific selector or check for the first one
		await expect(page.getByText('No orders found.')).toBeVisible()
	})

	test('should link to order detail page from order list', async ({ page, navigate, login }) => {
		
		// Ensure testProduct exists (created in beforeEach)
		if (!testProduct?.id) {
			throw new Error('testProduct was not created in beforeEach')
		}
		
		await login({ asAdmin: true })

		const orderNumber = await generateOrderNumber()

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

