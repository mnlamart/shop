import { useCallback, useEffect, useState } from 'react'
import { redirect, redirectDocument, useFetcher, useRevalidator } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import {
	createOrderFromStripeSession,
	getOrderByCheckoutSessionId,
} from '#app/utils/order.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/success.ts'

export async function loader({ request }: Route.LoaderArgs) {
	try {
		const url = new URL(request.url)
		const sessionId = url.searchParams.get('session_id')

		if (!sessionId) {
			// No session_id - redirect to shop
			return redirect('/shop')
		}

		// Wait 1.5 seconds for webhook to process (webhooks are usually very fast)
		await new Promise((resolve) => setTimeout(resolve, 1500))

		// Check database for order by session_id (webhook creates it)
		let order
		try {
			order = await getOrderByCheckoutSessionId(sessionId)
		} catch (error) {
			console.error('[CHECKOUT SUCCESS] Error looking up order:', error)
			// If there's an error, still show processing state
			order = null
		}

		if (order) {
			// Order exists - redirect to order detail using redirectDocument to replace history
			const userId = await getUserId(request)
			// For authenticated users, redirect directly
			if (userId) {
				const redirectUrl = `/shop/orders/${order.orderNumber}`
				return redirectDocument(redirectUrl)
			}
			// For guests, redirect with email parameter
			const redirectUrl = `/shop/orders/${order.orderNumber}?email=${encodeURIComponent(order.email)}`
			return redirectDocument(redirectUrl)
		}

		// Order doesn't exist yet - return processing state
		// DO NOT redirect - let the component handle the processing state
		return {
			processing: true,
			sessionId,
			message: 'Your order is being processed. Please wait a moment.',
		}
	} catch (error) {
		console.error('[CHECKOUT SUCCESS] Loader error:', error)
		// Return error state but still render something
		const url = new URL(request.url)
		const sessionId = url.searchParams.get('session_id')
		return {
			processing: true,
			sessionId: sessionId || null,
			message: 'An error occurred while processing your order. Please try refreshing the page.',
		}
	}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const intent = formData.get('intent')
	const sessionId = formData.get('session_id')

	if (intent !== 'sync-order' || !sessionId || typeof sessionId !== 'string') {
		return { error: 'Invalid request' }
	}

	try {
		// Verify payment status from Stripe before creating order
		const session = await stripe.checkout.sessions.retrieve(sessionId)
		
		if (session.payment_status !== 'paid') {
			return {
				error: 'Payment not completed',
				message: `Payment status: ${session.payment_status}. Please contact support if you were charged.`,
			}
		}

		// Create order using shared function (includes cart deletion)
		const order = await createOrderFromStripeSession(sessionId, session, request)

		// Return success with order number and email for redirect
		return {
			success: true,
			orderNumber: order.orderNumber,
			email: session.customer_email || session.metadata?.email || null,
		}
	} catch (error) {
		console.error('[CHECKOUT SUCCESS] Error syncing order:', error)
		return {
			error: 'Failed to sync order',
			message:
				error instanceof Error
					? error.message
					: 'An error occurred while creating your order. Please contact support with your session ID.',
		}
	}
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Order Processing | Shop | Epic Shop' },
]

export default function CheckoutSuccess({ loaderData }: Route.ComponentProps) {
	// Ensure we have the required data with defaults
	const processing = loaderData?.processing ?? false
	const sessionId = loaderData?.sessionId ?? null
	const message = loaderData?.message ?? 'Your order is being processed. Please wait a moment.'

	console.log('[CHECKOUT SUCCESS] Component rendering', { processing, sessionId, message, loaderData })

	const revalidator = useRevalidator()
	const syncFetcher = useFetcher<typeof action>()
	const [showSyncButton, setShowSyncButton] = useState(false)
	const [hasTriggeredFallback, setHasTriggeredFallback] = useState(false)
	const [pageLoadTime] = useState(() => Date.now())

	const handleSyncOrder = useCallback(() => {
		if (!sessionId) {
			console.error('[CHECKOUT SUCCESS] No sessionId available for sync')
			return
		}
		
		if (syncFetcher.state !== 'idle') {
			console.warn('[CHECKOUT SUCCESS] Sync already in progress, skipping')
			return
		}
		
		console.log('[CHECKOUT SUCCESS] Triggering manual order sync', { sessionId })
		const formData = new FormData()
		formData.append('intent', 'sync-order')
		formData.append('session_id', sessionId)
		void syncFetcher.submit(formData, { method: 'POST' })
	}, [sessionId, syncFetcher])

	// Auto-refresh if order is processing
	useEffect(() => {
		if (!processing || !sessionId) return
		
		// If fallback already triggered, don't start polling again
		if (hasTriggeredFallback) return

		// Check if we should trigger fallback immediately (if page has been open for > 15 seconds)
		const elapsedSincePageLoad = Date.now() - pageLoadTime
		if (elapsedSincePageLoad >= 15000) {
			console.warn('[CHECKOUT SUCCESS] Page already open for >15s, triggering fallback immediately')
			setShowSyncButton(true)
			setHasTriggeredFallback(true)
			handleSyncOrder()
			return
		}

		// Set max polling duration (15 seconds before fallback)
		const maxPollingDuration = 15000 // 15 seconds
		const startTime = Date.now()
		
		const interval = setInterval(() => {
			const elapsed = Date.now() - startTime
			if (elapsed >= maxPollingDuration) {
				console.warn('[CHECKOUT SUCCESS] Max polling duration reached, triggering fallback')
				clearInterval(interval)
				setShowSyncButton(true)
				setHasTriggeredFallback(true)
				// Automatically trigger fallback sync
				handleSyncOrder()
				return
			}
			console.log('[CHECKOUT SUCCESS] Polling for order...', { elapsed })
			void revalidator.revalidate()
		}, 3000) // Check every 3 seconds

		return () => clearInterval(interval)
	}, [processing, sessionId, revalidator, hasTriggeredFallback, handleSyncOrder, pageLoadTime])

	// Handle sync fetcher response
	useEffect(() => {
		if (syncFetcher.data?.success && syncFetcher.data.orderNumber) {
			console.log('[CHECKOUT SUCCESS] Order created successfully, redirecting...', {
				orderNumber: syncFetcher.data.orderNumber,
				email: syncFetcher.data.email,
			})
			// Redirect to order detail page
			// For guests, include email in URL if available
			let redirectUrl = `/shop/orders/${syncFetcher.data.orderNumber}`
			if (syncFetcher.data.email) {
				redirectUrl += `?email=${encodeURIComponent(syncFetcher.data.email)}`
			}
			window.location.href = redirectUrl
		} else if (syncFetcher.data?.error) {
			console.error('[CHECKOUT SUCCESS] Sync error:', syncFetcher.data.error, syncFetcher.data.message)
		}
	}, [syncFetcher.data])

	const isSyncing = syncFetcher.state !== 'idle'
	const syncError = syncFetcher.data?.error
	
	// Show sync button if we've been processing for more than 15 seconds
	const shouldShowSyncButton = showSyncButton || (processing && (Date.now() - pageLoadTime) >= 15000)
	
	return (
		<div className="container mx-auto px-4 py-16 flex items-center justify-center min-h-[calc(100vh-200px)]">
			<Card className="w-full max-w-[672px] rounded-[10px] border border-[#D1D5DC] shadow-[0px_1px_2px_-1px_rgba(0,0,0,0.1),0px_1px_3px_0px_rgba(0,0,0,0.1)] bg-white">
				<CardContent className="pt-16 pb-16 px-12 text-center">
					{/* Loading Icon */}
					<div className="flex justify-center mb-6">
						<Icon
							name="update"
							className={`h-[68px] w-[68px] ${isSyncing ? 'animate-spin' : ''} text-[#101828]`}
						/>
					</div>
					
					{/* Heading */}
					<h1 className="text-base font-normal text-[#101828] mb-4 leading-[1.5em]">
						{isSyncing ? 'Creating Your Order...' : 'Processing Your Order'}
					</h1>
					
					{/* Message */}
					<p className="text-base font-normal text-[#4A5565] mb-6 leading-[1.5em]">
						{isSyncing
							? 'Your payment was successful! We are creating your order now. This may take a few moments.'
							: message}
					</p>
					
					{/* Error Message */}
					{syncError && (
						<div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
							<p className="text-destructive font-medium mb-2">Error: {syncError}</p>
							<p className="text-sm text-muted-foreground">
								{syncFetcher.data?.message || 'Please contact support with your session ID.'}
							</p>
						</div>
					)}
					
					{/* Sync Button (shown after timeout) */}
					{shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								onClick={handleSyncOrder}
								disabled={isSyncing}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								<Icon name="update" className="mr-2 h-4 w-4" />
								Sync Order Now
							</Button>
						</div>
					)}
					
					{/* Refresh Button */}
					{!shouldShowSyncButton && !isSyncing && (
						<div className="mb-6">
							<Button
								variant="outline"
								onClick={() => {
									void revalidator.revalidate()
								}}
								className="h-9 px-4 rounded-lg font-medium border border-[#D1D5DC] bg-white text-[#101828] hover:bg-gray-50"
							>
								Refresh Now
							</Button>
						</div>
					)}
					
					{/* Cart Info */}
					<p className="text-sm font-normal text-[#4A5565] mb-4 leading-[1.4285714285714286em]">
						Your cart will be cleared once your order is created. If this takes longer than expected, please check your email for order confirmation or contact support.
					</p>
					
					{/* Session ID */}
					{sessionId && (
						<p className="text-sm font-normal text-[#6A7282] leading-[1.4285714285714286em]">
							Session ID: {sessionId.substring(0, 20)}...
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => (
					<div className="container mx-auto px-4 py-16">
						<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
							<CardContent className="pt-12 pb-12 text-center">
								<Icon name="question-mark-circled" className="h-16 w-16 text-primary mx-auto mb-6" />
								<h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
								<p className="text-muted-foreground mb-6">
									The checkout success page could not be found.
								</p>
							</CardContent>
						</Card>
					</div>
				),
			}}
			unexpectedErrorHandler={(_error) => (
				<div className="container mx-auto px-4 py-16">
					<Card className="max-w-2xl mx-auto border-primary/50 bg-primary/5">
						<CardContent className="pt-12 pb-12 text-center">
							<Icon name="question-mark-circled" className="h-16 w-16 text-primary mx-auto mb-6" />
							<h1 className="text-3xl font-bold mb-4">Error Loading Page</h1>
							<p className="text-muted-foreground mb-6">
								An error occurred while loading the checkout success page. Please try again or contact support.
							</p>
						</CardContent>
					</Card>
				</div>
			)}
		/>
	)
}
