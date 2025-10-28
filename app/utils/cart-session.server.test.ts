import { describe, expect, test } from 'vitest'
import {
	getCartSessionId,
	getCartSessionIdFromRequest,
	createCartSessionCookieHeader,
	clearCartSessionCookieHeader,
	CART_SESSION_COOKIE,
	getSession,
	commitSession,
} from './cart-session.server.ts'

describe('cart-session.server', () => {
	test('getCartSessionId should create a new session ID if none exists', async () => {
		const request = new Request('http://example.com')

		const result = await getCartSessionId(request)

		expect(result.sessionId).toBeDefined()
		expect(typeof result.sessionId).toBe('string')
		expect(result.needsCommit).toBe(true)
		expect(result.cookieHeader).toBeDefined()
	})

	test('getCartSessionId should return the same session ID on subsequent calls', async () => {
		const session = await getSession()
		const testSessionId = 'test-session-123'
		session.set(CART_SESSION_COOKIE, testSessionId)
		const cookie = await commitSession(session)
		const request = new Request('http://example.com', {
			headers: { cookie },
		})

		const result = await getCartSessionId(request)

		expect(result.sessionId).toBe(testSessionId)
		expect(result.needsCommit).toBe(false)
	})

	test('getCartSessionIdFromRequest should return existing session ID', async () => {
		const session = await getSession()
		const testSessionId = 'test-session-456'
		session.set(CART_SESSION_COOKIE, testSessionId)
		const cookie = await commitSession(session)
		const request = new Request('http://example.com', {
			headers: { cookie },
		})

		const sessionId = await getCartSessionIdFromRequest(request)

		expect(sessionId).toBe(testSessionId)
	})

	test('getCartSessionIdFromRequest should return undefined if no session exists', async () => {
		const request = new Request('http://example.com')

		const sessionId = await getCartSessionIdFromRequest(request)

		expect(sessionId).toBeUndefined()
	})

	test('createCartSessionCookieHeader should create a cookie header with session ID', async () => {
		const sessionId = 'test-session-789'

		const cookieHeader = await createCartSessionCookieHeader(sessionId)

		expect(cookieHeader).toBeDefined()
		expect(cookieHeader).toContain('cart_session')
	})

	test('clearCartSessionCookieHeader should create a cookie header to clear session', async () => {
		// First set a session
		const session = await getSession()
		session.set(CART_SESSION_COOKIE, 'test-session-clear')
		await commitSession(session)

		// Now clear it
		const clearHeader = await clearCartSessionCookieHeader()

		expect(clearHeader).toBeDefined()
	})
})
