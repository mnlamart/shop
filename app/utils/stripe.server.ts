import { invariant } from '@epic-web/invariant'
import { invariantResponse } from '@epic-web/invariant'
import { z } from 'zod'
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
 * We use the Stripe SDK throughout for type safety, automatic retries, and proper error handling.
 * MSW passthrough handlers allow Stripe API calls to reach the real API in dev/test mode.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
	apiVersion: '2025-09-30.clover', // Use stable version
	maxNetworkRetries: 2,
	timeout: 30000,
})

/**
 * Create a Stripe Checkout Session using the Stripe SDK
 * 
 * Uses stripe.checkout.sessions.create() which provides:
 * - Type safety
 * - Automatic retries
 * - Proper error handling with Stripe error types
 */
export async function createCheckoutSession(params: {
	line_items: Array<{
		price_data: {
			currency: string
			unit_amount: number
			product_data: {
				name: string
				description?: string
			}
		}
		quantity: number
	}>
	mode: 'payment' | 'subscription'
	success_url: string
	cancel_url: string
	customer_email: string
	metadata: Record<string, string>
	payment_intent_data?: {
		metadata: Record<string, string>
	}
}): Promise<{ id: string; url: string }> {
	try {
		const session = await stripe.checkout.sessions.create({
			line_items: params.line_items,
			mode: params.mode,
			success_url: params.success_url,
			cancel_url: params.cancel_url,
			customer_email: params.customer_email,
			metadata: params.metadata,
			payment_intent_data: params.payment_intent_data,
		})

		invariantResponse(session.url, 'Stripe checkout session URL is missing')

		return {
			id: session.id,
			url: session.url,
		}
	} catch (error) {
		// SDK throws Stripe error types directly - let them propagate
		throw error
	}
}

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
