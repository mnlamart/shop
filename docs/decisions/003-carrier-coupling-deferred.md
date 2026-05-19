# ADR 003: Carrier Coupling — Mondial Relay Hardcoded, Abstraction Deferred

## Status
Accepted (deferred)

Date: 2026-05-20

## Context
The shipping system was built incrementally against a single carrier (Mondial Relay). As a result, the codebase has assumed exactly one carrier in several places:

**Server utilities** (direct imports of Mondial Relay API clients):
- `app/utils/shipment.server.ts` — `createMondialRelayShipment` calls `searchPickupPoints` and `createShipment` from `carriers/mondial-relay-api{1,2}.server.ts`
- `app/utils/label.server.ts` — `getMondialRelayLabel`, `createMondialRelayShipmentAndLabel` call `getLabel` from `carriers/mondial-relay-api2.server.ts`
- `app/utils/tracking.server.ts` — `getMondialRelayTrackingInfo` calls `getTrackingInfo` from `carriers/mondial-relay-api1.server.ts`
- `app/utils/tracking-status.server.ts` — checks `order.shippingCarrierName !== 'Mondial Relay'` and reads `order.mondialRelayShipmentNumber`
- `app/utils/fulfillment.server.ts` — branches on `shippingCarrierName === 'Mondial Relay'` to call the Mondial Relay shipment creator

**Database schema** (`prisma/schema.prisma`, `Order` model):
- `mondialRelayPickupPointId`
- `mondialRelayPickupPointName`
- `mondialRelayShipmentNumber`
- `mondialRelayLabelUrl`

These four columns are carrier-specific on a model that is otherwise generic.

**UI** (`app/routes/admin+/orders+/__shipment-management-section.tsx`):
- Literal `order.shippingCarrierName === 'Mondial Relay'` checks gate the entire shipment / tracking / label UI.

**Routes** (carrier-agnostic names, carrier-specific implementations):
- `admin+/orders+/$orderNumber.create-shipment.ts`
- `admin+/orders+/$orderNumber.label.ts`
- `admin+/orders+/$orderNumber.sync-tracking.ts`

**Components**:
- `app/components/shipping/mondial-relay-pickup-selector.tsx` is a Mondial-Relay-specific component bound directly to the schema fields above.

There is no carrier abstraction layer today. Adding a second carrier (Colissimo, DHL, UPS) without one would require touching every file listed above plus a schema migration.

## Decision
**Defer the carrier abstraction until a second carrier is actually queued.** Capture the target shape here so the next person knows what "the right refactor" looks like.

### Target shape (for when this is acted on)

**1. Adapter interface** — `app/utils/carriers/types.ts`:

```ts
export interface CarrierAdapter {
  code: string // matches Carrier.code in DB
  supportsPickupPoints: boolean
  supportsLabels: boolean
  supportsTrackingSync: boolean
  createShipment(orderId: string, storeAddress: StoreAddress): Promise<{
    shipmentNumber: string
    labelUrl: string | null
  }>
  getLabelPdf?(shipmentNumber: string): Promise<Blob>
  getTrackingInfo?(shipmentNumber: string): Promise<TrackingInfo>
  mapTrackingStatusToOrderStatus?(statusCode: string): OrderStatus | null
  searchPickupPoints?(postalCode: string, country: string): Promise<PickupPoint[]>
}

export function getCarrierAdapter(code: string): CarrierAdapter | null
```

Registry dispatches on `Carrier.code` (already in the DB), not on `shippingCarrierName` (display string).

**2. Schema migration** — replace the four `mondialRelay*` columns on `Order` with a polymorphic `OrderShipment` table:

```prisma
model OrderShipment {
  id                String   @id @default(cuid())
  orderId           String   @unique
  order             Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  carrierId         String
  carrier           Carrier  @relation(fields: [carrierId], references: [id])
  externalShipmentId String?
  pickupPointId     String?
  pickupPointName   String?
  labelUrl          String?
  rawPayload        Json?
  createdAt         DateTime @default(now())
}
```

Backfill the existing `mondialRelay*` data into `OrderShipment` rows in the migration.

**3. UI** — `__shipment-management-section.tsx` keys off `order.shipment?.carrier.{supportsPickupPoints,supportsLabels,supportsTrackingSync}` instead of `order.shippingCarrierName === 'Mondial Relay'`. The pickup-point selector becomes generic and picks up its UI from the carrier adapter.

**4. Server utils** — `shipment.server.ts`, `label.server.ts`, `tracking.server.ts`, `tracking-status.server.ts`, `fulfillment.server.ts` become thin dispatchers that look up the adapter via `getCarrierAdapter(order.shipment.carrier.code)` and forward.

## Why deferred
- **No second carrier on the roadmap.** Designing an abstraction against one implementation produces a leaky abstraction; better to wait until a second adapter exposes the real interface needs.
- **Schema migration is expensive.** Replacing four columns with a polymorphic table requires a non-trivial data migration and changes to every order-reading code path.
- **Current coupling is greppable and localised.** All Mondial Relay references can be enumerated in a few minutes (see Context above), and the post-decomposition `__shipment-management-section.tsx` consolidates the UI-side coupling in one file.

## Consequences
- Any work to add a second carrier must precede the feature with this refactor — there is no shortcut. Estimate the abstraction work into the carrier-onboarding ticket, not the feature delivery.
- The admin UI cannot currently show carrier-agnostic shipment state (label/tracking/pickup) for any non-Mondial-Relay order.
- Tests, mocks, and dev fixtures assume Mondial Relay (`tests/mocks/`, `app/utils/carriers/mondial-relay-api{1,2}.server.test.ts`). New carriers must add matching test infrastructure.

## Re-open when
A second carrier integration is planned. Update this ADR's status to `Superseded by ADR 00X` and link the implementation PR.
