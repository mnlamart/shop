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
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
	apiVersion: '2025-09-30.clover', // Use stable version
	maxNetworkRetries: 2,
	timeout: 30000,
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
			message: 'An unexpected error occurred',
		}
	}

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
	return {
		type: 'unknown_error',
		message: 'An unexpected error occurred',
	}
}

