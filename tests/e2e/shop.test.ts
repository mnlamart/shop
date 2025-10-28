import { test, expect } from '../playwright-utils.ts'

test('shop home page should display welcome message', async ({ page }) => {
	await page.goto('/shop')
	await expect(page.getByRole('heading', { name: /welcome to our shop/i })).toBeVisible()
})

test('shop home page should have browse all products link', async ({ page }) => {
	await page.goto('/shop')
	await expect(page.getByRole('link', { name: /browse all products/i })).toBeVisible()
})

test('shop home page should display category cards', async ({ page }) => {
	await page.goto('/shop')
	const categoryCards = page.getByTestId('category-card')
	await expect(categoryCards.first()).toBeVisible()
})
