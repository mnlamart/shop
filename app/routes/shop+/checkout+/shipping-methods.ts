import { data } from 'react-router'
import { getShippingMethodsForCountry } from '#app/utils/shipping.server.ts'
import { type Route } from './+types/shipping-methods.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const country = url.searchParams.get('country')

	if (!country || country.length !== 2) {
		return data({ shippingMethods: [] }, { status: 400 })
	}

	const shippingMethods = await getShippingMethodsForCountry(country.toUpperCase())

	return data({ shippingMethods })
}

