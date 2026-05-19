import { reactRouter } from '@react-router/dev/vite'
import {
	type SentryReactRouterBuildOptions,
	sentryReactRouter,
} from '@sentry/react-router'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { envOnlyMacros } from 'vite-env-only'
import { iconsSpritesheet } from 'vite-plugin-icons-spritesheet'

// Plugin to externalize node builtins for Vitest 4 compatibility
function externalizeNodeBuiltins() {
	return {
		name: 'externalize-node-builtins',
		enforce: 'pre' as const,
		resolveId(id: string) {
			if (id.startsWith('node:')) {
				return { id, external: true }
			}
			return null
		},
	}
}

const MODE = process.env.NODE_ENV

export default defineConfig((config) => ({
	build: {
		target: 'es2022',
		cssMinify: MODE === 'production',

		rollupOptions: {
			external: [/node:.*/, 'fsevents'],
		},

		assetsInlineLimit: (source: string) => {
			if (
				source.endsWith('favicon.svg') ||
				source.endsWith('apple-touch-icon.png')
			) {
				return false
			}
		},

		sourcemap: MODE !== 'production' || !!process.env.SENTRY_AUTH_TOKEN,
	},
	server: {
		watch: {
			ignored: ['**/playwright-report/**'],
		},
	},
	ssr: {
		external: ['node:sqlite'],
	},
	sentryConfig,
	plugins: [
		externalizeNodeBuiltins(),
		envOnlyMacros(),
		tailwindcss(),
		iconsSpritesheet({
			inputDir: './other/svg-icons',
			outputDir: './app/components/ui/icons',
			fileName: 'sprite.svg',
			withTypes: true,
			iconNameTransformer: (name) => name,
		}),
		// it would be really nice to have this enabled in tests, but we'll have to
		// wait until https://github.com/remix-run/remix/issues/9871 is fixed
		MODE === 'test' ? null : reactRouter(),
		MODE === 'production' && process.env.SENTRY_AUTH_TOKEN
			? sentryReactRouter(sentryConfig, config)
			: null,
	],
	resolve: {
		external: ['node:sqlite'],
	},
	test: {
		include: ['./app/**/*.test.{ts,tsx}'],
		setupFiles: ['./tests/setup/setup-test-env.ts'],
		globalSetup: ['./tests/setup/global-setup.ts'],
		restoreMocks: true,
		server: {
			deps: {
				external: [/node:.*/],
			},
		},
		coverage: {
			include: ['app/**/*.{ts,tsx}'],
			all: true,
		},
	},
}))

const sentryConfig: SentryReactRouterBuildOptions = {
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,

	unstable_sentryVitePluginOptions: {
		release: {
			name: process.env.COMMIT_SHA,
			setCommits: {
				auto: true,
			},
		},
		sourcemaps: {
			filesToDeleteAfterUpload: ['./build/**/*.map', '.server-build/**/*.map'],
		},
	},
}
