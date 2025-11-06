import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { createUser, expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'
import {
	createAdminUser,
	createTestUser,
	createTestUserWithRoles,
	createTestRole,
	loginAsAdmin,
} from '#tests/user-utils.ts'

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
		// Clean up: delete users created during tests
		// Faker-generated usernames start with 2 alphanumeric chars + underscore
		// We'll delete users that match the pattern by checking username length and format
		const allUsers = await prisma.user.findMany({
			where: {
				username: {
					contains: '_',
				},
			},
			select: { id: true, username: true },
		})
		
		const testUserIds = allUsers
			.filter(u => /^[a-z0-9]{2}_/.test(u.username))
			.map(u => u.id)
		
		if (testUserIds.length > 0) {
			await prisma.user.deleteMany({
				where: { id: { in: testUserIds } },
			})
		}
		
		// Clean up test roles (except built-in ones)
		await prisma.role.deleteMany({
			where: {
				name: { notIn: ['admin', 'user'] },
			},
		})
		// Clean up test categories and products
		await prisma.order.deleteMany({
			where: {
				orderNumber: { startsWith: 'ORD-' },
			},
		})
		await prisma.cartItem.deleteMany({
			where: {
				product: {
					category: {
						name: { startsWith: 'Test' },
					},
				},
			},
		})
		await prisma.product.deleteMany({
			where: {
				category: {
					name: { startsWith: 'Test' },
				},
			},
		})
		await prisma.category.deleteMany({
			where: {
				name: { startsWith: 'Test' },
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

		// Create test users with faker
		const { user: testUser1 } = await createTestUser({
			name: faker.person.fullName(),
		})
		const { user: testUser2 } = await createTestUser({
			name: faker.person.fullName(),
		})

		await navigate('/admin/users')

		// Check that users are displayed
		await expect(page.getByText(testUser1.name || testUser1.username)).toBeVisible()
		await expect(page.getByText(testUser2.name || testUser2.username)).toBeVisible()
	})

	test('should display user email and username', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate('/admin/users')

		// Check that email and username are displayed
		await expect(page.getByText(testUser.email)).toBeVisible()
		// Use more specific selector - username appears in its own cell
		const usernameCell = page.getByRole('cell', { name: new RegExp(`^${testUser.username}$`) })
		await expect(usernameCell).toBeVisible()
	})

	test('should display user roles', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create a role with faker
		const testRole = await createTestRole()

		// Create user with role
		await createTestUserWithRoles([testRole.name])

		await navigate('/admin/users')

		// Check that role is displayed
		await expect(page.getByText(testRole.name)).toBeVisible()
	})


	test('should search users by name', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const aliceName = faker.person.fullName({ firstName: 'Alice' })
		const bobName = faker.person.fullName({ firstName: 'Bob' })

		await createTestUser({ name: aliceName })
		await createTestUser({ name: bobName })

		await navigate('/admin/users')

		// Search for Alice
		await page.getByPlaceholder(/search users/i).fill('Alice')

		// Wait for search to apply
		await page.waitForTimeout(500)

		// Check that only Alice is visible
		await expect(page.getByText(aliceName)).toBeVisible()
		// Bob should not be visible
		const bobVisible = await page.getByText(bobName).isVisible().catch(() => false)
		expect(bobVisible).toBe(false)
	})

	test('should search users by email', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate('/admin/users')

		// Search by email domain
		const emailDomain = testUser.email.split('@')[1]
		if (emailDomain) {
			await page.getByPlaceholder(/search users/i).fill(emailDomain)

			// Wait for search to apply
			await page.waitForTimeout(500)

			// Check that user is visible
			await expect(page.getByText(testUser.email)).toBeVisible()
		}
	})

	test('should display user detail page with profile information', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that user details are displayed - use getByTestId for elements that appear multiple times
		await expect(page.getByTestId('user-detail-email')).toHaveText(testUser.email, { timeout: 10000 })
		await expect(page.getByTestId('user-detail-username')).toHaveText(testUser.username, { timeout: 10000 })
		if (testUser.name) {
			await expect(page.getByTestId('user-detail-name')).toHaveText(testUser.name, { timeout: 10000 })
		}
	})

	test('should display user statistics', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that statistics section is displayed using role-based locators
		await expect(page.getByText(/total orders/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/active sessions/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/total sessions/i).first()).toBeVisible({ timeout: 10000 })
	})

	test('should display user orders in detail page', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create test category and product with faker
		const categoryName = faker.commerce.department()
		const category = await prisma.category.create({
			data: {
				name: categoryName,
				slug: faker.helpers.slugify(categoryName).toLowerCase() + '-' + faker.string.alphanumeric(4),
				description: faker.lorem.sentence(),
			},
		})

		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		const { user: testUser } = await createTestUser()

		// Create an order for the user
		const order = await prisma.order.create({
			data: {
				orderNumber: await generateOrderNumber(),
				userId: testUser.id,
				email: testUser.email,
				subtotal: faker.number.int({ min: 1000, max: 100000 }),
				total: faker.number.int({ min: 1000, max: 100000 }),
				shippingName: testUser.name || testUser.username,
				shippingStreet: faker.location.streetAddress(),
				shippingCity: faker.location.city(),
				shippingPostal: faker.location.zipCode(),
				shippingCountry: faker.location.countryCode(),
				status: 'PENDING',
				stripeCheckoutSessionId: `cs_test_${faker.string.alphanumeric(24)}`,
				items: {
					create: {
						productId: product.id,
						quantity: faker.number.int({ min: 1, max: 5 }),
						price: product.price,
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

test.describe('Admin User Edit', () => {
	test.beforeEach(async () => {
		// Ensure admin role exists
		await prisma.role.upsert({
			where: { name: 'admin' },
			update: {},
			create: { name: 'admin', description: 'Administrator' },
		})
	})

	test.afterEach(async () => {
		// Clean up test users - faker-generated usernames start with 2 alphanumeric chars + underscore
		const allUsers = await prisma.user.findMany({
			where: {
				username: {
					contains: '_',
				},
			},
			select: { id: true, username: true },
		})
		
		const testUserIds = allUsers
			.filter(u => /^[a-z0-9]{2}_/.test(u.username))
			.map(u => u.id)
		
		if (testUserIds.length > 0) {
			await prisma.user.deleteMany({
				where: { id: { in: testUserIds } },
			})
		}
		
		// Clean up test roles (except built-in ones)
		await prisma.role.deleteMany({
			where: {
				name: { notIn: ['admin', 'user'] },
			},
		})
		// Clean up test orders, products, categories
		await prisma.order.deleteMany({
			where: {
				orderNumber: { startsWith: 'ORD-' },
			},
		})
		await prisma.cartItem.deleteMany({
			where: {
				product: {
					category: {
						name: { notIn: ['Uncategorized'] },
					},
				},
			},
		})
		await prisma.product.deleteMany({
			where: {
				category: {
					name: { notIn: ['Uncategorized'] },
				},
			},
		})
		await prisma.category.deleteMany({
			where: {
				name: { notIn: ['Uncategorized'] },
			},
		})
	})

	test('should redirect to login if not authenticated', async ({ page }) => {
		const { user: testUser } = await createTestUser()

		await page.goto(`/admin/users/${testUser.id}/edit`)
		await page.waitForURL(/\/login/)
		await expect(page).toHaveURL(/\/login/)
	})

	test('should redirect non-admin users', async ({ page, login, navigate }) => {
		await login()
		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)
		await page.waitForLoadState('networkidle')

		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({
			timeout: 5000,
		})
	})

	test('should load edit page with user data pre-filled', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/edit`))
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible()

		// Check that form fields are pre-filled
		const nameInput = page.getByLabel(/^name$/i)
		const emailInput = page.getByLabel(/^email/i)
		const usernameInput = page.getByLabel(/^username/i)

		if (testUser.name) {
			await expect(nameInput).toHaveValue(testUser.name)
		}
		await expect(emailInput).toHaveValue(testUser.email)
		await expect(usernameInput).toHaveValue(testUser.username)
	})

	test('should update user name', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const originalName = faker.person.fullName()
		const { user: testUser } = await createTestUser({ name: originalName })

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Update name
		const updatedName = faker.person.fullName()
		await page.getByLabel(/^name$/i).fill(updatedName)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page.getByRole('heading', { name: new RegExp(updatedName, 'i') })).toBeVisible({ timeout: 10000 })
	})

	test('should update user email', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Update email
		const newEmail = faker.internet.email()
		await page.getByLabel(/^email/i).fill(newEmail)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(newEmail).first()).toBeVisible({ timeout: 10000 })
	})

	test('should update user username', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Update username - createTestUser ensures it's within 20 char limit
		const { username: newUsername } = await createUser()
		await page.getByLabel(/^username/i).fill(newUsername)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(newUsername)).toBeVisible({ timeout: 10000 })
	})

	test('should add role to user', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create a test role
		const testRole = await createTestRole()

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Check the role checkbox
		await page.getByLabel(testRole.name).check()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`))
		await expect(page.getByText(testRole.name)).toBeVisible()
	})

	test('should remove role from user', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create a test role
		const testRole = await createTestRole()

		const { user: testUser } = await createTestUserWithRoles([testRole.name])

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Uncheck the role checkbox
		await page.getByLabel(testRole.name).uncheck()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		// Role should not be visible
		const roleVisible = await page.getByText(testRole.name).isVisible().catch(() => false)
		expect(roleVisible).toBe(false)
	})

	test('should update multiple roles', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		// Create test roles
		const role1 = await createTestRole()
		const role2 = await createTestRole()

		const { user: testUser } = await createTestUserWithRoles([role1.name])

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Check role2 and keep role1 checked
		await page.getByLabel(role2.name).check()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(role1.name)).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(role2.name)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for duplicate email', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: existingUser } = await createTestUser()
		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Try to use existing user's email
		await page.getByLabel(/^email/i).fill(existingUser.email)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/email.*already exists|user.*already exists.*email/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for duplicate username', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: existingUser } = await createTestUser()
		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Try to use existing user's username
		await page.getByLabel(/^username/i).fill(existingUser.username)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		// Check for the exact error message from the schema
		await expect(page.getByText(/A user already exists with this username/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid email format', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Enter invalid email
		await page.getByLabel(/^email/i).fill('invalid-email')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/email.*invalid|invalid.*email/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid username format', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Enter invalid username (with special characters)
		await page.getByLabel(/^username/i).fill('invalid@username')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/username.*can only include|invalid.*username/i)).toBeVisible({ timeout: 10000 })
	})

	test('should redirect to user detail page after successful update', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Update name
		const updatedName = faker.person.fullName()
		await page.getByLabel(/^name$/i).fill(updatedName)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}`))
		await expect(page.getByRole('heading', { name: new RegExp(updatedName, 'i') })).toBeVisible({ timeout: 10000 })
	})

	test('should show toast notification on success', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		const { user: testUser } = await createTestUser()

		await navigate(`/admin/users/${testUser.id}/edit` as any)

		// Update name
		const updatedName = faker.person.fullName()
		await page.getByLabel(/^name$/i).fill(updatedName)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page first
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 10000 })
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Verify the data was actually updated
		await expect(page.getByRole('heading', { name: new RegExp(updatedName, 'i') })).toBeVisible({ timeout: 10000 })
		
		// Then check for toast notification (secondary check)
		await page.waitForTimeout(500)
		await expect(page.getByText(/updated successfully/i)).toBeVisible({ timeout: 10000 })
	})

	test('should return 404 for non-existent user', async ({ page, navigate }) => {
		const { user, password } = await createAdminUser()
		await loginAsAdmin(page, user.username, password)

		await navigate('/admin/users/non-existent-user-id/edit' as any)

		// Should show 404 error
		await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 5000 })
	})
})

