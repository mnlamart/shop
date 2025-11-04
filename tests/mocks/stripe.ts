import { http, passthrough } from 'msw'

// MSW handlers to passthrough all Stripe requests
// These handlers MUST be matched first, so they should be placed at the beginning of the handlers array
export const handlers = [
	// Use regex pattern to match all Stripe API requests
	http.all(/^https:\/\/api\.stripe\.com\/.*/, () => {
		console.log('[MSW Stripe] Passthrough handler matched for Stripe API request')
		return passthrough()
	}),
	// Use regex pattern to match all Stripe Checkout requests
	http.all(/^https:\/\/checkout\.stripe\.com\/.*/, () => {
		console.log('[MSW Stripe] Passthrough handler matched for Stripe Checkout request')
		return passthrough()
	}),
]

