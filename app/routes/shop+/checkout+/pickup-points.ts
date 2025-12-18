import * as Sentry from '@sentry/react-router'
import { data } from 'react-router'
import { z } from 'zod'
import { searchPickupPoints } from '#app/utils/carriers/mondial-relay-api1.server.ts'
import { type Route } from './+types/pickup-points.ts'

const PickupPointsSearchSchema = z.object({
	postalCode: z.string().min(1, { message: 'Postal code is required' }),
	country: z.string().length(2, { message: 'Country code must be 2 letters' }),
	city: z.string().optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const postalCode = url.searchParams.get('postalCode')
	const country = url.searchParams.get('country')
	const city = url.searchParams.get('city')

	// Validate parameters
	const validation = PickupPointsSearchSchema.safeParse({
		postalCode,
		country,
		city: city || undefined,
	})

	if (!validation.success) {
		return data(
			{
				error: 'Invalid parameters',
				details: validation.error.issues.map((issue) => ({
					path: issue.path,
					message: issue.message,
				})),
			},
			{ status: 400 },
		)
	}

	const { postalCode: validPostalCode, country: validCountry, city: validCity } = validation.data

	try {
		const pickupPoints = await searchPickupPoints({
			postalCode: validPostalCode,
			country: validCountry.toUpperCase(),
			city: validCity,
		})

		return data({
			pickupPoints,
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		Sentry.captureException(error, {
			tags: { context: 'pickup-points-search' },
			extra: {
				postalCode: validPostalCode,
				country: validCountry,
				city: validCity,
			},
		})
		return data(
			{
				error: 'Failed to search pickup points',
				message: errorMessage,
			},
			{ status: 500 },
		)
	}
}

