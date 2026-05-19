import { invariant, invariantResponse } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import Stripe from 'stripe'

// In test mode, use the default HTTP client so MSW can intercept requests.
// In dev/prod, use the fetch-based client to bypass MSW.
// See: https://github.com/mswjs/msw/issues/2259#issuecomment-2422672039
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2026-04-22.dahlia',
	maxNetworkRetries: 0,
	timeout: 10000,
	telemetry: false,
	...(process.env.NODE_ENV !== 'test' && {
		httpClient: Stripe.createFetchHttpClient(),
	}),
})

invariant(
	process.env.STRIPE_SECRET_KEY,
	'STRIPE_SECRET_KEY must be set in environment variables',
)

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

export async function createCheckoutSession({
	cart,
	shippingInfo,
	shippingMethodId,
	shippingCost,
	mondialRelayPickupPointId,
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
	shippingMethodId: string
	shippingCost: number // in cents
	mondialRelayPickupPointId?: string | null
	currency: {
		code: string
	}
	domainUrl: string
	userId?: string | null
}): Promise<Stripe.Checkout.Session> {
	// Build line items from cart
	const lineItems: Array<any> = cart.items.map(
		(item) => {
			const unitAmount = item.variant?.price ?? item.product.price
			invariant(unitAmount !== null, `Price missing for product ${item.product.id}`)

			return {
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
		},
	)

	// Add shipping as a line item if cost > 0
	if (shippingCost > 0) {
		lineItems.push({
			price_data: {
				currency: currency.code.toLowerCase(),
				product_data: {
					name: 'Shipping',
					description: 'Shipping cost',
				},
				unit_amount: shippingCost,
			},
			quantity: 1,
		})
	}

	// Create checkout session
	const sessionParams: any = {
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
			shippingMethodId: shippingMethodId,
			shippingCost: shippingCost.toString(),
			...(mondialRelayPickupPointId && {
				mondialRelayPickupPointId: mondialRelayPickupPointId,
			}),
		},
		payment_intent_data: {
			metadata: {
				cartId: cart.id,
			},
		},
	}

	try {
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

		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})

		return session
	} catch (error) {
		// Log error to Sentry before re-throwing
		// Caller will handle the error appropriately
		Sentry.captureException(error, {
			tags: { context: 'stripe-checkout-session-creation' },
			extra: {
				message: error instanceof Error ? error.message : 'Unknown error',
				errorType: error instanceof Error ? error.constructor.name : typeof error,
			},
		})
		throw error
	}
}

