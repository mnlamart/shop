import { getDomainUrl } from '#app/utils/misc.tsx'
import { generateRobotsTxt } from '#app/utils/robots.server.ts'
import { type Route } from './+types/robots[.]txt.ts'

export function loader({ request }: Route.LoaderArgs) {
	const siteUrl = getDomainUrl(request)
	const robotsTxt = generateRobotsTxt(`${siteUrl}/sitemap.xml`)
	
	return new Response(robotsTxt, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain',
			'Cache-Control': `public, max-age=${60 * 60}`, // Cache for 1 hour
		},
	})
}
