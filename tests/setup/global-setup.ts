import path from 'node:path'
import { execaCommand } from 'execa'
import fsExtra from 'fs-extra'
import 'dotenv/config'
import '#app/utils/env.server.ts'
import '#app/utils/cache.server.ts'

export const BASE_DATABASE_PATH = path.join(
	process.cwd(),
	`./tests/prisma/base.db`,
)

export async function setup() {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)
	let needsReset = false

	if (databaseExists) {
		const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
			.mtime
		const prismaSchemaLastModifiedAt = (
			await fsExtra.stat('./prisma/schema.prisma')
		).mtime

		if (prismaSchemaLastModifiedAt >= databaseLastModifiedAt) {
			needsReset = true
		}
	} else {
		needsReset = true
	}

	if (needsReset) {
		await execaCommand(
			'npx prisma migrate reset --force --skip-seed --skip-generate',
			{
				stdio: 'inherit',
				env: {
					...process.env,
					DATABASE_URL: `file:${BASE_DATABASE_PATH}`,
				},
			},
		)
	}

	// ALWAYS ensure currency and settings exist for tests (required by getStoreCurrency)
	// This is critical because:
	// 1. In CI, the base database might exist from a previous run and skip reset
	// 2. The database might have been manually deleted or corrupted
	// 3. We need currency to exist for all tests that use getStoreCurrency
	// We need to import prisma after DATABASE_URL is set
	const { prisma } = await import('#app/utils/db.server.ts')
	
	// Create USD currency if it doesn't exist
	const usdCurrency = await prisma.currency.upsert({
		where: { code: 'USD' },
		create: {
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			decimals: 2,
		},
		update: {},
	})

	// Create Settings with USD as default currency
	await prisma.settings.upsert({
		where: { id: 'settings' },
		create: {
			id: 'settings',
			currencyId: usdCurrency.id,
		},
		update: {},
	})
}
