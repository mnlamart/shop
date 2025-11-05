/**
 * Generates robots.txt content
 * @param sitemapUrl - The URL to the sitemap.xml file
 * @param options - Optional configuration for robots.txt rules
 */
export function generateRobotsTxt(
	sitemapUrl: string,
	options?: {
		userAgents?: Array<{
			userAgent: string
			allow?: string[]
			disallow?: string[]
			crawlDelay?: number
		}>
	},
): string {
	const userAgents = options?.userAgents || [
		{
			userAgent: '*',
			allow: ['/'],
			disallow: ['/admin', '/login', '/signup', '/settings', '/auth', '/webhooks'],
		},
	]

	const rules: string[] = []

	for (const { userAgent, allow, disallow, crawlDelay } of userAgents) {
		rules.push(`User-agent: ${userAgent}`)

		if (allow) {
			for (const path of allow) {
				rules.push(`Allow: ${path}`)
			}
		}

		if (disallow) {
			for (const path of disallow) {
				rules.push(`Disallow: ${path}`)
			}
		}

		if (crawlDelay !== undefined) {
			rules.push(`Crawl-delay: ${crawlDelay}`)
		}

		rules.push('') // Empty line between user agents
	}

	// Remove trailing empty line before adding sitemap
	if (rules.length > 0 && rules[rules.length - 1] === '') {
		rules.pop()
	}

	// Add sitemap reference
	rules.push(`Sitemap: ${sitemapUrl}`)

	return rules.join('\n')
}

