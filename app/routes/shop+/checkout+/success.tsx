import { useEffect } from 'react'
import { redirect, useRevalidator } from 'react-router'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrderByCheckoutSessionId } from '#app/utils/order.server.ts'
import { type Route } from './+types/success.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const sessionId = url.searchParams.get('session_id')

	if (!sessionId) {
		// No session_id - redirect to shop
		return redirect('/shop')
	}

	// Wait 1-2 seconds for webhook to process (webhooks are usually very fast)
	await new Promise((resolve) => setTimeout(resolve, 1500))

	// Check database for order by session_id (webhook creates it)
	const order = await getOrderByCheckoutSessionId(sessionId)

	if (order) {
		// Order exists - redirect to order detail
		const userId = await getUserId(request)
		// For authenticated users, redirect directly
		if (userId) {
			return redirect(`/shop/orders/${order.orderNumber}`)
		}
		// For guests, redirect with email parameter
		return redirect(`/shop/orders/${order.orderNumber}?email=${encodeURIComponent(order.email)}`)
	}

	// Order doesn't exist yet - return processing state
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
			const interval = setInterval(() => {
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
					</CardContent>
				</Card>
			</div>
		)
	}

	// This should never render since we redirect when order exists
	return null
}
