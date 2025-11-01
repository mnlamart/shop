import { http, passthrough } from 'msw'

export const handlers = [
	// STRIPE HANDLERS - Use passthrough to bypass MSW interference
	// MSW's HTTP module patching interferes with Stripe SDK requests
	// Using passthrough() tells MSW to let requests go to the real Stripe API
	// This is needed because MSW patches Node.js HTTP modules globally,
	// which can interfere with the Stripe SDK even when not intercepting
	
	http.post('https://api.stripe.com/v1/checkout/sessions', ({ request }) => {
		console.log('[MSW] ===== STRIPE REQUEST PASSTHROUGH =====')
		console.log('[MSW] Stripe checkout request detected')
		console.log('[MSW] Using passthrough() - request will bypass MSW and go to real Stripe API')
		console.log('[MSW] Request URL:', request.url)
		return passthrough()
	}),
	
	http.get('https://api.stripe.com/v1/checkout/sessions/:id', () => {
		console.log('[MSW] Stripe session retrieval - passthrough')
		return passthrough()
	}),
	
	http.post('https://api.stripe.com/v1/refunds', () => {
		console.log('[MSW] Stripe refund - passthrough')
		return passthrough()
	}),

	// Note: Unit tests use vi.mock to mock the Stripe client directly,
	// so they don't rely on MSW handlers. These passthrough handlers
	// are only for dev mode to ensure real Stripe API calls work correctly.
]
