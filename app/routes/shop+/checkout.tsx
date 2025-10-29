import { invariantResponse } from '@epic-web/invariant'
import { parseWithZod } from '@conform-to/zod/v4'
import { redirect } from 'react-router'
import { z } from 'zod'
import { getOrCreateCartFromRequest } from '#app/utils/cart.server.ts'
import { validateStockAvailability } from '#app/utils/order.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { getUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/checkout.ts'

const ShippingFormSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	email: z.string().email('Invalid email address'),
	street: z.string().min(1, 'Street address is required'),
	city: z.string().min(1, 'City is required'),
	state: z.string().optional(),
	postal: z.string().min(1, 'Postal code is required'),
	country: z.string().min(1, 'Country is required'),
})

export async function loader({ request }: Route.LoaderArgs) {
	const { cart } = await getOrCreateCartFromRequest(request)

	if (!cart || cart.items.length === 0) {
		return redirect('/shop/cart')
	}

	// Load cart with full product details for display
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
							images: {
								select: { objectKey: true, altText: true },
								orderBy: { displayOrder: 'asc' },
								take: 1,
							},
						},
					},
					variant: {
						select: {
							id: true,
							price: true,
							sku: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	return {
		cart: cartWithItems,
		currency,
		subtotal,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: ShippingFormSchema,
	})

	if (submission.status !== 'success') {
		return submission.reply()
	}

	const shippingData = submission.value

	// Get cart and user
	const { cart } = await getOrCreateCartFromRequest(request)
	invariantResponse(cart, 'Cart not found', { status: 404 })
	invariantResponse(cart.items.length > 0, 'Cart is empty', { status: 400 })

	// Get currency
	const currency = await getStoreCurrency()
	invariantResponse(currency, 'Currency not configured', { status: 500 })

	// Get user ID (optional - for guest checkout)
	const userId = await getUserId(request)

	// Validate stock availability BEFORE creating checkout session
	await validateStockAvailability(cart.id)

	// Load cart with products and variants for checkout session
	const cartWithItems = await prisma.cart.findUnique({
		where: { id: cart.id },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
		},
	})

	invariantResponse(cartWithItems, 'Cart not found', { status: 404 })

	// Create Stripe Checkout Session
	const session = await stripe.checkout.sessions.create({
		line_items: cartWithItems.items.map((item) => ({
			price_data: {
				currency: currency.code.toLowerCase(),
				product_data: {
					name: item.product.name,
					description: item.product.description || undefined,
				},
				unit_amount:
					item.variantId && item.variant
						? item.variant.price ?? item.product.price
						: item.product.price,
			},
			quantity: item.quantity,
		})),
		mode: 'payment',
		success_url: `${getDomainUrl(request)}/shop/orders?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${getDomainUrl(request)}/shop/checkout?canceled=true`,
		customer_email: shippingData.email,
		metadata: {
			cartId: cart.id,
			userId: userId || '',
			shippingName: shippingData.name,
			shippingStreet: shippingData.street,
			shippingCity: shippingData.city,
			shippingState: shippingData.state || '',
			shippingPostal: shippingData.postal,
			shippingCountry: shippingData.country,
		},
		payment_intent_data: {
			metadata: {
				cartId: cart.id,
			},
		},
	})

	invariantResponse(
		session.url,
		'Failed to create checkout session',
		{ status: 500 },
	)

	return redirect(session.url)
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout | Shop | Epic Shop' },
]

export default function Checkout({ loaderData }: Route.ComponentProps) {
	// TODO: Implement checkout form UI
	return (
		<div className="container py-8">
			<h1 className="text-3xl font-bold tracking-tight mb-6">Checkout</h1>
			<p className="text-muted-foreground">Checkout form coming soon...</p>
		</div>
	)
}

