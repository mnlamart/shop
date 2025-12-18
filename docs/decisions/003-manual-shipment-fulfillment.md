# ADR 003: Manual Shipment Fulfillment

## Status
Accepted

## Context
The shipping system was initially designed with automatic fulfillment capabilities. Mondial Relay API2 supports automatic shipment creation and label generation, which could be triggered immediately upon order creation. The original implementation plan included automatic fulfillment as part of Phase 5.

However, this approach presented several concerns:

1. **No Review Step**: Orders would be shipped immediately without admin review
2. **Error Risk**: Automatic API calls could fail or create incorrect shipments
3. **Lack of Control**: Admins couldn't verify order details before shipping
4. **API Rate Limits**: Automatic fulfillment could hit API rate limits during high order volumes
5. **Order Cancellations**: Orders might need to be cancelled before shipment, but automatic fulfillment would already create shipments

The migration `20251108000001_remove_mondial_relay_shipment_label_fields` removed the `mondialRelayShipmentNumber` and `mondialRelayLabelUrl` fields from the Order model, indicating a shift away from automatic fulfillment.

## Decision
Use manual shipment and label creation instead of automatic fulfillment upon order creation.

This decision involves:
- Orders store pickup point selection data (`mondialRelayPickupPointId`, `mondialRelayPickupPointName`, etc.) but not shipment/label data
- Shipments and labels are created manually by admins through the admin interface
- The `fulfillOrder()` function does not create shipments automatically
- Admin interface provides a manual workflow for shipment creation and label generation
- Labels are generated on-demand when an admin initiates shipment

## Implementation Details

### Database Schema
```prisma
model Order {
  // ... other fields ...
  
  // Mondial Relay specific (nullable - only populated if using Mondial Relay)
  mondialRelayPickupPointId       String? // Selected Point Relais® ID
  mondialRelayPickupPointName     String? // Snapshot of pickup point name
  mondialRelayPickupPointAddress  String? // Pickup point street address
  mondialRelayPickupPointPostalCode String? // Pickup point postal code
  mondialRelayPickupPointCity     String? // Pickup point city
  mondialRelayPickupPointCountry  String? // Pickup point country code
  mondialRelayPickupPointData     String? // Full pickup point data as JSON
  
  // Note: No mondialRelayShipmentNumber or mondialRelayLabelUrl fields
  // These are created on-demand when admin initiates shipment
}
```

### Fulfillment Function
```typescript
// app/utils/fulfillment.server.ts
export async function fulfillOrder(orderId: string): Promise<void> {
  // Load order
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    // ... select fields ...
  })

  if (!order) {
    // Order not found - log but don't throw (idempotent)
    return
  }

  // Future: Add other fulfillment tasks here:
  // - Update inventory systems
  // - Trigger warehouse notifications
  // - Send confirmation emails
  // - etc.
  
  // Note: Shipment creation is NOT automatic
  // Admins create shipments manually through admin interface
}
```

### Workflow
1. **Order Creation**: Customer completes checkout and selects Mondial Relay pickup point
2. **Order Storage**: Pickup point data is stored in the order record
3. **Admin Review**: Admin reviews order details in admin interface
4. **Manual Shipment**: Admin initiates shipment creation when ready
5. **Label Generation**: Label is generated on-demand via Mondial Relay API2
6. **Tracking**: Tracking number is stored and order status updated

## Consequences

### Positive
- ✅ **Admin Control**: Admins can review orders before shipping
- ✅ **Error Prevention**: Reduces risk of shipping incorrect or cancelled orders
- ✅ **Order Review**: Allows verification of order details, addresses, and items
- ✅ **Reduced API Calls**: Only creates shipments when needed, avoiding unnecessary API usage
- ✅ **Flexibility**: Admins can batch shipments or handle special cases manually
- ✅ **Cost Control**: Prevents accidental shipments that might incur costs
- ✅ **Cancellation Handling**: Orders can be cancelled before shipment creation

### Negative
- ⚠️ **Manual Step Required**: Admins must manually create each shipment
- ⚠️ **Potential Delay**: Fulfillment may be delayed if admin doesn't process orders immediately
- ⚠️ **Admin Workload**: Increases admin tasks for high-volume stores
- ⚠️ **No Automation**: Cannot fully automate the fulfillment process

### Neutral
- 📝 **Scalability**: Manual approach works well for small to medium stores
- 📝 **Future Enhancement**: Automatic fulfillment could be added later if needed
- 📝 **API Integration**: Mondial Relay API2 integration exists but is used manually

## Alternatives Considered

### Alternative 1: Automatic Fulfillment
- Create shipments immediately upon order creation
- Problem: No review step, high error risk, cannot handle cancellations, potential API rate limit issues

### Alternative 2: Scheduled Fulfillment
- Automatically create shipments after a delay (e.g., 1 hour)
- Problem: Still lacks review step, adds complexity, doesn't solve cancellation issues

### Alternative 3: Hybrid Approach
- Automatic fulfillment with admin override/cancellation capability
- Problem: Adds complexity, still creates shipments that might need cancellation, requires additional error handling

### Alternative 4: Conditional Automatic Fulfillment
- Automatic fulfillment only for certain order types or conditions
- Problem: Adds complexity, still has risks for automatic cases, inconsistent user experience

## Future Enhancements

If automatic fulfillment becomes desirable in the future, consider:
- **Admin Configuration**: Allow admins to enable/disable automatic fulfillment per shipping method
- **Delay Option**: Add configurable delay before automatic fulfillment (e.g., 30 minutes)
- **Review Queue**: Create a review queue for orders before automatic fulfillment
- **Cancellation Window**: Allow order cancellation within a time window before automatic shipment
- **Batch Processing**: Process multiple orders in batches to reduce API calls

## Related Decisions
- ADR 001: Price Storage as Integer Cents (unrelated, but part of order system)
- ADR 002: Store-Level Currency Configuration (unrelated, but part of order system)

## References
- Migration: `20251108000001_remove_mondial_relay_shipment_label_fields`
- Fulfillment Service: `app/utils/fulfillment.server.ts`
- Order Model: `prisma/schema.prisma`
- Shipping System Plan: `docs/plans/shipping-system-implementation.md`
