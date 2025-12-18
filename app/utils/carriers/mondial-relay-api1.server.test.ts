/**
 * @vitest-environment node
 */
import * as Sentry from '@sentry/react-router'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { searchPickupPoints } from './mondial-relay-api1.server.ts'

// Mock Sentry
vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
}))

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Note: We don't mock crypto - we test the actual hash generation
// The hash will be different each time, but we can verify it's present in the SOAP body

describe('mondial-relay-api1.server', () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		vi.clearAllMocks()
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
    <WSI3_PointRelais_RechercheResponse>
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais>
          <PointRelais_Details>
            <Num>12345</Num>
            <LgAdr1>Test Address 1</LgAdr1>
            <LgAdr2>Test Address 2</LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
          </PointRelais_Details>
        </PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
  </soap:Body>
</soap:Envelope>`,
			})

			await searchPickupPoints({
				postalCode: '75001',
				country: 'FR',
				city: 'Paris',
				latitude: 48.8566,
				longitude: 2.3522,
			})

			expect(mockFetch).toHaveBeenCalledTimes(1)
			const call = mockFetch.mock.calls[0]
			expect(call).toBeDefined()
			if (!call) throw new Error('Expected call to be defined')
			expect(call[0]).toBe('https://api.mondialrelay.com/WebService.asmx')
			expect(call[1]?.method).toBe('POST')
			expect(call[1]?.headers['Content-Type']).toBe('text/xml; charset=utf-8')
			expect(call[1]?.headers['SOAPAction']).toBe(
				'"http://www.mondialrelay.fr/webservice/WSI3_PointRelais_Recherche"',
			)

			const soapBody = call[1]?.body as string
			expect(soapBody).toBeDefined()
			expect(typeof soapBody).toBe('string')
			// Enseigne is padded to 8 characters, so it will be "TEST_STO" (8 chars) or "TEST_STORE" padded
			expect(soapBody).toMatch(/<Enseigne>TEST_STO[\w\s]{0,2}<\/Enseigne>/)
			expect(soapBody).toContain('<Pays>FR</Pays>')
			expect(soapBody).toContain('<CP>75001</CP>')
			expect(soapBody).toContain('<Ville>Paris</Ville>')
			expect(soapBody).toContain('<Taille></Taille>') // Taille should be empty for pickup point search
			expect(soapBody).toContain('<Security>')
		})

		test('generates correct SOAP request without optional parameters', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI3_PointRelais_RechercheResponse>
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais></PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
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
			expect(soapBody).toContain('<Taille></Taille>') // Taille should be empty for pickup point search
		})

		test('generates security hash correctly', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				text: async () => `<?xml version="1.0"?>
<soap:Envelope>
  <soap:Body>
    <WSI3_PointRelais_RechercheResponse>
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais></PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
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

			// Verify Sentry.captureException was called
			expect(Sentry.captureException).toHaveBeenCalled()
		})

		test('throws error when fetch fails', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'))

			await expect(
				searchPickupPoints({
					postalCode: '75001',
					country: 'FR',
				}),
			).rejects.toThrow(/Failed to search pickup points|Network error/)

			// Verify Sentry.captureException was called
			expect(Sentry.captureException).toHaveBeenCalled()
		})

		test('parses XML response and returns pickup points', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI3_PointRelais_RechercheResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais>
          <PointRelais_Details>
            <Num>12345</Num>
            <LgAdr1>123 Rue de Test</LgAdr1>
            <LgAdr2>Bâtiment A</LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
            <Horaires_Lundi>
              <string>0900</string>
              <string>1200</string>
              <string>1400</string>
              <string>1800</string>
            </Horaires_Lundi>
            <Horaires_Mardi>
              <string>0900</string>
              <string>1200</string>
              <string>1400</string>
              <string>1800</string>
            </Horaires_Mardi>
            <Horaires_Mercredi>
              <string>0900</string>
              <string>1200</string>
              <string>1400</string>
              <string>1800</string>
            </Horaires_Mercredi>
            <Horaires_Jeudi>
              <string>0900</string>
              <string>1200</string>
              <string>1400</string>
              <string>1800</string>
            </Horaires_Jeudi>
            <Horaires_Vendredi>
              <string>0900</string>
              <string>1200</string>
              <string>1400</string>
              <string>1800</string>
            </Horaires_Vendredi>
            <Horaires_Samedi>
              <string>0900</string>
              <string>1200</string>
            </Horaires_Samedi>
          </PointRelais_Details>
          <PointRelais_Details>
            <Num>67890</Num>
            <LgAdr1>456 Avenue Example</LgAdr1>
            <LgAdr2></LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75002</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8606</Latitude>
            <Longitude>2.3376</Longitude>
            <Horaires_Lundi>
              <string>0800</string>
              <string>1900</string>
            </Horaires_Lundi>
          </PointRelais_Details>
        </PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
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
			// Note: WSI3 uses full day names (Horaires_Lundi, Horaires_Mardi, etc.)
			// Opening hours are parsed as arrays: [OpenAM, CloseAM, OpenPM, ClosePM]
			expect(result[0]?.openingHours).toBeDefined()
			expect(result[0]?.openingHours?.monday).toBe('0900-1200')
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
			// Opening hours format: OpenAM-CloseAM (if only 2 times) or OpenAM-CloseAM,OpenPM-ClosePM (if 4 times)
			expect(result[1]?.openingHours?.monday).toBe('0800-1900')
		})

		test('parses XML response with empty PointsRelais', async () => {
			const xmlResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI3_PointRelais_RechercheResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais></PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
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
    <WSI3_PointRelais_RechercheResponse xmlns="http://www.mondialrelay.fr/webservice/">
      <WSI3_PointRelais_RechercheResult>
        <PointsRelais>
          <PointRelais_Details>
            <Num>12345</Num>
            <LgAdr1>123 Rue de Test</LgAdr1>
            <LgAdr2></LgAdr2>
            <LgAdr3></LgAdr3>
            <CP>75001</CP>
            <Ville>Paris</Ville>
            <Pays>FR</Pays>
            <Latitude>48.8566</Latitude>
            <Longitude>2.3522</Longitude>
          </PointRelais_Details>
        </PointsRelais>
      </WSI3_PointRelais_RechercheResult>
    </WSI3_PointRelais_RechercheResponse>
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
})

