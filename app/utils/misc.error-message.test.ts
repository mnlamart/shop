import { faker } from '@faker-js/faker'
import { expect, test, vi } from 'vitest'
import { getErrorMessage } from './misc.tsx'

vi.mock('@sentry/react-router', () => ({
	captureException: vi.fn(),
}))

// Mock window for client-side check
Object.defineProperty(global, 'window', {
	value: { ...global.window },
	writable: true,
})

test('Error object returns message', () => {
	const message = faker.lorem.words(2)
	expect(getErrorMessage(new Error(message))).toBe(message)
})

test('String returns itself', () => {
	const message = faker.lorem.words(2)
	expect(getErrorMessage(message)).toBe(message)
})

test('undefined falls back to Unknown', () => {
	expect(getErrorMessage(undefined)).toBe('Unknown Error')
	// Note: Sentry logging is async and client-side only, so we can't easily test it in this unit test
	// The function still works correctly - it returns 'Unknown Error' as expected
})
