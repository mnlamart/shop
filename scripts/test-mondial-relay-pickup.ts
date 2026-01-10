/**
 * Test script to directly call Mondial Relay API1 for pickup point search
 * This helps debug if the issue is with our code or the API itself
 * 
 * Based on official documentation:
 * - https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf
 * - https://api.mondialrelay.com/WebService.asmx
 */

import 'dotenv/config'
import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'

const storeCode = process.env.MONDIAL_RELAY_API1_STORE_CODE
const privateKey = process.env.MONDIAL_RELAY_API1_PRIVATE_KEY
const brandCode = process.env.MONDIAL_RELAY_API1_BRAND_CODE
const apiUrl = process.env.MONDIAL_RELAY_API1_URL || 'https://api.mondialrelay.com/WebService.asmx'

if (!storeCode || !privateKey || !brandCode) {
	console.error('Missing required credentials:')
	console.error('MONDIAL_RELAY_API1_STORE_CODE:', storeCode ? '✓' : '✗')
	console.error('MONDIAL_RELAY_API1_PRIVATE_KEY:', privateKey ? '✓' : '✗')
	console.error('MONDIAL_RELAY_API1_BRAND_CODE:', brandCode ? '✓' : '✗')
	console.error('\nPlease set these environment variables in your .env file')
	process.exit(1)
}

console.log('Using Mondial Relay API credentials from environment variables')
console.log('Code Enseigne:', storeCode)
console.log('Code Marque:', brandCode)
console.log('API URL:', apiUrl)
console.log('')

// Test parameters - you can modify these
// Test multiple locations to see if it's location-specific
const testCases = [
	{ name: 'Paris 75001 with city', postalCode: '75001', country: 'FR', city: 'Paris', maxResults: 10 },
	{ name: 'Paris 75001 without city', postalCode: '75001', country: 'FR', city: '', maxResults: 10 },
	{ name: 'Lyon 69001', postalCode: '69001', country: 'FR', city: 'Lyon', maxResults: 10 },
	{ name: 'Marseille 13001', postalCode: '13001', country: 'FR', city: 'Marseille', maxResults: 10 },
]

for (const testCase of testCases) {
	console.log(`\n${'='.repeat(60)}`)
	console.log(`Test Case: ${testCase.name}`)
	console.log(`Postal Code: ${testCase.postalCode}, Country: ${testCase.country}, City: "${testCase.city}"`)
	console.log('='.repeat(60))
	
	// Generate security hash (same logic as in the code)
	// Format: MD5(Code Enseigne + Code Marque + Parameters + Clé Privée)
	// Parameters for WSI2_RecherchePointRelais: CP + Pays + Ville
	const params = `${testCase.postalCode}${testCase.country}${testCase.city || ''}`
	const hashString = `${storeCode}${brandCode}${params}${privateKey}`
	const securityHash = createHash('md5').update(hashString).digest('hex').toUpperCase()
	
	console.log('Security Hash Calculation:')
	console.log(`  Hash = MD5(${storeCode} + ${brandCode} + "${params}" + ${privateKey})`)
	console.log(`  Result: ${securityHash}`)
	console.log('')

	// Build SOAP request
	const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${storeCode}</Enseigne>
      <Pays>${testCase.country}</Pays>
      <CP>${testCase.postalCode}</CP>
      <Ville>${testCase.city || ''}</Ville>
      <Taille>${testCase.maxResults}</Taille>
      <Poids>0</Poids>
      <Action>0</Action>
      <Security>${securityHash}</Security>
    </WSI2_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`

	// Save SOAP body to temp file for curl
	const tempFile = `/tmp/mondial-relay-soap-${testCase.name.replace(/\s+/g, '-')}.xml`
	try {
		writeFileSync(tempFile, soapBody)
	} catch (error) {
		console.error('Failed to write temp file:', error)
		continue
	}

	// Test with the correct API V1 endpoint
	const endpoint = {
		name: 'Mondial Relay API1',
		url: apiUrl,
		soapAction: 'http://www.mondialrelay.fr/webservice/WSI2_RecherchePointRelais',
	}
	console.log(`\n${'='.repeat(60)}`)
	console.log(`Testing endpoint: ${endpoint.name}`)
	console.log(`URL: ${endpoint.url}`)
	console.log('='.repeat(60))
	
	// Make curl request
	const curlCommand = `curl -X POST \
  '${endpoint.url}' \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: ${endpoint.soapAction}' \
  --data-binary @${tempFile} \
  -s`

	console.log('Executing curl command...')
	console.log('')
	console.log('Response:')
	console.log('=========')
	try {
		const output = execSync(curlCommand, { encoding: 'utf-8' })
	
	// Extract just the XML response (remove curl verbose output)
	const xmlMatch = output.match(/<\?xml[\s\S]*<\/soap:Envelope>/)
	if (xmlMatch) {
		const xmlResponse = xmlMatch[0]
		console.log('Raw XML Response:')
		console.log(xmlResponse)
		console.log('')
		
		// Parse and pretty print the response
		const parser = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@_',
			textNodeName: '#text',
			parseAttributeValue: false,
			trimValues: true,
		})
		
		const parsed = parser.parse(xmlResponse)
		console.log('Parsed JSON Structure:')
		console.log(JSON.stringify(parsed, null, 2))
		console.log('')
		
		// Check the structure our code expects
		const envelope = parsed['soap:Envelope'] || parsed['soap:envelope'] || parsed.Envelope
		const body = envelope?.['soap:Body'] || envelope?.Body
		const response = body?.['WSI2_RecherchePointRelaisResponse'] || body?.['ws:WSI2_RecherchePointRelaisResponse']
		const result = response?.WSI2_RecherchePointRelaisResult || response?.['ws:WSI2_RecherchePointRelaisResult']
		
		console.log('Status (STAT):', result?.STAT)
		console.log('Has PointsRelais?', !!result?.PointsRelais)
		console.log('Has PR01?', !!result?.PR01)
		if (result?.PR01) {
			console.log('PR01 Num:', result.PR01.Num)
			console.log('PR01 LgAdr1:', result.PR01.LgAdr1)
		}
		
		// Check if we got actual results
		if (result?.STAT === 0 || result?.STAT === '0') {
			const hasResults = result?.PointsRelais || 
				(result?.PR01 && result.PR01.Num && result.PR01.Num.trim() !== '')
			console.log('Has results?', hasResults)
			
			// Count actual pickup points found
			if (result?.PointsRelais) {
				const points = Array.isArray(result.PointsRelais.PointRelais)
					? result.PointsRelais.PointRelais
					: result.PointsRelais.PointRelais
					? [result.PointsRelais.PointRelais]
					: []
				console.log(`Found ${points.length} pickup point(s) in PointsRelais structure`)
				if (points.length > 0) {
					console.log('First pickup point:', {
						id: points[0].Num,
						name: points[0].LgAdr1,
						address: `${points[0].LgAdr1} ${points[0].LgAdr2 || ''}`.trim(),
						city: points[0].Ville,
						postalCode: points[0].CP,
					})
				}
			} else {
				// Check PR01-PR10 fields
				const prFields = ['PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR06', 'PR07', 'PR08', 'PR09', 'PR10'] as const
				const validPoints = prFields.filter(pr => {
					const prData = result?.[pr]
					return prData && prData.Num && prData.Num.trim() !== ''
				})
				console.log(`Found ${validPoints.length} pickup point(s) in PR fields`)
				if (validPoints.length > 0 && result) {
					const firstPrKey = validPoints[0]
					if (firstPrKey) {
						const firstPr = result[firstPrKey]
						if (firstPr) {
							console.log('First pickup point:', {
								id: firstPr.Num,
								name: firstPr.LgAdr1,
								address: `${firstPr.LgAdr1} ${firstPr.LgAdr2 || ''}`.trim(),
								city: firstPr.Ville,
								postalCode: firstPr.CP,
							})
						}
					}
				}
			}
			
			// If no results but STAT is 0, it might be a credentials issue
			if (!hasResults) {
				console.log('\n⚠️  WARNING: API returned success (STAT: 0) but no pickup points found.')
				console.log('This could indicate:')
				console.log('  - Credentials may not have access to pickup point data')
				console.log('  - Account may need activation for pickup point searches')
				console.log('  - Test credentials may not return real data')
				console.log('  - The search parameters might not match any pickup points')
			} else {
				console.log('\n✅ SUCCESS: Found pickup points!')
			}
		} else {
			console.log(`\n❌ ERROR: API returned error status: ${result?.STAT}`)
			if (result?.STAT) {
				const statCode = String(result.STAT)
				console.log('\nError code meanings:')
				console.log('  - STAT 0 = Success')
				console.log('  - STAT 1 = Invalid parameters')
				console.log('  - STAT -1 = Authentication error')
				console.log('  - STAT 97 = Invalid security hash or authentication issue')
				console.log('  - Other codes = See Mondial Relay documentation')
				
				if (statCode === '97') {
					console.log('\n⚠️  STAT 97 typically means:')
					console.log('  - Security hash calculation is incorrect')
					console.log('  - Credentials are invalid or expired')
					console.log('  - Parameter order in hash calculation is wrong')
					console.log('\nCurrent hash calculation:')
					console.log(`  Hash = MD5(${storeCode} + ${brandCode} + ${params} + ${privateKey})`)
					console.log(`  Params = ${testCase.postalCode} + ${testCase.country} + "${testCase.city}"`)
				}
			}
		}
	} else {
		console.log('Raw output (no XML found):')
		console.log(output)
	}
	} catch (error: any) {
		console.error(`\n❌ Error executing curl for ${endpoint.name}:`, error.message)
		if (error.stdout) {
			console.log('STDOUT:', error.stdout)
		}
		if (error.stderr) {
			console.error('STDERR:', error.stderr)
		}
	} finally {
		// Clean up temp file
		try {
			unlinkSync(tempFile)
		} catch {
			// Ignore cleanup errors
		}
	}
}

