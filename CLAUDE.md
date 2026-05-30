# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This is an Epic Stack (`epicweb.dev/epic-stack`) instance extended into an e-commerce app: product catalog, cart, Stripe checkout, order/fulfillment management, and an admin dashboard. Read `docs/README.md` first for an index of the architecture docs — they cover the non-obvious parts (relational variants, fixture images, checkout fallback, etc.).

## Commands

Package manager is **pnpm 9.15.0** (also has `package-lock.json` but pnpm is canonical — see `pnpm-workspace.yaml`).

- `pnpm run dev` — dev server with MSW mocks on `MOCKS=true` (`server/dev-server.js` → `server/index.ts`). Use `dev:no-mocks` to hit real third parties.
- `pnpm run build` — runs `build:remix` (React Router build) then `build:server` (`tsx other/build-server.ts` → `server-build/`).
- `pnpm run start` — production: runs `index.js`, which loads `server-build/index.js`.
- `pnpm run setup` — first-time setup: build + `prisma migrate deploy` + `prisma generate --sql` + `playwright install`.
- `pnpm run typecheck` — runs `react-router typegen` (generates route types into `.react-router/`) **then** `tsc`. Always run typegen before tsc when types look stale.
- `pnpm run lint` / `pnpm run format` — ESLint / Prettier.
- `pnpm run test` — Vitest (unit/integration, colocated `*.test.{ts,tsx}` in `app/`). Run a single file: `pnpm test path/to/file.test.ts`. Run a single test: append `-t "test name"`.
- `pnpm run test:e2e` — Playwright with UI. `test:e2e:run` for headless CI mode (builds first via `pretest:e2e:run`, then starts `start:mocks`). `test:a11y` for the axe-core suite only.
- `pnpm run validate` — full gate: vitest + lint + typecheck + e2e.

Prisma: `pnpm exec prisma migrate dev --name <name>`, `pnpm exec prisma studio`. Seed runs via `tsx prisma/seed.ts` (configured in `package.json` `prisma.seed`).

## Architecture

### Routing — React Router 7 with flat-routes

- Route tree is built by `app/routes.ts` using `remix-flat-routes` via `@react-router/remix-routes-option-adapter`.
- **`+` suffix directories** are route folders (e.g. `app/routes/admin+/products+/`). Files inside compose into nested URLs.
- Filename conventions: `_layout.tsx` = pathless layout, `_index.tsx` = index route, `$param.tsx` = dynamic, `foo_.bar.tsx` = sibling (not nested under `foo`).
- Files ignored by the router: `*.css`, `*.test.*`, `*.server.*`, `*.client.*`, `__*.*`. Use `.server.ts`/`.client.ts` to colocate non-route modules next to routes; use `__new.server.tsx` style for shared route internals.
- Top-level route areas:
  - `_auth+/` — login, signup, onboarding, verify, passkeys, OAuth callback
  - `_marketing+/`, `_seo+/` — public pages, sitemap, robots
  - `shop+/` — storefront: products, categories, cart, checkout flow (`checkout+/{delivery,shipping,payment,review,success}.tsx`), orders
  - `admin+/` — admin dashboard, protected at `_layout.tsx` (role-based). CRUD for products, categories, attributes, users, orders, shipping, plus a cache inspector.
  - `account+/`, `users+/`, `resources+/`, `webhooks+/` — settings, public user pages, image/asset resources, Stripe webhooks
- TS path aliases: `#app/*` → `./app/*`, `#tests/*` → `./tests/*` (declared in `package.json#imports`).

### Server entry

`index.js` (root) is the production entry. It installs source-map-support, optionally boots MSW mocks (`MOCKS=true`), then in dev imports `server/index.ts` and in prod imports `server-build/index.js`. `server/index.ts` sets up Express (compression, helmet, rate limit, morgan, Sentry, `@react-router/express` request handler) and creates the Vite middleware server in dev.

### Database — Prisma 7 + SQLite (better-sqlite3) + LiteFS

- Single schema in `prisma/schema.prisma` (~30 models). E-commerce uses normalized variants: `Product` → `ProductVariant` → `VariantAttributeValue` → `AttributeValue` → `Attribute` (see `docs/relational-variants.md` — JSON variants were intentionally rejected).
- SQL files in `prisma/sql/` are compiled by `prisma generate --sql` (typed SQL preview feature is on).
- Production uses LiteFS on Fly (`fly.toml`, `app/utils/litefs.server.ts`). Reads can hit replicas, writes go through the primary — keep this in mind for mutations.
- Tests must not depend on seed data — create what you need via the helpers in `tests/db-utils.ts`, `tests/user-utils.ts`, `tests/product-utils.ts`.

### State, forms, validation

- Forms use `@conform-to/react` + `@conform-to/zod` against Zod v4 schemas in `app/schemas/`. Zod v4 uses the `error` parameter (not `message`) — see `docs/implementation-notes.md#schema-validation`.
- No client-side data fetching framework — server loaders/actions are the source of truth.
- Auth, sessions, permissions, toasts, themes, client hints, monitoring all live under `app/utils/` with `.server.ts` / `.client.tsx` split.

### Payments and fulfillment

- Stripe checkout flow lives in `app/routes/shop+/checkout+/` plus `app/utils/stripe.server.ts`, `app/utils/checkout.server.ts`, and the webhook in `app/routes/webhooks+/`. The success page polls and falls back to a manual sync when the webhook is late (`docs/checkout-success-page.md`).
- Order lifecycle, idempotency, and atomic state transitions are documented in `docs/order-management-system.plan.md` — read before touching `app/utils/order.server.ts` or shipping/tracking utilities.
- Carriers (Mondial Relay etc.) live in `app/utils/carriers/` and `app/utils/providers/`.

### Testing

- **Vitest** for unit/integration. Setup: `tests/setup/setup-test-env.ts` and global setup at `tests/setup/global-setup.ts`. Include pattern is `./app/**/*.test.{ts,tsx}` — tests are colocated with source.
- **Playwright** for E2E in `tests/e2e/`. Custom helpers in `tests/playwright-utils.ts` — use the exported `test`/`expect` from there, plus the `prepareTest` / database helpers, not raw `@playwright/test`. Tests run with 4 workers in parallel; isolate test data per-test (timestamps/UUIDs) since the suite cleans up scoped.
- **MSW** handlers in `tests/mocks/` mock Stripe, Resend, Tigris (image storage), GitHub OAuth. Both the dev server (`MOCKS=true`) and the E2E suite (`start:mocks`) use them.
- **axe-core** suite at `tests/e2e/a11y.test.ts` (`pnpm run test:a11y`). The project targets WCAG 2.1 AA.

### Build artifacts and CI

- Generated dirs that should not be hand-edited: `.react-router/` (route types), `build/`, `server-build/`, `app/components/ui/icons/` (sprite + types, generated by `vite-plugin-icons-spritesheet` from `other/svg-icons/`).
- Deploy is Fly.io via `.github/workflows/deploy.yml`. Sentry sourcemap upload requires `SENTRY_AUTH_TOKEN`.

## Code conventions (from `.cursor/rules/`)

- **Avoid `useEffect`** for derived state or event-driven side effects. Prefer event handlers, ref callbacks, `useSyncExternalStore`, CSS. `useEffect` is fine for true external subscriptions (e.g. global `keydown`). See `.cursor/rules/avoid-use-effect.mdc`.
- **Testing rules** in `.cursor/rules/test.mdc` apply to any `*.test.*` / `*.spec.*` / `tests/**` work. Highlights: test intentions not implementation, never `sleep()`, prefer `getByRole` (no `getByTestId`), always mock third-party HTTP via MSW, never rely on seed data, never mock the code under test. The file also instructs Cursor to prefix replies with "KB" — that is a Cursor-only convention and does not apply to Claude Code.

## Environment

Copy `.env.example` to `.env` for local config. Stripe CLI setup notes are in `STRIPE_CLI_SETUP.md`. Engines field pins Node 22 (verify against `.github/workflows/deploy.yml`).

## Agent skills

### Issue tracker

GitHub Issues on `Seven74AI/shop`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
