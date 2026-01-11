import 'dotenv/config'
import '#app/utils/env.server.ts'

/**
 * Global setup for Playwright tests
 * Ensures currency and settings exist in the database
 * This is critical because getStoreCurrency() is called in many routes
 */
async function globalSetup() {
	// Import prisma after environment is set up
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

export default globalSetup
