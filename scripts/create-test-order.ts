import { prisma } from '#app/utils/db.server.ts'
import { generateOrderNumber } from '#app/utils/order-number.server.ts'

async function createTestOrder() {
	// Get the first product
	const product = await prisma.product.findFirst({
		where: { status: 'ACTIVE' },
	})

	if (!product) {
		console.error('No active products found')
		process.exit(1)
	}

	// Get or create a cart
	const cart = await prisma.cart.create({
		data: {
			items: {
				create: {
					productId: product.id,
					quantity: 1,
				},
			},
		},
		include: {
			items: {
				include: {
					product: true,
				},
			},
		},
	})

	const orderNumber = await generateOrderNumber()
	const subtotal = cart.items.reduce((sum, item) => {
		return sum + (item.product.price ?? 0) * item.quantity
	}, 0)

	const order = await prisma.order.create({
		data: {
			orderNumber,
			email: 'test@example.com',
			subtotal,
			total: subtotal,
			shippingName: 'Test User',
			shippingStreet: '123 Main St',
			shippingCity: 'San Francisco',
			shippingState: 'CA',
			shippingPostal: '94102',
			shippingCountry: 'US',
			stripeCheckoutSessionId: 'cs_test_' + Date.now(),
			status: 'CONFIRMED',
			items: {
				create: cart.items.map((item) => ({
					productId: item.productId,
					variantId: item.variantId,
					price: item.product.price ?? 0,
					quantity: item.quantity,
				})),
			},
		},
	})

	console.log('Created order:', order.orderNumber)
	console.log('Order ID:', order.id)

	// Clean up cart
	await prisma.cart.delete({ where: { id: cart.id } })

	process.exit(0)
}

createTestOrder().catch(console.error)

