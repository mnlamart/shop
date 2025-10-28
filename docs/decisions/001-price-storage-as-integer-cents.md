# ADR 001: Price Storage as Integer Cents

## Status
Accepted

## Context
Initially, product prices were stored as `Decimal` type in the database. This approach led to several issues:

1. **Serialization Issues**: Prisma's `Decimal` type is not JSON-serializable by default, requiring manual conversion in loaders which led to complexity and potential bugs
2. **NaN Display Errors**: The conversion process sometimes resulted in prices displaying as `NaN` in the UI
3. **Hydration Issues**: Decimal-to-Number conversion across serialization boundaries caused double-loading and rendering issues
4. **Complexity**: Every price display required careful handling of the Decimal type

These issues manifested as prices displaying correctly on initial load, but then flashing to `NaN` shortly after page hydration.

## Decision
Store all prices as `Int` (integer) representing cents, instead of `Decimal` representing dollars.

This decision involves:
- Changing the `price` field in `Product` and `ProductVariant` models from `Decimal` to `Int`
- Storing prices multiplied by 100 (e.g., $10.99 is stored as 1099 cents)
- Creating a utility function `formatPrice()` to convert cents to display format (e.g., "$10.99")
- Updating seed data to generate prices in cents
- Updating all display logic to use the new `formatPrice()` utility

## Implementation Details

### Database Schema
```prisma
model Product {
  price Int // price in cents
  // ...
}

model ProductVariant {
  price Int? // price in cents (if different from product base price)
  // ...
}
```

### Price Utility
```typescript
// app/utils/price.ts
export function formatPrice(priceInCents: number, currency?: Currency | null): string {
  const symbol = currency?.symbol ?? '$'
  const decimals = currency?.decimals ?? 2
  return `${symbol}${(priceInCents / 100).toFixed(decimals)}`
}
```

### Display Pattern
```tsx
<p className="text-lg font-bold">{formatPrice(product.price, currency)}</p>
```

## Migration Strategy

The migration was created manually due to SQLite's limitations with ALTER TABLE:

```sql
-- Convert existing Decimal prices to Integer (cents)
INSERT INTO "new_Product" (..., "price", ...) 
SELECT ..., CAST(ROUND(CAST("price" AS REAL) * 100) AS INTEGER), ... 
FROM "Product";
```

## Consequences

### Positive
- ✅ **No Serialization Issues**: Integer types are naturally JSON-serializable
- ✅ **No NaN Errors**: Direct integer arithmetic eliminates conversion errors
- ✅ **Simpler Code**: No need for `Number(String(decimal))` conversions
- ✅ **Better Performance**: Integer operations are faster than Decimal
- ✅ **Industry Standard**: Common pattern in e-commerce (stripe, shopify, etc.)
- ✅ **Precise Calculations**: Integer math avoids floating-point precision issues
- ✅ **Easier Testing**: No special handling needed for price values

### Negative
- ⚠️ **Display Conversion Required**: Must divide by 100 for display (handled by utility)
- ⚠️ **Migration Complexity**: Required manual migration due to SQLite limitations
- ⚠️ **Potential Display Logic**: Need to ensure consistent use of `formatPrice()`

### Neutral
- 📝 **Storage Size**: Slightly larger than Decimal for prices < $1, but negligible
- 📝 **Range**: Supports prices up to ~$21 million, which is more than sufficient

## Alternatives Considered

### Alternative 1: Keep Decimal, Fix Serialization
- Convert Decimal to Number in loaders
- Problem: Still complex, prone to errors, hydration issues remain

### Alternative 2: Store as String
- Serialize prices as strings in the database
- Problem: No mathematical operations possible, inefficient queries

### Alternative 3: Store as Float
- Use REAL/FLOAT database type
- Problem: Floating-point precision errors, not suitable for financial data

## Related Decisions
- ADR 002: Store-Level Currency Configuration (related to price display format)

## References
- [Prisma Decimal Type Documentation](https://www.prisma.io/docs/concepts/components/prisma-schema/data-model#decimal)
- [Best Practices for Handling Money](https://www.react-spring.io/blog/how-to-handle-monetary-values-in-javascript)
- Migration: `20251028180823_convert_price_to_cents`
- Price Utility: `app/utils/price.ts`

