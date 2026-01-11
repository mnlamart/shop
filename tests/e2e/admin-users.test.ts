import { randomUUID } from 'node:crypto'
import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'
import { createUser, expect, test } from '#tests/playwright-utils.ts'
import { createProductData } from '#tests/product-utils.ts'
import {
	createTestUser,
	createTestUserWithRoles,
	createTestRole,
} from '#tests/user-utils.ts'

// Run admin user tests serially to avoid data cleanup collisions across tests
test.describe.configure({ mode: 'serial' })

const ADMIN_USERS_PREFIX = 'admin-users-e2e'

function getTestPrefix(testId: string) {
	return `${ADMIN_USERS_PREFIX}-${testId.replace(/\W+/g, '-')}-${randomUUID()}`
}

async function createPrefixedUser(testId: string, overrides?: Parameters<typeof createTestUser>[0]) {
	const prefix = getTestPrefix(testId)
	return createTestUser({
		username: `${prefix}-user`,
		email: `${prefix}@example.com`,
		name: overrides?.name ?? overrides?.username ?? overrides?.email ?? `${prefix}-name`,
		...overrides,
	})
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
		await prisma.$transaction([
			prisma.order.deleteMany({
				where: {
					stripeCheckoutSessionId: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: { startsWith: ADMIN_USERS_PREFIX },
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.category.deleteMany({
				where: {
					slug: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.user.deleteMany({
				where: {
					OR: [
						{ email: { startsWith: ADMIN_USERS_PREFIX } },
						{ username: { startsWith: ADMIN_USERS_PREFIX } },
					],
				},
			}),
			prisma.role.deleteMany({
				where: {
					name: { notIn: ['admin', 'user'] },
				},
			}),
		])
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

	test('should display admin users list page', async ({ page, navigate, login }) => {
		// Use login fixture to create session directly (bypasses login form)
		await login({ asAdmin: true })

		await navigate('/admin/users')

		await expect(page).toHaveURL(/\/admin\/users/)
		await expect(page.getByRole('heading', { name: /users/i })).toBeVisible()
	})

	test('should display all users in the list', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Create test users with faker
		const { user: testUser1 } = await createPrefixedUser(test.info().testId, {
			name: faker.person.fullName(),
		})
		const { user: testUser2 } = await createPrefixedUser(test.info().testId, {
			name: faker.person.fullName(),
		})

		await navigate('/admin/users')
		await page.waitForLoadState('networkidle')
		// Wait for the table to be visible
		await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 })

		// Check that users are displayed by searching for each one
		const searchInput = page.getByPlaceholder(/search users/i)

		await searchInput.fill(testUser1.email)
		await searchInput.blur()
		await page.waitForLoadState('networkidle')
		await expect(
			page.getByText(new RegExp(`^${testUser1.email}$`, 'i')),
		).toBeVisible({ timeout: 10000 })

		await searchInput.fill(testUser2.email)
		await searchInput.blur()
		await page.waitForLoadState('networkidle')
		await expect(
			page.getByText(new RegExp(`^${testUser2.email}$`, 'i')),
		).toBeVisible({ timeout: 10000 })
	})

	test('should display user email and username', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate('/admin/users')

		// Check that email and username are displayed
		await expect(page.getByText(testUser.email)).toBeVisible()
		// Use more specific selector - username appears in its own cell
		const usernameCell = page.getByRole('cell', { name: new RegExp(`^${testUser.username}$`) })
		await expect(usernameCell).toBeVisible()
	})

	test('should display user roles', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Create a role with faker
		const testRole = await createTestRole()

		// Create user with role
		await createTestUserWithRoles([testRole.name])

		await navigate('/admin/users')

		// Check that role is displayed
		await expect(page.getByText(testRole.name)).toBeVisible()
	})


	test('should search users by name', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Use unique names to avoid conflicts
		const aliceName = `Alice ${faker.string.alphanumeric(8)}`
		const bobName = `Bob ${faker.string.alphanumeric(8)}`

		await createPrefixedUser(test.info().testId, { name: aliceName })
		await createPrefixedUser(test.info().testId, { name: bobName })

		await navigate('/admin/users')
		await page.waitForLoadState('networkidle')

		// Verify both users are visible initially
		await expect(page.getByText(aliceName)).toBeVisible()
		await expect(page.getByText(bobName)).toBeVisible()

		// Search for Alice by first name only
		const searchInput = page.getByPlaceholder(/search users/i)
		await searchInput.fill('Alice')
		await searchInput.blur() // Trigger change event

		// Wait for React to update the filtered list
		await page.waitForTimeout(300)

		// Check that Alice is visible
		await expect(page.getByText(aliceName)).toBeVisible({ timeout: 5000 })
		
		// Bob should not be visible - wait for him to disappear
		await expect(page.getByText(bobName)).not.toBeVisible({ timeout: 5000 })
	})

	test('should search users by email', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

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

	test('should display user detail page with profile information', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that user details are displayed - use accessible queries
		// The user details are in a card with "Profile Details" heading
		// Email appears in both header and profile details, so use first() to avoid strict mode violation
		// Use test IDs for specific elements to avoid ambiguity
		await expect(page.getByTestId('user-detail-email')).toHaveText(testUser.email, { timeout: 10000 })
		await expect(page.getByTestId('user-detail-username')).toHaveText(testUser.username, { timeout: 10000 })
		if (testUser.name) {
			await expect(page.getByTestId('user-detail-name')).toHaveText(testUser.name, { timeout: 10000 })
		}
	})

	test('should display user statistics', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(('/admin/users/' + testUser.id) as any)

		// Wait for page to load and heading to appear
		await page.waitForLoadState('networkidle')
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 })
		
		// Check that statistics section is displayed using role-based locators
		await expect(page.getByText(/total orders/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/active sessions/i).first()).toBeVisible({ timeout: 10000 })
		await expect(page.getByText(/total sessions/i).first()).toBeVisible({ timeout: 10000 })
	})

	test('should display user orders in detail page', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const testPrefix = getTestPrefix(test.info().testId)

		// Create test category and product with faker
		const categoryName = `${testPrefix}-category`
		const category = await prisma.category.create({
			data: {
				name: categoryName,
				slug: `${testPrefix}-category`,
				description: faker.lorem.sentence(),
			},
		})

		const productData = createProductData()
		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: `${testPrefix}-product`,
				description: productData.description,
				sku: `${ADMIN_USERS_PREFIX}-sku-${randomUUID()}`,
				price: productData.price,
				status: 'ACTIVE',
				categoryId: category.id,
			},
		})

		const { user: testUser } = await createPrefixedUser(test.info().testId)

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
				stripeCheckoutSessionId: `${ADMIN_USERS_PREFIX}-${faker.string.alphanumeric(24)}`,
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

	test('should return 404 for non-existent user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

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
		await prisma.$transaction([
			prisma.order.deleteMany({
				where: {
					stripeCheckoutSessionId: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.cartItem.deleteMany({
				where: {
					product: {
						sku: { startsWith: ADMIN_USERS_PREFIX },
					},
				},
			}),
			prisma.product.deleteMany({
				where: {
					sku: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.cart.deleteMany({}),
			prisma.category.deleteMany({
				where: {
					slug: { startsWith: ADMIN_USERS_PREFIX },
				},
			}),
			prisma.user.deleteMany({
				where: {
					OR: [
						{ email: { startsWith: ADMIN_USERS_PREFIX } },
						{ username: { startsWith: ADMIN_USERS_PREFIX } },
					],
				},
			}),
			prisma.role.deleteMany({
				where: {
					name: { notIn: ['admin', 'user'] },
				},
			}),
		])
	})

	test('should redirect to login if not authenticated', async ({ page }) => {
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`)
		await page.waitForURL(/\/login/)
		await expect(page).toHaveURL(/\/login/)
	})

	test('should redirect non-admin users', async ({ page, login, navigate }) => {
		await login()
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await navigate(`/admin/users/${testUser.id}/edit` as any)
		await page.waitForLoadState('networkidle')

		await expect(page.getByRole('heading', { name: /unauthorized/i })).toBeVisible({
			timeout: 5000,
		})
	})

	test('should load edit page with user data pre-filled', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })

		await expect(page).toHaveURL(new RegExp(`/admin/users/${testUser.id}/edit`))
		await expect(page.getByRole('heading', { name: /edit user/i })).toBeVisible({ timeout: 10000 })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

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

	test('should update user name', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const originalName = faker.person.fullName()
		const { user: testUser } = await createPrefixedUser(test.info().testId, { name: originalName })

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })

		// Wait for form to be ready - check for form element first
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^name$/i)).toBeVisible({ timeout: 10000 })

		// Update name
		const updatedName = faker.person.fullName()
		await page.getByLabel(/^name$/i).fill(updatedName)
		
		// Submit form and wait for navigation
		await Promise.all([
			page.waitForURL(new RegExp(`/admin/users/${testUser.id}`), { timeout: 15000 }),
			page.getByRole('button', { name: /save changes/i }).click(),
		])
		
		// Wait for page to fully load
		await page.waitForLoadState('networkidle')
		
		// Wait for heading to be visible first
		const heading = page.getByRole('heading', { level: 1 })
		await expect(heading).toBeVisible({ timeout: 10000 })
		
		// Verify the update was successful by checking the database
		const updatedUser = await prisma.user.findUnique({
			where: { id: testUser.id },
			select: { name: true },
		})
		expect(updatedUser?.name).toBe(updatedName)
		
		// Verify the updated name appears on the page
		// The heading shows name || username, so if name exists, it should be in the heading
		if (updatedUser?.name) {
			await expect(heading).toContainText(updatedName, { timeout: 10000 })
		} else {
			// If name is null, check the detail section
			await expect(page.locator('[data-testid="user-detail-name"]')).toHaveText(updatedName, { timeout: 5000 })
		}
	})

	test('should update user email', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^email/i)).toBeVisible({ timeout: 10000 })

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

	test('should update user username', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^username/i)).toBeVisible({ timeout: 10000 })

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

	test('should add role to user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Create a test role
		const testRole = await createTestRole()

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

		// Check the role checkbox
		await page.getByLabel(testRole.name).check()
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should redirect to user detail page
		await page.waitForURL(new RegExp(`/admin/users/${testUser.id}`))
		await expect(page.getByText(testRole.name)).toBeVisible()
	})

	test('should remove role from user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

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
		// Role should not be visible - wait for it to disappear
		await expect(page.getByText(testRole.name)).not.toBeVisible({ timeout: 5000 })
	})

	test('should update multiple roles', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		// Create test roles
		const role1 = await createTestRole()
		const role2 = await createTestRole()

		const { user: testUser } = await createTestUserWithRoles([role1.name])

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

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

	test('should show validation error for duplicate email', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: existingUser } = await createPrefixedUser(test.info().testId)
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

		// Try to use existing user's email
		await page.getByLabel(/^email/i).fill(existingUser.email)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/email.*already exists|user.*already exists.*email/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for duplicate username', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: existingUser } = await createPrefixedUser(test.info().testId)
		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

		// Try to use existing user's username
		await page.getByLabel(/^username/i).fill(existingUser.username)
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		// Check for the exact error message from the schema
		await expect(page.getByText(/A user already exists with this username/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid email format', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^email/i)).toBeVisible({ timeout: 10000 })

		// Enter invalid email
		await page.getByLabel(/^email/i).fill('invalid-email')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/email.*invalid|invalid.*email/i)).toBeVisible({ timeout: 10000 })
	})

	test('should show validation error for invalid username format', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })

		// Enter invalid username (with special characters)
		await page.getByLabel(/^username/i).fill('invalid@username')
		await page.getByRole('button', { name: /save changes/i }).click()

		// Should stay on edit page and show validation error (no redirect)
		await page.waitForLoadState('networkidle')
		await expect(page.getByText(/username.*can only include|invalid.*username/i)).toBeVisible({ timeout: 10000 })
	})

	test('should redirect to user detail page after successful update', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^name$/i)).toBeVisible({ timeout: 10000 })

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

	test('should show toast notification on success', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		const { user: testUser } = await createPrefixedUser(test.info().testId)

		await page.goto(`/admin/users/${testUser.id}/edit`, { waitUntil: 'networkidle' })
		await expect(page.locator('form')).toBeVisible({ timeout: 10000 })
		await expect(page.getByLabel(/^name$/i)).toBeVisible({ timeout: 10000 })

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

	test('should return 404 for non-existent user', async ({ page, navigate, login }) => {
		await login({ asAdmin: true })

		await navigate('/admin/users/non-existent-user-id/edit' as any)

		// Should show 404 error
		await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 5000 })
	})
})

