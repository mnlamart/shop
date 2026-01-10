/**
 * Mondial Relay API2 Client (REST)
 * 
 * API2 is used for:
 * - Creating shipments
 * - Generating shipping labels
 * 
 * Official Documentation:
 * - Request Schema: https://storage.mondialrelay.fr/Mondial-Relay-Shipment-API-.Request.1.0.xsd
 * - Response Schema: https://storage.mondialrelay.fr/Mondial-Relay-Shipment-API-.Response.1.0.xsd
 * - WebServices PDF: https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf
 * 
 * Note: This implementation uses XML format matching the XSD schema for requests.
 * The REST API endpoint (https://connect-api.mondialrelay.com/api/shipment) accepts
 * XML requests with the structure defined in the XSD schema.
 */

import { invariant } from '@epic-web/invariant'
import { XMLParser } from 'fast-xml-parser'

/**
 * Gets environment variables dynamically (for testing support)
 */
function getApi2Credentials() {
	return {
		login: process.env.MONDIAL_RELAY_API2_LOGIN,
		password: process.env.MONDIAL_RELAY_API2_PASSWORD,
		customerId: process.env.MONDIAL_RELAY_API2_CUSTOMER_ID,
		deliveryMode: process.env.MONDIAL_RELAY_DELIVERY_MODE || '24R', // Default to 24R, but configurable
		collectionMode: process.env.MONDIAL_RELAY_COLLECTION_MODE || 'REL', // Default to REL, but configurable
	}
}

/**
 * Validates that all required API2 credentials are set
 */
function validateApi2Credentials() {
	const { login, password, customerId } = getApi2Credentials()
	invariant(login, 'MONDIAL_RELAY_API2_LOGIN must be set')
	invariant(password, 'MONDIAL_RELAY_API2_PASSWORD must be set')
	invariant(customerId, 'MONDIAL_RELAY_API2_CUSTOMER_ID must be set')
}

/**
 * Gets the API2 base URL from environment variable or defaults to production
 */
function getApi2BaseUrl(): string {
	return process.env.MONDIAL_RELAY_API2_URL || 'https://connect-api.mondialrelay.com/api'
}

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
	pickupPointCountry?: string // Point Relais® country code (required for DeliveryMode Location)
	weight: number // Weight in grams
	reference?: string // Optional reference number
	value?: number // Shipment value in cents (for insurance/declared value)
	length?: number // Parcel length in cm (optional but may be required for some delivery modes)
	width?: number // Parcel width in cm (optional but may be required for some delivery modes)
	depth?: number // Parcel depth in cm (optional but may be required for some delivery modes)
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
 * Escapes XML special characters
 */
function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

/**
 * Formats phone number to match XSD pattern: +\d{3,20}
 * Converts formats like "0123456789", "+33123456789", "33123456789" to "+33123456789"
 * 
 * Country code mapping for common countries:
 * - FR (France): 33
 * - BE (Belgium): 32
 * - ES (Spain): 34
 * - IT (Italy): 39
 * - DE (Germany): 49
 * - GB (UK): 44
 */
function formatPhoneNumber(phone: string, countryCode: string): string {
	if (!phone) return ''
	
	// Country code to phone prefix mapping
	const countryPrefixMap: Record<string, string> = {
		FR: '33',
		BE: '32',
		ES: '34',
		IT: '39',
		DE: '49',
		GB: '44',
	}
	
	const phonePrefix = countryPrefixMap[countryCode] || '33' // Default to France
	
	// Remove all non-digit characters except +
	let cleaned = phone.replace(/[^\d+]/g, '')
	
	// If already starts with +, validate format
	if (cleaned.startsWith('+')) {
		const digits = cleaned.substring(1)
		if (digits.length >= 3 && digits.length <= 20) {
			return cleaned // Already valid format
		}
	}
	
	// If starts with country prefix (e.g., 33), add +
	if (cleaned.startsWith(phonePrefix)) {
		return `+${cleaned}`
	}
	
	// If starts with 0 (common in France/Belgium), replace with country prefix
	if (cleaned.startsWith('0')) {
		return `+${phonePrefix}${cleaned.substring(1)}`
	}
	
	// Otherwise, prepend country prefix
	return `+${phonePrefix}${cleaned}`
}

/**
 * Formats address for recipient, splitting into HouseNo and Streetname if needed
 * to respect the 40 character limit for Streetname
 */
function formatRecipientAddress(address: string): { houseNo?: string; streetname: string } {
	// Try to extract house number if present (e.g., "8 RUE DE PARIS" -> HouseNo="8", Streetname="RUE DE PARIS")
	const houseNoMatch = address.match(/^(\d+[A-Z]?)\s+(.+)$/i)
	if (houseNoMatch && houseNoMatch[1] && houseNoMatch[2]) {
		const houseNo = houseNoMatch[1].substring(0, 10) // Max 10 chars
		const streetname = houseNoMatch[2].substring(0, 40) // Max 40 chars
		return { houseNo, streetname }
	} else {
		// No house number, just truncate streetname to 40 chars
		return { streetname: address.substring(0, 40) }
	}
}

/**
 * Create a shipment and get the label URL
 * 
 * @param request - Shipment creation request
 * @returns Shipment response with shipment number and label URL
 */
export async function createShipment(request: ShipmentRequest): Promise<ShipmentResponse> {
	validateApi2Credentials()
	const credentials = getApi2Credentials()
	const login = credentials.login!
	const password = credentials.password!
	const customerId = credentials.customerId!
	const deliveryMode = credentials.deliveryMode
	const collectionMode = credentials.collectionMode

	// Build XML request body matching the XSD schema
	// Based on: https://storage.mondialrelay.fr/Mondial-Relay-Shipment-API-.Request.1.0.xsd
	const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationRequest xmlns="http://www.example.org/Request">
	<Context>
		<Login>${escapeXml(login)}</Login>
		<Password>${escapeXml(password)}</Password>
		<CustomerId>${escapeXml(customerId)}</CustomerId>
		<Culture>en-US</Culture>
		<VersionAPI>1.0</VersionAPI>
	</Context>
	<OutputOptions>
		<OutputFormat>10x15</OutputFormat>
		<OutputType>PdfUrl</OutputType>
	</OutputOptions>
	<ShipmentsList>
		<Shipment>
			${request.reference ? `<OrderNo>${escapeXml(request.reference)}</OrderNo>` : ''}
			<ParcelCount>1</ParcelCount>
			<ShipmentValue Currency="EUR" Amount="${request.value && request.value > 0 ? (request.value / 100).toFixed(2) : '0.01'}"></ShipmentValue>
			<DeliveryMode Mode="${deliveryMode}"${deliveryMode === '24R' || deliveryMode === '24L' ? ` Location="${request.pickupPointCountry}-${request.pickupPointId}"` : ''}></DeliveryMode>
			<CollectionMode Mode="${collectionMode}" Location=""></CollectionMode>
			<Parcels>
				<Parcel>
					<Weight Value="${request.weight}" Unit="gr"></Weight>
				</Parcel>
			</Parcels>
			<DeliveryInstruction>Point Relais: ${escapeXml(request.pickupPointId)}</DeliveryInstruction>
			<Sender>
				<Address>
					<Lastname>${escapeXml(request.shipper.name)}</Lastname>
					<Streetname>${escapeXml(request.shipper.address)}</Streetname>
					<CountryCode>${escapeXml(request.shipper.country)}</CountryCode>
					<PostCode>${escapeXml(request.shipper.postalCode)}</PostCode>
					<City>${escapeXml(request.shipper.city)}</City>
					${request.shipper.phone ? `<PhoneNo>${escapeXml(formatPhoneNumber(request.shipper.phone, request.shipper.country))}</PhoneNo>` : ''}
					${request.shipper.email ? `<Email>${escapeXml(request.shipper.email)}</Email>` : ''}
				</Address>
			</Sender>
			<Recipient>
				<Address>
					<Firstname></Firstname>
					<Lastname>${escapeXml(request.recipient.name)}</Lastname>
					${(function() {
						const formatted = formatRecipientAddress(request.recipient.address)
						if (formatted.houseNo) {
							return `<HouseNo>${escapeXml(formatted.houseNo)}</HouseNo>
					<Streetname>${escapeXml(formatted.streetname)}</Streetname>`
						}
						return `<Streetname>${escapeXml(formatted.streetname)}</Streetname>`
					})()}
					<CountryCode>${escapeXml(request.recipient.country)}</CountryCode>
					<PostCode>${escapeXml(request.recipient.postalCode)}</PostCode>
					<City>${escapeXml(request.recipient.city)}</City>
					<AddressAdd1></AddressAdd1>
					<AddressAdd2></AddressAdd2>
					<AddressAdd3></AddressAdd3>
					${request.recipient.phone ? `<PhoneNo>${escapeXml(formatPhoneNumber(request.recipient.phone, request.recipient.country))}</PhoneNo>` : ''}
					${request.recipient.email ? `<Email>${escapeXml(request.recipient.email)}</Email>` : ''}
				</Address>
			</Recipient>
		</Shipment>
	</ShipmentsList>
</ShipmentCreationRequest>`

	try {
		const api2BaseUrl = getApi2BaseUrl()
		const response = await fetch(`${api2BaseUrl}/shipment`, {
			method: 'POST',
			headers: {
				'Content-Type': 'text/xml; charset=utf-8',
				'Accept': 'application/xml',
			},
			body: xmlBody,
		})

		// Read the full response text first (before parsing)
		const responseText = await response.text()

		if (!response.ok) {
			console.error('[Mondial Relay API2] Error response:', responseText)
			throw new Error(`Mondial Relay API2 error: ${response.status} ${response.statusText} - ${responseText}`)
		}

		// Parse XML response (API always returns XML when sending XML request)
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_',
			textNodeName: '#text',
			parseAttributeValue: false,
			trimValues: true,
		})

		const parsed = parser.parse(responseText)
		
		// Navigate through XML structure - API always returns ShipmentCreationResponse as root
		const root = parsed.ShipmentCreationResponse
		if (!root) {
			throw new Error('Mondial Relay API2 error: Invalid response format - missing ShipmentCreationResponse')
		}
		
		// Check for StatusList (error/warning response)
		const statusList = root.StatusList
		if (statusList) {
			const statuses = Array.isArray(statusList.Status) ? statusList.Status : statusList.Status ? [statusList.Status] : []
			
			const errors = statuses.filter((s: any) => s['@_Level'] === 'Error')
			const warnings = statuses.filter((s: any) => s['@_Level'] === 'Warning')
			
			if (errors.length > 0) {
				const errorMessages = errors.map((e: any) => `${e['@_Code']}: ${e['@_Message']}`).join('; ')
				console.error('[Mondial Relay API2] API returned errors:', errorMessages)
				throw new Error(`Mondial Relay API2 error: ${errorMessages}`)
			}
			
			if (warnings.length > 0) {
				const warningMessages = warnings.map((w: any) => `${w['@_Code']}: ${w['@_Message']}`).join('; ')
				console.warn('[Mondial Relay API2] API returned warnings:', warningMessages)
			}
		}
		
		// Extract shipment data from XML response
		const shipmentsList = root.ShipmentsList
		if (!shipmentsList) {
			throw new Error('Mondial Relay API2 error: Invalid response format - missing ShipmentsList')
		}

		const shipments = Array.isArray(shipmentsList.Shipment) 
			? shipmentsList.Shipment 
			: shipmentsList.Shipment 
				? [shipmentsList.Shipment] 
				: []

		if (shipments.length === 0) {
			throw new Error('Mondial Relay API2 error: No shipment data in response')
		}

		const shipment = shipments[0]
		// ShipmentNumber is always an attribute on Shipment element
		const shipmentNumber = shipment['@_ShipmentNumber']
		if (!shipmentNumber) {
			throw new Error('Mondial Relay API2 error: Missing ShipmentNumber attribute in response')
		}
		
		// Output is always an element - can be a string or an object with #text property (depending on parser)
		const outputValue = shipment.Output
		const labelUrl = typeof outputValue === 'string' 
			? outputValue 
			: outputValue?.['#text'] || ''

		return {
			shipmentNumber: shipmentNumber,
			labelUrl: labelUrl || '',
			statusCode: '0',
			statusMessage: undefined,
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
		const api2BaseUrl = getApi2BaseUrl()
		const response = await fetch(`${api2BaseUrl}/Label/${shipmentNumber}`, {
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
