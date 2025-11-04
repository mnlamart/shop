import { http, passthrough } from 'msw'

/**
 * Stripe passthrough handlers for MSW
 * 
 * MSW patches Node.js http/https modules globally, which can interfere with Stripe SDK
 * requests even when not explicitly intercepting Stripe calls. These passthrough handlers
 * explicitly tell MSW to allow Stripe requests to pass through to the real API.
 * 
 * Without these handlers, MSW may intercept Stripe requests but not know how to handle them,
 * causing timeouts or protocol errors (ERR_INVALID_PROTOCOL).
 * 
 * Note: Unit tests use vi.mock to mock Stripe directly (see checkout.test.ts),
 * so these handlers are primarily for dev mode when MOCKS=true.
 * 
 * Using specific method patterns since http.all() may not work reliably in MSW v2.
 */
export const handlers = [
	// POST requests to Stripe API (checkout sessions, refunds, etc.)
	http.post('https://api.stripe.com/*', () => {
		console.log('[MSW] Stripe POST request intercepted - passing through')
		return passthrough()
	}),
	
	// GET requests to Stripe API (retrieving sessions, etc.)
	http.get('https://api.stripe.com/*', () => {
		console.log('[MSW] Stripe GET request intercepted - passing through')
		return passthrough()
	}),
	
	// PUT requests to Stripe API
	http.put('https://api.stripe.com/*', () => {
		console.log('[MSW] Stripe PUT request intercepted - passing through')
		return passthrough()
	}),
	
	// DELETE requests to Stripe API
	http.delete('https://api.stripe.com/*', () => {
		console.log('[MSW] Stripe DELETE request intercepted - passing through')
		return passthrough()
	}),
]

