import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { data } from 'react-router'
import type Stripe from 'stripe'
import {
	createOrderFromStripeSession,
	StockUnavailableError,
} from '#app/utils/order.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/stripe.ts'

/**
 * Webhook handler for Stripe events.
 * Handles checkout.session.completed events to create orders.
 */
export async function action({ request }: Route.ActionArgs) {
	const body = await request.text()
	const sig = request.headers.get('stripe-signature')

	invariant(sig, 'Missing webhook signature')
	invariant(
		process.env.STRIPE_WEBHOOK_SECRET,
		'STRIPE_WEBHOOK_SECRET must be set in environment variables',
	)

	let event: Stripe.Event
	try {
		event = stripe.webhooks.constructEvent(
			body,
			sig,
			process.env.STRIPE_WEBHOOK_SECRET,
			300, // tolerance in seconds
		)
	} catch (err) {
		// Log signature verification failures to Sentry
		Sentry.captureException(err, {
			tags: { context: 'webhook-signature-verification' },
		})
		return data(
			{ error: `Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
			{ status: 400 },
		)
	}

	// Handle checkout.session.completed event
	if (event.type === 'checkout.session.completed') {
		const session = event.data.object as Stripe.Checkout.Session

		// Retrieve full session from Stripe with expanded data
		const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
			expand: ['line_items', 'payment_intent'],
		})

		// Verify payment status before fulfilling order
		if (fullSession.payment_status !== 'paid') {
			// Log payment status issues for monitoring
			Sentry.captureMessage(
				`Payment not completed for session ${session.id}. Payment status: ${fullSession.payment_status}`,
				{
					level: 'warning',
					tags: { context: 'webhook-payment-status' },
					extra: { sessionId: session.id, paymentStatus: fullSession.payment_status },
				},
			)
			return data(
				{
					received: true,
					skipped: true,
					message: `Payment not completed. Status: ${fullSession.payment_status}`,
				},
				{ status: 200 },
			)
		}

		// Create order using shared function
		try {
			const order = await createOrderFromStripeSession(
				session.id,
				fullSession,
				request,
			)

			// Cart is already deleted within the transaction above
			return data({ received: true, orderId: order.id })
		} catch (error) {
			// Log critical errors to Sentry
			Sentry.captureException(error, {
				tags: { context: 'webhook-order-creation' },
				extra: {
					sessionId: session.id,
					message: error instanceof Error ? error.message : 'Unknown error',
				},
			})
			if (error instanceof StockUnavailableError) {
				// Stock unavailable after payment - this is a critical error
				// Payment was already processed, so we need to handle refund
				const paymentIntentId =
					typeof fullSession.payment_intent === 'string'
						? fullSession.payment_intent
						: fullSession.payment_intent?.id

				if (paymentIntentId && fullSession.amount_total) {
					try {
						await stripe.refunds.create({
							payment_intent: paymentIntentId,
							amount: fullSession.amount_total,
							reason: 'requested_by_customer',
							metadata: {
								reason: 'stock_unavailable',
								checkout_session_id: fullSession.id,
								product_name: error.data.productName,
							},
						})
						// Log successful refund for monitoring
						Sentry.captureMessage(
							`Refund created for payment ${paymentIntentId} due to stock unavailability`,
							{
								level: 'info',
								tags: { context: 'webhook-refund' },
								extra: { paymentIntentId, sessionId: fullSession.id },
							},
						)
					} catch (refundError) {
						// Log refund errors - these are critical
						Sentry.captureException(refundError, {
							tags: { context: 'webhook-refund-error' },
							extra: { paymentIntentId, sessionId: fullSession.id },
						})
					}
				}

				return data(
					{
						received: true,
						error: 'Stock unavailable',
						message: error.message,
					},
					{ status: 500 },
				)
			}
			// Re-throw other errors to trigger Stripe retry
			throw error
		}
	}

	// Return success for unhandled event types
	return data({ received: true })
}

