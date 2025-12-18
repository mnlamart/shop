import closeWithGrace from 'close-with-grace'
import { http, passthrough } from 'msw'
import { setupServer } from 'msw/node'
import { handlers as githubHandlers } from './github.ts'
import { handlers as pwnedPasswordApiHandlers } from './pwned-passwords.ts'
import { handlers as resendHandlers } from './resend.ts'
import { handlers as stripeHandlers } from './stripe.ts'
import { handlers as tigrisHandlers } from './tigris.ts'

// In development mode, pass through Mondial Relay API requests (we want to use real API)
// In test mode, these will be handled by test mocks if needed
const mondialRelayHandlers =
	process.env.NODE_ENV === 'test'
		? []
		: [
				// Passthrough for Mondial Relay API1 (SOAP)
				http.post('https://api.mondialrelay.com/WebService.asmx', () => passthrough()),
				http.post('https://www.mondialrelay.fr/WebService/Web_Services.asmx', () =>
					passthrough(),
				),
				// Passthrough for Mondial Relay API2 (REST)
				http.post('https://api.mondialrelay.fr/api/v2/*', () => passthrough()),
				http.get('https://api.mondialrelay.fr/api/v2/*', () => passthrough()),
		  ]

const handlersToUse = [
	// IMPORTANT: Stripe handlers MUST be first to ensure they're matched before other handlers
	// In test mode: use mocked Stripe handlers
	// In development: pass through Stripe API requests (we want to use real Stripe)
	...stripeHandlers,
	// Mondial Relay passthrough handlers (development only)
	...mondialRelayHandlers,
	...resendHandlers,
	...githubHandlers,
	...tigrisHandlers,
	...pwnedPasswordApiHandlers,
]

export const server = setupServer(...handlersToUse)

server.listen({
	onUnhandledRequest(request, print) {
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
		// In development mode, bypass Stripe API requests - we want to use real Stripe
		// In test mode, Stripe requests are handled by mock handlers
		if (
			process.env.NODE_ENV !== 'test' &&
			(request.url.includes('api.stripe.com') || request.url.includes('checkout.stripe.com'))
		) {
			return
		}
		// Mondial Relay API requests are handled by passthrough handlers above, so they shouldn't reach here
		// But if they do, don't warn about them
		if (
			request.url.includes('api.mondialrelay.com') ||
			request.url.includes('www.mondialrelay.fr') ||
			request.url.includes('api.mondialrelay.fr')
		) {
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
