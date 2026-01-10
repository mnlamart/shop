/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import {
	createShipment,
	getLabel,
	type ShipmentRequest,
} from './mondial-relay-api2.server.ts'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('mondial-relay-api2.server', () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		vi.clearAllMocks()
		// Mock console.error to not throw (since we expect it to be called in error cases)
		consoleError.mockImplementation(() => {})
		// Set required environment variables before each test
		process.env.MONDIAL_RELAY_API2_LOGIN = 'TEST_LOGIN'
		process.env.MONDIAL_RELAY_API2_PASSWORD = 'TEST_PASSWORD'
		process.env.MONDIAL_RELAY_API2_CUSTOMER_ID = 'TEST123'
	})

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv }
	})

	describe('createShipment', () => {
		test('throws error when API credentials are missing', async () => {
			// Need to reload module after changing env vars
			delete process.env.MONDIAL_RELAY_API2_LOGIN
			vi.resetModules()
			const { createShipment: createShipmentReloaded } = await import('./mondial-relay-api2.server.ts')

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: '12345',
				pickupPointCountry: 'FR',
				weight: 1000, // grams
				reference: 'TEST-REF-001',
			}

			await expect(createShipmentReloaded(shipmentRequest)).rejects.toThrow(
				'MONDIAL_RELAY_API2_LOGIN must be set',
			)
		})

		test('generates correct XML request for shipment creation', async () => {
			const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
	<ShipmentsList>
		<Shipment ShipmentNumber="123456789">
			<Output>https://www.mondialrelay.fr/label/123456789</Output>
		</Shipment>
	</ShipmentsList>
</ShipmentCreationResponse>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => mockXmlResponse,
			})

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: '12345',
				pickupPointCountry: 'FR',
				weight: 1000,
				reference: 'TEST-REF-001',
			}

			await createShipment(shipmentRequest)

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[0]).toContain('mondialrelay.fr')
			expect(call[0]).toContain('/shipment')
			expect(call[1]?.method).toBe('POST')
			expect(call[1]?.headers['Content-Type']).toBe('text/xml; charset=utf-8')
			expect(call[1]?.headers['Accept']).toBe('application/xml')

			const requestBody = call[1]?.body as string
			expect(requestBody).toContain('<?xml version="1.0" encoding="UTF-8"?>')
			expect(requestBody).toContain('<ShipmentCreationRequest')
			expect(requestBody).toContain('<Login>TEST_LOGIN</Login>')
			expect(requestBody).toContain('<Password>TEST_PASSWORD</Password>')
			expect(requestBody).toContain('<CustomerId>TEST123</CustomerId>')
			expect(requestBody).toContain('Location="FR-12345"')
			expect(requestBody).toContain('<Weight Value="1000" Unit="gr"></Weight>')
			expect(requestBody).toContain('<OrderNo>TEST-REF-001</OrderNo>')
			expect(requestBody).toContain('Point Relais: 12345')
		})

		test('returns shipment number and label URL on success', async () => {
			const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
	<ShipmentsList>
		<Shipment ShipmentNumber="123456789">
			<Output>https://www.mondialrelay.fr/label/123456789</Output>
		</Shipment>
	</ShipmentsList>
</ShipmentCreationResponse>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => mockXmlResponse,
			})

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: '12345',
				pickupPointCountry: 'FR',
				weight: 1000,
				reference: 'TEST-REF-001',
			}

			const result = await createShipment(shipmentRequest)

			expect(result).toHaveProperty('shipmentNumber', '123456789')
			expect(result).toHaveProperty('labelUrl', 'https://www.mondialrelay.fr/label/123456789')
			expect(result).toHaveProperty('statusCode', '0')
		})

		test('throws error when API returns error status', async () => {
			const mockXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationResponse xmlns="http://www.example.org/Response">
	<StatusList>
		<Status Code="10034" Level="Error" Message="Invalid pickup point" />
	</StatusList>
</ShipmentCreationResponse>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				headers: new Headers({ 'content-type': 'application/xml' }),
				text: async () => mockXmlResponse,
			})

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: 'INVALID',
				pickupPointCountry: 'FR',
				weight: 1000,
				reference: 'TEST-REF-001',
			}

			await expect(createShipment(shipmentRequest)).rejects.toThrow(/Mondial Relay API2 error.*Invalid pickup point/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('throws error when API returns non-OK HTTP response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: async () => 'Internal Server Error',
			})

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: '12345',
				pickupPointCountry: 'FR',
				weight: 1000,
				reference: 'TEST-REF-001',
			}

			await expect(createShipment(shipmentRequest)).rejects.toThrow(/Failed to create shipment|Mondial Relay API2 error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('throws error when fetch fails', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			const shipmentRequest: ShipmentRequest = {
				shipper: {
					name: 'Test Shipper',
					address: '123 Test St',
					city: 'Paris',
					postalCode: '75001',
					country: 'FR',
					phone: '+33123456789',
					email: 'shipper@test.com',
				},
				recipient: {
					name: 'Test Recipient',
					address: '456 Test Ave',
					city: 'Lyon',
					postalCode: '69001',
					country: 'FR',
					phone: '+33987654321',
					email: 'recipient@test.com',
				},
				pickupPointId: '12345',
				pickupPointCountry: 'FR',
				weight: 1000,
				reference: 'TEST-REF-001',
			}

			await expect(createShipment(shipmentRequest)).rejects.toThrow(/Failed to create shipment|Network error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})
	})

	describe('getLabel', () => {
		test('throws error when API credentials are missing', async () => {
			delete process.env.MONDIAL_RELAY_API2_LOGIN
			vi.resetModules()
			const { getLabel: getLabelReloaded } = await import('./mondial-relay-api2.server.ts')

			await expect(getLabelReloaded('123456789')).rejects.toThrow('MONDIAL_RELAY_API2_LOGIN must be set')
		})

		test('generates correct REST API request for label retrieval', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				blob: async () => new Blob(['PDF content'], { type: 'application/pdf' }),
			})

			await getLabel('123456789')

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[0]).toContain('mondialrelay.fr')
			expect(call[0]).toContain('123456789')
			expect(call[1]?.method).toBe('GET')
		})

		test('returns label blob on success', async () => {
			const mockBlob = new Blob(['PDF content'], { type: 'application/pdf' })
			mockFetch.mockResolvedValueOnce({
				ok: true,
				blob: async () => mockBlob,
			})

			const result = await getLabel('123456789')

			expect(result).toBeInstanceOf(Blob)
			expect(result.type).toBe('application/pdf')
		})

		test('throws error when API returns non-OK response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
			})

			await expect(getLabel('INVALID')).rejects.toThrow(/Failed to get label|Mondial Relay API2 error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('throws error when fetch fails', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			await expect(getLabel('123456789')).rejects.toThrow(/Failed to get label|Network error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})
	})
})
