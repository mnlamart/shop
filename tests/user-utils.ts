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
