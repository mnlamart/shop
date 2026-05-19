# E2E Flaky Tests Fix Reference

Reference document for debugging and fixing flaky E2E tests. Created from the flaky test fixing session using the Testing Knowledge Base (`.cursorrules`, `.cursor/rules/test.mdc`) and manual investigation. Context7 can be used for Playwright/Remix documentation when needed.

## Investigation Approach

**Always inspect failure artifacts before applying fixes.**

| Artifact | Location | Purpose |
|----------|----------|---------|
| Screenshot | `test-results/{test-name}/test-failed-1.png` | See what the page actually showed at failure |
| Page snapshot | `test-results/{test-name}/error-context.md` | YAML snapshot of DOM, roles, links |
| Trace | `test-results/{test-name}/trace.zip` | Playwright trace for step-by-step replay |

**Example**: "User Not Found" screenshots revealed the real issue was parallel test data deletion, not timing. Reading screenshots first prevented incorrect fixes.

**Reproduce flakiness:**
```bash
npx playwright test --workers=4
```

**Debug visually:**
```bash
npx playwright test -g "test name" --headed
```

---

## Root Causes Identified

| Root cause | Symptom | Affected tests |
|------------|---------|----------------|
| **Nuclear cleanup** | One test's `afterEach` deletes ALL matching data (e.g. `deleteMany({})` or `startsWith: 'SKU-'`) | product-detail, category |
| **Shared cleanup prefix** | Multiple tests use same prefix, so one test's cleanup deletes another's data | admin-users, admin-orders |
| **Role deletion** | Cleanup deletes roles `notIn ['admin','user']`, removing roles used by other tests | admin-users (add/remove/update role tests) |
| **Missing prerequisites** | Test assumes role/entity exists (e.g. `user` role) | cart-badge merge test |
| **Timing / state waits** | Using `sleep()` or insufficient wait for state changes (badge, redirect) | cart-badge, product-detail, checkout |

---

## Fixes Applied Per File

| File | Change |
|------|--------|
| `tests/e2e/admin-users.test.ts` | `getTestSpecificPrefix(testId)` with MD5 hash for user email; role names use `${testPrefix}-role-`; cleanup only deletes that test's data |
| `tests/e2e/admin-orders.test.ts` | Cleanup uses `currentPrefix` instead of `ORDER_PREFIX`; `if (!currentPrefix) return` guard in afterEach |
| `tests/e2e/category.test.ts` | Replaced nuclear `deleteMany({})` with scoped cleanup by `category-e2e-{hash}` prefix; categories/products use testPrefix |
| `tests/e2e/product-detail.test.ts` | Replaced `sku.startsWith('SKU-')` cleanup with `categoryId`-scoped cleanup; unique slug/sku with `randomUUID()`; `Promise.all([waitForURL, click])` for add-to-cart |
| `tests/e2e/cart-badge.test.ts` | `mergeCartInTest` after `page.goto('/')`; wait for quantity before badge; `expect(quantityInput).toHaveValue('3')`; navigate to `/shop` to trigger badge revalidation; `prisma.role.upsert` for user role |
| `tests/e2e/checkout.test.ts` | Wait for product in cart before navigating to checkout: `expect(page.getByRole('heading', { name: product.name })).toBeVisible()` |
| `tests/e2e/shop.test.ts` | Increased timeout for category link assertion to 15s |

---

## KB Principles Applied

From `.cursorrules` and `.cursor/rules/test.mdc`:

- **Wait for state, not time**: Never use `sleep()`; use `expect(locator).toHaveValue()`, `expect(page).toHaveURL()`, `waitForURL` with assertions
- **Test boundaries**: Each test must only clean up its own data; use test-specific prefixes
- **Test isolation**: Create test data in tests; don't rely on seed data
- **Use fixtures for setup/teardown**: Ensures cleanup even on failure
- **Accessible queries**: Prefer `getByRole()`, `getByLabelText()` over `getByTestId()`

---

## Patterns for Future Reference

### Scoped cleanup pattern

```typescript
import { createHash } from 'node:crypto'

const TEST_PREFIX = 'my-e2e-'

function getTestPrefix(testId: string) {
  const hash = createHash('md5').update(testId).digest('hex').slice(0, 8)
  return `${TEST_PREFIX}-${hash}`
}

test.afterEach(async ({}, testInfo) => {
  const prefix = getTestPrefix(testInfo.testId)
  await prisma.x.deleteMany({ where: { field: { startsWith: prefix } } })
})
```

### Form submission with redirect

```typescript
await Promise.all([
  page.waitForURL(/\/expected-path/, { timeout: 15000 }),
  page.getByRole('button', { name: /submit/i }).click(),
])
```

### Badge / UI state after mutation

```typescript
await expect(quantityInput).toHaveValue('3', { timeout: 5000 })
await page.goto('/shop')  // Trigger root loader revalidation
await expect(page.getByRole('link', { name: /3 items/i })).toBeVisible({ timeout: 15000 })
```

### Ensure prerequisite exists

```typescript
await prisma.role.upsert({
  where: { name: 'user' },
  update: {},
  create: { name: 'user', description: 'User' },
})
```

---

## Checklist for Future Flaky Tests

1. Check `test-results/{test-name}/test-failed-1.png` and `error-context.md`
2. Check if cleanup is too broad (`deleteMany({})` without where, or prefix shared across tests)
3. Replace `waitForTimeout` with state-based waits
4. Ensure test-specific prefixes for cleanup (hash of testId)
5. Run with `--workers=4` to reproduce
6. Run with `--headed` to debug visually

---

## Result

- **Before**: 3–5 flaky tests with 4 workers
- **After**: 120 tests passing, 0 flaky (with 4 workers)
