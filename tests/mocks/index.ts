import closeWithGrace from 'close-with-grace'
import { setupServer } from 'msw/node'
import { handlers as githubHandlers } from './github.ts'
import { handlers as pwnedPasswordApiHandlers } from './pwned-passwords.ts'
import { handlers as resendHandlers } from './resend.ts'
import { handlers as stripeHandlers } from './stripe.ts'
import { handlers as tigrisHandlers } from './tigris.ts'

export const server = setupServer(
	...resendHandlers,
	...githubHandlers,
	...tigrisHandlers,
	...pwnedPasswordApiHandlers,
	...stripeHandlers,
)

server.listen({
	onUnhandledRequest(request, print) {
		// Log unhandled requests to help debug Stripe interception
		if (request.url.includes('api.stripe.com')) {
			console.log('[MSW] ===== UNHANDLED STRIPE REQUEST =====')
			console.log('[MSW] Method:', request.method)
			console.log('[MSW] URL:', request.url)
			console.log('[MSW] Headers:', Object.fromEntries(request.headers.entries()))
			console.log('[MSW] This means MSW saw the request but no handler matched!')
			print.warning()
			return
		}
		// Do not print warnings on unhandled requests to https://<:userId>.ingest.us.sentry.io/api/
		// Note: a request handler with passthrough is not suited with this type of url
		//       until there is a more permissible url catching system
		//       like requested at https://github.com/mswjs/msw/issues/1804
		if (request.url.includes('.sentry.io')) {
			return
		}
		// React-router-devtools send custom requests internally to handle some functionality, we ignore those
		if (request.url.includes('__rrdt')) {
			return
		}
		// Print the regular MSW unhandled request warning otherwise.
		print.warning()
	},
})

if (process.env.NODE_ENV !== 'test') {
	console.info('🔶 Mock server installed')

	closeWithGrace(() => {
		server.close()
	})
}
