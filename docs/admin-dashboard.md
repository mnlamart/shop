# Admin Dashboard Architecture

## Overview

The admin dashboard provides a comprehensive interface for managing e-commerce products, categories, and attributes. Built with role-based access control and ARIA-compliant UI components following Epic Stack patterns.

## Route Structure

### Dashboard Home
- **Route**: `/admin/`
- **Purpose**: Landing page with navigation cards and quick actions
- **Features**: 
  - Navigation cards to main sections (Products, Categories, Attributes)
  - Welcome message for admin users
  - Quick links to common actions

### Product Management
- **Base Route**: `/admin/products/`
- **Routes**:
  - `index.tsx` - Product list with search, filtering, and pagination
  - `new.tsx` - Create new product with variants and images
  - `$productId.tsx` - View product details (read-only)
  - `$productId.edit.tsx` - Edit existing product
  - `$productId.delete.ts` - Delete product action
- **Features**:
  - CRUD operations for products
  - Multi-image upload with drag-to-reorder
  - Variant management with relational attributes
  - Inventory tracking and stock indicators

### Category Management
- **Base Route**: `/admin/categories/`
- **Routes**:
  - `index.tsx` - Category list with hierarchy view
  - `new.tsx` - Create new category
  - `$categoryId.edit.tsx` - Edit category
  - `$categoryId.delete.ts` - Delete category action
- **Features**:
  - Hierarchical category structure
  - Parent-child relationships
  - Cascade delete behavior (products → null category)

### Attribute Management
- **Base Route**: `/admin/attributes/` (formerly `/admin/variant-attributes/`)
- **Routes**:
  - `index.tsx` - List all attributes with their values
  - `new.tsx` - Create new attribute with values
  - `$attributeId.edit.tsx` - Edit attribute and manage values
- **Features**:
  - Global attribute definitions (Size, Color, Material, etc.)
  - Value management for each attribute
  - Used across all products for variant creation

## Security Architecture

### Role-Based Access Control
```typescript
// All admin routes protected by role check
export async function loader({ request }: Route.LoaderArgs) {
  await requireUserWithRole(request, 'admin')
  // ... loader logic
}

export async function action({ request }: Route.ActionArgs) {
  await requireUserWithRole(request, 'admin')
  // ... action logic
}
```

### Permission Levels
- **Admin Role**: Full access to all product management features
- **User Role**: No access to admin routes (403 Forbidden)
- **Unauthenticated**: Redirected to login with return URL

### Route Protection Strategy
- **Layout-Level**: `_layout.tsx` files use `requireUserWithRole` for nested route protection
- **Individual Routes**: Each route validates admin role in loader/action
- **UI Components**: Conditional rendering based on user role

## UI Components Architecture

### Design System Integration
- **Radix UI**: All components built on Radix primitives for accessibility
- **Tailwind CSS**: Consistent styling with Epic Stack design tokens
- **SVG Icons**: Epic Stack's sprite system with additional Radix icons

### Key Components

#### ProductImageUploader
```typescript
// Multi-image upload with advanced features
<ProductImageUploader
  images={product.images}
  onImagesChange={setImages}
  maxImages={10}
  acceptedFormats={['jpg', 'jpeg', 'png', 'webp']}
  maxFileSize={5 * 1024 * 1024} // 5MB
/>
```
**Features**:
- Drag-to-reorder functionality
- Primary image selection
- Progress indicators during upload
- Preview grid with thumbnails
- ARIA-compliant keyboard navigation

#### VariantManager
```typescript
// Dynamic variant creation with relational attributes
<VariantManager
  variants={product.variants}
  attributes={availableAttributes}
  onVariantsChange={setVariants}
/>
```
**Features**:
- Dynamic add/remove variant rows
- Attribute value selectors
- Stock quantity management
- Price override capabilities
- Form validation and error handling

#### CategorySelector
```typescript
// Hierarchical category selection
<CategorySelector
  categories={categories}
  value={selectedCategoryId}
  onValueChange={setSelectedCategoryId}
  placeholder="Select a category..."
/>
```
**Features**:
- Hierarchical dropdown display
- Search and filter capabilities
- Full path display (e.g., "Electronics > Laptops")
- ARIA-compliant navigation

### Form Architecture

#### Conform Integration
```typescript
// Form validation with Conform and Zod
const [form, fields] = useForm({
  id: 'product-editor',
  defaultValue: productData,
  onValidate: ({ formData }) => {
    return parse(formData, { schema: ProductEditorSchema })
  },
})
```

#### Auto-Slug Generation
```typescript
// Automatic slug generation on name field blur
<input
  {...getInputProps(fields.name, { type: 'text' })}
  onBlur={(e) => {
    const name = e.target.value
    if (name && !fields.slug.value) {
      setSlug(slugify(name))
    }
  }}
/>
```

## Data Flow Architecture

### Server-Side Data Loading
```typescript
// Optimized data loading with includes
export async function loader({ params }: Route.LoaderArgs) {
  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: {
      category: true,
      images: { orderBy: { displayOrder: 'asc' } },
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
      tags: { include: { tag: true } },
    },
  })
}
```

### Client-Side State Management
- **React Router 7**: Navigation state and form handling
- **Conform**: Form validation and submission
- **Optimistic Updates**: Immediate UI feedback during operations
- **Error Boundaries**: Graceful error handling and recovery

## Performance Optimizations

### Database Queries
- **Strategic Includes**: Load related data in single queries
- **Pagination**: Limit results for large datasets
- **Indexing**: Proper database indexes on frequently queried fields

### Image Handling
- **Fixture System**: Fast local images in development
- **Optimized Serving**: Production images via signed URLs
- **Lazy Loading**: Images loaded on demand
- **Caching**: Browser and CDN caching strategies

### UI Performance
- **Code Splitting**: Route-based code splitting
- **Lazy Components**: Load heavy components on demand
- **Memoization**: React.memo for expensive components
- **Virtual Scrolling**: For large product lists

## Accessibility Features

### ARIA Compliance
- **Semantic HTML**: Proper heading hierarchy and landmarks
- **ARIA Labels**: Descriptive labels for all interactive elements
- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: Proper announcements and descriptions

### Form Accessibility
```typescript
// Accessible form fields
<Label htmlFor={fields.name.id}>
  Product Name
  <span aria-label="required">*</span>
</Label>
<Input
  {...getInputProps(fields.name, { type: 'text' })}
  aria-describedby={fields.name.errorId}
  aria-invalid={!!fields.name.errors}
/>
{fields.name.errors && (
  <div id={fields.name.errorId} role="alert">
    {fields.name.errors}
  </div>
)}
```

## Error Handling

### Server-Side Errors
- **Validation Errors**: Zod schema validation with detailed messages
- **Database Errors**: Graceful handling of constraint violations
- **File Upload Errors**: Progress tracking and rollback capabilities

### Client-Side Errors
- **Form Validation**: Real-time validation with error display
- **Network Errors**: Retry mechanisms and offline handling
- **Error Boundaries**: Component-level error recovery

## Testing Strategy

### E2E Testing
- **Playwright**: Full user journey testing
- **Admin Flows**: Complete CRUD operations
- **Permission Testing**: Role-based access validation
- **Form Validation**: Error handling and success flows

### Component Testing
- **React Testing Library**: Component behavior testing
- **Accessibility Testing**: ARIA compliance validation
- **Form Testing**: Validation and submission flows

## File Structure

```
app/routes/admin+/
├── index.tsx                    # Dashboard home
├── _layout.tsx                  # Admin layout with navigation
├── products/
│   ├── _layout.tsx             # Products layout
│   ├── index.tsx               # Product list
│   ├── new.tsx                 # Create product
│   ├── $productId.tsx          # View product
│   ├── $productId.edit.tsx     # Edit product
│   ├── $productId.delete.ts    # Delete action
│   ├── __product-editor.server.tsx  # Server actions
│   └── __product-editor.client.tsx  # UI components
├── categories/
│   ├── index.tsx               # Category list
│   ├── new.tsx                 # Create category
│   ├── $categoryId.edit.tsx    # Edit category
│   └── $categoryId.delete.ts   # Delete action
└── attributes/
    ├── index.tsx               # Attribute list
    ├── new.tsx                 # Create attribute
    └── $attributeId.edit.tsx   # Edit attribute
```

## Related Files

- `app/utils/permissions.server.ts` - Role-based access control
- `app/components/ui/` - Reusable UI components
- `app/utils/storage.server.ts` - File upload and management
- `prisma/schema.prisma` - Database schema
- `tests/e2e/admin/` - E2E test suites
