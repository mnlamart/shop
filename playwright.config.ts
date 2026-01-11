import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const PORT = process.env.PORT || '3000'

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 20 * 1000, // Reduced from 15s to fail faster
	expect: {
		timeout: 5 * 1000,
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 4 : 2,
	reporter: process.env.CI ? 'html' : [['html', { open: 'never' }]],
	globalSetup: './tests/setup/playwright-global-setup.ts',
	use: {
		baseURL: `http://localhost:${PORT}/`,
		trace: 'on-first-retry',
		headless: true,
	},

	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],

	webServer: {
		command: process.env.CI ? 'npm run start:mocks' : 'npm run dev',
		port: Number(PORT),
		reuseExistingServer: true,
		timeout: 120 * 1000,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			PORT,
			NODE_ENV: 'test',
		},
	},
})
