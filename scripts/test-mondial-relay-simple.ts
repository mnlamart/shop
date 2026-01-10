/**
 * Simple test script for Mondial Relay customer service
 * Demonstrates pickup point search API call
 */

import { execSync } from 'child_process'
import { createHash } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'

// Production credentials
const API_URL = 'https://api.mondialrelay.com/WebService.asmx'
const storeCode = 'CC23OXZ5'  // Code Enseigne
const privateKey = 'CCfAAGyU'  // Clé privée
const brandCode = 'CC'  // Code Marque

console.log('='.repeat(70))
console.log('Mondial Relay API Test - Pickup Point Search')
console.log('='.repeat(70))
console.log('')
console.log(`API Endpoint: ${API_URL}`)
console.log('Method: WSI2_RecherchePointRelais')
console.log('')
console.log('Credentials:')
console.log(`  Code Enseigne: ${storeCode}`)
console.log(`  Code Marque: ${brandCode}`)
console.log(`  Clé Privée: ${privateKey}`)
console.log('')
// Test with different weights to see if API filters pickup points
const testWeights = ['500', '2000', '5000', '10000']  // 500g, 2kg, 5kg, 10kg

for (const testWeight of testWeights) {
	console.log('='.repeat(70))
	console.log(`Testing with weight: ${testWeight}g (${parseInt(testWeight) / 1000}kg)`)
	console.log('='.repeat(70))
	console.log('')
	
	const postalCode = '75001'
	const country = 'FR'
	const city = 'Paris'
	const poids = testWeight
	const action = '24R'  // Standard Relay Point/Locker delivery
	
	console.log('Test Parameters:')
	console.log('  Postal Code: 75001 (Paris)')
	console.log('  Country: FR')
	console.log('  City: Paris')
	console.log(`  Weight (Poids): ${poids}g (${parseInt(poids) / 1000}kg)`)
	console.log(`  Action: ${action} (Standard Relay Point/Locker delivery)`)
	console.log('')

	// Original hash method: Only CP + Pays + Ville (this was working before)
	const params = `${postalCode}${country}${city}`
	const hashString = `${storeCode}${brandCode}${params}${privateKey}`
	const securityHash = createHash('md5').update(hashString).digest('hex').toUpperCase()

	console.log('Security Hash Calculation:')
	console.log(`  MD5(${storeCode} + ${brandCode} + "${params}" + ${privateKey})`)
	console.log(`  Result: ${securityHash}`)
	console.log('')

	// Build SOAP request
	const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WSI2_RecherchePointRelais xmlns="http://www.mondialrelay.fr/webservice/">
      <Enseigne>${storeCode}</Enseigne>
      <Pays>${country}</Pays>
      <CP>${postalCode}</CP>
      <Ville>${city}</Ville>
      <Poids>${poids}</Poids>
      <Action>${action}</Action>
      <Security>${securityHash}</Security>
    </WSI2_RecherchePointRelais>
  </soap:Body>
</soap:Envelope>`

	// Save to temp file and make request
	const tempFile = `/tmp/mondial-relay-test-${testWeight}.xml`
	writeFileSync(tempFile, soapBody)

	try {
		const curlCommand = `curl -X POST \
  '${API_URL}' \
  -H 'Content-Type: text/xml; charset=utf-8' \
  -H 'SOAPAction: http://www.mondialrelay.fr/webservice/WSI2_RecherchePointRelais' \
  --data-binary @${tempFile} \
  -s`
		
		const response = execSync(curlCommand, { encoding: 'utf-8' })
		
		// Extract STAT code
		const statMatch = response.match(/<STAT>([^<]+)<\/STAT>/i)
		if (statMatch) {
			const stat = statMatch[1]
			
			if (stat === '0') {
				// Count pickup points
				const pointMatches = response.match(/<PR\d+><Num>([^<]+)<\/Num>/g)
				const pointCount = pointMatches ? pointMatches.length : 0
				
				console.log(`✅ STAT: ${stat} - Found ${pointCount} pickup point(s)`)
				
				if (pointCount > 0) {
					// Show first pickup point as example
					const firstMatch = response.match(/<PR01><Num>([^<]+)<\/Num><LgAdr1>([^<]+)<\/LgAdr1>/)
					if (firstMatch) {
						console.log(`   Example: ${firstMatch[1]} - ${firstMatch[2]}`)
					}
				}
			} else {
				console.log(`❌ STAT: ${stat} (Error)`)
			}
		}
	} catch (error: any) {
		console.error(`❌ Error: ${error.message}`)
	} finally {
		try {
			unlinkSync(tempFile)
		} catch {
			// Ignore cleanup errors
		}
	}
	
	console.log('')
}

console.log('='.repeat(70))
console.log('Summary:')
console.log('Action=24R returns pickup points that support standard delivery')
console.log('and can handle the specified weight (Poids parameter)')
console.log('='.repeat(70))
