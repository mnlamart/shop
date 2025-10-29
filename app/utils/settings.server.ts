import { cachified, cache } from './cache.server.ts'
import { prisma } from './db.server.ts'
import { type Timings } from './timing.server.ts'

/**
 * Get the store currency settings
 * Currency rarely (if ever) changes, so we cache it for 24 hours
 * @param options - Optional timings for server timing metrics
 * @returns The currency object with symbol and decimals
 */
export async function getStoreCurrency({ timings }: { timings?: Timings } = {}) {
	return cachified({
		key: 'settings:currency',
		cache,
		timings,
		getFreshValue: async () => {
			const settings = await prisma.settings.findUnique({
				where: { id: 'settings' },
				include: {
					currency: {
						select: { symbol: true, decimals: true },
					},
				},
			})

			return settings?.currency ?? undefined
		},
		ttl: 1000 * 60 * 60 * 24, // 24 hours
		staleWhileRevalidate: 1000 * 60 * 60 * 24 * 7, // 7 days
	})
}

