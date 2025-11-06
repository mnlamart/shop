/**
 * @vitest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { consoleError } from '#tests/setup/setup-test-env'
import { searchPickupPoints, getTrackingInfo } from './mondial-relay-api1.server.ts'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Note: We don't mock crypto - we test the actual hash generation
// The hash will be different each time, but we can verify it's present in the SOAP body

describe('mondial-relay-api1.server', () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		vi.clearAllMocks()
		// Mock console.error to not throw (since we expect it to be called in error cases)
		consoleError.mockImplementation(() => {})
		// Set required environment variables before each test
		process.env.MONDIAL_RELAY_API1_STORE_CODE = 'TEST_STORE'
		process.env.MONDIAL_RELAY_API1_PRIVATE_KEY = 'TEST_PRIVATE_KEY'
		process.env.MONDIAL_RELAY_API1_BRAND_CODE = 'TEST_BRAND'
	})

	afterEach(() => {
		// Restore original environment
		process.env = { ...originalEnv }
	})

	describe('searchPickupPoints', () => {
		test('throws error when API credentials are missing', async () => {
			// Need to reload module after changing env vars
			delete process.env.MONDIAL_RELAY_API1_STORE_CODE
			vi.resetModules()
			const { searchPickupPoints: searchPickupPointsReloaded } = await import('./mondial-relay-api1.server.ts')

			await expect(
				searchPickupPointsReloaded({
					postalCode: '75001',
					country: 'FR',
				}),
			).rejects.toThrow('MONDIAL_RELAY_API1_STORE_CODE must be set')
		})

		test('generates correct SOAP request with all parameters', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse>
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais>
          <PointRelais>
            <Num>12345</Num>
            <LgAdr1>Test Address 1</LgAdr1>
            <LgAdr2>Test Address 2</LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
          </PointRelais>
        </PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`,
			})

			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
				city: 'Paris',
				latitude: 48.8566,
				longitude: 2.3522,
				maxResults: 5,
			})

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[0]).toBe('https://www.mondialrelay.fr/WebService/Web_Services.asmx')
			expect(call[1]?.method).toBe('POST')
			expect(call[1]?.headers['Content-Type']).toBe('text/xml; charset=utf-8')
			expect(call[1]?.headers['SOAPAction']).toBe(
				'http://www.mondialrelay.fr/webservice/WSI2_RecherchePointRelais',
			)

			const soapBody = call[1]?.body
			expect(soapBody).toContain('<Enseigne>TEST_STORE</Enseigne>')
			expect(soapBody).toContain('<Pays>FR</Pays>')
			expect(soapBody).toContain('<CP>75001</CP>')
			expect(soapBody).toContain('<Ville>Paris</Ville>')
			expect(soapBody).toContain('<Taille>5</Taille>')
			expect(soapBody).toContain('<Security>')
		})

		test('generates correct SOAP request without optional parameters', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse>
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais></PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`,
			})

			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			})

			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			const soapBody = call[1]?.body
			expect(soapBody).toContain('<Ville></Ville>')
			expect(soapBody).toContain('<Taille>10</Taille>') // Default maxResults
		})

		test('generates security hash correctly', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse>
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais></PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`,
			})

			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
				city: 'Paris',
			})

			// Verify security hash is present in SOAP body (32 char hex string)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			const soapBody = call[1]?.body
			expect(soapBody).toMatch(/<Security>[A-F0-9]{32}<\/Security>/)
		})

		test('throws error when API returns non-OK response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
			})

			await expect(
				searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}),
			).rejects.toThrow(/Failed to search pickup points|Mondial Relay API1 error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('throws error when fetch fails', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			await expect(
				searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}),
			).rejects.toThrow(/Failed to search pickup points|Network error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('parses XML response and returns pickup points', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais>
          <PointRelais>
            <Num>12345</Num>
            <LgAdr1>123 Rue de Test</LgAdr1>
            <LgAdr2>Bâtiment A</LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
            <Horaires_Lun>0900-1200,1400-1800</Horaires_Lun>
            <Horaires_Mar>0900-1200,1400-1800</Horaires_Mar>
            <Horaires_Mer>0900-1200,1400-1800</Horaires_Mer>
            <Horaires_Jeu>0900-1200,1400-1800</Horaires_Jeu>
            <Horaires_Ven>0900-1200,1400-1800</Horaires_Ven>
            <Horaires_Sam>0900-1200</Horaires_Sam>
            <Horaires_Dim></Horaires_Dim>
          </PointRelais>
          <PointRelais>
            <Num>67890</Num>
            <LgAdr1>456 Avenue Example</LgAdr1>
            <LgAdr2></LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75002</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8606</Latitude>
            <Longitude>2.3376</Longitude>
            <Horaires_Lun>0800-1900</Horaires_Lun>
          </PointRelais>
        </PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			const result = await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			})

			expect(Array.isArray(result)).toBe(true)
			expect(result).toHaveLength(2)

			// Verify first pickup point
			expect(result[0]).toMatchObject({
				id: '12345',
				name: '123 Rue de Test',
				address: '123 Rue de Test, Bâtiment A',
				postalCode: '75001',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8566,
				longitude: 2.3522,
			})
			expect(result[0]?.openingHours).toMatchObject({
				monday: '0900-1200,1400-1800',
				tuesday: '0900-1200,1400-1800',
				wednesday: '0900-1200,1400-1800',
				thursday: '0900-1200,1400-1800',
				friday: '0900-1200,1400-1800',
				saturday: '0900-1200',
			})
			expect(result[0]?.openingHours?.sunday).toBeUndefined()

			// Verify second pickup point
			expect(result[1]).toMatchObject({
				id: '67890',
				name: '456 Avenue Example',
				address: '456 Avenue Example',
				postalCode: '75002',
				city: 'Paris',
				country: 'FR',
				latitude: 48.8606,
				longitude: 2.3376,
			})
			expect(result[1]?.openingHours?.monday).toBe('0800-1900')
		})

		test('parses XML response with empty PointsRelais', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais></PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			const result = await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
			})

			expect(Array.isArray(result)).toBe(true)
			expect(result).toHaveLength(0)
		})

		test('calculates distance when latitude and longitude are provided', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelaisResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_RecherchePointRelaisResult>
        <PointsRelais>
          <PointRelais>
            <Num>12345</Num>
            <LgAdr1>123 Rue de Test</LgAdr1>
            <LgAdr2></LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
          </PointRelais>
        </PointsRelais>
      </WSI2_RecherchePointRelaisResult>
    </WSI2_RecherchePointRelaisResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			// Search from a nearby location (about 1km away)
			const result = await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
				latitude: 48.8656, // ~1km north
				longitude: 2.3522, // Same longitude
			})

			expect(result).toHaveLength(1)
			expect(result[0]?.distance).toBeDefined()
			expect(typeof result[0]?.distance).toBe('number')
			// Distance should be approximately 1000 meters (1km)
			expect(result[0]?.distance).toBeGreaterThan(900)
			expect(result[0]?.distance).toBeLessThan(1100)
		})
	})

	describe('getTrackingInfo', () => {
		test('throws error when API credentials are missing', async () => {
			// Need to reload module after changing env vars
			delete process.env.MONDIAL_RELAY_API1_PRIVATE_KEY
			vi.resetModules()
			const { getTrackingInfo: getTrackingInfoReloaded } = await import('./mondial-relay-api1.server.ts')

			await expect(getTrackingInfoReloaded('123456789')).rejects.toThrow(
				'MONDIAL_RELAY_API1_PRIVATE_KEY must be set',
			)
		})

		test('generates correct SOAP request for tracking', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI2_TracingColisDetailleResponse>
      <WSI2_TracingColisDetailleResult>
        <Stat>0</Stat>
        <Libelle>En cours de traitement</Libelle>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`,
			})

			await getTrackingInfo('123456789')

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[1]?.headers['SOAPAction']).toBe(
				'http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille',
			)

			const soapBody = call[1]?.body
			expect(soapBody).toContain('<Enseigne>TEST_STORE</Enseigne>')
			expect(soapBody).toContain('<Expedition>123456789</Expedition>')
			expect(soapBody).toContain('<Security>')
		})

		test('throws error when API returns non-OK response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: 'Not Found',
			})

			await expect(getTrackingInfo('123456789')).rejects.toThrow(/Failed to get tracking info|Mondial Relay API1 error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('throws error when fetch fails', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			await expect(getTrackingInfo('123456789')).rejects.toThrow(/Failed to get tracking info|Network error/)

			// Verify console.error was called
			expect(consoleError).toHaveBeenCalled()
		})

		test('parses XML response and returns tracking info', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <Stat>0</Stat>
        <Libelle>En cours de traitement</Libelle>
        <Relais_Num>12345</Relais_Num>
        <Relais_Pays>FR</Relais_Pays>
        <Tracing>
          <Libelle>En cours de livraison</Libelle>
          <Statut>LI</Statut>
          <EventList>
            <Event>
              <Date>2023-01-01</Date>
              <Heure>10:00</Heure>
              <Libelle>Prise en charge</Libelle>
              <Localisation>AGENCE PARIS</Localisation>
            </Event>
            <Event>
              <Date>2023-01-02</Date>
              <Heure>14:30</Heure>
              <Libelle>En transit</Libelle>
              <Localisation>HUB LYON</Localisation>
            </Event>
            <Event>
              <Date>2023-01-03</Date>
              <Heure>09:15</Heure>
              <Libelle>Arrivé au point relais</Libelle>
              <Localisation>POINT RELAIS PARIS</Localisation>
            </Event>
          </EventList>
        </Tracing>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			const result = await getTrackingInfo('123456789')

			expect(result).toHaveProperty('status')
			expect(result).toHaveProperty('statusCode')
			expect(result).toHaveProperty('events')
			expect(Array.isArray(result.events)).toBe(true)

			expect(result.status).toBe('En cours de livraison')
			expect(result.statusCode).toBe('LI')
			expect(result.events).toHaveLength(3)

			// Verify first event
			expect(result.events[0]).toMatchObject({
				description: 'Prise en charge',
				location: 'AGENCE PARIS',
			})
			expect(result.events[0]?.date).toBeInstanceOf(Date)
			expect(result.events[0]?.date.toISOString()).toContain('2023-01-01')

			// Verify second event
			expect(result.events[1]).toMatchObject({
				description: 'En transit',
				location: 'HUB LYON',
			})

			// Verify third event
			expect(result.events[2]).toMatchObject({
				description: 'Arrivé au point relais',
				location: 'POINT RELAIS PARIS',
			})
		})

		test('parses XML response with error status', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <Stat>1</Stat>
        <Libelle>Numéro d'expédition invalide</Libelle>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			const result = await getTrackingInfo('invalid')

			expect(result.statusCode).toBe('1')
			expect(result.status).toBe("Numéro d'expédition invalide")
			expect(result.events).toHaveLength(0)
		})

		test('parses XML response with empty event list', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetailleResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI2_TracingColisDetailleResult>
        <Stat>0</Stat>
        <Libelle>OK</Libelle>
        <Tracing>
          <Libelle>En attente</Libelle>
          <Statut>AT</Statut>
          <EventList></EventList>
        </Tracing>
      </WSI2_TracingColisDetailleResult>
    </WSI2_TracingColisDetailleResponse>
  </soap:Body>
</soap:Envelope>`

			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => xmlResponse,
			})

			const result = await getTrackingInfo('123456789')

			expect(result.status).toBe('En attente')
			expect(result.statusCode).toBe('AT')
			expect(result.events).toHaveLength(0)
		})
	})
})

