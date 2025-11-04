import { invariant } from '@epic-web/invariant'
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { createCartSessionCookieHeader } from '#app/utils/cart-session.server.ts'
import { mergeGuestCartToUser } from '#app/utils/cart.server.ts'
import { UNCATEGORIZED_CATEGORY_ID } from '#app/utils/category.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getStoreCurrency } from '#app/utils/settings.server.ts'
import { createProductData, createVariantData } from '#tests/product-utils.ts'
import { consoleError } from '#tests/setup/setup-test-env.ts'
import { getSessionCookieHeader } from '#tests/utils.ts'

// TODO: Re-implement tests when payment provider is integrated
describe.skip('Checkout', () => {
	// All Stripe-related tests have been removed
	// Tests will be re-implemented when payment provider is integrated
})
