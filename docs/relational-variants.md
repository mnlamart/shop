# Relational Product Variant System

## Overview

Product variants use a normalized relational database structure instead of JSON storage, following industry best practices and providing better type safety, querying capabilities, and scalability.

## Database Schema

### Core Models

#### Attribute
Global attributes that can be applied to any product:
```prisma
model Attribute {
  id        String   @id @default(cuid())
  name      String   @unique // e.g., "Size", "Color", "Material"
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  values AttributeValue[]
}
```

#### AttributeValue
Specific values for each attribute:
```prisma
model AttributeValue {
  id         String   @id @default(cuid())
  attributeId String
  value      String   // e.g., "M", "L", "XL" for Size
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  attribute Attribute @relation(fields: [attributeId], references: [id], onDelete: Cascade)
  variantAttributeValues VariantAttributeValue[]
}
```

#### VariantAttributeValue
Junction table linking product variants to specific attribute values:
```prisma
model VariantAttributeValue {
  id              String @id @default(cuid())
  productVariantId String
  attributeValueId String

  productVariant ProductVariant @relation(fields: [productVariantId], references: [id], onDelete: Cascade)
  attributeValue AttributeValue @relation(fields: [attributeValueId], references: [id], onDelete: Cascade)

  @@unique([productVariantId, attributeValueId])
}
```

#### ProductVariant
Product variants with individual pricing and stock:
```prisma
model ProductVariant {
  id            String   @id @default(cuid())
  productId     String
  sku           String   @unique
  price         Decimal? // Optional override of base product price
  stockQuantity Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  product              Product                @relation(fields: [productId], references: [id], onDelete: Cascade)
  variantAttributeValues VariantAttributeValue[]
}
```

## Benefits Over JSON Storage

### Type Safety
- **Compile-time Validation**: TypeScript can validate attribute relationships
- **Database Constraints**: Foreign key constraints ensure data integrity
- **Referential Integrity**: Cascade deletes prevent orphaned records

### Querying Capabilities
- **Efficient Filtering**: Filter products by specific attribute values
- **Complex Queries**: Join across attributes for advanced filtering
- **Indexing**: Database indexes on attribute values for fast lookups

### Scalability
- **Normalized Data**: No duplicate attribute definitions
- **Flexible Attributes**: Add new attributes without schema changes
- **Performance**: Optimized queries with proper indexing

## Implementation Examples

### Creating Attributes and Values
```typescript
// Create Size attribute
const sizeAttribute = await prisma.attribute.create({
  data: {
    name: 'Size',
    slug: 'size',
  },
})

// Create size values
const sizeValues = await Promise.all([
  prisma.attributeValue.create({
    data: { attributeId: sizeAttribute.id, value: 'XS' },
  }),
  prisma.attributeValue.create({
    data: { attributeId: sizeAttribute.id, value: 'S' },
  }),
  // ... more sizes
])
```

### Creating Product Variants
```typescript
// Create product variant with multiple attributes
const variant = await prisma.productVariant.create({
  data: {
    productId: product.id,
    sku: 'PROD-001-M-BLACK',
    price: 29.99,
    stockQuantity: 50,
  },
})

// Link variant to attribute values
await Promise.all([
  prisma.variantAttributeValue.create({
    data: {
      productVariantId: variant.id,
      attributeValueId: mediumSizeValue.id,
    },
  }),
  prisma.variantAttributeValue.create({
    data: {
      productVariantId: variant.id,
      attributeValueId: blackColorValue.id,
    },
  }),
])
```

### Querying Variants with Attributes
```typescript
// Get product with all variants and their attributes
const product = await prisma.product.findUnique({
  where: { id: productId },
  include: {
    variants: {
      include: {
        variantAttributeValues: {
          include: {
            attributeValue: {
              include: {
                attribute: true,
              },
            },
          },
        },
      },
    },
  },
})

// Transform for frontend consumption
const variantsWithAttributes = product.variants.map(variant => ({
  ...variant,
  attributes: variant.variantAttributeValues.reduce((acc, vav) => {
    acc[vav.attributeValue.attribute.name] = vav.attributeValue.value
    return acc
  }, {} as Record<string, string>),
}))
```

## Form Handling

### Zod Schema
```typescript
const VariantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1),
  price: z.number().min(0).multipleOf(0.01).optional(),
  stockQuantity: z.number().int().min(0),
  attributeValueIds: z.array(z.string()).min(1), // Array of AttributeValue IDs
})
```

### Form Processing
```typescript
// In product editor action
const { attributeValueIds, ...variantData } = variant

// Create variant
const newVariant = await prisma.productVariant.create({
  data: {
    ...variantData,
    productId: product.id,
  },
})

// Link to attribute values
await Promise.all(
  attributeValueIds.map(attributeValueId =>
    prisma.variantAttributeValue.create({
      data: {
        productVariantId: newVariant.id,
        attributeValueId,
      },
    })
  )
)
```

## Migration from JSON System

### Before (JSON-based)
```typescript
// Old JSON approach
const variant = {
  sku: 'PROD-001-M-BLACK',
  attributes: {
    size: 'M',
    color: 'Black',
  },
}
```

### After (Relational)
```typescript
// New relational approach
const variant = {
  sku: 'PROD-001-M-BLACK',
  attributeValueIds: ['size-m-id', 'color-black-id'],
}
```

## Admin Interface

### Attribute Management
- **Route**: `/admin/attributes/`
- **Features**: Create/edit attributes and their values
- **UI**: Form with dynamic value management

### Product Editor Integration
- **Attribute Selectors**: Multi-select dropdowns for each attribute
- **Variant Builder**: Dynamic form for creating variant combinations
- **Validation**: Ensures all required attributes are selected

## Performance Considerations

### Indexing Strategy
```sql
-- Recommended indexes
CREATE INDEX idx_attribute_value_attribute_id ON AttributeValue(attributeId);
CREATE INDEX idx_variant_attribute_value_variant_id ON VariantAttributeValue(productVariantId);
CREATE INDEX idx_variant_attribute_value_attribute_value_id ON VariantAttributeValue(attributeValueId);
```

### Query Optimization
- Use `include` strategically to avoid N+1 queries
- Consider pagination for products with many variants
- Cache frequently accessed attributes and values

## Related Files

- `prisma/schema.prisma` - Database schema definitions
- `app/routes/admin+/attributes/` - Attribute management routes
- `app/routes/admin+/products/__product-editor.server.tsx` - Variant creation logic
- `app/routes/admin+/products/__product-editor.client.tsx` - Variant form UI
- `prisma/seed.ts` - Sample attributes and values creation
