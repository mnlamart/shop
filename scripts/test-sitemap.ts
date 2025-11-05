#!/usr/bin/env tsx
/**
 * Test script to verify sitemap generation
 * Usage: npm run test:sitemap
 * 
 * Make sure the dev server is running first: npm run dev
 */

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'

async function testSitemap() {
	console.log('🧪 Testing sitemap generation...\n')

	try {
		// Fetch sitemap
		const response = await fetch(`${SERVER_URL}/sitemap.xml`)
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		const xml = await response.text()

		// Basic XML validation
		if (!xml.includes('<?xml')) {
			throw new Error('Invalid XML: missing XML declaration')
		}

		if (!xml.includes('<urlset')) {
			throw new Error('Invalid XML: missing urlset element')
		}

		// Extract all URLs from sitemap
		const urlMatches = xml.matchAll(/<loc>(.*?)<\/loc>/g)
		const urls = Array.from(urlMatches, m => m[1])
		const baseUrl = urls[0]?.split('/').slice(0, 3).join('/') || SERVER_URL

		// Count URLs
		const productUrls = urls.filter(url => url.includes('/shop/products/') && !url.endsWith('/shop/products'))
		const categoryUrls = urls.filter(url => url.includes('/shop/categories/') && !url.endsWith('/shop/categories'))
		const staticUrls = urls.filter(url => !productUrls.includes(url) && !categoryUrls.includes(url))

		console.log('✅ Sitemap is valid XML')
		console.log(`📊 Total URLs: ${urls.length}`)
		console.log(`   - Static routes: ${staticUrls.length}`)
		console.log(`   - Product pages: ${productUrls.length}`)
		console.log(`   - Category pages: ${categoryUrls.length}`)

		if (productUrls.length > 0) {
			console.log(`\n📦 Sample product URLs:`)
			productUrls.slice(0, 5).forEach(url => {
				console.log(`   - ${url.replace(baseUrl, '')}`)
			})
			if (productUrls.length > 5) {
				console.log(`   ... and ${productUrls.length - 5} more`)
			}
		} else {
			console.log('\n⚠️  No product URLs found (database might be empty)')
		}

		if (categoryUrls.length > 0) {
			console.log(`\n📁 Sample category URLs:`)
			categoryUrls.slice(0, 5).forEach(url => {
				console.log(`   - ${url.replace(baseUrl, '')}`)
			})
			if (categoryUrls.length > 5) {
				console.log(`   ... and ${categoryUrls.length - 5} more`)
			}
		} else {
			console.log('\n⚠️  No category URLs found (database might be empty)')
		}

		// Test robots.txt too
		console.log('\n🤖 Testing robots.txt...')
		const robotsResponse = await fetch(`${SERVER_URL}/robots.txt`)
		if (robotsResponse.ok) {
			const robotsTxt = await robotsResponse.text()
			if (robotsTxt.includes('Sitemap:')) {
				console.log('✅ robots.txt includes sitemap reference')
				const sitemapLine = robotsTxt.split('\n').find(line => line.startsWith('Sitemap:'))
				if (sitemapLine) {
					console.log(`   ${sitemapLine}`)
				}
			} else {
				console.warn('⚠️  robots.txt missing sitemap reference')
			}
		} else {
			console.warn(`⚠️  robots.txt not accessible (${robotsResponse.status})`)
		}

		console.log('\n✅ All tests passed!')
	} catch (error) {
		console.error('❌ Test failed:', error instanceof Error ? error.message : error)
		console.error('\n💡 Make sure the dev server is running: npm run dev')
		process.exit(1)
	}
}

void testSitemap()
