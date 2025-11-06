import { redirectDocument } from 'react-router'
import { type Route } from './+types/_index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	
	// Redirect to success page if session_id is present
	const sessionId = url.searchParams.get('session_id')
	if (sessionId) {
		return redirectDocument(`/shop/checkout/success?session_id=${sessionId}`)
	}
	
	// Redirect to review step (first step of multi-step checkout)
	return redirectDocument('/shop/checkout/review')
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout' },
]

