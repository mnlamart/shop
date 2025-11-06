import { Outlet, redirectDocument, useLoaderData } from 'react-router'
import { CheckoutSteps, type CheckoutStep } from '#app/components/checkout/checkout-steps.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { getCartSessionIdFromRequest } from '#app/utils/cart-session.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/_layout.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const pathname = url.pathname

	// Check if cart exists and has items - redirect early if not
	// Use findFirst to avoid creating empty carts or sessions
	const userId = await getUserId(request)
	let cart = null
	
	if (userId) {
		cart = await prisma.cart.findFirst({
			where: { userId },
			include: { items: true },
		})
	} else {
		// Use getCartSessionIdFromRequest to avoid creating session if it doesn't exist
		const sessionId = await getCartSessionIdFromRequest(request)
		if (sessionId) {
			cart = await prisma.cart.findFirst({
				where: { sessionId },
				include: { items: true },
			})
		}
	}
	
	if (!cart || cart.items.length === 0) {
		return redirectDocument('/shop/cart')
	}

	// Determine current step from pathname
	let currentStep: CheckoutStep = 'review'
	if (pathname.includes('/checkout/shipping')) {
		currentStep = 'shipping'
	} else if (pathname.includes('/checkout/delivery')) {
		currentStep = 'delivery'
	} else if (pathname.includes('/checkout/payment')) {
		currentStep = 'payment'
	}

	return { currentStep }
}

export const meta: Route.MetaFunction = () => [
	{ title: 'Checkout' },
]

export default function CheckoutLayout() {
	const loaderData = useLoaderData<typeof loader>()
	const currentStep = loaderData?.currentStep || 'review'

	return (
		<div className="container mx-auto max-w-4xl px-4 py-8">
			<h1 className="mb-8 text-center text-3xl font-bold">Checkout</h1>
			<CheckoutSteps currentStep={currentStep} />
			<div className="min-h-[400px]">
				<Outlet />
			</div>
		</div>
	)
}

