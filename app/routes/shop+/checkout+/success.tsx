import { useEffect } from 'react'
import { redirect, redirectDocument, useRevalidator } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrderByCheckoutSessionId } from '#app/utils/order.server.ts'
import { type Route } from './+types/success.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const sessionId = url.searchParams.get('session_id')

	console.log('[CHECKOUT SUCCESS] Loader called with session_id:', sessionId)

	if (!sessionId) {
		// No session_id - redirect to shop
		console.log('[CHECKOUT SUCCESS] No session_id, redirecting to /shop')
		return redirect('/shop')
	}

	// Wait 1-2 seconds for webhook to process (webhooks are usually very fast)
	console.log('[CHECKOUT SUCCESS] Waiting 1.5 seconds for webhook to process...')
	await new Promise((resolve) => setTimeout(resolve, 1500))

	// Check database for order by session_id (webhook creates it)
	console.log('[CHECKOUT SUCCESS] Checking for order with session_id:', sessionId)
	let order
	try {
		order = await getOrderByCheckoutSessionId(sessionId)
		console.log('[CHECKOUT SUCCESS] Order lookup result:', order ? `Found order ${order.orderNumber}` : 'Not found')
	} catch (error) {
		console.error('[CHECKOUT SUCCESS] Error looking up order:', error)
		// If there's an error, still show processing state
		order = null
	}

	if (order) {
		console.log('[CHECKOUT SUCCESS] Order found:', order.orderNumber, 'Redirecting to order detail')
		// Order exists - redirect to order detail using redirectDocument to replace history
		const userId = await getUserId(request)
		// For authenticated users, redirect directly
		if (userId) {
			const redirectUrl = `/shop/orders/${order.orderNumber}`
			console.log('[CHECKOUT SUCCESS] Redirecting authenticated user to:', redirectUrl)
			return redirectDocument(redirectUrl)
		}
		// For guests, redirect with email parameter
		const redirectUrl = `/shop/orders/${order.orderNumber}?email=${encodeURIComponent(order.email)}`
		console.log('[CHECKOUT SUCCESS] Redirecting guest user to:', redirectUrl)
		return redirectDocument(redirectUrl)
	}

	console.log('[CHECKOUT SUCCESS] Order not found yet, showing processing state')
	console.log('[CHECKOUT SUCCESS] NOTE: If order doesn\'t appear, ensure Stripe CLI is running: stripe listen --forward-to localhost:3000/webhooks/stripe')
	// Order doesn't exist yet - return processing state
	// DO NOT redirect - let the component handle the processing state
	return {
		processing: true,
		sessionId,
		message: 'Your order is being processed. Please wait a moment.',
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order Processing | Shop | Epic Shop' },
]

export default function CheckoutSuccess({ loaderData }: Route.ComponentProps) {
	const { processing, sessionId, message } = loaderData
	const revalidator = useRevalidator()

	// Auto-refresh if order is processing
	useEffect(() => {
		if (processing && sessionId) {
			// Set max polling duration (30 seconds)
			const maxPollingDuration = 30000 // 30 seconds
			const startTime = Date.now()
			
			const interval = setInterval(() => {
				const elapsed = Date.now() - startTime
				if (elapsed >= maxPollingDuration) {
					console.warn('[CHECKOUT SUCCESS] Max polling duration reached, stopping auto-refresh')
					clearInterval(interval)
					return
				}
				void revalidator.revalidate()
			}, 3000) // Check every 3 seconds

			return () => clearInterval(interval)
		}
	}, [processing, sessionId, revalidator])

	if (processing) {
		return (
			<div className="container mx-auto px-4 py-16">
				<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
					<CardContent className="pt-12 pb-12 text-center">
						<Icon
							name="update"
							className="h-16 w-16 animate-spin text-primary mx-auto mb-6"
						/>
						<h1 className="text-3xl font-bold mb-4">Processing Your Order</h1>
						<p className="text-muted-foreground mb-6">
							{message ||
								'Your payment was successful! We are processing your order. This page will automatically refresh when your order is ready.'}
						</p>
						<Button
							variant="outline"
							onClick={() => {
								void revalidator.revalidate()
							}}
						>
							Refresh Now
						</Button>
						<p className="text-sm text-muted-foreground mt-6">
							If this takes longer than expected, please check your email for order
							confirmation or contact support.
						</p>
						{sessionId && (
							<p className="text-xs text-muted-foreground mt-4">
								Session ID: {sessionId.substring(0, 20)}...
							</p>
						)}
					</CardContent>
				</Card>
			</div>
		)
	}

	// This should never render since we redirect when order exists
	return null
}
