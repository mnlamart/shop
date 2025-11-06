import { invariantResponse } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { useEffect } from 'react'
import { data, Link, redirect, redirectDocument, useActionData, useLoaderData } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { getCheckoutData } from '#app/utils/checkout.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import {
	StockValidationError,
	validateStockAvailability,
} from '#app/utils/order.server.ts'
import { formatPrice } from '#app/utils/price.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { createCheckoutSession, handleStripeError } from '#app/utils/stripe.server.ts'
import { type Route } from './+types/payment.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	
	// Get shipping data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')
	const shippingMethodId = url.searchParams.get('shippingMethodId')
	const shippingCostParam = url.searchParams.get('shippingCost')
	const mondialRelayPickupPointId = url.searchParams.get('mondialRelayPickupPointId')

	// Validate required fields
	if (!name || !email || !street || !city || !postal || !country || !shippingMethodId || !shippingCostParam) {
		return redirect('/shop/checkout/delivery')
	}

	const shippingCost = parseInt(shippingCostParam, 10)
	if (isNaN(shippingCost)) {
		return redirect('/shop/checkout/delivery')
	}

	const checkoutData = await getCheckoutData(request)
	if (!checkoutData) {
		return redirectDocument('/shop/cart')
	}

	return {
		...checkoutData,
		shippingInfo: {
			name,
			email,
			street,
			city,
			state: state || undefined,
			postal,
			country,
		},
		shippingMethodId,
		shippingCost,
		mondialRelayPickupPointId: mondialRelayPickupPointId || undefined,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const url = new URL(request.url)
	
	// Get shipping data from URL params
	const name = url.searchParams.get('name')
	const email = url.searchParams.get('email')
	const street = url.searchParams.get('street')
	const city = url.searchParams.get('city')
	const state = url.searchParams.get('state')
	const postal = url.searchParams.get('postal')
	const country = url.searchParams.get('country')
	const shippingMethodId = url.searchParams.get('shippingMethodId')
	const shippingCostParam = url.searchParams.get('shippingCost')
	const mondialRelayPickupPointId = url.searchParams.get('mondialRelayPickupPointId')

	// Validate required fields
	if (!name || !email || !street || !city || !postal || !country || !shippingMethodId || !shippingCostParam) {
		return redirect('/shop/checkout/delivery')
	}

	const shippingCost = parseInt(shippingCostParam, 10)
	if (isNaN(shippingCost)) {
		return redirect('/shop/checkout/delivery')
	}

	// Get cart
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Validate stock availability
	try {
		await validateStockAvailability(cart.id)
	} catch (error) {
		if (error instanceof StockValidationError) {
			const stockMessages = error.issues.map(
				(issue) =>
					`${issue.productName}: Only ${issue.available} available, ${issue.requested} requested`,
			)
			return data(
				{
					error: 'Insufficient stock',
					messages: stockMessages,
				},
				{ status: 400 },
			)
		}
		Sentry.captureException(error, {
			tags: { context: 'checkout-stock-validation' },
		})
		throw error
	}

	// Get cart with full product details
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: {
						select: {
							id: true,
							name: true,
							description: true,
							price: true,
							weightGrams: true,
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							sku: true,
							weightGrams: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	const userId = await getUserId(request)

	// Create Stripe Checkout Session
	try {
		const domainUrl = getDomainUrl(request)
		const session = await createCheckoutSession({
			cart: cartWithItems,
			shippingInfo: {
				name,
				email,
				street,
				city,
				state: state || undefined,
				postal,
				country,
			},
			shippingMethodId,
			shippingCost,
			mondialRelayPickupPointId: mondialRelayPickupPointId || undefined,
			currency,
			domainUrl,
			userId: userId || undefined,
		})

		invariantResponse(session.url, 'Failed to create checkout session URL', {
			status: 500,
		})
		
		// Redirect to Stripe Checkout
		return redirect(session.url)
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'checkout-session-creation' },
		})
		
		const stripeError = handleStripeError(error)
		return data(
			{
				error: 'Failed to create checkout session',
				message: stripeError.message,
			},
			{ status: 500 },
		)
	}
}

export default function CheckoutPayment() {
	const loaderData = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()

	// Auto-submit to create Stripe session on mount
	useEffect(() => {
		if (!actionData?.error && loaderData) {
			const form = document.createElement('form')
			form.method = 'POST'
			form.action = window.location.pathname + window.location.search
			document.body.appendChild(form)
			form.submit()
		}
	}, [actionData?.error, loaderData])

	if (!loaderData) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		)
	}

	const {
		cart,
		currency,
		subtotal,
		shippingInfo,
		shippingCost,
	} = loaderData

	if (actionData?.error) {
		return (
			<div className="space-y-6">
				<Card>
					<CardContent className="pt-6">
						<div className="text-center space-y-4">
							<h2 className="text-2xl font-bold text-destructive">Payment Error</h2>
							<p className="text-muted-foreground">
								{'message' in actionData ? actionData.message : actionData.error}
							</p>
							{'messages' in actionData && actionData.messages && (
								<div className="text-sm text-muted-foreground">
									{actionData.messages.map((msg: string, i: number) => (
										<p key={i}>{msg}</p>
									))}
								</div>
							)}
							<div className="flex justify-center gap-4 pt-4">
								<Button variant="outline" asChild>
									<Link to={`/shop/checkout/delivery?${new URLSearchParams({
										name: loaderData.shippingInfo.name,
										email: loaderData.shippingInfo.email,
										street: loaderData.shippingInfo.street,
										city: loaderData.shippingInfo.city,
										state: loaderData.shippingInfo.state || '',
										postal: loaderData.shippingInfo.postal,
										country: loaderData.shippingInfo.country,
										shippingMethodId: loaderData.shippingMethodId,
										shippingCost: loaderData.shippingCost.toString(),
									}).toString()}`}>
										Back to Delivery
									</Link>
								</Button>
								<Button asChild>
									<Link to="/shop/cart">Return to Cart</Link>
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		)
	}

	if (!cart || !currency) {
		return (
			<div className="text-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardContent className="pt-6">
					<div className="text-center space-y-4">
						<h2 className="text-2xl font-bold">Processing Payment</h2>
						<p className="text-muted-foreground">
							Redirecting to secure payment...
						</p>
						<div className="flex justify-center">
							<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
						</div>
					</div>
				</CardContent>
			</Card>

			<div className="border rounded-lg p-6 space-y-4">
				<h3 className="text-lg font-semibold">Order Summary</h3>
				<div className="space-y-2">
					<div className="flex justify-between">
						<span>Subtotal</span>
						<span>{formatPrice(subtotal, currency)}</span>
					</div>
					<div className="flex justify-between">
						<span>Shipping</span>
						<span>
							{shippingCost === 0 ? (
								<span className="text-green-600">Free</span>
							) : (
								formatPrice(shippingCost, currency)
							)}
						</span>
					</div>
					<div className="flex justify-between text-lg font-bold border-t pt-2">
						<span>Total</span>
						<span>{formatPrice(subtotal + shippingCost, currency)}</span>
					</div>
				</div>
			</div>

			{shippingInfo && (
				<div className="border rounded-lg p-6">
					<h3 className="text-lg font-semibold mb-4">Shipping To</h3>
					<p className="font-medium">{shippingInfo.name}</p>
					<p className="text-sm text-muted-foreground">{shippingInfo.street}</p>
					<p className="text-sm text-muted-foreground">
						{shippingInfo.city}
						{shippingInfo.state && `, ${shippingInfo.state}`} {shippingInfo.postal}
					</p>
					<p className="text-sm text-muted-foreground">{shippingInfo.country}</p>
				</div>
			)}
		</div>
	)
}

