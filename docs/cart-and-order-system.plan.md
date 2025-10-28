<!-- 946e0e5d-a24c-4fd1-b31a-957783437d01 b66cf16d-a496-4a78-936d-0217fff56df3 -->
# Shopping Cart System

## Overview

Build a complete shopping cart experience with product browsing, variant selection, and cart management. Session-based carts for guests that merge with user carts on login. Simple, clean, and focused on core functionality.

## Database Schema Changes

### Models to Add

```prisma
model Cart {
  id        String   @id @default(cuid())
  userId    String?  @unique // Null for guest carts
  sessionId String?  @unique // For guest carts
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user  User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  items CartItem[]
  
  @@index([userId])
  @@index([sessionId])
}

model CartItem {
  id        String  @id @default(cuid())
  cartId    String
  productId String
  variantId String?
  quantity  Int     @default(1)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  cart    Cart           @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product Product        @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
  
  @@unique([cartId, productId, variantId])
  @@index([cartId])
  @@index([productId])
}
```

**Key Design Decisions:**

- No `priceAtAdd` - always show current price
- `sessionId` for guest carts (cookie-based)
- `userId` for logged-in users
- Unique constraint prevents duplicate cart items

## Cart Management System

### Cart Utilities (`app/utils/cart.server.ts`)

Core functions:

- `getCart(request)` - Get cart for current session/user
- `getOrCreateCart(request)` - Get existing or create new
- `addToCart(cartId, productId, variantId?, quantity)` - Add/update item
- `updateCartItemQuantity(cartItemId, quantity)` - Update quantity
- `removeFromCart(cartItemId)` - Remove item
- `clearCart(cartId)` - Empty cart
- `mergeGuestCartToUser(sessionId, userId)` - Merge on login
- `getCartWithItems(cartId)` - Get cart with full item details
- `getCartSummary(cartId)` - Calculate totals

### Cart Cookie (`app/utils/cart-session.server.ts`)

Session management:

- Cookie name: `cart_session`
- 30 day expiry
- Generate unique sessionId (cuid)
- Merge with user cart on login

## Routes Structure

### Public Shop Routes (`app/routes/shop+/`)

```
shop+/
├── index.tsx                          # Simple shop home
├── products+/
│   ├── index.tsx                      # Product catalog with filters
│   └── $productSlug.tsx               # Product detail with add to cart
└── categories+/
    └── $categorySlug.tsx              # Category product listing
```

### Cart Routes

```
cart+/
├── index.tsx                          # Shopping cart page
├── add.ts                             # Add to cart action
├── update.$cartItemId.ts              # Update quantity action
└── remove.$cartItemId.ts              # Remove item action
```

## Key Features

### 1. Shop Home Page (`shop+/index.tsx`)

**Display:**

- Simple hero section with shop description
- Category cards with images and product counts
- "Browse All Products" button

**Features:**

- Clean, minimal design
- Focus on navigation to categories/products
- Responsive grid layout

### 2. Product Catalog (`shop+/products+/index.tsx`)

**Features:**

- Grid of all ACTIVE products (24 per page)
- Client-side filtering:
  - Category dropdown
  - Price range (min/max sliders)
  - In stock only checkbox
  - Search by name
- Sort by: Price (low-high), Price (high-low), Newest
- Pagination
- Product count display

**Product Card:**

- Product image (primary image from displayOrder:0)
- Name and price
- Category badge
- Stock indicator badge
- "View Details" link (no quick add)

### 3. Product Detail Page (`shop+/products+/$productSlug.tsx`)

**Layout:**

- Left: Image gallery (main image + thumbnails, no zoom)
- Right: Product information panel

**Information Panel:**

- Product name
- Price (updates when variant selected)
- Category badge
- Description
- Stock indicator
- Variant selector (if has variants)
- Quantity selector
- Add to Cart button

**Variant Selector:**

- One dropdown per attribute (Size, Color, etc.)
- Show only available combinations
- Update price when variant changes
- Show variant stock status
- Disable add to cart if out of stock

**Add to Cart:**

- Validate stock availability
- Require variant selection if product has variants
- Show success toast with "View Cart" link
- Optimistic UI update (button → "Adding..." → "Added!")

### 4. Category Page (`shop+/categories+/$categorySlug.tsx`)

**Features:**

- Category name and description
- Breadcrumb (Home > Category)
- Product grid (filtered by category)
- Same filtering as product catalog
- Include products from child categories

### 5. Shopping Cart Page (`cart+/index.tsx`)

**Layout:**

- Two columns on desktop (items + summary)
- Stacked on mobile

**Cart Items Section:**

- List of cart items (table on desktop, cards on mobile)
- Each item shows:
  - Product image
  - Name and variant details
  - Current price (not snapshot)
  - Quantity selector (inline update)
  - Subtotal
  - Remove button
- Empty cart state:
  - Icon and message
  - "Continue Shopping" button

**Cart Summary Card:**

- Subtotal
- Note: "Taxes and shipping calculated at checkout"
- Total (same as subtotal for now)
- "Checkout" button (disabled, placeholder for later)
- "Continue Shopping" link

**Features:**

- Inline quantity update (debounced)
- Remove with confirmation dialog
- Stock warnings if quantity exceeds available
- Auto-update totals
- Show cart item count in header badge

## UI Components

### New Components

1. **ProductCard** (`app/components/product-card.tsx`)
```typescript
type ProductCardProps = {
  product: {
    slug: string
    name: string
    price: number
    images: { objectKey: string; altText?: string }[]
    category?: { name: string }
    variants: { stockQuantity: number }[]
  }
}
```


Features:

- Simple, clean design
- Category badge
- Stock indicator
- Link to product detail (always)

2. **VariantSelector** (`app/components/variant-selector.tsx`)
```typescript
type VariantSelectorProps = {
  variants: ProductVariant[]
  attributes: Attribute[]
  onVariantChange: (variantId: string | null) => void
  selectedVariantId?: string | null
}
```


Features:

- One select per attribute
- Shows available combinations
- Disables invalid combinations
- Shows stock for selected variant

3. **QuantitySelector** (`app/components/quantity-selector.tsx`)
```typescript
type QuantitySelectorProps = {
  value: number
  onChange: (quantity: number) => void
  max: number
  min?: number
}
```


Features:

- Increment/decrement buttons
- Manual input with validation
- Disable buttons at min/max
- ARIA labels

4. **CartItemRow** (`app/components/cart-item-row.tsx`)
```typescript
type CartItemRowProps = {
  item: CartItemWithDetails
  onUpdateQuantity: (itemId: string, quantity: number) => void
  onRemove: (itemId: string) => void
}
```


Features:

- Product image and details
- Variant display (if applicable)
- Quantity selector
- Remove button with confirmation
- Subtotal calculation (current price)

## Form Schemas

### Add to Cart Schema

```typescript
const AddToCartSchema = z.object({
  productId: z.string().cuid(),
  variantId: z.string().cuid().optional(),
  quantity: z.coerce.number().int().min(1).max(999),
})
```

### Update Cart Item Schema

```typescript
const UpdateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(999), // 0 = remove
})
```

## Cart in Header/Navigation

Add cart icon with badge to app header:

- Icon: shopping cart (from existing icon set)
- Badge: item count (sum of quantities)
- Link to cart page
- Show on all pages (except admin routes)

## Migration & Seeding

### Migration Steps

1. Add Cart and CartItem models to schema
2. Add relations to User, Product, ProductVariant
3. Run: `npx prisma migrate dev --name add_shopping_cart`
4. Generate client: `npx prisma generate`

### Seed Data

- Don't create any carts (users create their own)
- Ensure products have good variety:
  - Products with variants
  - Products without variants
  - Different stock levels (high, low, out of stock)
  - Different price points

## Implementation Order (TDD Approach)

Following TDD: Write tests first, then implement to make them pass.

### Phase 1: Database & Cart Utilities

1. **Database schema** - Add Cart and CartItem models
2. **Test: Cart utilities** - Write unit tests for cart operations
3. **Implement: Cart utilities** - Build cart server functions to pass tests
4. **Test: Cart session** - Write tests for guest cart sessions
5. **Implement: Cart session** - Build cookie-based session management

### Phase 2: Product Browsing

6. **Test: Shop home** - E2E test for browsing categories
7. **Implement: Shop home** - Simple shop home page
8. **Test: Product catalog** - E2E test for browsing/filtering products
9. **Implement: Product catalog** - Product listing with filters
10. **Test: Product card** - Component test for ProductCard
11. **Implement: Product card** - Reusable ProductCard component

### Phase 3: Product Detail & Add to Cart

12. **Test: Product detail** - E2E test for viewing product and variants
13. **Implement: Product detail** - Product detail page
14. **Test: Variant selector** - Component test for variant selection
15. **Implement: Variant selector** - VariantSelector component
16. **Test: Add to cart** - E2E test for adding items to cart
17. **Implement: Add to cart** - Add to cart action with validation

### Phase 4: Shopping Cart

18. **Test: Cart page** - E2E test for viewing cart
19. **Implement: Cart page** - Shopping cart display
20. **Test: Cart updates** - E2E test for quantity update/remove
21. **Implement: Cart updates** - Update and remove functionality
22. **Test: Cart badge** - Component test for cart header badge
23. **Implement: Cart badge** - Cart icon with count in header

### Phase 5: Advanced Features

24. **Test: Category page** - E2E test for category filtering
25. **Implement: Category page** - Category-specific product listing
26. **Test: Cart merge** - E2E test for guest → user cart merge
27. **Implement: Cart merge** - Merge carts on login

### Phase 6: Polish & Edge Cases

28. **Test: Edge cases** - Out of stock, deleted products, etc.
29. **Implement: Edge case handling** - Proper error handling
30. **UI polish** - Animations, loading states, responsive design

## Design Patterns to Follow

### Epic Stack Patterns

- Use Conform for form validation
- Use React Router actions for mutations
- Use fetcher for optimistic updates
- Follow existing auth patterns
- Use existing toast system

### Modern UI Patterns (from admin)

- Card-based layouts
- Badge components for status
- Alert dialogs for confirmations
- Responsive tables/grids
- Loading states with icons
- Success/error toasts

## Notes

- Always use current product/variant price (no snapshot)
- No featured products or quick add buttons
- No hover zoom effects
- UI polish comes before E2E tests
- Orders implementation comes later (separate plan)
- Focus on simple, clean, and functional experience

### To-dos

- [ ] Add Cart and CartItem models to Prisma schema
- [ ] Write unit tests for cart utilities (TDD)
- [ ] Implement cart server utilities to pass tests
- [ ] Write tests for cart session/cookie management
- [ ] Implement cookie-based cart session management
- [ ] Write E2E tests for shop home page
- [ ] Implement shop home page
- [ ] Write E2E tests for product catalog with filters
- [ ] Implement product catalog page
- [ ] Write E2E tests for product detail and add to cart
- [ ] Implement product detail page with variant selection
- [ ] Write E2E tests for cart page and updates
- [ ] Implement cart page with update/remove functionality
- [ ] Add cart badge to header and implement cart merge
- [ ] Polish UI with animations, loading states, responsive design
- [ ] Create Cart, CartItem, Order, OrderItem models in Prisma schema
- [ ] Build cart management utilities (getCart, addToCart, updateCart, etc.)
- [ ] Create shop product catalog page with filtering and search
- [ ] Build product detail page with variant selection and add to cart
- [ ] Create shopping cart page with update/remove functionality
- [ ] Implement multi-step checkout with address, shipping, and review
- [ ] Build order creation logic from cart with inventory reduction
- [ ] Create user order history and detail pages
- [ ] Build admin order management with status updates and tracking
- [ ] Write E2E tests for shopping cart and order flows