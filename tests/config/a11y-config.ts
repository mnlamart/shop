import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'

/**
 * Default accessibility configuration
 * Uses WCAG 2.1 Level AA compliance
 */
export const DEFAULT_A11Y_TAGS = ['wcag2a', 'wcag2aa'] as const

/**
 * Creates a configured AxeBuilder instance
 * 
 * @param page - Playwright page object
 * @returns Configured AxeBuilder instance
 */
export function createAxeBuilder(page: Page) {
	return new AxeBuilder({ page }).withTags([...DEFAULT_A11Y_TAGS])
}

