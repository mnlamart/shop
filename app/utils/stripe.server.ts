import { invariant, invariantResponse } from '@epic-web/invariant'
import Stripe from 'stripe'

/**
 * Initialize Stripe client with API key from environment variables.
 * Throws an error if STRIPE_SECRET_KEY is not set.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2025-10-29.clover',
	maxNetworkRetries: 0, // Disable retries to fail fast
	timeout: 10000, // 10 seconds global timeout
	telemetry: false, // Disable telemetry for faster requests
	// Use fetch-based HTTP client to bypass MSW interception
	// MSW only intercepts Node's http/https modules, not fetch
	// See: https://github.com/mswjs/msw/issues/2259#issuecomment-2422672039
	httpClient: Stripe.createFetchHttpClient(),
})

// Add event listeners to debug SDK requests
stripe.on('request', (request) => {
	console.log('[STRIPE SDK] Request:', {
		method: request.method,
		path: request.path,
		timestamp: request.request_start_time,
	})
})

stripe.on('response', (response) => {
	console.log('[STRIPE SDK] Response:', {
		method: response.method,
		path: response.path,
		status: response.status,
		request_id: response.request_id,
		elapsed: response.elapsed + 'ms',
	})
})

invariant(
	process.env.STRIPE_SECRET_KEY,
	'STRIPE_SECRET_KEY must be set in environment variables',
)

// Log Stripe initialization for debugging
console.log('[STRIPE] Initializing Stripe client:', {
	hasApiKey: !!process.env.STRIPE_SECRET_KEY,
	apiKeyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7),
	apiKeyLength: process.env.STRIPE_SECRET_KEY?.length,
	apiVersion: '2025-10-29.clover',
})

/**
 * Handles Stripe errors and returns a user-friendly error message.
 * @param err - The error to handle
 * @returns An object with error type and message
 */
export function handleStripeError(err: unknown): {
	type: string
	message: string
	code?: string
	param?: string
} {
	if (err instanceof Stripe.errors.StripeCardError) {
		return {
			type: 'card_error',
			message: err.message,
			code: err.code,
		}
	}
	if (err instanceof Stripe.errors.StripeInvalidRequestError) {
		return {
			type: 'invalid_request',
			message: err.message,
			param: err.param,
		}
	}
	if (err instanceof Stripe.errors.StripeAPIError) {
		return {
			type: 'api_error',
			message: err.message,
		}
	}
	if (err instanceof Stripe.errors.StripeConnectionError) {
		return {
			type: 'connection_error',
			message: err.message,
		}
	}
	if (err instanceof Stripe.errors.StripeAuthenticationError) {
		return {
			type: 'authentication_error',
			message: err.message,
		}
	}
	if (err instanceof Stripe.errors.StripeRateLimitError) {
		return {
			type: 'rate_limit_error',
			message: err.message,
		}
	}
	return {
		type: 'unknown_error',
		message: err instanceof Error ? err.message : 'An unexpected error occurred',
	}
}

/**
 * Cart item with product and variant details for creating checkout session
 */
type CartItemWithDetails = {
	id: string
	productId: string
	variantId: string | null
	quantity: number
	product: {
		id: string
		name: string
		description: string | null
		price: number
	}
	variant: {
		id: string
		price: number | null
		sku: string
	} | null
}

/**
 * Creates a Stripe Checkout Session for the given cart.
 * @param params - Parameters for checkout session creation
 * @returns Stripe Checkout Session with URL
 */
export async function createCheckoutSession({
	cart,
	shippingInfo,
	currency,
	domainUrl,
	userId,
}: {
	cart: {
		id: string
		items: CartItemWithDetails[]
	}
	shippingInfo: {
		name: string
		email: string
		street: string
		city: string
		state?: string
		postal: string
		country: string
	}
	currency: {
		code: string
	}
	domainUrl: string
	userId?: string | null
}): Promise<Stripe.Checkout.Session> {
	console.log('[STRIPE] Creating checkout session:', {
		cartId: cart.id,
		itemCount: cart.items.length,
		currency: currency.code,
		domainUrl,
		userId: userId || 'guest',
		email: shippingInfo.email,
	})

	// Build line items from cart
	console.log('[STRIPE] Building line items from cart')
	const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cart.items.map(
		(item) => {
			const unitAmount = item.variant?.price ?? item.product.price
			invariant(unitAmount !== null, `Price missing for product ${item.product.id}`)

			const lineItem = {
				price_data: {
					currency: currency.code.toLowerCase(),
					product_data: {
						name: item.product.name,
						description: item.product.description || undefined,
					},
					unit_amount: unitAmount,
				},
				quantity: item.quantity,
			}
			console.log('[STRIPE] Line item:', {
				productName: item.product.name,
				unitAmount,
				quantity: item.quantity,
			})
			return lineItem
		},
	)

	console.log('[STRIPE] Line items created:', lineItems.length)

	// Create checkout session
	console.log('[STRIPE] Calling Stripe API to create checkout session')
	const sessionParams: Stripe.Checkout.SessionCreateParams = {
		line_items: lineItems,
		mode: 'payment',
		success_url: `${domainUrl}/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${domainUrl}/shop/checkout?canceled=true`,
		customer_email: shippingInfo.email,
		metadata: {
			cartId: cart.id,
			userId: userId || '',
			shippingName: shippingInfo.name,
			shippingStreet: shippingInfo.street,
			shippingCity: shippingInfo.city,
			shippingState: shippingInfo.state || '',
			shippingPostal: shippingInfo.postal,
			shippingCountry: shippingInfo.country,
		},
		payment_intent_data: {
			metadata: {
				cartId: cart.id,
			},
		},
	}
	console.log('[STRIPE] Session params:', {
		...sessionParams,
		line_items: sessionParams.line_items?.map((li) => ({
			quantity: li.quantity,
			price_data: li.price_data ? { currency: li.price_data.currency, unit_amount: li.price_data.unit_amount } : undefined,
		})) || [],
	})

	try {
		console.log('[STRIPE] About to create checkout session')
		console.log('[STRIPE] API Key present:', !!process.env.STRIPE_SECRET_KEY)
		console.log('[STRIPE] API Key prefix:', process.env.STRIPE_SECRET_KEY?.substring(0, 7))
		console.log('[STRIPE] Session params line_items count:', sessionParams.line_items?.length || 0)
		console.log('[STRIPE] Starting Stripe SDK call...')
		
		// Test DNS resolution first
		const dns = await import('dns').then(m => m.promises)
		try {
			const addresses = await dns.resolve4('api.stripe.com')
			console.log('[STRIPE] DNS resolution for api.stripe.com:', addresses)
		} catch (dnsError) {
			console.error('[STRIPE] DNS resolution failed:', dnsError)
		}
		
		// Test HTTPS connection directly before making SDK call
		try {
			const testUrl = 'https://api.stripe.com/v1/charges'
			console.log('[STRIPE] Testing direct HTTPS connection to:', testUrl)
			const httpsTest = await fetch(testUrl, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
				},
				signal: AbortSignal.timeout(5000), // 5 second timeout
			})
			console.log('[STRIPE] Direct HTTPS test status:', httpsTest.status)
		} catch (fetchError) {
			console.error('[STRIPE] Direct HTTPS test failed:', fetchError)
		}
		
		// Use Stripe SDK with explicit timeout options
		const sessionPromise = stripe.checkout.sessions.create(sessionParams, {
			timeout: 8000, // 8 seconds timeout per request (shorter than global)
			maxNetworkRetries: 0, // Disable retries to fail fast
		})
		
		// Add additional timeout wrapper as a safety net
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error('Stripe SDK call timed out after 10 seconds - no response received'))
			}, 10000)
		})
		
		const session = await Promise.race([sessionPromise, timeoutPromise])
		
		console.log('[STRIPE] Stripe SDK call completed')
		
		console.log('[STRIPE] Session created successfully:', {
			id: session.id,
			url: session.url,
			status: session.status,
			payment_status: session.payment_status,
		})

		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})

		return session
	} catch (error) {
		console.error('[STRIPE] Error creating checkout session:', {
			error,
			message: error instanceof Error ? error.message : 'Unknown error',
			stack: error instanceof Error ? error.stack : undefined,
			errorType: error instanceof Error ? error.constructor.name : typeof error,
		})
		// Log specific Stripe error details if available
		if (error && typeof error === 'object' && 'type' in error) {
			console.error('[STRIPE] Stripe error details:', {
				type: (error as any).type,
				code: (error as any).code,
				param: (error as any).param,
				message: (error as any).message,
			})
		}
		throw error
	}
}

