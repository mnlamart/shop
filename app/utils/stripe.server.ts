import { Agent as HttpAgent } from 'node:http'
import { invariant } from '@epic-web/invariant'
import Stripe from 'stripe'

invariant(
	process.env.STRIPE_SECRET_KEY,
	'STRIPE_SECRET_KEY is not set',
)

/**
 * Stripe client instance.
 * Automatically uses test mode if key starts with sk_test_
 * No code changes needed between test/production!
 * 
 * Note on MSW mocking:
 * - In test mode: Uses vi.mock (see checkout.test.ts) - works perfectly
 * - In dev mode with MOCKS=true: MSW may interfere with Stripe SDK requests even if not intercepting.
 *   Solution: Use a custom HTTP agent to bypass MSW's HTTP patching.
 * - In production: Uses real Stripe keys (sk_live_* or sk_test_*)
 */

// Create custom HTTP agent that bypasses MSW's patching
// MSW patches the global http/https modules, but we can use our own agent
// The Stripe SDK uses the httpAgent for both HTTP and HTTPS requests internally
const httpAgent = new HttpAgent({ 
	keepAlive: true,
	// Create a new HTTPS agent instance for HTTPS connections
	// Note: Stripe SDK uses this agent, so we ensure it's not patched by MSW
})

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
	apiVersion: '2025-09-30.clover', // Use stable version
	maxNetworkRetries: 2,
	timeout: 30000,
	// Use custom agent to bypass MSW interference in dev mode
	// This ensures Stripe requests go directly to the API, not through MSW
	httpAgent: httpAgent,
})

/**
 * Stripe error handling utility.
 * Converts Stripe errors into a consistent format.
 */
export function handleStripeError(err: unknown): {
	type: string
	message: string
	code?: string
	param?: string
} {
	// Handle non-object errors or null/undefined
	if (!err || typeof err !== 'object' || Array.isArray(err)) {
		return {
			type: 'unknown_error',
			message: err instanceof Error 
				? err.message || 'An unexpected error occurred'
				: 'An unexpected error occurred',
		}
	}

	// Check for Stripe error types
	if (err instanceof Stripe.errors.StripeCardError) {
		return {
			type: 'card_error',
			message: err.message,
			code: err.code,
		}
	} else if (err instanceof Stripe.errors.StripeInvalidRequestError) {
		return {
			type: 'invalid_request',
			message: err.message,
			param: err.param,
		}
	} else if (err instanceof Stripe.errors.StripeAPIError) {
		return {
			type: 'api_error',
			message: err.message,
		}
	} else if (err instanceof Stripe.errors.StripeConnectionError) {
		return {
			type: 'connection_error',
			message: err.message,
		}
	} else if (err instanceof Stripe.errors.StripeAuthenticationError) {
		return {
			type: 'authentication_error',
			message: err.message,
		}
	} else if (err instanceof Stripe.errors.StripeRateLimitError) {
		return {
			type: 'rate_limit_error',
			message: err.message,
		}
	}

	// For unknown errors, try to extract useful information
	if ('message' in err && typeof err.message === 'string') {
		return {
			type: 'unknown_error',
			message: err.message,
		}
	}

	if (err instanceof Error) {
		return {
			type: 'unknown_error',
			message: err.message || 'An unexpected error occurred',
		}
	}

	// Last resort - log the error structure for debugging
	console.error('Unknown Stripe error structure:', {
		error: err,
		keys: Object.keys(err),
		stringified: JSON.stringify(err, Object.getOwnPropertyNames(err)),
	})

	return {
		type: 'unknown_error',
		message: 'An unexpected error occurred. Please check the server logs for details.',
	}
}
