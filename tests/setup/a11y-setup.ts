import * as axe from 'axe-core'

/**
 * Configure axe-core for component testing
 * This configuration is applied globally for all component tests
 * 
 * Note: Rules configuration is done via tags. Individual rule configuration
 * can be done per-test using AxeBuilder options.
 */
axe.configure({
	tags: ['wcag2a', 'wcag2aa', 'best-practice'],
} as any)

/**
 * Check component accessibility
 * 
 * @param container - HTML element container from React Testing Library
 * @returns Promise resolving to accessibility scan results
 * 
 * @example
 * ```typescript
 * import { render } from '@testing-library/react'
 * import { checkComponentA11y } from '#tests/setup/a11y-setup.ts'
 * 
 * test('component should be accessible', async () => {
 *   const { container } = render(<MyComponent />)
 *   const results = await checkComponentA11y(container)
 *   expect(results.violations).toEqual([])
 * })
 * ```
 */
export async function checkComponentA11y(container: HTMLElement) {
	return await axe.run(container)
}

