import { type ServerBuild } from 'react-router'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { generateSitemap } from '#app/utils/sitemap.server.ts'
import { type Route } from './+types/sitemap[.]xml.ts'

export async function loader({ request, context }: Route.LoaderArgs) {
	const serverBuild = (await context.serverBuild) as { build: ServerBuild }
	const siteUrl = getDomainUrl(request)
	
	const sitemap = await generateSitemap(serverBuild.build, siteUrl)
	
	return new Response(sitemap, {
		status: 200,
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': `public, max-age=${60 * 5}`, // Cache for 5 minutes
		},
	})
}
