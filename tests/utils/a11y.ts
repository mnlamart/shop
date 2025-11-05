import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'

export interface A11yOptions {
	tags?: string[]
	exclude?: string | string[]
	include?: string | string[]
	disableRules?: string[]
}

/**
 * Runs an accessibility scan on a page using axe-core
 * 
 * @param page - Playwright page object
 * @param options - Configuration options for the scan
 * @returns Accessibility scan results
 * 
 * @example
 * ```typescript
 * const results = await checkAccessibility(page, {
 *   tags: ['wcag2a', 'wcag2aa'],
 *   exclude: '.third-party-widget'
 * })
 * expect(results.violations).toEqual([])
 * ```
 */
export async function checkAccessibility(
	page: Page,
	options?: A11yOptions,
) {
	const builder = new AxeBuilder({ page })

	if (options?.tags) {
		builder.withTags(options.tags)
	}
	if (options?.exclude) {
		builder.exclude(options.exclude)
	}
	if (options?.include) {
		builder.include(options.include)
	}
	if (options?.disableRules) {
		builder.disableRules(options.disableRules)
	}

	return await builder.analyze()
}

/**
 * Formats accessibility violations into a readable error message
 * 
 * @param violations - Array of accessibility violations
 * @returns Formatted error message
 */
export function formatViolations(violations: any[]): string {
	if (violations.length === 0) return ''

	return violations
		.map((violation) => {
			const nodes = violation.nodes
				.map((node: any) => `  - ${node.target.join(', ')}`)
				.join('\n')
			return `- ${violation.id}: ${violation.description}\n${nodes}`
		})
		.join('\n\n')
}

/**
 * Asserts that no accessibility violations exist
 * 
 * @param violations - Array of accessibility violations
 * @throws Error with formatted violation details if violations exist
 */
export function expectNoViolations(violations: any[]) {
	if (violations.length > 0) {
		const summary = formatViolations(violations)
		throw new Error(
			`Found ${violations.length} accessibility violation(s):\n\n${summary}`,
		)
	}
}

