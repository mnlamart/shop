# Admin Dashboard Architecture

## Overview

The admin dashboard provides a comprehensive interface for managing e-commerce products, categories, attributes, users, and orders. Built with role-based access control and ARIA-compliant UI components following Epic Stack patterns.

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
  - `$productSlug.tsx` - View product details (read-only)
  - `$productSlug_.edit.tsx` - Edit existing product
  - `$productSlug.delete.ts` - Delete product action
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

### User Management
- **Base Route**: `/admin/users/`
- **Routes**:
  - `index.tsx` - User list with search, filtering, and pagination
  - `$userId.tsx` - View user details (read-only)
  - `$userId_.edit.tsx` - Edit user information and roles
- **Features**:
  - View all users with pagination (25 per page)
  - Search users by name, username, or email
  - Edit user profile information (name, username, email)
  - Manage user roles (admin/user)
  - View user profile images with proper image URL handling
  - Comprehensive E2E test coverage with faker-generated test data

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
- **Admin Role**: Full access to all admin features (products, categories, attributes, users, orders)
- **User Role**: No access to admin routes (403 Forbidden)
- **Unauthenticated**: Redirected to login with return URL

### Route Protection Strategy
- **Layout-Level**: `_layout.tsx` files use `requireUserWithRole` for nested route protection
- **Individual Routes**: Each route validates admin role in loader/action
- **UI Components**: Conditional rendering based on user role

## Navigation & Sidebar

### Sidebar Navigation (`app/components/app-sidebar.tsx`)
The admin sidebar provides consistent navigation across all admin pages with improved UX:

#### Navigation Structure
- **Platform Section**:
  - Dashboard (`/admin`) - Main admin dashboard
  - Users (`/admin/users`) - User management (positioned above Orders)
  - Orders (`/admin/orders`) - Order management
  - Products (`/admin/products`) - Product management with submenu
  - Categories (`/admin/categories`) - Category management with submenu
  - Attributes (`/admin/attributes`) - Attribute management with submenu
- **System Section**:
  - View Store (`/`) - Link to public-facing store

#### UX Improvements
- **Direct Links**: Products, Categories, and Attributes titles are clickable links to their index pages
- **Collapsible Submenus**: Expandable sections for "All Products", "Add Product", etc.
- **Hover Effects**: Consistent background color transitions (`hover:!bg-muted`) on all interactive elements
- **Active States**: Visual indication of current page with `secondary` variant for active items
- **Improved Padding**: Consistent spacing (`p-2`/`p-3`, `px-3 py-2`) throughout
- **Icon Updates**:
  - Categories: `folder` icon (replaced `tags`)
  - Attributes: `sliders` icon (replaced `settings`)
- **Responsive Design**: Collapsible sidebar with icon-only mode for smaller screens

#### Icon Management
- Icons managed via `sly` CLI (`@sly-cli/sly`)
- SVG icons stored in `other/svg-icons/`
- Icon sprite automatically generated from SVG files
- Unused icons removed to keep sprite clean

## UI Components Architecture

### Design System Integration
- **Radix UI**: All components built on Radix primitives for accessibility
- **Tailwind CSS**: Consistent styling with Epic Stack design tokens
- **SVG Icons**: Epic Stack's sprite system with Lucide icons via `sly` CLI

### Key Components

#### Product Image Upload (Inline Implementation)
The product image upload functionality is implemented inline within the product editor pages (`__new.server.tsx`, `__edit.server.tsx`) rather than as a standalone component. It provides:
- Drag-to-reorder functionality for multiple images
- Image upload with progress tracking
- Display order management using the `displayOrder` field
- Preview grid with thumbnails
- ARIA-compliant keyboard navigation

#### Variant Management (Inline Implementation)
The variant management functionality is implemented inline within the product editor pages. It provides:
- Dynamic add/remove variant rows using Conform's field list API
- Attribute value selection with relational attributes
- Stock quantity management per variant
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
- **User Images**: Proper URL formatting using `getUserImgSrc()` helper (`/resources/images?objectKey=...`)
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
- **User Management**: Comprehensive E2E tests with faker-generated test data
- **Test Isolation**: Each test creates and cleans up its own data
- **Robust Locators**: Uses `getByTestId()`, `getByRole()`, `getByLabel()` for reliable element selection
- **Permission Testing**: Role-based access validation
- **Form Validation**: Error handling and success flows
- **Test Utilities**: Centralized helpers in `tests/user-utils.ts` for user creation and login

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
│   ├── $productSlug.tsx        # View product
│   ├── $productSlug_.edit.tsx  # Edit product
│   ├── $productSlug.delete.ts  # Delete action
│   ├── __new.server.tsx        # New product server logic
│   └── __edit.server.tsx       # Edit product server logic
├── categories/
│   ├── index.tsx               # Category list
│   ├── new.tsx                 # Create category
│   ├── $categoryId.edit.tsx    # Edit category
│   └── $categoryId.delete.ts   # Delete action
├── attributes/
│   ├── index.tsx               # Attribute list
│   ├── new.tsx                 # Create attribute
│   └── $attributeId.edit.tsx   # Edit attribute
└── users/
    ├── index.tsx               # User list
    ├── $userId.tsx             # View user
    └── $userId_.edit.tsx       # Edit user
```

## Related Files

- `app/utils/permissions.server.ts` - Role-based access control
- `app/components/ui/` - Reusable UI components
- `app/components/app-sidebar.tsx` - Admin sidebar navigation
- `app/utils/storage.server.ts` - File upload and management
- `app/utils/misc.tsx` - Utility functions including `getUserImgSrc()`
- `prisma/schema.prisma` - Database schema
- `tests/e2e/admin/` - E2E test suites
- `tests/user-utils.ts` - Test utilities for user creation and login

## Recent Updates

### Sidebar UX Improvements (Latest)
- Added direct links to Products, Categories, and Attributes titles
- Reordered navigation: Users now appears above Orders
- Improved hover effects with consistent background color transitions
- Enhanced active state styling for better visual feedback
- Updated padding and spacing for better visual hierarchy
- Updated icons: Categories (`folder`), Attributes (`sliders`)
- Removed non-existent Settings section

### User Management (Latest)
- Added comprehensive user management pages (list, view, edit)
- Fixed user image 404 errors by using `getUserImgSrc()` helper
- Implemented role management (admin/user) with checkbox interface
- Added E2E tests with faker-generated test data for reliability
- Improved test isolation and cleanup strategies
- Added `data-testid` attributes for robust Playwright locators

### Order Management
- Fixed tracking number handling: always set when order status is SHIPPED
- Improved order status update flow with proper validation
