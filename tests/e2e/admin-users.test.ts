import { getPasswordHash } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

async function createAdminUser() {
	const username = `admin${Date.now()}`
	const email = `admin${Date.now()}@example.com`
	const password = username
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username,
			name: 'Admin User',
			email,
			roles: { connect: { name: 'admin' } },
			password: { create: { hash: hashedPassword } },
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

async function loginAsAdmin(page: any, username: string, password: string) {
	await page.goto('/login')
	await page.getByRole('textbox', { name: /username/i }).fill(username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()
	await page.waitForFunction(() => {
		return document.querySelector('[aria-label*="User menu"]') !== null
	}, { timeout: 5000 })
}

test.describe('Admin User Management', () => {
	test.beforeEach(async () => {
		// Ensure admin role exists
		await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin', description: 'Administrator' },
		})
	})

	test.afterEach(async () => {
		// Clean up test users
		await prisma.user.deleteMany({
			where: {
				OR: [
					{ username: { startsWith: 'admin' } },
					{ username: { startsWith: 'testuser' } },
					{ email: { startsWith: 'testuser' } },
				],
			},
		})
	})

	test('should redirect non-admin users from admin users page', async ({
		page,
		login,
		navigate,
	}) => {
		await login()
		await navigate('/admin/users')
		// requireUserWithRole throws a 403 response, which React Router renders as an error page
		await page.waitForLoadState('networkidle')

		// Check for error content that indicates unauthorized access
		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({
			timeout: 5000,
		})
	})

	test('should display admin users list page', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		await navigate('/admin/users')

		await expect(page).toHaveURL(/\/admin\/users/)
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible()
	})

	test('should display all users in the list', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create test users
		const testUser1 = await prisma.user.create({
			data: {
				username: `testuser1-${Date.now()}`,
				email: `testuser1-${Date.now()}@example.com`,
				name: 'Test User One',
			},
		})

		const testUser2 = await prisma.user.create({
			data: {
				username: `testuser2-${Date.now()}`,
				email: `testuser2-${Date.now()}@example.com`,
				name: 'Test User Two',
			},
		})

		await navigate('/admin/users')

		// Check that users are displayed
		await expect(page.getByText(testUser1.name || testUser1.username)).toBeVisible()
		await expect(page.getByText(testUser2.name || testUser2.username)).toBeVisible()
	})

	test('should display user email and username', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		await navigate('/admin/users')

		// Check that email and username are displayed
		await expect(page.getByText(testUser.email)).toBeVisible()
		// Use more specific selector - username appears in the table cell
		await expect(page.getByRole('cell', { name: new RegExp(testUser.username) })).toBeVisible()
	})

	test('should display user roles', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create a role
		const testRole = await prisma.role.create({
			data: {
				name: 'test-role',
				description: 'Test Role',
			},
		})

		// Create user with role
		await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
				roles: { connect: { id: testRole.id } },
			},
		})

		await navigate('/admin/users')

		// Check that role is displayed
		await expect(page.getByText(testRole.name)).toBeVisible()
	})

	test('should filter users by role', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create roles
		const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })
		const testRole = await prisma.role.create({
			data: {
				name: 'test-role',
				description: 'Test Role',
			},
		})

		// Create users with different roles
		const adminUser = await prisma.user.create({
			data: {
				username: `adminuser-${Date.now()}`,
				email: `adminuser-${Date.now()}@example.com`,
				name: 'Admin User',
				roles: { connect: { id: adminRole!.id } },
			},
		})

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
				roles: { connect: { id: testRole.id } },
			},
		})

		await navigate('/admin/users')

		// Filter by admin role
		await page.getByRole('combobox', { name: /filter by role/i }).click()
		await page.getByRole('option', { name: 'admin' }).click()

		// Wait for filter to apply
		await page.waitForTimeout(500)

		// Check that only admin user is visible
		await expect(page.getByText(adminUser.name || adminUser.username)).toBeVisible()
		// Test user should not be visible (or filtered out)
		const testUserVisible = await page.getByText(testUser.name || testUser.username).isVisible().catch(() => false)
		expect(testUserVisible).toBe(false)
	})

	test('should search users by name', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		await prisma.user.create({
			data: {
				username: `testuser1-${Date.now()}`,
				email: `testuser1-${Date.now()}@example.com`,
				name: 'Alice Smith',
			},
		})

		await prisma.user.create({
			data: {
				username: `testuser2-${Date.now()}`,
				email: `testuser2-${Date.now()}@example.com`,
				name: 'Bob Jones',
			},
		})

		await navigate('/admin/users')

		// Search for Alice
		await page.getByPlaceholder(/search users/i).fill('Alice')

		// Wait for search to apply
		await page.waitForTimeout(500)

		// Check that only Alice is visible
		await expect(page.getByText('Alice Smith')).toBeVisible()
		// Bob should not be visible
		const bobVisible = await page.getByText('Bob Jones').isVisible().catch(() => false)
		expect(bobVisible).toBe(false)
	})

	test('should search users by email', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `special.email-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		await navigate('/admin/users')

		// Search by email
		await page.getByPlaceholder(/search users/i).fill('special.email')

		// Wait for search to apply
		await page.waitForTimeout(500)

		// Check that user is visible
		await expect(page.getByText(testUser.email)).toBeVisible()
	})

	test('should navigate to user detail page', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		await navigate('/admin/users')

		// Click on user link
		await page.getByRole('link', { name: testUser.name || testUser.username }).click()

		// Should navigate to user detail page
		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}`))
		await expect(page.getByRole('heading', { name: testUser.name || testUser.username })).toBeVisible()
	})

	test('should display user detail page with profile information', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		await navigate(('/admin/users/' + testUser.id) as any)

		// Check that user details are displayed
		await expect(page.getByText(testUser.email)).toBeVisible()
		await expect(page.getByText(testUser.username)).toBeVisible()
		if (testUser.name) {
			await expect(page.getByText(testUser.name)).toBeVisible()
		}
	})

	test('should display user statistics', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		await navigate(('/admin/users/' + testUser.id) as any)

		// Check that statistics section is displayed
		await expect(page.getByText(/total orders/i)).toBeVisible()
		await expect(page.getByText(/active sessions/i)).toBeVisible()
		await expect(page.getByText(/total sessions/i)).toBeVisible()
	})

	test('should display user orders in detail page', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create test category and product
		const category = await prisma.category.create({
			data: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
				description: 'Test',
			},
		})

		const product = await prisma.product.create({
			data: {
				name: 'Test Product',
				slug: `test-product-${Date.now()}`,
				description: 'Test',
				sku: `SKU-${Date.now()}`,
				price: 1000,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		const testUser = await prisma.user.create({
			data: {
				username: `testuser-${Date.now()}`,
				email: `testuser-${Date.now()}@example.com`,
				name: 'Test User',
			},
		})

		// Create an order for the user
		const order = await prisma.order.create({
			data: {
				orderNumber: `ORD-${Date.now()}`,
				userId: testUser.id,
				email: testUser.email,
				subtotal: 10000,
				total: 10000,
				shippingName: 'Test User',
				shippingStreet: '123 Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				status: 'PENDING',
				stripeCheckoutSessionId: `cs_test_${Date.now()}`,
				items: {
					create: {
						productId: product.id,
						quantity: 1,
						price: 10000,
					},
				},
			},
		})

		await navigate(('/admin/users/' + testUser.id) as any)

		// Check that order is displayed
		await expect(page.getByText(order.orderNumber)).toBeVisible()
	})

	test('should return 404 for non-existent user', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		await navigate('/admin/users/non-existent-user-id' as any)

		// Should show 404 error
		await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 5000 })
	})
})

