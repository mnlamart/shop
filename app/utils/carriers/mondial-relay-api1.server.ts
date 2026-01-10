/**
 * Mondial Relay API1 Client (SOAP)
 * 
 * API1 is used for:
 * - Searching pickup points (Point Relais®)
 * - Tracking shipments
 * 
 * Official Documentation:
 * - WebServices PDF: https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf
 * 
 * API Endpoint: https://api.mondialrelay.com/WebService.asmx
 * 
 * Security Hash Format: MD5(Code Enseigne + Code Marque + Parameters + Clé Privée)
 */

import { createHash } from 'crypto'
import { invariant } from '@epic-web/invariant'
import { XMLParser } from 'fast-xml-parser'

/**
 * Gets the API1 base URL from environment variable or defaults to production
 */
function getApi1BaseUrl(): string {
	return process.env.MONDIAL_RELAY_API1_URL || 'https://api.mondialrelay.com/WebService.asmx'
}

/**
 * Gets environment variables dynamically (for testing support)
 */
function getApi1Credentials() {
	return {
		storeCode: process.env.MONDIAL_RELAY_API1_STORE_CODE,
		privateKey: process.env.MONDIAL_RELAY_API1_PRIVATE_KEY,
		brandCode: process.env.MONDIAL_RELAY_API1_BRAND_CODE,
	}
}

/**
 * Validates that all required API1 credentials are set
 */
function validateApi1Credentials() {
	const { storeCode, privateKey, brandCode } = getApi1Credentials()
	invariant(storeCode, 'MONDIAL_RELAY_API1_STORE_CODE must be set')
	invariant(privateKey, 'MONDIAL_RELAY_API1_PRIVATE_KEY must be set')
	invariant(brandCode, 'MONDIAL_RELAY_API1_BRAND_CODE must be set')
}

/**
 * Generates the security hash for API1 requests
 * Format: MD5(Code Enseigne + Code Marque + Parameters + Clé Privée)
 */
function generateSecurityHash(params: string): string {
	validateApi1Credentials()
	const { storeCode, brandCode, privateKey } = getApi1Credentials()
	const hashString = `${storeCode}${brandCode}${params}${privateKey}`
	return createHash('md5').update(hashString).digest('hex').toUpperCase()
}

/**
 * PointRelais structure from SOAP API response
 */
interface PointRelaisResponse {
	Num?: string | number
	LgAdr1?: string
	LgAdr2?: string
	LgAdr3?: string
	LgAdr4?: string
	CP?: string
	Ville?: string
	Pays?: string
	Latitude?: string | number
	Longitude?: string | number
	Horaires_Lun?: string
	Horaires_Mar?: string
	Horaires_Mer?: string
	Horaires_Jeu?: string
	Horaires_Ven?: string
	Horaires_Sam?: string
	Horaires_Dim?: string
	[key: string]: unknown // Allow other fields
}

/**
 * Pickup point (Point Relais®) information
 */
export interface PickupPoint {
	id: string // Numéro du Point Relais®
	name: string // Nom du point relais
	address: string // Adresse
	postalCode: string // Code postal
	city: string // Ville
	country: string // Pays (code ISO 2 lettres)
	latitude: number
	longitude: number
	distance?: number // Distance in meters (if provided)
	openingHours?: {
		monday?: string
		tuesday?: string
		wednesday?: string
		thursday?: string
		friday?: string
		saturday?: string
		sunday?: string
	}
}

/**
 * Search for pickup points near a location
 * 
 * @param postalCode - Postal code (5 digits for France)
 * @param country - Country code (ISO 2 letters, e.g., "FR")
 * @param city - City name (optional, helps narrow results)
 * @param latitude - Latitude (optional, for distance calculation)
 * @param longitude - Longitude (optional, for distance calculation)
 * @param maxResults - Maximum number of results (default: 10)
 * @returns Array of pickup points
 */
export async function searchPickupPoints({
	postalCode,
	country,
	city,
	latitude,
	longitude,
	maxResults = 10,
	weightGrams = 1000, // Default to 1kg if not specified
	sizeCategory, // Optional: XS, S, M, L, XL, 3XL
}: {
	postalCode: string
	country: string
	city?: string
	latitude?: number
	longitude?: number
	maxResults?: number
	weightGrams?: number // Weight in grams (minimum 15g)
	sizeCategory?: 'XS' | 'S' | 'M' | 'L' | 'XL' | '3XL' // Optional size category
}): Promise<PickupPoint[]> {
	validateApi1Credentials()

	// Ensure minimum weight (15g minimum per Mondial Relay)
	const poids = Math.max(weightGrams, 15)
	
	// Build SOAP request
	const { storeCode } = getApi1Credentials()
	// Parameters for security hash: CP + Pays + Ville only (this is the working method)
	// Note: Taille, Poids, and Action are in the SOAP request but NOT included in the hash
	const params = `${postalCode}${country}${city || ''}`
	const securityHash = generateSecurityHash(params)

	const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${storeCode}</Enseigne>
      <Pays>${country}</Pays>
      <CP>${postalCode}</CP>
      <Ville>${city || ''}</Ville>
      ${sizeCategory ? `<Taille>${sizeCategory}</Taille>` : ''}
      <Poids>${poids}</Poids>
      <Action>24R</Action>
      <Security>${securityHash}</Security>
    </WSI2_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`

	try {
		const response = await fetch(getApi1BaseUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI2_RecherchePointRelais',
			},
			body: soapBody,
		})

		if (!response.ok) {
			throw new Error(`Mondial Relay API1 error: ${response.status} ${response.statusText}`)
		}

		const xmlText = await response.text()
		const pickupPoints = parsePickupPointsResponse(xmlText, latitude, longitude)
		
		// Limit results if maxResults is specified
		return maxResults ? pickupPoints.slice(0, maxResults) : pickupPoints
	} catch (error) {
		console.error('Mondial Relay API1 searchPickupPoints error:', error)
		throw new Error(`Failed to search pickup points: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const R = 6371000 // Earth radius in meters
	const dLat = ((lat2 - lat1) * Math.PI) / 180
	const dLon = ((lon2 - lon1) * Math.PI) / 180
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2)
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
	return R * c
}

/**
 * Parse the SOAP XML response and extract pickup points
 */
function parsePickupPointsResponse(
	xmlText: string,
	latitude?: number,
	longitude?: number,
): PickupPoint[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		textNodeName: '#text',
		parseAttributeValue: false,
		trimValues: true,
	})

	const parsed = parser.parse(xmlText)

	// Navigate through SOAP envelope structure
	const envelope =
		parsed['soap:Envelope'] || parsed['soap:envelope'] || parsed.Envelope
	const body = envelope?.['soap:Body'] || envelope?.Body
	const response =
		body?.['WSI2_RecherchePointRelaisResponse'] ||
		body?.['ws:WSI2_RecherchePointRelaisResponse']
	const result =
		response?.WSI2_RecherchePointRelaisResult ||
		response?.['ws:WSI2_RecherchePointRelaisResult']
	
	// Check status code - non-zero means error
	const status = result?.STAT
	if (status && status !== '0' && status !== 0) {
		console.warn(`Mondial Relay API returned error status: ${status}`)
		return []
	}

	const pointsRelais = result?.PointsRelais || result?.pointsRelais

	// If we have PointsRelais structure, use it
	if (pointsRelais) {
		// Handle both single point and array of points
		const pointRelaisArray = Array.isArray(pointsRelais.PointRelais)
			? pointsRelais.PointRelais
			: pointsRelais.PointRelais
			? [pointsRelais.PointRelais]
			: []
		
		return parsePointRelaisArray(pointRelaisArray, latitude, longitude)
	}

	// Otherwise, try to parse PR01-PR10 structure (used when no results or alternative format)
	const prFields = ['PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR06', 'PR07', 'PR08', 'PR09', 'PR10']
	const prPoints: PointRelaisResponse[] = []
	
	for (const prField of prFields) {
		const pr = result?.[prField] as PointRelaisResponse | undefined
		if (pr && pr.Num && String(pr.Num).trim() !== '') {
			prPoints.push(pr)
		}
	}

	if (prPoints.length > 0) {
		return parsePointRelaisArray(prPoints, latitude, longitude)
	}

	// No results found
	return []
}

/**
 * Parse an array of PointRelais objects into PickupPoint objects
 */
function parsePointRelaisArray(
	pointRelaisArray: PointRelaisResponse[],
	latitude?: number,
	longitude?: number,
): PickupPoint[] {
	const pickupPoints: PickupPoint[] = []

	for (const point of pointRelaisArray) {
		if (!point?.Num || String(point.Num).trim() === '') continue // Skip invalid points

		// Build address from LgAdr1, LgAdr2, LgAdr3
		const addressParts = [
			point.LgAdr1,
			point.LgAdr2,
			point.LgAdr3,
		].filter(Boolean)
		const address = addressParts.join(', ')

		// Parse opening hours
		const openingHours: PickupPoint['openingHours'] = {}
		if (point.Horaires_Lun) openingHours.monday = point.Horaires_Lun
		if (point.Horaires_Mar) openingHours.tuesday = point.Horaires_Mar
		if (point.Horaires_Mer) openingHours.wednesday = point.Horaires_Mer
		if (point.Horaires_Jeu) openingHours.thursday = point.Horaires_Jeu
		if (point.Horaires_Ven) openingHours.friday = point.Horaires_Ven
		if (point.Horaires_Sam) openingHours.saturday = point.Horaires_Sam
		if (point.Horaires_Dim) openingHours.sunday = point.Horaires_Dim

		const pointLat = parseFloat(point.Latitude)
		const pointLon = parseFloat(point.Longitude)

		const pickupPoint: PickupPoint = {
			id: String(point.Num),
			name: point.LgAdr1 || '',
			address,
			postalCode: String(point.CP || ''),
			city: point.Ville || '',
			country: String(point.Pays || ''),
			latitude: pointLat,
			longitude: pointLon,
			openingHours: Object.keys(openingHours).length > 0 ? openingHours : undefined,
		}

		// Calculate distance if user coordinates provided
		if (
			latitude !== undefined &&
			longitude !== undefined &&
			!isNaN(pointLat) &&
			!isNaN(pointLon)
		) {
			pickupPoint.distance = Math.round(
				calculateDistance(latitude, longitude, pointLat, pointLon),
			)
		}

		pickupPoints.push(pickupPoint)
	}

	return pickupPoints
}

/**
 * Get tracking information for a shipment
 * 
 * @param shipmentNumber - Mondial Relay shipment number
 * @returns Tracking information
 */
export async function getTrackingInfo(shipmentNumber: string): Promise<{
	status: string
	statusCode: string
	events: Array<{
		date: Date
		description: string
		location?: string
	}>
}> {
	validateApi1Credentials()

	const { storeCode } = getApi1Credentials()
	const params = shipmentNumber
	const securityHash = generateSecurityHash(params)

	const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_TracingColisDetaille xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${storeCode}</Enseigne>
      <Expedition>${shipmentNumber}</Expedition>
      <Security>${securityHash}</Security>
    </WSI2_TracingColisDetaille>
  </soap:Body>
</soap:Envelope>`

	try {
		const response = await fetch(getApi1BaseUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'SOAPAction': 'http://www.mondialrelay.fr/webservice/WSI2_TracingColisDetaille',
			},
			body: soapBody,
		})

		if (!response.ok) {
			throw new Error(`Mondial Relay API1 error: ${response.status} ${response.statusText}`)
		}

		const xmlText = await response.text()
		return parseTrackingResponse(xmlText)
	} catch (error) {
		console.error('Mondial Relay API1 getTrackingInfo error:', error)
		throw new Error(`Failed to get tracking info: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

/**
 * Parse the SOAP XML tracking response
 */
function parseTrackingResponse(xmlText: string): {
	status: string
	statusCode: string
	events: Array<{
		date: Date
		description: string
		location?: string
	}>
} {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
		textNodeName: '#text',
		parseAttributeValue: false,
		trimValues: true,
	})

	const parsed = parser.parse(xmlText)

	// Navigate through SOAP envelope structure
	const envelope =
		parsed['soap:Envelope'] || parsed['soap:envelope'] || parsed.Envelope
	const body = envelope?.['soap:Body'] || envelope?.Body
	const response =
		body?.['WSI2_TracingColisDetailleResponse'] ||
		body?.['ws:WSI2_TracingColisDetailleResponse']
	const result =
		response?.WSI2_TracingColisDetailleResult ||
		response?.['ws:WSI2_TracingColisDetailleResult']

	if (!result) {
		return {
			status: 'Unknown',
			statusCode: '0',
			events: [],
		}
	}

	// Check for error status
	const stat = result.Stat || result.stat || '0'
	const libelle = result.Libelle || result.libelle || 'Unknown'

	// If error status (non-zero), return error info
	if (stat !== '0') {
		return {
			status: libelle,
			statusCode: String(stat),
			events: [],
		}
	}

	// Parse tracking details
	const tracing = result.Tracing || result.tracing
	if (!tracing) {
		return {
			status: libelle,
			statusCode: String(stat),
			events: [],
		}
	}

	const status = tracing.Libelle || tracing.libelle || 'Unknown'
	const statusCode = tracing.Statut || tracing.statut || '0'

	// Parse events
	const events: Array<{
		date: Date
		description: string
		location?: string
	}> = []

	const eventList = tracing.EventList || tracing.eventList
	if (eventList) {
		const eventArray = Array.isArray(eventList.Event)
			? eventList.Event
			: eventList.Event
			? [eventList.Event]
			: []

		for (const event of eventArray) {
			if (!event?.Date || !event?.Libelle) continue

			// Parse date and time
			const dateStr = event.Date || ''
			const timeStr = event.Heure || '00:00'
			const dateTimeStr = `${dateStr}T${timeStr}:00`

			let eventDate: Date
			try {
				// Try parsing as ISO format first
				eventDate = new Date(dateTimeStr)
				// If invalid, try parsing date separately
				if (isNaN(eventDate.getTime())) {
					// Try YYYY-MM-DD format
					const [year, month, day] = dateStr.split('-').map(Number)
					const [hours, minutes] = timeStr.split(':').map(Number)
					eventDate = new Date(year, month - 1, day, hours || 0, minutes || 0)
				}
			} catch {
				// Fallback to current date if parsing fails
				eventDate = new Date()
			}

			events.push({
				date: eventDate,
				description: event.Libelle || '',
				location: event.Localisation || event.localisation || undefined,
			})
		}
	}

	return {
		status,
		statusCode: String(statusCode),
		events,
	}
}

