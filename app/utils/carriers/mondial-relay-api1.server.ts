/**
 * Mondial Relay API1 Client (SOAP)
 * 
 * API1 is used for:
 * - Searching pickup points (Point Relais®)
 * 
 * Documentation: https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf
 */

import { createHash } from 'crypto'
import { invariant } from '@epic-web/invariant'
import * as Sentry from '@sentry/react-router'
import { XMLParser } from 'fast-xml-parser'

// API endpoints
// Official API endpoint: https://api.mondialrelay.com/WebService.asmx
const API1_BASE_URL = 'https://api.mondialrelay.com/WebService.asmx'

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
 * Note: brandCode is not currently used (WSI3 doesn't require it in hash), but kept for potential future use
 */
function validateApi1Credentials() {
	const { storeCode, privateKey } = getApi1Credentials()
	invariant(storeCode, 'MONDIAL_RELAY_API1_STORE_CODE must be set')
	invariant(privateKey, 'MONDIAL_RELAY_API1_PRIVATE_KEY must be set')
}

/**
 * Generates the security hash for WSI3_PointRelais_Recherche (official method)
 * Based on official Mondial Relay example code
 * Format: MD5(Enseigne + Pays + Ville + CP + Taille + Poids + Action + RayonRecherche + TypeActivite + DelaiEnvoi + Clé Privée)
 * Note: All parameter values are concatenated in order, then private key is appended
 * The official PHP code uses utf8_decode(), but for most cases UTF-8 encoding works the same
 */
function generateSecurityHashForWSI3(paramsString: string, privateKey: string): string {
	if (!privateKey) {
		throw new Error('Missing private key for hash generation')
	}
	
	const trimmedPrivateKey = privateKey.trim()
	
	// Build hash string: All parameter values + Clé Privée
	// Based on official example: concatenate all params, then append secret key
	const hashString = `${paramsString}${trimmedPrivateKey}`
	
	// Generate MD5 hash in uppercase
	// Note: Official PHP code uses utf8_decode() before hashing, but for ASCII/UTF-8 strings this is equivalent
	const hash = createHash('md5').update(hashString, 'utf8').digest('hex').toUpperCase()
	
	return hash
}

/**
 * Pickup point (Point Relais®) information
 */
export interface PickupPoint {
	id: string // Numéro du Point Relais®
	name: string // Nom du point relais (LgAdr1)
	address: string // Full address (combined for display)
	addressLine1?: string // LgAdr1 - Pickup point name (for AddressAdd1 in API2)
	addressLine2?: string // LgAdr2 - Additional address info (for AddressAdd2 in API2)
	addressLine3?: string // LgAdr3 - Street address (for Streetname in API2, max 40 chars)
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
 * Validates and normalizes postal code format
 * Based on PrestaShop validation: /^[A-Za-z0-9_\-\' ]{2,10}$/
 * Special handling for Portugal (PT): replace spaces with dashes
 */
function normalizePostalCode(postalCode: string, country: string): string {
	// Trim whitespace
	let normalized = postalCode.trim()
	
	// Special handling for Portugal: replace spaces with dashes
	if (country.toUpperCase() === 'PT') {
		normalized = normalized.replace(/\s+/g, '-')
	}
	
	// Validate format: 2-10 alphanumeric characters, dashes, underscores, spaces, apostrophes
	if (!/^[A-Za-z0-9_\-\' ]{2,10}$/.test(normalized)) {
		throw new Error(`Invalid postal code format: ${postalCode}. Must be 2-10 alphanumeric characters.`)
	}
	
	return normalized
}

/**
 * Validates and normalizes city name
 */
function normalizeCity(city?: string): string {
	if (!city) return ''
	
	// Trim whitespace and limit length (Mondial Relay typically accepts up to 50 chars)
	const normalized = city.trim().substring(0, 50)
	
	// Remove any control characters that might cause issues
	return normalized.replace(/[\x00-\x1F\x7F]/g, '')
}

/**
 * Search for pickup points near a location
 * 
 * @param postalCode - Postal code (5 digits for France)
 * @param country - Country code (ISO 2 letters, e.g., "FR")
 * @param city - City name (optional, helps narrow results)
 * @param latitude - Latitude (optional, for distance calculation)
 * @param longitude - Longitude (optional, for distance calculation)
 * @returns Array of pickup points
 */
export async function searchPickupPoints({
	postalCode,
	country,
	city,
	latitude,
	longitude,
}: {
	postalCode: string
	country: string
	city?: string
	latitude?: number
	longitude?: number
}): Promise<PickupPoint[]> {
	validateApi1Credentials()

	// Validate and normalize inputs (per Mondial Relay FAQ: error 97 can be caused by incorrect field formats)
	const normalizedPostalCode = normalizePostalCode(postalCode, country)
	const normalizedCountry = country.toUpperCase().trim()
	const normalizedCity = normalizeCity(city)
	
	// Validate country code (must be 2 uppercase letters)
	if (!/^[A-Z]{2}$/.test(normalizedCountry)) {
		throw new Error(`Invalid country code: ${country}. Must be 2 uppercase letters (ISO 3166-1 alpha-2).`)
	}

	// Build SOAP request
	const { storeCode, privateKey } = getApi1Credentials()
	
	// Ensure credentials are available
	if (!storeCode || !privateKey) {
		throw new Error('Missing API1 credentials')
	}
	
	// Pad Enseigne to 8 characters (as per official Mondial Relay example)
	const paddedStoreCode = storeCode.trim().padEnd(8).substring(0, 8)
	
	// Security hash format for WSI3_PointRelais_Recherche (official method):
	// MD5(Enseigne + Pays + Ville + CP + Taille + Poids + Action + RayonRecherche + TypeActivite + DelaiEnvoi + Clé Privée)
	// All parameters are included in the hash in this exact order, using the exact same values as in the SOAP body
	// Based on: /Users/marvin/Downloads/mondial-relay-web-api (2)-1/includes/MondialRelay.API.Class.php
	// Parameter order: Enseigne, Pays, Ville, CP, Taille, Poids, Action, RayonRecherche, TypeActivite, DelaiEnvoi
	// Values must match exactly what's sent in the SOAP request
	// Note: In the official example, Taille, Poids, Action, RayonRecherche, TypeActivite, and DelaiEnvoi are empty strings
	// Taille is NOT maxResults - it's for parcel size, which we don't need for pickup point search
	// Action parameter filters pickup points by delivery mode:
	// - REL = Standard Point Relais (corresponds to MED in API2)
	// - 24R = Point Relais L (Large)
	// - 24L = Point Relais XL
	// - 24X = Point Relais XXL
	// - DRI = Drive
	// Using REL to filter for standard pickup points that support MED delivery mode
	const taille = '' // Empty - not used for pickup point search
	const poids = '' // Empty - not used for pickup point search
	const action = 'REL' // Filter for standard Point Relais (MED) - ensures we only show points that support standard delivery
	const rayonRecherche = '' // Empty - not used for basic search
	const typeActivite = '' // Empty - not used for basic search
	const delaiEnvoi = '' // Empty - not used for basic search
	const hashParams = `${paddedStoreCode}${normalizedCountry}${normalizedCity}${normalizedPostalCode}${taille}${poids}${action}${rayonRecherche}${typeActivite}${delaiEnvoi}`
	const securityHash = generateSecurityHashForWSI3(hashParams, privateKey.trim())

	const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI3_PointRelais_Recherche xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${paddedStoreCode}</Enseigne>
      <Pays>${normalizedCountry}</Pays>
      <Ville>${normalizedCity}</Ville>
      <CP>${normalizedPostalCode}</CP>
      <Taille>${taille}</Taille>
      <Poids>${poids}</Poids>
      <Action>${action}</Action>
      <RayonRecherche>${rayonRecherche}</RayonRecherche>
      <TypeActivite>${typeActivite}</TypeActivite>
      <DelaiEnvoi>${delaiEnvoi}</DelaiEnvoi>
      <Security>${securityHash}</Security>
    </WSI3_PointRelais_Recherche>
  </soap:Body>
</soap:Envelope>`

	try {
		const response = await fetch(API1_BASE_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'SOAPAction': '"http://www.mondialrelay.fr/webservice/WSI3_PointRelais_Recherche"',
			},
			body: soapBody,
		})

		if (!response.ok) {
			throw new Error(`Mondial Relay API1 error: ${response.status} ${response.statusText}`)
		}

		const xmlText = await response.text()
		
		// Check for API errors in the XML response
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_',
			textNodeName: '#text',
			parseAttributeValue: false,
			trimValues: true,
		})
		
		const parsed = parser.parse(xmlText)
		const envelope = parsed['soap:Envelope'] || parsed['soap:envelope'] || parsed.Envelope
		const body = envelope?.['soap:Body'] || envelope?.Body
		const responseData = body?.['WSI3_PointRelais_RechercheResponse'] || body?.['ws:WSI3_PointRelais_RechercheResponse']
		const result = responseData?.WSI3_PointRelais_RechercheResult || responseData?.['ws:WSI3_PointRelais_RechercheResult']
		
		// Check for error codes in the response
		if (result?.STAT && result.STAT !== '0') {
			// Common error codes:
			// 0 = Success
			// 22 = Incorrect parcel size (Taille parameter issue)
			// 97 = Security error (incorrect hash or credentials)
			// 99 = Invalid parameters
			const errorCode = result.STAT
			const apiError = result.ERROR || `Mondial Relay API error: STAT=${errorCode}`
			
			// Log detailed error information to Sentry
			Sentry.captureException(new Error(`Mondial Relay API1 error: STAT=${errorCode}`), {
				tags: { context: 'mondial-relay-api1-error' },
				extra: {
					stat: errorCode,
					error: result.ERROR,
					postalCode: normalizedPostalCode,
					country: normalizedCountry,
					city: normalizedCity,
					xmlText: xmlText.substring(0, 1000),
				},
			})
			
			// Provide more helpful error messages
			// Per Mondial Relay FAQ: Error 97 is usually caused by incorrect client coordinate fields
			// (phone, weight, postal code, city, etc.) - need to modify in the client order
			let userFriendlyMessage: string
			if (errorCode === '22') {
				userFriendlyMessage = `Incorrect parcel size (STAT=22): ${apiError}`
			} else if (errorCode === '97') {
				userFriendlyMessage = `Security error (STAT=97): ${apiError || 'This error is usually caused by incorrect field formats (postal code, city, country code, etc.). Please check:'}
- Postal code format (2-10 alphanumeric characters)
- Country code (must be 2 uppercase letters, e.g., FR)
- City name (if provided, should be valid)
- API credentials (MONDIAL_RELAY_API1_STORE_CODE, MONDIAL_RELAY_API1_PRIVATE_KEY)`
			} else if (errorCode === '99') {
				userFriendlyMessage = `Invalid parameters (STAT=99): ${apiError || 'Check postal code format, country code, and other parameters'}`
			} else {
				userFriendlyMessage = apiError
			}
			
			throw new Error(`Failed to search pickup points: ${userFriendlyMessage}`)
		}
		
		return parsePickupPointsResponse(xmlText, latitude, longitude)
	} catch (error) {
		Sentry.captureException(error, {
			tags: { context: 'mondial-relay-api1-search' },
			extra: {
				postalCode: normalizedPostalCode,
				country: normalizedCountry,
				city: normalizedCity,
			},
		})
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
 * Parses opening hours for a single day from the API response.
 * @param dayData - The day's opening hours data (e.g., point.Horaires_Lundi)
 * @returns Formatted time string (e.g., "0900-1200") or undefined if invalid
 */
function parseOpeningHoursDay(dayData: any): string | undefined {
	if (!dayData) return undefined
	
	const times = dayData.string || dayData
	if (!Array.isArray(times) || times.length < 2) return undefined
	
	// Convert to string and pad with leading zero if needed (e.g., 900 -> "0900")
	const time1 = String(times[0] || '').padStart(4, '0')
	const time2 = String(times[1] || '').padStart(4, '0')
	return `${time1}-${time2}`
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
		body?.['WSI3_PointRelais_RechercheResponse'] ||
		body?.['ws:WSI3_PointRelais_RechercheResponse']
	const result =
		response?.WSI3_PointRelais_RechercheResult ||
		response?.['ws:WSI3_PointRelais_RechercheResult']
	
	// Check for PointsRelais structure (WSI3 uses PointRelais_Details)
	let pointsRelais = result?.PointsRelais || result?.pointsRelais
	
	// Handle WSI3 response structure:
	// - PointsRelais.PointRelais_Details (array or single object) - standard success response with data
	let pointRelaisArray: any[] = []
	
	if (pointsRelais?.PointRelais_Details) {
		// WSI3 structure: PointsRelais.PointRelais_Details
		pointRelaisArray = Array.isArray(pointsRelais.PointRelais_Details)
			? pointsRelais.PointRelais_Details
			: [pointsRelais.PointRelais_Details]
	} else if (result?.PR01) {
		// Fallback: PR01, PR02, etc. directly in result (for WSI2 compatibility)
		// Extract all PR## keys and filter out empty points
		const prKeys = Object.keys(result).filter(key => /^PR\d+$/.test(key))
		pointRelaisArray = prKeys
			.map(key => result[key])
			.filter(point => point && point.Num && point.Num !== '' && point.Num !== null) // Filter out empty points
	}
	
	// Return empty array if no valid points found
	if (pointRelaisArray.length === 0) {
		return []
	}

	const pickupPoints: PickupPoint[] = []

	for (const point of pointRelaisArray) {
		if (!point?.Num) continue // Skip invalid points

		// Build address from LgAdr1, LgAdr2, LgAdr3
		const addressParts = [
			point.LgAdr1,
			point.LgAdr2,
			point.LgAdr3,
		].filter(Boolean)
		const address = addressParts.join(', ')

		// Parse opening hours (WSI3 uses full day names: Horaires_Lundi, Horaires_Mardi, etc.)
		// Opening hours are structured as arrays with time slots: [OpenAM, CloseAM, OpenPM, ClosePM]
		// Note: Times are stored as strings (e.g., "0900") but parser may convert to numbers
		const openingHours: PickupPoint['openingHours'] = {}
		const mondayHours = parseOpeningHoursDay(point.Horaires_Lundi)
		if (mondayHours) openingHours.monday = mondayHours
		
		const tuesdayHours = parseOpeningHoursDay(point.Horaires_Mardi)
		if (tuesdayHours) openingHours.tuesday = tuesdayHours
		
		const wednesdayHours = parseOpeningHoursDay(point.Horaires_Mercredi)
		if (wednesdayHours) openingHours.wednesday = wednesdayHours
		
		const thursdayHours = parseOpeningHoursDay(point.Horaires_Jeudi)
		if (thursdayHours) openingHours.thursday = thursdayHours
		
		const fridayHours = parseOpeningHoursDay(point.Horaires_Vendredi)
		if (fridayHours) openingHours.friday = fridayHours
		
		const saturdayHours = parseOpeningHoursDay(point.Horaires_Samedi)
		if (saturdayHours) openingHours.saturday = saturdayHours
		
		const sundayHours = parseOpeningHoursDay(point.Horaires_Dimanche)
		if (sundayHours) openingHours.sunday = sundayHours

		const pointLat = parseFloat(point.Latitude)
		const pointLon = parseFloat(point.Longitude)

		const pickupPoint: PickupPoint = {
			id: String(point.Num),
			name: point.LgAdr1 || '',
			address, // Combined address for display
			addressLine1: point.LgAdr1 || undefined, // For AddressAdd1 in API2
			addressLine2: point.LgAdr2 || undefined, // For AddressAdd2 in API2
			addressLine3: point.LgAdr3 || undefined, // For Streetname in API2 (max 40 chars)
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

