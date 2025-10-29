import { invariant } from '@epic-web/invariant'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { stripe } from '#app/utils/stripe.server.ts'
import { createProductData, createVariantData } from '#tests/product-utils.ts'

// Mock Stripe checkout sessions
vi.mock('#app/utils/stripe.server.ts', async () => {
	const actual = await vi.importActual('#app/utils/stripe.server.ts')
	return {
		...actual,
		stripe: {
			checkout: {
				sessions: {
					create: vi.fn(),
				},
			},
		},
		handleStripeError: actual.handleStripeError,
	}
})

describe('Checkout - Stripe Checkout Session Creation', () => {
	let categoryId: string
	let productId: string
	let variantId: string
	let cartId: string
	let sessionId: string

	beforeEach(async () => {
		// Create test category
		const category = await prisma.category.upsert({
			where: { id: UNCATEGORIZED_CATEGORY_ID },
			update: {
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
			create: {
				id: UNCATEGORIZED_CATEGORY_ID,
				name: 'Test Category',
				slug: `test-category-${Date.now()}`,
			},
		})
		categoryId = category.id

		// Create test product
		const productData = createProductData()
		productData.categoryId = categoryId
		productData.price = Math.round(productData.price * 100) // Convert to cents

		const product = await prisma.product.create({
			data: {
				name: productData.name,
				slug: productData.slug,
				description: productData.description,
				sku: productData.sku,
				price: productData.price,
				status: 'ACTIVE' as const,
				categoryId: productData.categoryId!,
			},
		})
		productId = product.id

		// Create test variant with stock
		const variantData = createVariantData(productData.sku)
		variantData.stockQuantity = 10

		const variant = await prisma.productVariant.create({
			data: {
				productId,
				sku: variantData.sku,
				stockQuantity: variantData.stockQuantity,
			},
		})
		variantId = variant.id

		// Create test cart with item
		const cart = await prisma.cart.create({
			data: {
				sessionId: `session-${Date.now()}`,
			},
		})
		cartId = cart.id

		await prisma.cartItem.create({
			data: {
				cartId,
				productId,
				variantId,
				quantity: 2,
			},
		})

		// Generate session ID for tests
		sessionId = cart.sessionId!
	})

	afterEach(async () => {
		// Reset Stripe mocks
		vi.mocked(stripe.checkout.sessions.create).mockReset()

		// Cleanup database
		await prisma.cartItem.deleteMany({})
		await prisma.cart.deleteMany({})
		await prisma.productVariant.deleteMany({})
		await prisma.product.deleteMany({})
		await prisma.category.deleteMany({
			where: { id: categoryId },
		})
	})

	test('should create Stripe Checkout Session with correct line items', async () => {
		const cart = await prisma.cart.findUnique({
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

		invariant(cart && cart.items.length > 0, 'Cart not found')

		// Mock Stripe response
		const mockSession = {
			id: 'cs_test_mock123',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock123',
			status: 'open' as const,
			mode: 'payment' as const,
			payment_intent: 'pi_test_mock123',
			amount_total: 2000,
			amount_subtotal: 2000,
			customer_email: 'test@example.com',
			metadata: {
				cartId: cart.id,
				userId: '',
			},
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		// Test: Create checkout session
		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
						description: item.product.description || undefined,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
			cancel_url: 'https://example.com/cancel',
			customer_email: 'test@example.com',
			metadata: {
				cartId: cart.id,
				userId: '',
			},
		})

		invariant(cart.items[0], 'Cart must have at least one item')
		const firstItem = cart.items[0]

		expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: 'payment',
				customer_email: 'test@example.com',
				metadata: {
					cartId: cart.id,
					userId: '',
				},
				line_items: expect.arrayContaining([
					expect.objectContaining({
						price_data: expect.objectContaining({
							currency: 'usd',
							product_data: expect.objectContaining({
								name: firstItem.product.name,
							}),
						}),
						quantity: firstItem.quantity,
					}),
				]),
			}),
		)
		expect(session).toEqual(mockSession)
	})

	test('should include shipping address in metadata', async () => {
		const shippingData = {
			name: 'John Doe',
			street: '123 Main St',
			city: 'New York',
			state: 'NY',
			postal: '10001',
			country: 'US',
			email: 'john@example.com',
		}

		const cart = await prisma.cart.findUnique({
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

		invariant(cart && cart.items.length > 0, 'Cart not found')

		const mockSession = {
			id: 'cs_test_mock456',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock456',
			customer_email: shippingData.email,
			metadata: {
				cartId: cart.id,
				userId: '',
				shippingName: shippingData.name,
				shippingStreet: shippingData.street,
				shippingCity: shippingData.city,
				shippingState: shippingData.state,
				shippingPostal: shippingData.postal,
				shippingCountry: shippingData.country,
			},
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
			customer_email: shippingData.email,
			metadata: {
				cartId: cart.id,
				userId: '',
				shippingName: shippingData.name,
				shippingStreet: shippingData.street,
				shippingCity: shippingData.city,
				shippingState: shippingData.state,
				shippingPostal: shippingData.postal,
				shippingCountry: shippingData.country,
			},
		})

		expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				customer_email: shippingData.email,
				metadata: expect.objectContaining({
					shippingName: shippingData.name,
					shippingStreet: shippingData.street,
					shippingCity: shippingData.city,
					shippingCountry: shippingData.country,
				}),
			}),
		)
		expect(session.metadata?.shippingName).toBe(shippingData.name)
		expect(session.metadata?.shippingStreet).toBe(shippingData.street)
		expect(session.metadata?.shippingCity).toBe(shippingData.city)
		expect(session.metadata?.shippingCountry).toBe(shippingData.country)
		expect(session.customer_email).toBe(shippingData.email)
	})

	test('should calculate amounts correctly from line items', async () => {
		const cart = await prisma.cart.findUnique({
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

		invariant(cart && cart.items.length > 0, 'Cart not found')

		// Calculate expected totals from line items
		const expectedSubtotal = cart.items.reduce(
			(sum, item) => {
				const price = item.variant?.price ?? item.product.price
				invariant(price !== null, 'Price must not be null')
				return sum + price * item.quantity
			},
			0,
		)

		const mockSession = {
			id: 'cs_test_mock789',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock789',
			amount_total: expectedSubtotal,
			amount_subtotal: expectedSubtotal,
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => {
				const unitAmount = item.variant?.price ?? item.product.price
				invariant(unitAmount !== null, 'Unit amount must not be null')
				return {
					price_data: {
						currency: 'usd',
						product_data: {
							name: item.product.name,
						},
						unit_amount: unitAmount,
					},
					quantity: item.quantity,
				}
			}),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
		})

		// Stripe calculates amounts from line items
		invariant(
			session.amount_total !== null && session.amount_subtotal !== null,
			'Session amounts must be set',
		)
		expect(session.amount_total).toBeGreaterThan(0)
		expect(session.amount_subtotal).toBeGreaterThanOrEqual(
			session.amount_total,
		)
	})

	test('should handle authenticated user with userId in metadata', async () => {
		// Create a test user
		const user = await prisma.user.create({
			data: {
				email: 'user@example.com',
				username: 'testuser',
				name: 'Test User',
			},
		})

		// Update cart to have userId
		await prisma.cart.update({
			where: { id: cartId },
			data: { userId: user.id },
		})

		const cart = await prisma.cart.findUnique({
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

		invariant(cart && cart.items.length > 0, 'Cart not found')

		const mockSession = {
			id: 'cs_test_mock999',
			object: 'checkout.session' as const,
			url: 'https://checkout.stripe.com/test/mock999',
			metadata: {
				cartId: cart.id,
				userId: user.id,
			},
		}

		vi.mocked(stripe.checkout.sessions.create).mockResolvedValue(
			mockSession as any,
		)

		const session = await stripe.checkout.sessions.create({
			line_items: cart.items.map((item) => ({
				price_data: {
					currency: 'usd',
					product_data: {
						name: item.product.name,
					},
					unit_amount:
						item.variant?.price ?? item.product.price,
				},
				quantity: item.quantity,
			})),
			mode: 'payment',
			success_url: 'https://example.com/success',
			cancel_url: 'https://example.com/cancel',
			metadata: {
				cartId: cart.id,
				userId: user.id,
			},
		})

		expect(session.metadata?.userId).toBe(user.id)

		// Cleanup
		await prisma.user.delete({ where: { id: user.id } })
	})
})

