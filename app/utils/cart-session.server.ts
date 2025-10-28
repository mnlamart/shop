import { createId as cuid } from '@paralleldrive/cuid2'
import { createCookieSessionStorage } from 'react-router'

export const CART_SESSION_COOKIE = 'cart_session'

const cartSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'cart_session',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		secrets: process.env.SESSION_SECRET.split(','),
		maxAge: 60 * 60 * 24 * 30, // 30 days
	},
})

export const { getSession, commitSession, destroySession } = cartSessionStorage

/**
 * Get or create a cart session ID for guest users
 * Returns the session ID from the cookie, or creates a new one
 * Also returns whether a new session was created (for committing)
 */
export async function getCartSessionId(request: Request): Promise<{ sessionId: string, needsCommit: boolean, cookieHeader?: string }> {
	const session = await getSession(request.headers.get('cookie'))
	let sessionId = session.get(CART_SESSION_COOKIE) as string | undefined

	if (!sessionId) {
		sessionId = cuid()
		session.set(CART_SESSION_COOKIE, sessionId)
		const cookieHeader = await commitSession(session)
		return { sessionId, needsCommit: true, cookieHeader }
	}

	return { sessionId, needsCommit: false }
}

/**
 * Get cart session ID from cookie without creating a new one
 */
export async function getCartSessionIdFromRequest(request: Request): Promise<string | undefined> {
	const session = await getSession(request.headers.get('cookie'))
	return session.get(CART_SESSION_COOKIE) as string | undefined
}

/**
 * Create a session cookie header for cart session
 */
export async function createCartSessionCookieHeader(sessionId: string): Promise<string> {
	const session = await getSession()
	session.set(CART_SESSION_COOKIE, sessionId)
	return commitSession(session)
}

/**
 * Create a session cookie header to clear cart session
 */
export async function clearCartSessionCookieHeader(): Promise<string> {
	const session = await getSession()
	session.unset(CART_SESSION_COOKIE)
	return commitSession(session)
}
