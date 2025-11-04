import { getUserId } from './auth.server.ts'
import { getCartSessionId, getCartSessionIdFromRequest } from './cart-session.server.ts'
import { prisma } from './db.server.ts'

export async function createCart({
	userId,
	sessionId,
}: {
	userId?: string
	sessionId?: string
}) {
	return prisma.cart.create({
		data: {
			userId,
			sessionId,
		},
	include: {
			items: true,
	},
	})
}

export async function getCart(sessionIdOrUserId: string) {
	return prisma.cart.findFirst({
		where: {
			OR: [{ sessionId: sessionIdOrUserId }, { userId: sessionIdOrUserId }],
		},
		include: {
			items: true,
		},
	})
}

export async function getOrCreateCart({
	userId,
	sessionId,
}: {
	userId?: string
	sessionId?: string
}) {
	const existing = await prisma.cart.findFirst({
		where: userId ? { userId } : { sessionId },
		include: {
			items: true,
		},
	})

	if (existing) {
		return existing
	}

	try {
		return await createCart({ userId, sessionId })
	} catch (error) {
		// Handle race condition: if cart was created by another request between findFirst and create
		// (e.g., after webhook deleted cart, another request created it)
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'P2002' &&
			'meta' in error &&
			error.meta &&
			typeof error.meta === 'object' &&
			'modelName' in error.meta &&
			error.meta.modelName === 'Cart'
		) {
			// Unique constraint violation - try to find the cart again
			const retryCart = await prisma.cart.findFirst({
				where: userId ? { userId } : { sessionId },
				include: {
					items: true,
				},
			})
			if (retryCart) {
				return retryCart
			}
		}
		// Re-throw if it's not a unique constraint error or if cart still doesn't exist
		throw error
	}
}

/**
 * Gets or creates a cart from a request, automatically detecting if user is authenticated.
 * For authenticated users, returns their user cart. For guests, returns/create their session cart.
 * 
 * @param request - The incoming request
 * @returns Object containing the cart, whether session needs to be committed, and cookie header if needed
 */
export async function getOrCreateCartFromRequest(request: Request) {
	const userId = await getUserId(request)
	
	if (userId) {
		// Authenticated user - use their cart
		// Check if they have a recent order (prevent cart recreation after checkout)
		const cart = await getOrCreateCart({ userId })
		return { cart, needsCommit: false, cookieHeader: undefined }
	} else {
		// Guest user - use session cart
		const { sessionId, needsCommit, cookieHeader } = await getCartSessionId(request)
		const cart = await getOrCreateCart({ sessionId })
		return { cart, needsCommit, cookieHeader }
	}
}

export async function addToCart(
	cartId: string,
	productId: string,
	variantId: string | null,
	quantity: number,
) {
	// Check if item already exists in cart
	const existingItem = await prisma.cartItem.findFirst({
		where: {
			cartId,
			productId,
			variantId: variantId || null,
		},
	})

	if (existingItem) {
		// Update quantity
		await prisma.cartItem.update({
			where: { id: existingItem.id },
			data: { quantity: existingItem.quantity + quantity },
		})
	} else {
		// Create new item
		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId: variantId || null,
				quantity,
			},
		})
	}

	// Return updated cart
	return prisma.cart.findUniqueOrThrow({
		where: { id: cartId },
		include: {
			items: true,
		},
	})
}

export async function updateCartItemQuantity(cartItemId: string, quantity: number) {
	await prisma.cartItem.update({
		where: { id: cartItemId },
		data: { quantity },
	})

	const item = await prisma.cartItem.findUniqueOrThrow({
		where: { id: cartItemId },
	})

	// Return updated cart
	return prisma.cart.findUniqueOrThrow({
		where: { id: item.cartId },
		include: {
			items: true,
		},
	})
}

export async function removeFromCart(cartItemId: string) {
	const item = await prisma.cartItem.findUniqueOrThrow({
		where: { id: cartItemId },
	})

	await prisma.cartItem.delete({
		where: { id: cartItemId },
	})

	// Return updated cart
	return prisma.cart.findUniqueOrThrow({
		where: { id: item.cartId },
		include: {
			items: true,
		},
	})
}

export async function clearCart(cartId: string) {
	await prisma.cartItem.deleteMany({
		where: { cartId },
	})

	return prisma.cart.findUniqueOrThrow({
		where: { id: cartId },
		include: {
			items: true,
		},
	})
}

export async function mergeGuestCartToUser(sessionId: string, userId: string) {
	const guestCart = await prisma.cart.findFirst({
		where: { sessionId },
		include: { items: true },
	})

	if (!guestCart) {
		// No guest cart to merge
		return getOrCreateCart({ userId })
	}

	// Find or create user cart
	const userCart = await getOrCreateCart({ userId })

	// Merge items from guest cart to user cart
	for (const item of guestCart.items) {
		await addToCart(userCart.id, item.productId, item.variantId, item.quantity)
	}

	// Delete guest cart
	await prisma.cart.delete({
		where: { id: guestCart.id },
	})

	// Return updated user cart
	return prisma.cart.findUniqueOrThrow({
		where: { id: userCart.id },
		include: {
			items: true,
		},
	})
}

/**
 * Merge the guest cart into the user's cart on login.
 * This is called from handleNewSession and can be called directly in tests.
 * @param request - The incoming request containing guest session cookies
 * @param userId - The ID of the user to merge the cart for
 */
export async function mergeCartOnUserLogin(request: Request, userId: string) {
	try {
		const guestSessionId = await getCartSessionIdFromRequest(request)
		if (guestSessionId) {
			await mergeGuestCartToUser(guestSessionId, userId)
		}
	} catch (error) {
		// Log error but don't fail login if cart merge fails
		console.error('Failed to merge cart on login:', error)
	}
}

export async function getCartSummary(cartId: string) {
	const cart = await prisma.cart.findUniqueOrThrow({
		where: { id: cartId },
		include: {
			items: {
				include: {
					product: true,
					variant: true,
				},
			},
		},
	})

	let subtotal = 0
	let totalQuantity = 0

	for (const item of cart.items) {
		const price = item.variant?.price
			? Number(item.variant.price)
			: Number(item.product.price)
		subtotal += price * item.quantity
		totalQuantity += item.quantity
	}

	return {
		itemCount: cart.items.length,
		totalQuantity,
		subtotal,
	}
}
