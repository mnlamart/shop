import closeWithGrace from 'close-with-grace'
import { setupServer } from 'msw/node'
import { handlers as githubHandlers } from './github.ts'
import { handlers as pwnedPasswordApiHandlers } from './pwned-passwords.ts'
import { handlers as resendHandlers } from './resend.ts'
import { handlers as stripeHandlers } from './stripe.ts'
import { handlers as tigrisHandlers } from './tigris.ts'

const handlersToUse = [
	// IMPORTANT: Stripe passthrough handlers MUST be first to ensure they're matched before other handlers
	// In development, pass through Stripe API requests (we want to use real Stripe)
	...(process.env.NODE_ENV !== 'test' ? stripeHandlers : []),
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
		// Always bypass Stripe API requests - we want to use real Stripe
		// This prevents MSW from intercepting these requests at all
		if (request.url.includes('api.stripe.com') || request.url.includes('checkout.stripe.com')) {
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
