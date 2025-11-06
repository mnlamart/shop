import { faker } from '@faker-js/faker'
import { getPasswordHash } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser } from '#tests/db-utils.ts'

export type UserData = ReturnType<typeof createUser>

/**
 * Creates an admin user in the database
 */
export async function createAdminUser() {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: userData.username,
			email: userData.email,
			name: userData.name,
			roles: { connect: { name: 'admin' } },
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

/**
 * Creates a test user in the database
 */
export async function createTestUser(overrides?: Partial<UserData>) {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: overrides?.username ?? userData.username,
			email: overrides?.email ?? userData.email,
			name: overrides?.name ?? userData.name,
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

/**
 * Creates a test user with specific roles
 */
export async function createTestUserWithRoles(roleNames: string[], overrides?: Partial<UserData>) {
	const userData = createUser()
	const password = faker.internet.password({ length: 12 })
	const hashedPassword = await getPasswordHash(password)

	const user = await prisma.user.create({
		data: {
			username: overrides?.username ?? userData.username,
			email: overrides?.email ?? userData.email,
			name: overrides?.name ?? userData.name,
			roles: {
				connect: roleNames.map((name) => ({ name })),
			},
			password: {
				create: {
					hash: hashedPassword,
				},
			},
		},
		select: { id: true, email: true, username: true, name: true },
	})

	return { user, password }
}

/**
 * Creates a test role in the database
 */
export async function createTestRole(overrides?: { name?: string; description?: string }) {
	const name = overrides?.name ?? `role_${faker.string.alphanumeric({ length: 8 }).toLowerCase()}`
	const description = overrides?.description ?? faker.lorem.sentence()

	return await prisma.role.create({
		data: {
			name,
			description,
		},
	})
}

/**
 * Login helper for admin users
 */
export async function loginAsAdmin(page: any, username: string, password: string) {
	await page.goto('/login')
	await page.getByRole('textbox', { name: /username/i }).fill(username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()
	// Wait for redirect after login
	await page.waitForURL(/\/(?:|\?redirectTo=)|\/settings\/profile/)
	// Verify user is logged in by checking for user menu using role locator
	await page.getByRole('button', { name: /user menu|account menu/i }).waitFor({ timeout: 5000 }).catch(() => {
		// Fallback: wait for logout link or user menu aria-label
		return page.getByRole('link', { name: /logout|sign out/i }).waitFor({ timeout: 5000 }).catch(() => {
			// Last resort: wait for any logout link
			return page.waitForFunction(() => {
				return document.querySelector('a[href*="/logout"]') !== null ||
					document.querySelector('[aria-label*="User menu"]') !== null
			}, { timeout: 5000 })
		})
	})
}

