import { http, HttpResponse, passthrough } from 'msw'
import Stripe from 'stripe'

/**
 * Mock Stripe Checkout Session response
 */
function createMockCheckoutSession(
	params: {
		sessionId?: string
		url?: string
		paymentStatus?: Stripe.Checkout.Session.PaymentStatus
		amountTotal?: number
		currency?: string
		lineItems?: Array<{
			price_data?: {
				currency: string
				product_data: { name: string; description?: string }
				unit_amount: number
			}
			quantity: number
		}>
		metadata?: Record<string, string>
	} = {},
): Stripe.Checkout.Session {
	const sessionId = params.sessionId || `cs_test_${Date.now()}`
	const checkoutUrl = params.url || `https://checkout.stripe.com/c/pay/${sessionId}`

	return {
		id: sessionId,
		object: 'checkout.session',
		after_expiration: null,
		allow_promotion_codes: null,
		amount_subtotal: params.amountTotal || 0,
		amount_total: params.amountTotal || 0,
		automatic_tax: { enabled: false, status: null },
		billing_address_collection: null,
		cancel_url: 'http://localhost:3000/shop/checkout?canceled=true',
		client_reference_id: null,
		client_secret: null,
		consent: null,
		consent_collection: null,
		created: Math.floor(Date.now() / 1000),
		currency: params.currency || 'usd',
		currency_conversion: null,
		custom_fields: [],
		custom_text: {
			after_submit: null,
			shipping_address: null,
			submit: null,
			terms_of_service_acceptance: null,
		},
		customer: null,
		customer_creation: null,
		customer_details: {
			address: null,
			email: null,
			name: null,
			phone: null,
			tax_exempt: null,
			tax_ids: [],
		},
		customer_email: null,
		expires_at: null,
		invoice: null,
		invoice_creation: null,
		livemode: false,
		locale: null,
		mode: 'payment',
		payment_intent: null,
		payment_link: null,
		payment_method_collection: 'if_required',
		payment_method_configuration_details: null,
		payment_method_options: {},
		payment_method_types: ['card'],
		payment_status: params.paymentStatus || 'unpaid',
		phone_number_collection: { enabled: false },
		recovered_from: null,
		saved_payment_method_options: null,
		shipping_address_collection: null,
		shipping_cost: null,
		shipping_details: null,
		shipping_options: [],
		status: 'open',
		submit_type: null,
		subscription: null,
		success_url: 'http://localhost:3000/shop/checkout/success?session_id={CHECKOUT_SESSION_ID}',
		total_details: {
			amount_discount: 0,
			amount_shipping: 0,
			amount_tax: 0,
		},
		ui_mode: 'hosted',
		url: checkoutUrl,
		line_items: {
			object: 'list',
			data: [],
			has_more: false,
			url: `/v1/checkout/sessions/${sessionId}/line_items`,
		},
		metadata: params.metadata || {},
	} as unknown as Stripe.Checkout.Session
}

/**
 * MSW handlers for Stripe API requests
 * In test mode: mock Stripe API responses
 * In development: passthrough to real Stripe API
 */
export const handlers = [
	// In test mode, mock Stripe API endpoints
	...(process.env.NODE_ENV === 'test'
		? [
				// POST /v1/checkout/sessions - Create checkout session
				http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
					const body = await request.text()
					const params = new URLSearchParams(body)
					
					// Extract metadata if present
					const metadata: Record<string, string> = {}
					for (const [key, value] of params.entries()) {
						if (key.startsWith('metadata[') && key.endsWith(']')) {
							const metaKey = key.slice(9, -1)
							metadata[metaKey] = value
						}
					}

					const sessionId = `cs_test_${Date.now()}`
					const checkoutUrl = `https://checkout.stripe.com/c/pay/${sessionId}`

					const session = createMockCheckoutSession({
						sessionId,
						url: checkoutUrl,
						paymentStatus: 'unpaid',
						currency: 'usd',
						metadata,
					})

					return HttpResponse.json(session, { status: 200 })
				}),

				// GET /v1/checkout/sessions/:id - Retrieve checkout session
				http.get(
					'https://api.stripe.com/v1/checkout/sessions/:sessionId',
					async ({ params }) => {
						const { sessionId } = params

						// For test sessions, return mock data
						if (typeof sessionId === 'string' && sessionId.startsWith('cs_test_')) {
							const session = createMockCheckoutSession({
								sessionId,
								paymentStatus: 'paid',
								amountTotal: 10000, // $100.00 in cents
								currency: 'usd',
							})

							return HttpResponse.json(session, { status: 200 })
						}

						// For other sessions, return 404
						return HttpResponse.json(
							{
								error: {
									type: 'invalid_request_error',
									message: `No such checkout session: ${sessionId}`,
								},
							},
							{ status: 404 },
						)
					},
				),

				// Webhook signature verification endpoint (for testing webhooks)
				// Note: Actual webhook verification uses stripe.webhooks.constructEvent()
				// which we'll test using Stripe's generateTestHeaderString()
			]
		: [
				// In development mode, passthrough all Stripe API requests
				http.all(/^https:\/\/api\.stripe\.com\/.*/, () => {
					return passthrough()
				}),
				http.all(/^https:\/\/checkout\.stripe\.com\/.*/, () => {
					return passthrough()
				}),
			]),
]

/**
 * Generate test webhook signature for Stripe webhook testing
 * Uses Stripe's built-in method for generating test signatures
 */
export function generateTestWebhookSignature(
	payload: string | object,
	secret: string,
): string {
	const stripe = new Stripe(secret, {
		apiVersion: '2025-10-29.clover',
	})
	
	const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload)
	
	return stripe.webhooks.generateTestHeaderString({
		payload: payloadString,
		secret,
	})
}
