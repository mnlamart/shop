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

/**
 * Check if database migration history matches current migration files
 * Returns true if they match, false if reset is needed
 */
async function checkMigrationHistoryMatches(): Promise<boolean> {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)
	if (!databaseExists) {
		return false // Database doesn't exist, need to create it
	}

	try {
		// Use Prisma migrate status to check if migrations match
		const { stdout } = await execaCommand(
			'npx prisma migrate status',
			{
				env: {
					...process.env,
					DATABASE_URL: `file:${BASE_DATABASE_PATH}`,
				},
				reject: false, // Don't throw on error
			},
		)

		// If status shows migrations are in sync, return true
		// If it shows mismatches or errors, return false
		if (stdout.includes('Database schema is up to date') || stdout.includes('All migrations have been applied')) {
			return true
		}

		// Check for migration mismatches
		if (stdout.includes('different') || stdout.includes('not yet been applied') || stdout.includes('not found locally')) {
			return false
		}

		// If we can't determine, err on the side of resetting
		return false
	} catch {
		// If command fails, assume we need to reset
		return false
	}
}

export async function setup() {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)

	if (databaseExists) {
		const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
			.mtime
		const prismaSchemaLastModifiedAt = (
			await fsExtra.stat('./prisma/schema.prisma')
		).mtime

		// Check if schema was modified
		if (prismaSchemaLastModifiedAt < databaseLastModifiedAt) {
			// Schema hasn't changed, but check if migrations match
			const migrationsMatch = await checkMigrationHistoryMatches()
			if (migrationsMatch) {
				return // Everything is in sync
			}
			// Migrations don't match (renamed/removed/added), need to reset
		}
	}

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
