---
plan_id: 001
title: Admin Product Management Dashboard
status: Completed
created: 2025-01-14
completed: 2025-01-14
implementation_notes: |
  - Refactored to relational variant system (Attribute/AttributeValue/VariantAttributeValue)
  - Implemented Picsum Photos fixture image system for development
  - Renamed variant-attributes to attributes for cleaner URLs and better semantics
  - Added comprehensive ARIA compliance and accessibility features
  - Integrated auto-slug generation without useEffect following Epic Stack patterns
  - Simplified image route to focus on production storage patterns
dependencies: []
related_plans: []
---

# Admin Product Management Dashboard

## Overview

Build a complete admin dashboard for managing e-commerce products with CRUD operations, inventory tracking, product variants, multi-image upload, and currency handling. Admin-only access with ARIA-compliant UI using Radix UI.

## Database Schema

Create comprehensive product models in `prisma/schema.prisma`:

### Product

Core product model with:

- `name` (String, required, 1-200 chars)
- `slug` (String, unique, required) - SEO-friendly URL (auto-generated from name)
- `description` (String, optional, max 5000 chars)
- `sku` (String, unique, required)
- `price` (Decimal, required) - Stored as decimal with 2 decimal places
- `currency` (String, default "USD") - Following Shopify pattern: ISO 4217 currency codes
- `status` (Enum: DRAFT, ACTIVE, ARCHIVED)
- `categoryId` (String, optional, foreign key)
- Timestamps: `createdAt`, `updatedAt`
- Relations: category, images, variants, tags

### ProductImage

Multiple images per product:

- `id`, `productId` (foreign key)
- `objectKey` (String) - S3 storage reference
- `altText` (String, optional)
- `displayOrder` (Int) - For sorting
- `isPrimary` (Boolean) - One primary image per product
- Timestamps: `createdAt`, `updatedAt`
- **Cascade delete**: When product is deleted, all images are deleted

### ProductVariant

Optional size/color/custom attribute combinations:

- `id`, `productId` (foreign key)
- `sku` (String, unique, required)
- `price` (Decimal, optional) - Override base product price
- `stockQuantity` (Int, default 0)
- `attributes` (Json) - Flexible storage for dynamic attributes: `{ "size": "M", "color": "Black", "material": "Cotton" }`
- Timestamps: `createdAt`, `updatedAt`
- **Cascade delete**: When product is deleted, all variants are deleted

### VariantAttribute

Define available variant attributes (admin-configurable):

- `id`, `name` (String, unique) - e.g., "Size", "Color", "Material"
- `values` (Json) - Array of possible values: `["XS", "S", "M", "L", "XL"]`
- Timestamps: `createdAt`, `updatedAt`

### Category

Hierarchical categories:

- `id`, `name` (String, required)
- `slug` (String, unique, required)
- `description` (String, optional)
- `parentId` (String, optional) - Self-referential for hierarchy
- Timestamps: `createdAt`, `updatedAt`
- **Cascade delete behavior**: When category is deleted, set `categoryId` to null on products (or optionally cascade delete products if desired)

### ProductTag

Flexible tagging system:

- `id`, `name` (String, unique)
- Many-to-many relation with Product via `ProductToTag` join table

**Currency Handling (Shopify Standard)**:

- Store prices as Decimal (precision: 10, scale: 2) for accuracy
- Currency code in ISO 4217 format (USD, EUR, GBP, etc.)
- Default to USD, admin can configure per-product if needed in future

No new permissions needed - will use existing admin role for all product management.

## Storage & Image Handling

Enhance `app/utils/storage.server.ts`:

### Upload Functions

- Add `uploadProductImage(productId: string, file: File | FileUpload): Promise<string>` function
  - ObjectKey structure: `products/{productId}/images/{timestamp}-{fileId}.{ext}`
  - Returns objectKey for database storage

- Add `uploadProductImages(productId: string, files: Array<File | FileUpload>): Promise<string[]>`
  - Batch upload support for multiple images
  - Returns array of objectKeys

### Delete Functions (NEW - currently missing in Epic Stack)

Add deletion capabilities to properly clean up Tigris storage:

- `deleteObjectFromStorage(objectKey: string): Promise<void>`
  - Uses AWS S3 DELETE method with signed request
  - Similar pattern to existing GET/PUT signed requests
  - Idempotent - silently succeeds if object doesn't exist

- `deleteProductImages(objectKeys: string[]): Promise<void>`
  - Batch delete for multiple images
  - Calls `deleteObjectFromStorage` for each objectKey
  - Returns after all deletes complete

### Image Cleanup Strategy

**When product is deleted:**

1. Query database for all ProductImage records with objectKeys
2. Delete from Tigris storage using `deleteProductImages(objectKeys)`
3. Delete from database (cascade handles ProductImage & ProductVariant records)

**When individual image is removed:**

1. Get old objectKey from database
2. Upload new image if replacing
3. Update database with new objectKey
4. Delete old image from Tigris

**Example delete action implementation:**

```typescript
// app/routes/admin+/products/$productId.delete.ts
const product = await prisma.product.findUnique({
  where: { id: params.productId },
  include: { images: true }
})
const imageKeys = product.images.map(img => img.objectKey)
await prisma.product.delete({ where: { id: params.productId } })
await deleteProductImages(imageKeys) // Clean Tigris storage
```

This prevents orphaned files in Tigris storage and keeps storage costs down.

## Admin Routes Structure

Create admin product management routes in `app/routes/admin+/`:

### Admin Dashboard Home

- `index.tsx`: Admin dashboard landing page
  - Navigation cards to Products, Categories
  - Welcome message for admin
  - No stats for initial version
  - Quick links to common actions (Create Product, Create Category)

### Layout & Protection

- `products/_layout.tsx`: Admin products layout with navigation
  - Uses `requireUserWithRole(request, 'admin')` for protection
  - Breadcrumbs component (Dashboard > Products > ...)
  - All nested routes inherit admin protection

### Product CRUD Routes

- `products/index.tsx`: Product list with search, filtering, pagination
- `products/new.tsx`: Create new product with variants and images
- `products/$productId.tsx`: View product details (read-only view)
- `products/$productId.edit.tsx`: Edit product (similar to note editor pattern)
- `products/$productId.delete.ts`: Delete product action (cascade deletes images & variants)

### Category Routes

- `categories/index.tsx`: Category list with hierarchy view
- `categories/new.tsx`: Create category
- `categories/$categoryId.edit.tsx`: Edit category
- `categories/$categoryId.delete.ts`: Delete category action

### Variant Attribute Management

- `variant-attributes/index.tsx`: Manage available variant attributes
- `variant-attributes/new.tsx`: Create new attribute (e.g., "Material")
- `variant-attributes/$attributeId.edit.tsx`: Edit attribute and its values

## Form Schemas & Validation

Create `app/routes/admin+/products/__product-editor.tsx` (server) and `__product-editor.client.tsx` (UI):

### ProductEditorSchema (Zod)

```typescript
{
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(250).regex(/^[a-z0-9-]+$/), // auto-generated, editable
  description: z.string().max(5000).optional(),
  sku: z.string().min(1).max(100),
  price: z.number().min(0).multipleOf(0.01), // Decimal with 2 places
  currency: z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD']).default('USD'),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  categoryId: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
  images: z.array(ImageFieldsetSchema).max(10),
  variants: z.array(VariantSchema).optional(),
}
```

### VariantSchema

```typescript
{
  id: z.string().optional(), // For updates
  sku: z.string().min(1),
  price: z.number().min(0).multipleOf(0.01).optional(),
  stockQuantity: z.number().int().min(0),
  attributes: z.record(z.string()), // { size: "M", color: "Black" }
}
```

### ImageFieldsetSchema

```typescript
{
  id: z.string().optional(),
  file: z.instanceof(File).optional(),
  altText: z.string().max(500).optional(),
  displayOrder: z.number().int(),
  isPrimary: z.boolean(),
}
```

**Slug Generation**:

- Auto-generated from product name on create (slugify function)
- Editable by admin with validation
- Unique constraint enforced

## Product Editor Component

Build comprehensive ARIA-compliant product editor:

### Form Structure

- Form with Conform validation (@conform-to/react, @conform-to/zod)
- Loading states with React Router 7 navigation state
- Optimistic UI updates for better UX

### Image Uploader

- Multi-image upload with progress indicators
- Drag-to-reorder functionality
- Primary image selection (radio button)
- Preview grid with thumbnails
- Delete with confirmation
- ARIA labels: "Upload product images", "Primary product image"

### Variant Manager

- Dynamic add/remove variant rows
- Attribute selectors populated from VariantAttribute table
- Stock quantity input for each variant
- Optional price override
- ARIA labels for each variant field
- "Add variant" button with keyboard navigation

### Category Selector

- Hierarchical dropdown using Radix Select
- Shows full path (e.g., "Electronics > Laptops")
- Search/filter capability
- ARIA-compliant with proper labeling

### Tag Input

- Multi-select with autocomplete
- Create new tags on the fly
- Max 10 tags per product
- ARIA labels for accessibility

### Other Fields

- Status toggle (Draft/Active/Archived) with Radix Radio Group
- Currency selector (defaults to USD)
- Price input with currency prefix display
- Rich description textarea

### Error Handling

- Inline validation errors below each field
- Form-level error summary at top
- Toast notifications for save success/failure
- If image upload fails mid-save: rollback transaction, show error, allow retry

## Product List & Search

`products/index.tsx` features:

- **Data Table** (using Radix UI primitives or shadcn Table):
  - Sortable columns: Name, SKU, Price, Stock, Status, Updated Date
  - Responsive design
  - ARIA labels for table headers and actions

- **Search & Filters**:
  - Search by name/SKU (debounced input)
  - Filter by category (dropdown)
  - Filter by status (Draft/Active/Archived)
  - Filter by stock level (In Stock / Low Stock / Out of Stock)
  - Filter by tags

- **Pagination**:
  - 25/50/100 items per page selector
  - Page navigation with ARIA labels

- **Quick Actions**:
  - View, Edit, Duplicate, Delete buttons
  - Delete confirmation dialog
  - Keyboard navigation support

## Improved Image System

Enhance image handling beyond the existing note/profile pattern:

- **Primary Image**: Radio buttons to select one primary image
- **Drag-to-Reorder**: Using @dnd-kit or similar (ARIA-compliant)
- **Batch Upload**: Multiple file input with progress bars for each image
- **Preview Grid**: Thumbnails with hover zoom
- **Lazy Delete**: Mark for deletion, only delete from storage on save
- **Validation**:
  - Max file size: 5MB per image
  - Accepted formats: jpg, jpeg, png, webp
  - Check MIME type and extension
- **Loading States**: Show upload progress using React Router 7's navigation state
- **Optimistic Updates**: Show image preview immediately while uploading

## Inventory Management

- Stock quantity per variant (or base product if no variants)
- Visual stock level indicators:
  - Green badge: In Stock (> 10)
  - Yellow badge: Low Stock (1-10)
  - Red badge: Out of Stock (0)
- Display stock info in product list
- Low stock threshold configurable (future enhancement)

## Permissions & Roles

Simplified admin-only access:

- All routes under `/admin/products` and `/admin/categories` require admin role
- Use `requireUserWithRole(request, 'admin')` in layout
- Non-admin users get 403 error
- Admin role already exists in Epic Stack seed

## UI Components & Design System

### Existing Components to Reuse

- Button, Input, Label, Checkbox from `app/components/ui/`
- StatusButton for save actions with loading states
- ErrorBoundary for error handling
- Toast notifications (Sonner)
- Icon component with SVG sprite system

### New Components to Create

All components must be ARIA-compliant:

1. **ProductImageUploader** (`app/components/product-image-uploader.tsx`):
   - Multi-image upload with Radix UI primitives
   - Drag-and-drop reordering
   - Primary selection
   - ARIA labels and keyboard navigation

2. **VariantManager** (`app/components/variant-manager.tsx`):
   - Dynamic variant add/remove
   - Attribute selectors
   - Stock inputs
   - Proper ARIA roles for dynamic content

3. **CategorySelector** (`app/components/category-selector.tsx`):
   - Hierarchical select using Radix Select
   - ARIA-compliant dropdown

4. **StockIndicator** (`app/components/stock-indicator.tsx`):
   - Visual badge with ARIA label
   - Color-coded status

5. **Breadcrumbs** (`app/components/breadcrumbs.tsx`):
   - Navigation breadcrumbs
   - ARIA navigation landmark

### Icons

- Use Epic Stack's SVG sprite system
- Add icons from Radix Icons as needed:
  - `plus` - Add product/variant
  - `pencil-1` - Edit
  - `trash` - Delete
  - `magnifying-glass` - Search
  - `cross-1` - Close/Remove
  - `check` - Confirm
  - `upload` - Upload images
  - `image` - Image placeholder
- Add SVGs to `other/svg-icons/`, run `npm run build` to regenerate sprite

### Additional shadcn/ui Components

If needed, install:

- Table component for product list
- Select component for dropdowns
- Badge component for status/stock indicators
- Card component for dashboard
- Dialog component for confirmations

## Migration Strategy

1. Create Prisma migration for new models
2. Run `npx prisma migrate dev --name add_products_and_categories`
3. Update seed to include:
   - Sample products and categories with faker.js
   - Variant attributes (Size, Color, Material)
4. Generate Prisma client: `npx prisma generate --sql`

## Mock Data Generation with Faker.js

Update `prisma/seed.ts`:

### Categories (8-12 with hierarchy)

```typescript
const categories = [
  { name: 'Electronics', slug: 'electronics', children: [
    { name: 'Laptops', slug: 'laptops' },
    { name: 'Smartphones', slug: 'smartphones' },
  ]},
  { name: 'Clothing', slug: 'clothing', children: [
    { name: "Men's", slug: 'mens', children: [
      { name: 'T-Shirts', slug: 'mens-tshirts' },
    ]},
  ]},
  // ... more categories
]
```

### Products (30-50 across categories)

```typescript
name: faker.commerce.productName()
slug: slugify(name) + '-' + faker.string.alphanumeric(4)
description: faker.commerce.productDescription() + '\n\n' + faker.lorem.paragraphs(2)
sku: faker.string.alphanumeric(8).toUpperCase()
price: Number(faker.commerce.price({ min: 10, max: 500, dec: 2 }))
currency: 'USD'
status: weighted random (20% draft, 70% active, 10% archived)
images: 2-5 mock images per product
tags: 1-3 random tags
```

### Product Variants (40% of products)

```typescript
sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
colors: ['Red', 'Blue', 'Green', 'Black', 'White', 'Navy', 'Gray']
sku: `${baseProductSKU}-${size}-${color}`
attributes: { size, color }
stockQuantity: faker.number.int({ min: 0, max: 100 })
price: base price ± 20% randomly
```

### Variant Attributes

```typescript
[
  { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Color', values: ['Red', 'Blue', 'Green', 'Black', 'White', 'Navy', 'Gray'] },
  { name: 'Material', values: ['Cotton', 'Polyester', 'Wool', 'Silk', 'Leather'] },
]
```

### Product Images

```typescript
objectKey: `products/${productId}/images/${timestamp}-${fileId}.jpg`
altText: `${productName} - Image ${index + 1}`
displayOrder: index
isPrimary: index === 0
```

### Tags (15-20 common tags)

```typescript
['bestseller', 'new-arrival', 'on-sale', 'eco-friendly', 'limited-edition', 
 'trending', 'seasonal', 'premium', 'budget-friendly', 'handmade']
```

### Helper Functions

```typescript
createCategory(name, parentId?, depth = 0)
createProduct(categoryId)
createProductVariant(productId, attributes)
createProductImage(productId, isPrimary, order)
```

## Testing Strategy

### Test Data Utilities (`tests/db-utils.ts`)

```typescript
export function createProduct(overrides?: Partial<Product>) {
  const name = faker.commerce.productName()
  return {
    name,
    slug: slugify(name),
    description: faker.commerce.productDescription(),
    sku: faker.string.alphanumeric(8).toUpperCase(),
    price: Number(faker.commerce.price({ min: 10, max: 500, dec: 2 })),
    currency: 'USD',
    status: 'active' as const,
    ...overrides,
  }
}

export function createCategory(name?: string, parentId?: string) {
  const categoryName = name || faker.commerce.department()
  return {
    name: categoryName,
    slug: slugify(categoryName),
    description: faker.lorem.sentence(),
    parentId,
  }
}

export function createProductVariant(productId: string, attributes: Record<string, string>) {
  return {
    productId,
    sku: faker.string.alphanumeric(10).toUpperCase(),
    attributes, // { size: 'M', color: 'Black' }
    price: Number(faker.commerce.price({ min: 10, max: 500, dec: 2 })),
    stockQuantity: faker.number.int({ min: 0, max: 100 }),
  }
}

export async function getProductImages() {
  return [
    { altText: 'Product image 1', objectKey: 'products/test-1.png', displayOrder: 0, isPrimary: true },
    { altText: 'Product image 2', objectKey: 'products/test-2.png', displayOrder: 1, isPrimary: false },
    { altText: 'Product image 3', objectKey: 'products/test-3.png', displayOrder: 2, isPrimary: false },
  ]
}
```

### Playwright Fixtures (`tests/playwright-utils.ts`)

```typescript
insertNewProduct(options?: {
  categoryId?: string
  withVariants?: boolean
  withImages?: boolean
}): Promise<Product>

insertNewCategory(options?: {
  name?: string
  parentId?: string
}): Promise<Category>

insertProductWithVariants(): Promise<{ product: Product, variants: ProductVariant[] }>
```

### E2E Test Coverage

**`tests/e2e/products.test.ts`**:

- Admin can create product with images
- Admin can edit product
- Admin can add/remove variants
- Admin can delete product (cascade deletes images & variants)
- Non-admin user gets 403 on product routes
- Product search and filtering works
- Image upload with progress indication
- Form validation errors display correctly
- Slug auto-generation and uniqueness

**`tests/e2e/categories.test.ts`**:

- Admin can create/edit/delete categories
- Hierarchical category relationships
- Category cascade delete behavior
- Non-admin user gets 403

### Seed Data Strategy

**Development** (`prisma/seed.ts`):

- Random faker.js data for variety
- 30-50 products, 8-12 categories
- Rich dataset for manual testing

**E2E Tests** (`tests/db-utils.ts`):

- Fixed, predictable data
- Known product names, SKUs for reliable selectors
- Consistent structure for assertions

## File Structure

```
app/routes/admin+/
├── index.tsx (dashboard home)
├── products/
│   ├── _layout.tsx (admin protection, breadcrumbs)
│   ├── index.tsx (product list)
│   ├── new.tsx (create product)
│   ├── $productId.tsx (view product)
│   ├── $productId.edit.tsx (edit product)
│   ├── $productId.delete.ts (delete action)
│   ├── __product-editor.server.tsx (server actions)
│   └── __product-editor.client.tsx (UI components)
├── categories/
│   ├── index.tsx (category list)
│   ├── new.tsx (create category)
│   ├── $categoryId.edit.tsx (edit category)
│   └── $categoryId.delete.ts (delete action)
├── variant-attributes/
│   ├── index.tsx (list attributes)
│   ├── new.tsx (create attribute)
│   └── $attributeId.edit.tsx (edit attribute)

app/components/
├── product-image-uploader.tsx
├── variant-manager.tsx
├── category-selector.tsx
├── stock-indicator.tsx
└── breadcrumbs.tsx

app/utils/
├── storage.server.ts (add uploadProductImage functions)
└── slug.ts (slugify utility function)
```

## Implementation Order

1. Database schema and migration (Product, Category, ProductImage, ProductVariant, VariantAttribute, ProductTag)
2. Seed data with faker.js (categories, products, variants, images, tags)
3. Storage utilities for product images (uploadProductImage, batch upload, deleteProductImages)
4. Slug generation utility
5. Admin dashboard landing page (`admin/index.tsx`)
6. Admin layout with breadcrumbs and role protection
7. Product editor schemas (Zod validation)
8. Product editor server actions (__product-editor.server.tsx)
9. Basic product CRUD routes (new, index, edit, delete)
10. Product image uploader component (multi-image with progress)
11. Variant manager component (dynamic attributes)
12. Category CRUD routes and selector component
13. Variant attribute management routes
14. Product list with search/filtering/pagination
15. Stock indicators and inventory UI
16. Loading states and optimistic updates
17. ARIA compliance audit and fixes
18. E2E tests for products and categories
19. Polish, error handling, and refinements

