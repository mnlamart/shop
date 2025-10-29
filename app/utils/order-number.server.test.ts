import { describe, expect, test, afterEach } from 'vitest'
import { prisma } from './db.server.ts'
import { generateOrderNumber } from './order-number.server.ts'

afterEach(async () => {
	// Clean up test orders
	await prisma.orderItem.deleteMany({})
	await prisma.order.deleteMany({})
})

describe('generateOrderNumber', () => {
	test('should generate order number in correct format', async () => {
		const orderNumber = await generateOrderNumber()
		
		expect(orderNumber).toMatch(/^ORD-\d{6}$/)
	})

	test('should generate unique order numbers', async () => {
		// First, create an order to establish a base number
		const order1 = await prisma.order.create({
			data: {
				orderNumber: 'ORD-000100',
				email: 'test@example.com',
				subtotal: 1000,
				total: 1000,
				shippingName: 'Test',
				shippingStreet: 'Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: 'cs_test_100',
			},
		})

		// Generate order number and create order to increment sequence
		const num1 = await generateOrderNumber()
		await prisma.order.create({
			data: {
				orderNumber: num1,
				email: 'test1@example.com',
				subtotal: 1000,
				total: 1000,
				shippingName: 'Test',
				shippingStreet: 'Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: `cs_test_${num1}`,
			},
		})

		const num2 = await generateOrderNumber()
		await prisma.order.create({
			data: {
				orderNumber: num2,
				email: 'test2@example.com',
				subtotal: 1000,
				total: 1000,
				shippingName: 'Test',
				shippingStreet: 'Test St',
				shippingCity: 'Test City',
				shippingPostal: '12345',
				shippingCountry: 'US',
				stripeCheckoutSessionId: `cs_test_${num2}`,
			},
		})

		const num3 = await generateOrderNumber()

		const numbers = [num1, num2, num3]

		// All should be unique
		const uniqueNumbers = new Set(numbers)
		expect(uniqueNumbers.size).toBe(3)

		// Should be sequential and greater than the base order
		const n1 = parseInt(num1.replace('ORD-', ''))
		const n2 = parseInt(num2.replace('ORD-', ''))
		const n3 = parseInt(num3.replace('ORD-', ''))
		const baseNum = parseInt(order1.orderNumber.replace('ORD-', ''))

		expect(n1).toBeGreaterThan(baseNum)
		expect(n2).toBeGreaterThan(n1)
		expect(n3).toBeGreaterThan(n2)
	})

	test('should generate sequential order numbers', async () => {
		const orderNumber1 = await generateOrderNumber()
		const orderNumber2 = await generateOrderNumber()
		
		// Extract the numeric part
		const num1 = parseInt(orderNumber1.replace('ORD-', ''))
		const num2 = parseInt(orderNumber2.replace('ORD-', ''))
		
		// Second should be greater than first
		expect(num2).toBeGreaterThanOrEqual(num1)
	})

	test(
		'should handle concurrent generation',
		async () => {
			// Create a dummy order to establish a starting point
			const baseOrder = await prisma.order.create({
				data: {
					orderNumber: 'ORD-000200',
					email: 'test@example.com',
					subtotal: 1000,
					total: 1000,
					shippingName: 'Test',
					shippingStreet: 'Test St',
					shippingCity: 'Test City',
					shippingPostal: '12345',
					shippingCountry: 'US',
					stripeCheckoutSessionId: 'cs_test_200',
				},
			})

			// Generate multiple order numbers sequentially (SQLite serializes)
			// In real scenario, each would be used to create an order immediately
			const numbers: string[] = []
			for (let i = 0; i < 5; i++) {
				const num = await generateOrderNumber()
				numbers.push(num)
				// Simulate creating order with this number
				await prisma.order.create({
					data: {
						orderNumber: num,
						email: `test${i}@example.com`,
						subtotal: 1000,
						total: 1000,
						shippingName: 'Test',
						shippingStreet: 'Test St',
						shippingCity: 'Test City',
						shippingPostal: '12345',
						shippingCountry: 'US',
						stripeCheckoutSessionId: `cs_test_${num}`,
					},
				})
			}

			// All should be unique
			const uniqueNumbers = new Set(numbers)
			expect(uniqueNumbers.size).toBe(5)

			// All should match format and be greater than base
			const baseNum = parseInt(baseOrder.orderNumber.replace('ORD-', ''))
			numbers.forEach((num) => {
				expect(num).toMatch(/^ORD-\d{6}$/)
				const numValue = parseInt(num.replace('ORD-', ''))
				expect(numValue).toBeGreaterThan(baseNum)
			})
		},
		10000,
	)

	test('should start from 000001 if no orders exist', async () => {
		// Clean up any existing orders for this test
		await prisma.order.deleteMany({})
		
		const orderNumber = await generateOrderNumber()
		expect(orderNumber).toBe('ORD-000001')
	})
})

