import * as Sentry from '@sentry/react-router'
import { type ServerBuild } from 'react-router'
import { prisma } from './db.server.ts'

/**
 * Fetches dynamic routes from database (products and categories)
 */
async function getDynamicRoutes(): Promise<string[]> {
	const dynamicRoutes: string[] = []

	try {
		// Get all active products
		const products = await prisma.product.findMany({
			where: {
				status: 'ACTIVE',
			},
			select: {
				slug: true,
			},
		})

		// Add product URLs
		for (const product of products) {
			dynamicRoutes.push(`/shop/products/${product.slug}`)
		}

		// Get all categories
		const categories = await prisma.category.findMany({
			select: {
				slug: true,
			},
		})

		// Add category URLs
		for (const category of categories) {
			dynamicRoutes.push(`/shop/categories/${category.slug}`)
		}
	} catch (error) {
		// If database query fails, log but don't break the sitemap generation
		// This ensures sitemap still works even if database is unavailable
		Sentry.captureException(error, {
			tags: { context: 'sitemap-dynamic-routes' },
		})
	}

	return dynamicRoutes
}

/**
 * Extracts public routes from React Router build that should be included in sitemap
 */
function extractPublicRoutes(routes: ServerBuild['routes']): string[] {
	const publicRoutes: string[] = []
	const routesToIgnore = [
		// Resource routes
		'/resources',
		'/sitemap.xml',
		'/robots.txt',
		// Admin routes
		'/admin',
		// Auth routes
		'/login',
		'/signup',
		'/logout',
		'/forgot-password',
		'/reset-password',
		'/verify',
		'/onboarding',
		'/auth',
		// User settings
		'/settings',
		'/me',
		// API/webhooks
		'/webhooks',
		// Checkout (not indexed)
		'/shop/checkout',
		// 404 catch-all
		'$',
	]

	function shouldIncludeRoute(path: string | undefined): boolean {
		if (!path) return false
		
		// Ignore routes that match any ignore pattern
		for (const ignorePattern of routesToIgnore) {
			if (path.startsWith(ignorePattern) || path === ignorePattern) {
				return false
			}
		}
		
		// Include public shop routes
		if (path.startsWith('/shop')) return true
		
		// Include marketing routes
		if (path.startsWith('/')) {
			const segments = path.split('/').filter(Boolean)
			// Exclude auth, admin, settings, etc.
			if (segments.length === 0) return true // root
			const firstSegment = segments[0]
			if (firstSegment && !['admin', 'auth', 'settings', 'me', 'resources', 'webhooks'].includes(firstSegment)) {
				return true
			}
		}
		
		return false
	}

	function traverseRoutes(
		routes: ServerBuild['routes'],
		parentPath: string = '',
	): void {
		for (const [, route] of Object.entries(routes)) {
			if (!route) continue

			let routePath = route.path || ''
			
			// Handle index routes
			if (route.index) {
				routePath = parentPath || '/'
			} else if (routePath) {
				// Handle relative paths
				if (routePath.startsWith('/')) {
					routePath = routePath
				} else {
					routePath = `${parentPath}/${routePath}`.replace(/\/+/g, '/')
				}
			} else {
				routePath = parentPath
			}

			// Normalize path
			routePath = routePath || '/'

			// Check if this route should be included
			if (shouldIncludeRoute(routePath)) {
				// Normalize: remove trailing slashes except for root
				const normalizedPath = routePath === '/' ? '/' : routePath.replace(/\/$/, '')
				if (!publicRoutes.includes(normalizedPath)) {
					publicRoutes.push(normalizedPath)
				}
			}

			// Recursively process children if they exist
			// Note: React Router 7 routes may have children in a different structure
			// We'll handle nested routes by checking if route has any child-related properties
			const routeWithChildren = route as ServerBuild['routes'][string] & { children?: ServerBuild['routes'] }
			if (routeWithChildren.children) {
				traverseRoutes(routeWithChildren.children, routePath)
			}
		}
	}

	traverseRoutes(routes)
	return publicRoutes.sort()
}

/**
 * Generates XML sitemap from routes
 */
function generateSitemapXML(
	routes: string[],
	siteUrl: string,
): string {
	const urls = routes
		.map((route) => {
			const url = `${siteUrl}${route === '/' ? '' : route}`
			return `	<url>
		<loc>${escapeXml(url)}</loc>
		<changefreq>weekly</changefreq>
		<priority>${route === '/' ? '1.0' : '0.8'}</priority>
	</url>`
		})
		.join('\n')

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`
}

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
 * Generates sitemap for React Router 7 application
 * Includes both static routes from the build and dynamic routes from the database
 */
export async function generateSitemap(
	build: ServerBuild,
	siteUrl: string,
): Promise<string> {
	// Get static routes from React Router build
	const staticRoutes = extractPublicRoutes(build.routes)
	
	// Get dynamic routes from database (products and categories)
	const dynamicRoutes = await getDynamicRoutes()
	
	// Combine and deduplicate routes
	const allRoutes = [...staticRoutes, ...dynamicRoutes]
	const uniqueRoutes = Array.from(new Set(allRoutes)).sort()
	
	return generateSitemapXML(uniqueRoutes, siteUrl)
}

