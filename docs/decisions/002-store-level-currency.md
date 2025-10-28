# ADR 002: Store-Level Currency Configuration

## Status
Accepted

## Context
Initially, we considered implementing currency at the product level, where each product could have its own currency. This would allow for:
- Multi-currency catalogs
- Regional pricing
- Product-specific currency handling

However, this approach has several issues:

1. **Cart Complexity**: Mixed-currency carts require complex conversion logic and display handling
2. **User Experience**: Customers would see products in different currencies, which is confusing
3. **Admin Complexity**: Admins would need to manage currency per product, increasing cognitive load
4. **Industry Standard**: Most e-commerce platforms use store-level currency (Shopify, WooCommerce, Etsy)
5. **Real-World Usage**: Single-currency stores are the norm for typical e-commerce operations

## Decision
Implement currency as a store-level setting, not a product-level attribute.

This decision involves:
- Removing `currencyId` field from the `Product` model
- Creating a `Settings` model to store store-wide configuration
- Creating a `Currency` model to manage available currencies
- Adding a `currencyId` field to the `Settings` model
- Using the store currency for all price displays
- Creating a `getStoreCurrency()` utility to retrieve the configured currency

## Implementation Details

### Database Schema
```prisma
model Settings {
  id        String   @id @default("settings")
  currencyId String
  
  currency Currency @relation(fields: [currencyId], references: [id])
}

model Currency {
  id        String   @id @default(cuid())
  code      String   @unique  // e.g., "USD", "EUR", "GBP"
  name      String             // e.g., "US Dollar"
  symbol    String             // e.g., "$", "€", "£"
  decimals  Int      @default(2)
  
  settings Settings[]
}

model Product {
  price Int // price in cents (no currencyId)
  // ...
}
```

### Currency Utility
```typescript
// app/utils/settings.server.ts
export async function getStoreCurrency() {
  const settings = await prisma.settings.findUnique({
    where: { id: 'settings' },
    include: {
      currency: {
        select: { symbol: true, decimals: true },
      },
    },
  })
  return settings?.currency
}
```

### Price Display Pattern
```tsx
// Loader
const currency = await getStoreCurrency()
return { products, currency }

// Component
<p>{formatPrice(product.price, currency)}</p>
```

## Consequences

### Positive
- ✅ **Simple Architecture**: One currency per store, straightforward implementation
- ✅ **Better UX**: Consistent currency throughout the shopping experience
- ✅ **Easier Admin**: Single setting to configure for the entire catalog
- ✅ **No Mixed-Cart Issues**: All products display in the same currency
- ✅ **Industry Standard**: Follows established e-commerce patterns
- ✅ **Scalable**: Can be extended to multi-store setups (each store has its own currency)

### Negative
- ⚠️ **Limited Flexibility**: Cannot have products in different currencies in the same store
- ⚠️ **Migration Required**: Existing product-level currency needed to be removed
- ⚠️ **Currency Change Impact**: Changing store currency affects all products

### Neutral
- 📝 **Future Extension**: If multi-currency is needed later, it would require a complete redesign
- 📝 **Display Logic**: All prices use the same currency for display

## Alternatives Considered

### Alternative 1: Product-Level Currency
- Each product has its own currency
- Problem: Cart complexity, user confusion, admin overhead

### Alternative 2: Region-Based Currency
- Currency based on user's region/IP
- Problem: More complex, requires geo-location services
- Note: Could be added as a future enhancement while keeping store-level as the base

### Alternative 3: Multi-Store with Different Currencies
- Different stores for different regions
- Problem: Inventory management complexity, not applicable to single stores

## Future Enhancements
- Admin UI to change store currency
- Support for additional currencies (EUR, GBP, etc.)
- Historical price tracking in original currency
- Currency conversion for multi-region stores (future)

## Related Decisions
- ADR 001: Price Storage as Integer Cents (uses currency for display formatting)

## References
- Migration: `20251028183056_store_level_currency`
- Settings Utility: `app/utils/settings.server.ts`
- Currency Model: `prisma/schema.prisma`

