/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import * as mondialRelayApi1 from '#app/utils/carriers/mondial-relay-api1.server.ts'
import { consoleError } from '#tests/setup/setup-test-env'
import { loader } from './pickup-points.ts'

// Mock the Mondial Relay API1 client
vi.mock('#app/utils/carriers/mondial-relay-api1.server.ts', () => ({
	searchPickupPoints: vi.fn(),
}))

describe('pickup-points route', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		consoleError.mockImplementation(() => {})
	})

	afterEach(() => {
		consoleError.mockClear()
	})

	test('returns pickup points for valid postal code and country', async () => {
		const mockPickupPoints = [
			{
				id: '12345',
				name: 'Test Pickup Point 1',
				address: '123 Test St',
				postalCode: '75001',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8566,
				longitude: 2.3522,
			},
			{
				id: '67890',
				name: 'Test Pickup Point 2',
				address: '456 Test Ave',
				postalCode: '75001',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8606,
				longitude: 2.3376,
			},
		]

		vi.mocked(mondialRelayApi1.searchPickupPoints).mockResolvedValueOnce(mockPickupPoints)

		const request = new Request('http://localhost:3000/shop/checkout/pickup-points?postalCode=75001&country=FR')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		// data() returns DataWithResponseInit, extract the data property
		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data as { pickupPoints?: Array<{ id: string; name: string }> }
			expect(responseData).toHaveProperty('pickupPoints')
			expect(responseData.pickupPoints).toHaveLength(2)
			if (responseData.pickupPoints && responseData.pickupPoints[0]) {
				expect(responseData.pickupPoints[0].id).toBe('12345')
				expect(responseData.pickupPoints[0].name).toBe('Test Pickup Point 1')
			}
		} else {
			throw new Error('Expected result to have data property')
		}

		expect(mondialRelayApi1.searchPickupPoints).toHaveBeenCalledWith({
			postalCode: '75001',
			country: 'FR',
			city: undefined,
			maxResults: 20,
		})
	})

	test('includes city in search when provided', async () => {
		vi.mocked(mondialRelayApi1.searchPickupPoints).mockResolvedValueOnce([])

		const request = new Request(
			'http://localhost:3000/shop/checkout/pickup-points?postalCode=75001&country=FR&city=Paris',
		)

		await loader({
			request,
			params: {},
			context: {},
		})

		expect(mondialRelayApi1.searchPickupPoints).toHaveBeenCalledWith({
			postalCode: '75001',
			country: 'FR',
			city: 'Paris',
			maxResults: 20,
		})
	})

	test('returns error for missing postal code', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/pickup-points?country=FR')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data
			expect(responseData).toHaveProperty('error', 'Invalid parameters')
			expect(responseData).toHaveProperty('details')
		} else {
			throw new Error('Expected result to have data property')
		}
	})

	test('returns error for invalid country code', async () => {
		const request = new Request('http://localhost:3000/shop/checkout/pickup-points?postalCode=75001&country=F')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data
			expect(responseData).toHaveProperty('error', 'Invalid parameters')
		} else {
			throw new Error('Expected result to have data property')
		}
	})

	test('returns error when API call fails', async () => {
		vi.mocked(mondialRelayApi1.searchPickupPoints).mockRejectedValueOnce(
			new Error('API error'),
		)

		const request = new Request('http://localhost:3000/shop/checkout/pickup-points?postalCode=75001&country=FR')

		const result = await loader({
			request,
			params: {},
			context: {},
		})

		if (typeof result === 'object' && result !== null && 'data' in result) {
			const responseData = result.data
			expect(responseData).toHaveProperty('error', 'Failed to search pickup points')
		} else {
			throw new Error('Expected result to have data property')
		}

		expect(consoleError).toHaveBeenCalled()
	})

	test('uppercases country code', async () => {
		vi.mocked(mondialRelayApi1.searchPickupPoints).mockResolvedValueOnce([])

		const request = new Request('http://localhost:3000/shop/checkout/pickup-points?postalCode=75001&country=fr')

		await loader({
			request,
			params: {},
			context: {},
		})

		expect(mondialRelayApi1.searchPickupPoints).toHaveBeenCalledWith(
			expect.objectContaining({
				country: 'FR',
			}),
		)
	})
})

