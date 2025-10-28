import { prisma } from './db.server.ts'

/**
 * Get the store currency settings
 * @returns The currency object with symbol and decimals
 */
export async function getStoreCurrency() {
	const settings = await prisma.settings.findUnique({
		where: { id: 'settings' },
		include: {
			currency: {
				select: { symbol: true, decimals: true },
			},
		},
	})

	return settings?.currency
}

