# Shipping System Implementation Plan

## Overview

Implement a flexible, carrier-based shipping system following industry best practices. The system will support multiple carriers (including Mondial Relay with full API integration), shipping zones, shipping methods, and rate calculation strategies.

## Key Design Principles

1. **Carriers**: Separate entity for shipping providers (Mondial Relay, Colissimo, DHL, etc.) with configurable availability
2. **Shipping Zones**: Geographic regions grouping countries (Europe, Africa, US, etc.) for easier management
3. **Country-Level Availability**: Carriers can be configured per country (e.g., Mondial Relay: France only)
4. **Zone-Level Availability**: Carriers can also be assigned to zones (e.g., Mondial Relay: Europe zone)
5. **Shipping Methods**: Delivery options with unique names per carrier (e.g., "Mondial Relay Standard", "Colissimo Express")
6. **Manual Methods**: Support generic shipping methods without carriers (for flexibility and fallback)
7. **Mondial Relay API Integration**: Full API support for pickup points, shipment creation, labels, and tracking
8. **Progressive Enhancement**: Start with manual rates, add API integration for carriers that support it
9. **Admin-Friendly**: Easy configuration - add/remove carriers, configure availability, manage API credentials

## Database Schema Changes

### New Models

```prisma
model Carrier {
  id          String   @id @default(cuid())
  name        String   @unique // e.g., "mondial_relay", "colissimo", "dhl"
  displayName String   // e.g., "Mondial Relay", "Colissimo (La Poste)", "DHL"
  description String?  // Optional description
  
  // Geographic availability
  availableCountries String[] // Array of ISO 2-letter country codes (e.g., ["FR", "BE"])
  availableZoneIds   String[] // Array of ShippingZone IDs
  
  // API Integration Configuration
  hasApiIntegration Boolean @default(false)
  apiProvider       String? // e.g., "mondial_relay", "colissimo_api", "dhl_api"
  
  // Display and status
  isActive    Boolean  @default(true)
  displayOrder Int     @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  methods     ShippingMethod[]
  
  @@index([isActive])
  @@index([name])
}

model ShippingZone {
  id          String   @id @default(cuid())
  name        String   // e.g., "Europe", "Africa", "United States"
  description String?  // Optional description
  countries   String[] // Array of ISO 2-letter country codes in this zone
  isActive    Boolean  @default(true)
  displayOrder Int     @default(0)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  methods     ShippingMethod[]
  
  @@index([isActive])
  @@index([name])
}

model ShippingMethod {
  id          String   @id @default(cuid())
  
  // Carrier relationship (nullable for manual/generic methods)
  carrierId   String?
  carrier     Carrier? @relation(fields: [carrierId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  
  // Zone relationship (required)
  zoneId      String
  zone        ShippingZone @relation(fields: [zoneId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  
  // Method name - unique per carrier
  name        String   // e.g., "Mondial Relay Standard", "DHL Express", "Standard Shipping"
  description String?  // Optional description
  
  // Rate calculation strategy
  rateType    ShippingRateType // FLAT, WEIGHT_BASED, PRICE_BASED, FREE
  
  // Flat rate (when rateType is FLAT)
  flatRate    Int?     // Price in cents
  
  // Weight-based rates (when rateType is WEIGHT_BASED)
  weightRates Json?    // Array of weight ranges and rates
  
  // Price-based rates (when rateType is PRICE_BASED)
  priceRates  Json?    // Array of price ranges and rates
  
  // Free shipping threshold
  freeShippingThreshold Int? // Order total in cents
  
  // Display and ordering
  isActive    Boolean  @default(true)
  displayOrder Int     @default(0)
  estimatedDays Int?   // Estimated delivery days (e.g., "3-5")
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  orders      Order[]
  
  @@index([carrierId])
  @@index([zoneId])
  @@index([isActive])
  @@unique([carrierId, name])
}

enum ShippingRateType {
  FLAT          // Fixed rate regardless of order
  WEIGHT_BASED  // Rate based on total weight
  PRICE_BASED   // Rate based on order total
  FREE          // Free shipping (with optional threshold)
}
```

## Rate Structure Details

### Type Definitions

The shipping rate structures are defined as TypeScript types in `app/utils/shipping.server.ts`:

```typescript
export type PriceRate = {
  minPrice: number    // Minimum order subtotal in cents
  maxPrice: number    // Maximum order subtotal in cents
  rate: number        // Shipping cost in cents for this price range
}

export type WeightRate = {
  minWeightGrams: number      // Minimum weight in grams
  maxWeightGrams: number | null // Maximum weight in grams (null = open-ended)
  rateCents: number           // Shipping cost in cents for this weight range
}
```

### JSON Structure Examples

**PriceRate Example:**
```json
[
  {"minPrice": 0, "maxPrice": 5000, "rate": 500},
  {"minPrice": 5001, "maxPrice": 10000, "rate": 1000},
  {"minPrice": 10001, "maxPrice": 999999, "rate": 0}
]
```

**WeightRate Example:**
```json
[
  {"minWeightGrams": 0, "maxWeightGrams": 1000, "rateCents": 500},
  {"minWeightGrams": 1001, "maxWeightGrams": 5000, "rateCents": 1000},
  {"minWeightGrams": 5001, "maxWeightGrams": null, "rateCents": 2000}
]
```

Note: `maxWeightGrams: null` indicates an open-ended range (e.g., "5001g and above").

### Rate Calculation Logic

The `calculateShippingRate()` function in `app/utils/shipping.server.ts` handles rate calculation:

- **FLAT**: Returns `flatRate` directly
- **PRICE_BASED**: Finds the first `PriceRate` where `subtotal >= minPrice && subtotal <= maxPrice`
- **WEIGHT_BASED**: Finds the first `WeightRate` where weight falls within the range (with null handling for open-ended ranges)
- **FREE**: Returns 0 if `subtotal >= freeShippingThreshold`, otherwise returns `flatRate`

**Fallback Behavior:**
- If no matching rate is found for PRICE_BASED or WEIGHT_BASED, returns 0
- If `weightRates` is null/empty for WEIGHT_BASED, falls back to `flatRate`
- If weight is not provided for WEIGHT_BASED, falls back to `flatRate`

### Zod Validation

Rate structures are validated using Zod schemas in `app/routes/admin+/shipping+/methods+/new.tsx`:

```typescript
const PriceRateSchema = z.object({
  minPrice: z.number().int().min(0),
  maxPrice: z.number().int().min(0),
  rate: z.number().int().min(0),
})

const WeightRateSchema = z.object({
  minWeightGrams: z.number().int().min(0),
  maxWeightGrams: z.number().int().min(0).nullable(),
  rateCents: z.number().int().min(0),
})
```

The form uses `z.preprocess()` to parse JSON strings and validate the structure:

```typescript
weightRates: z.preprocess(
  (val) => {
    // Parse JSON string
    if (!val || val === '' || val === null || val === undefined) return null
    const str = String(val)
    if (str.trim() === '') return null
    try {
      const parsed = JSON.parse(str)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  },
  z.array(WeightRateSchema).nullable().optional(),
)
```

This ensures:
- JSON strings are properly parsed
- Arrays are validated against the schema structure
- Type inference works correctly (returns `WeightRate[] | null | undefined`)

### Order Model Updates

```prisma
model Order {
  // ... existing fields ...
  
  // Shipping information
  shippingMethodId String?  // Selected shipping method
  shippingCost      Int      @default(0) // Shipping cost in cents (snapshot)
  shippingMethodName String? // Snapshot of method name
  shippingCarrierName String? // Snapshot of carrier name
  
  // Mondial Relay specific (nullable - only populated if using Mondial Relay)
  mondialRelayPickupPointId       String? // Selected Point Relais® ID
  mondialRelayPickupPointName     String? // Snapshot of pickup point name
  mondialRelayPickupPointAddress  String? // Pickup point street address
  mondialRelayPickupPointPostalCode String? // Pickup point postal code
  mondialRelayPickupPointCity     String? // Pickup point city
  mondialRelayPickupPointCountry  String? // Pickup point country code
  mondialRelayPickupPointData     String? // Full pickup point data as JSON (includes addressLine1, addressLine2, addressLine3)
  
  // Note: Shipment numbers and label URLs are NOT stored in orders
  // These are created on-demand when admins initiate shipment (see ADR 003)
  
  // ... rest of existing fields ...
  
  shippingMethod ShippingMethod? @relation(fields: [shippingMethodId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  
  @@index([shippingMethodId])
}
```

## Environment Variables Required

```bash
# Mondial Relay API1 (SOAP - Pickup Points & Tracking)
MONDIAL_RELAY_API1_STORE_CODE=...      # Code Enseigne
MONDIAL_RELAY_API1_PRIVATE_KEY=...     # Clé Privée
MONDIAL_RELAY_API1_BRAND_CODE=...      # Code Marque

# Mondial Relay API2 (REST - Shipment Creation & Labels)
MONDIAL_RELAY_API2_BRAND_ID=...        # Brand ID API
MONDIAL_RELAY_API2_LOGIN=...           # Login API
MONDIAL_RELAY_API2_PASSWORD=...        # API Password
MONDIAL_RELAY_API2_CUSTOMER_ID=...     # CustomerId (2-8 characters)
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Database migration (Carrier, ShippingZone, ShippingMethod models)
- Server utilities for zone/method lookup and rate calculation
- Basic rate calculation (FLAT, PRICE_BASED, FREE)

### Phase 2: Checkout Integration
- Shipping method selection UI
- Dynamic rate calculation
- Stripe integration with shipping costs

### Phase 3: Order Creation & Display
- Store shipping info in orders
- Display shipping details on order pages

### Phase 4: Admin Interface
- Manage shipping zones
- Manage carriers and API credentials
- Manage shipping methods and rates

### Phase 5: Mondial Relay API Integration
- API1: Pickup point search and selection (completed)
- API2: Shipment creation and label generation (manual, not automatic)
- Tracking integration (API1)
- Admin interface for manual shipment and label management

**Note**: Shipments and labels are created manually by admins, not automatically upon order creation. See [ADR 003: Manual Shipment Fulfillment](../decisions/003-manual-shipment-fulfillment.md) for the decision rationale.

## Key Files to Create/Modify

- `prisma/schema.prisma` - Add shipping models
- `app/utils/shipping.server.ts` - Shipping logic
- `app/utils/carriers/mondial-relay-api1.server.ts` - API1 client (SOAP)
- `app/utils/carriers/mondial-relay-api2.server.ts` - API2 client (REST)
- `app/utils/carriers/mondial-relay-permalinks.server.ts` - Generate permanent links
- `app/utils/carriers/mondial-relay-tracking.server.ts` - Tracking integration
- `app/components/shipping/mondial-relay-pickup-selector.tsx` - Pickup point selector UI
- `app/routes/shop+/checkout.tsx` - Add shipping selection
- `app/routes/admin+/shipping+/` - Admin management routes
- `app/utils/order.server.ts` - Store shipping info
- Order display pages - Show shipping details

