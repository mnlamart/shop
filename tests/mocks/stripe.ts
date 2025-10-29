import { faker } from '@faker-js/faker'
import { HttpResponse, http } from 'msw'

function requireHeader(headers: Headers, header: string) {
	const value = headers.get(header)
	if (!value) {
		throw new Error(`Missing required header: ${header}`)
	}
	return value
}

function parseLineItems(formData: FormData): Array<{
	amount_total: number
	amount_subtotal: number
}> {
	// Stripe sends line items as form-encoded array: line_items[0][price_data][unit_amount]
	const lineItems: Array<{ unit_amount: number; quantity: number }> = []
	let index = 0

	while (formData.has(`line_items[${index}][price_data][unit_amount]`)) {
		const unitAmount = Number(
			formData.get(`line_items[${index}][price_data][unit_amount]`),
		)
		const quantity = Number(formData.get(`line_items[${index}][quantity]`)) || 1
		lineItems.push({ unit_amount: unitAmount, quantity })
		index++
	}

	// Calculate totals from line items
	const amount_subtotal = lineItems.reduce(
		(sum, item) => sum + item.unit_amount * item.quantity,
		0,
	)

	return [{ amount_total: amount_subtotal, amount_subtotal }]
}

export const handlers = [
	// Mock Checkout Session creation
	http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
		requireHeader(request.headers, 'Authorization')
		const body = await request.formData()

		// Parse line items to calculate amounts (Stripe does this server-side)
		const totals = parseLineItems(body)
		const amount_subtotal = totals[0]?.amount_subtotal || 0
		const amount_total = totals[0]?.amount_total || 0

		// Build metadata object from form data
		const metadata: Record<string, string> = {}
		for (const [key, value] of body.entries()) {
			if (key.startsWith('metadata[') && key.endsWith(']')) {
				const metaKey = key.slice(9, -1) // Remove 'metadata[' and ']'
				metadata[metaKey] = String(value)
			}
		}

		return HttpResponse.json({
			id: `cs_test_${faker.string.alphanumeric(24)}`,
			object: 'checkout.session',
			url: `https://checkout.stripe.com/test/${faker.string.alphanumeric(24)}`,
			status: 'open',
			payment_intent: `pi_test_${faker.string.alphanumeric(24)}`,
			amount_total,
			amount_subtotal,
			customer_email: body.get('customer_email') || '',
			metadata: Object.keys(metadata).length > 0 ? metadata : {},
		})
	}),

	// Mock Checkout Session retrieval
	http.get('https://api.stripe.com/v1/checkout/sessions/:id', async ({ request }) => {
		requireHeader(request.headers, 'Authorization')
		const id = request.url.split('/').pop()?.split('?')[0]

		return HttpResponse.json({
			id: id || `cs_test_${faker.string.alphanumeric(24)}`,
			object: 'checkout.session',
			status: 'complete',
			payment_status: 'paid',
			payment_intent: `pi_test_${faker.string.alphanumeric(24)}`,
			customer_email: 'test@example.com',
			amount_total: 10000,
			amount_subtotal: 10000,
			metadata: {},
		})
	}),

	// Mock refund creation
	http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
		requireHeader(request.headers, 'Authorization')
		const body = await request.formData()

		return HttpResponse.json({
			id: `re_${faker.string.alphanumeric(24)}`,
			object: 'refund',
			amount: Number(body.get('amount')),
			status: 'succeeded',
			payment_intent: body.get('payment_intent') || '',
			reason: body.get('reason') || 'requested_by_customer',
		})
	}),

	// Mock webhook signature verification
	// Note: Actual webhook testing should use Stripe CLI or test mode
]

