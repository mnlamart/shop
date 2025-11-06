import { getUserId } from '#app/utils/auth.server.ts'
import { getCartSessionIdFromRequest } from '#app/utils/cart-session.server.ts'
import { getCart } from '#app/utils/cart.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { getShippingMethodsForCountry } from '#app/utils/shipping.server.ts'

export async function getCheckoutData(request: Request) {
	// Check for existing cart first without creating one
	const requestUserId = await getUserId(request)
	let cart = null
	
	if (requestUserId) {
		cart = await getCart(requestUserId)
	} else {
		const sessionId = await getCartSessionIdFromRequest(request)
		if (sessionId) {
			cart = await getCart(sessionId)
		}
	}

	// If cart is empty or doesn't exist, return null
	if (!cart || cart.items.length === 0) {
		return null
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
							weightGrams: true,
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
							weightGrams: true,
						},
					},
				},
			},
		},
	})

	if (!cartWithItems) {
		return null
	}

	const currency = await getStoreCurrency()
	if (!currency) {
		throw new Error('Currency not configured')
	}

	const subtotal = cartWithItems.items.reduce((sum, item) => {
		const price = item.variant?.price ?? item.product.price
		return sum + (price ?? 0) * item.quantity
	}, 0)

	// Get user email and saved addresses if authenticated
	let userEmail: string | undefined = undefined
	let savedAddresses: Array<{
		id: string
		name: string
		street: string
		city: string
		state: string | null
		postal: string
		country: string
		label: string | null
		isDefaultShipping: boolean
	}> = []
	let defaultShippingAddress: (typeof savedAddresses)[number] | null = null

	const userId = await getUserId(request)
	if (userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		})
		userEmail = user?.email || undefined

		// Load saved addresses
		const addresses = await prisma.address.findMany({
			where: { userId },
			orderBy: [
				{ isDefaultShipping: 'desc' },
				{ createdAt: 'desc' },
			],
		})
		savedAddresses = addresses.map((addr) => ({
			id: addr.id,
			name: addr.name,
			street: addr.street,
			city: addr.city,
			state: addr.state,
			postal: addr.postal,
			country: addr.country,
			label: addr.label,
			isDefaultShipping: addr.isDefaultShipping,
		}))
		defaultShippingAddress = savedAddresses.find((a) => a.isDefaultShipping) || null
	}

	// Get available shipping methods for default country (or US as fallback)
	const defaultCountry = defaultShippingAddress?.country || 'US'
	const shippingMethods = await getShippingMethodsForCountry(defaultCountry)

	return {
		cart: cartWithItems,
		currency,
		subtotal,
		userEmail,
		savedAddresses,
		defaultShippingAddress,
		shippingMethods,
	}
}

