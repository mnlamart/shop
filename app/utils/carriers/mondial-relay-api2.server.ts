/**
 * Mondial Relay API2 Client (REST)
 * 
 * API2 is used for:
 * - Creating shipments
 * - Generating shipping labels
 * 
 * Documentation: https://storage.mondialrelay.fr/Mondial-Relay-Shipment-API-.Response.1.0.xsd
 */

import { invariant } from '@epic-web/invariant'

/**
 * Gets environment variables dynamically (for testing support)
 */
function getApi2Credentials() {
	return {
		brandId: process.env.MONDIAL_RELAY_API2_BRAND_ID,
		login: process.env.MONDIAL_RELAY_API2_LOGIN,
		password: process.env.MONDIAL_RELAY_API2_PASSWORD,
		customerId: process.env.MONDIAL_RELAY_API2_CUSTOMER_ID,
	}
}

/**
 * Validates that all required API2 credentials are set
 */
function validateApi2Credentials() {
	const { brandId, login, password, customerId } = getApi2Credentials()
	invariant(brandId, 'MONDIAL_RELAY_API2_BRAND_ID must be set')
	invariant(login, 'MONDIAL_RELAY_API2_LOGIN must be set')
	invariant(password, 'MONDIAL_RELAY_API2_PASSWORD must be set')
	invariant(customerId, 'MONDIAL_RELAY_API2_CUSTOMER_ID must be set')
}

// API endpoints
const API2_BASE_URL = 'https://api.mondialrelay.fr/api/v2'

/**
 * Shipper information
 */
export interface ShipperInfo {
	name: string
	address: string
	city: string
	postalCode: string
	country: string // ISO 2-letter code
	phone: string
	email: string
}

/**
 * Recipient information
 */
export interface RecipientInfo {
	name: string
	address: string
	city: string
	postalCode: string
	country: string // ISO 2-letter code
	phone: string
	email: string
}

/**
 * Shipment creation request
 */
export interface ShipmentRequest {
	shipper: ShipperInfo
	recipient: RecipientInfo
	pickupPointId: string // Point Relais® ID
	weight: number // Weight in grams
	reference?: string // Optional reference number
}

/**
 * Shipment creation response
 */
export interface ShipmentResponse {
	shipmentNumber: string // ExpeditionNum
	labelUrl: string // URL_Etiquette
	statusCode: string // Stat
	statusMessage?: string // Libelle (if error)
}

/**
 * Label response
 */
export type LabelResponse = Blob

/**
 * Create a shipment and get the label URL
 * 
 * @param request - Shipment creation request
 * @returns Shipment response with shipment number and label URL
 */
export async function createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
	validateApi2Credentials()
	const { brandId, login, password, customerId } = getApi2Credentials()

	const requestBody = {
		BrandId: brandId,
		Login: login,
		Password: password,
		CustomerId: customerId,
		Expedition: {
			Shipper: {
				ShipperCivility: 'M', // M/Mme/Mlle - defaulting to M
				ShipperName: request.shipper.name,
				ShipperName2: '',
				ShipperAddress: request.shipper.address,
				ShipperAddress2: '',
				ShipperCity: request.shipper.city,
				ShipperZipCode: request.shipper.postalCode,
				ShipperCountry: request.shipper.country,
				ShipperPhone: request.shipper.phone,
				ShipperEmail: request.shipper.email,
			},
			Recipient: {
				RecipientCivility: 'M', // M/Mme/Mlle - defaulting to M
				RecipientName: request.recipient.name,
				RecipientName2: '',
				RecipientAddress: request.recipient.address,
				RecipientAddress2: '',
				RecipientCity: request.recipient.city,
				RecipientZipCode: request.recipient.postalCode,
				RecipientCountry: request.recipient.country,
				RecipientPhone: request.recipient.phone,
				RecipientEmail: request.recipient.email,
			},
			PointRelais_Num: request.pickupPointId,
			Poids: request.weight,
			Ref: request.reference || '',
		},
	}

	try {
		const response = await fetch(`${API2_BASE_URL}/shipment`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			throw new Error(`Mondial Relay API2 error: ${response.status} ${response.statusText}`)
		}

		const data = await response.json()

		// Check if API returned an error status
		if (data.Stat && data.Stat !== '0') {
			throw new Error(`Mondial Relay API2 error: ${data.Libelle || 'Unknown error'}`)
		}

		return {
			shipmentNumber: data.ExpeditionNum || '',
			labelUrl: data.URL_Etiquette || '',
			statusCode: data.Stat || '0',
			statusMessage: data.Libelle,
		}
	} catch (error) {
		console.error('Mondial Relay API2 createShipment error:', error)
		throw new Error(`Failed to create shipment: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

/**
 * Get shipping label PDF for a shipment
 * 
 * @param shipmentNumber - Mondial Relay shipment number
 * @returns Label PDF as Blob
 */
export async function getLabel(shipmentNumber: string): Promise<LabelResponse> {
	validateApi2Credentials()

	try {
		const response = await fetch(`${API2_BASE_URL}/label/${shipmentNumber}`, {
			method: 'GET',
		})

		if (!response.ok) {
			throw new Error(`Mondial Relay API2 error: ${response.status} ${response.statusText}`)
		}

		return await response.blob()
	} catch (error) {
		console.error('Mondial Relay API2 getLabel error:', error)
		throw new Error(`Failed to get label: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

