/**
 * Mondial Relay API1 Client (SOAP)
 * 
 * API1 is used for:
 * - Searching pickup points (Point Relais®)
 * - Tracking shipments
 * 
 * Documentation: https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf
 */

import { createHash } from 'crypto'
import { invariant } from '@epic-web/invariant'

// API endpoints
const API1_BASE_URL = 'https://www.mondialrelay.fr/WebService/Web_Services.asmx'

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
}: {
	postalCode: string
	country: string
	city?: string
	latitude?: number
	longitude?: number
	maxResults?: number
}): Promise<PickupPoint[]> {
	validateApi1Credentials()

	// Build SOAP request
	const { storeCode } = getApi1Credentials()
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
      <Taille>${maxResults}</Taille>
      <Poids>0</Poids>
      <Action>0</Action>
      <Security>${securityHash}</Security>
    </WSI2_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`

	try {
		const response = await fetch(API1_BASE_URL, {
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
		return parsePickupPointsResponse(xmlText, latitude, longitude)
	} catch (error) {
		console.error('Mondial Relay API1 searchPickupPoints error:', error)
		throw new Error(`Failed to search pickup points: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

/**
 * Parse the SOAP XML response and extract pickup points
 */
function parsePickupPointsResponse(_xmlText: string, _latitude?: number, _longitude?: number): PickupPoint[] {
	// Simple XML parsing - in production, consider using a proper XML parser like xml2js
	// For now, we'll use regex-based parsing (not ideal but works for simple cases)
	
	const pickupPoints: PickupPoint[] = []
	
	// Extract points from XML (simplified - real implementation should use proper XML parser)
	// This is a placeholder - actual implementation depends on the exact XML structure
	// from Mondial Relay's API response
	
	// TODO: Implement proper XML parsing using xml2js or similar
	// The response structure should be:
	// <WSI2_RecherchePointRelaisResponse>
	//   <WSI2_RecherchePointRelaisResult>
	//     <PointsRelais>
	//       <PointRelais>
	//         <Num>...</Num>
	//         <LgAdr1>...</LgAdr1>
	//         <LgAdr2>...</LgAdr2>
	//         <LgAdr3>...</LgAdr3>
	//         <CP>...</CP>
	//         <Ville>...</Ville>
	//         <Pays>...</Pays>
	//         <Latitude>...</Latitude>
	//         <Longitude>...</Longitude>
	//         ...
	//       </PointRelais>
	//     </PointsRelais>
	//   </WSI2_RecherchePointRelaisResult>
	// </WSI2_RecherchePointRelaisResponse>
	
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
		const response = await fetch(API1_BASE_URL, {
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
function parseTrackingResponse(_xmlText: string): {
	status: string
	statusCode: string
	events: Array<{
		date: Date
		description: string
		location?: string
	}>
} {
	// TODO: Implement proper XML parsing
	// This is a placeholder - actual implementation depends on the exact XML structure
	
	return {
		status: 'Unknown',
		statusCode: '0',
		events: [],
	}
}

