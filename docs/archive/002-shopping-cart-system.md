---
plan_id: 002
title: Shopping Cart System
status: Completed
created: 2025-01-15
completed: 2025-01-15
implementation_notes: |
  - Implemented complete shopping cart system with guest and authenticated user support
  - Session-based cart management with cookie persistence (30-day expiry)
  - Cart merge functionality on user login
  - Cart badge in header with real-time item count
  - Currency caching with 24-hour TTL for performance
  - Comprehensive E2E test coverage (41 passing tests)
  - Category filtering on category pages
  - No price snapshot - always uses current product price
  - Filtered deleted products from cart display automatically
dependencies: [001]
related_plans: []
---

# Shopping Cart System

## Overview

A complete shopping cart experience with product browsing, variant selection, and cart management. Session-based carts for guests that merge with user carts on login. Simple, clean, and focused on core functionality.

## Database Schema

### Implemented Models

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
  @@autoindex([productId])
}
```

**Key Design Decisions:**

- No `priceAtAdd` - always show current price
- `sessionId` for guest carts (cookie-based)
- `userId` for logged-in users
- Unique constraint prevents duplicate cart items
- Auto-cascade deletes when products are removed

## Cart Management System

### Implemented Cart Utilities (`app/utils/cart.server.ts`)

Core functions:

- ✅ `getOrCreateCart({ userId?, sessionId? })` - Get existing or create new cart
- ✅ `getOrCreateCartFromRequest(request)` - Smart cart retrieval (checks auth status automatically)
- ✅ `addToCart(cartId, productId, variantId?, quantity)` - Add/update item with stock validation
- ✅ `updateCartItemQuantity(cartItemId, quantity)` - Update quantity with validation
- ✅ `removeFromCart(cartItemId)` - Remove item from cart
- ✅ `clearCart(cartId)` - Empty cart (used on logout)
- ✅ `mergeGuestCartToUser(sessionId, userId)` - Merge carts on login
- ✅ `mergeCartOnUserLogin(request, userId)` - Wrapper for cart merge with error handling

### Cart Cookie (`app/utils/cart-session.server.ts`)

Session management:

- ✅ Cookie name: `cart_session`
- ✅ 30 day expiry
- ✅ Generate unique sessionId (cuid)
- ✅ Merge with user cart on login
- ✅ Clear on logout

## Routes Structure

### Implemented Shop Routes (`app/routes/shop+/`)

```
shop+/
├── index.tsx                          ✅ Shop home with category cards
├── products+/
│   ├── index.tsx                      ✅ Product catalog with filtering
│   └── $slug.tsx                      ✅ Product detail with add to cart
├── categories+/
│   └── $categorySlug.tsx              ✅ Category product listing with filtering
└── cart.tsx                           ✅ Shopping cart page
```

## Implemented Features

### ✅ 1. Shop Home Page (`shop+/index.tsx`)

**Features:**

- Hero section with shop description
- Category cards with product counts
- "Browse All Products" button
- Clean, minimal design
- Responsive grid layout

### ✅ 2. Product Catalog (`shop+/products+/index.tsx`)

**Features:**

- Grid of all ACTIVE products
- Client-side filtering:
  - ✅ Category dropdown
  - ✅ Search by name
- Product count display
- Click to view product details

**Product Display:**

- Product image (primary image)
- Name and price
- Category link
- "View Details" link

### ✅ 3. Product Detail Page (`shop+/products+/$slug.tsx`)

**Layout:**

- Left: Product image
- Right: Product information panel

**Information Panel:**

- ✅ Product name
- ✅ Price
- ✅ Category link
- ✅ Description
- ✅ Add to Cart button

**Add to Cart:**

- ✅ Redirects to cart page
- ✅ Validates stock availability
- ✅ Creates cart if doesn't exist

### ✅ 4. Category Page (`shop+/categories+/$categorySlug.tsx`)

**Features:**

- ✅ Category name and description
- ✅ Product grid (filtered by category)
- ✅ Client-side category filtering dropdown
- ✅ Product count display
- ✅ Dynamic category header

### ✅ 5. Shopping Cart Page (`shop+/cart.tsx`)

**Layout:**

- Two columns on desktop (items + summary)
- Stacked on mobile

**Cart Items Section:**

- ✅ List of cart items
- ✅ Each item shows:
  - Product image
  - Name and price
  - Quantity selector
  - Remove button
- ✅ Empty cart state

**Cart Summary:**

- ✅ Subtotal
- ✅ Total (formatted with currency)
- ✅ "Continue Shopping" link

**Features:**

- ✅ Inline quantity update
- ✅ Remove functionality
- ✅ Auto-update totals
- ✅ Filtered deleted products

### ✅ 6. Cart Badge Component (`app/components/cart-badge.tsx`)

**Features:**

- ✅ Shopping cart icon in header
- ✅ Badge with item count (sum of quantities)
- ✅ Link to cart page
- ✅ Shows on all shop pages
- ✅ Updates real-time via root loader
- ✅ Hidden when count is 0

### ✅ 7. Cart Merge on Login

**Implementation:**

- ✅ Automatic merge when user logs in
- ✅ Merges guest cart items into user cart
- ✅ Handles duplicate products (increments quantity)
- ✅ Clears session cart cookie after merge
- ✅ Tested with multiple login/logout cycles

## UI Components

### Implemented Components

1. ✅ **CartBadge** (`app/components/cart-badge.tsx`)
   - Shopping cart icon
   - Item count badge
   - Link to cart page
   - ARIA compliant

## Currency Caching

### Implemented Optimizations

- ✅ Currency settings cached with 24-hour TTL
- ✅ Stale-while-revalidate pattern (7 days)
- ✅ Reduces database queries for currency lookups
- ✅ Falls back to default if cache unavailable

## E2E Testing

### Test Coverage

✅ **41 passing E2E tests**

- ✅ Shop home page browsing
- ✅ Product catalog filtering
- ✅ Product detail viewing
- ✅ Add to cart functionality
- ✅ Cart page display and updates
- ✅ Cart badge display and count
- ✅ Cart merge on login
- ✅ Guest cart behavior after logout
- ✅ Multiple login/logout cycles
- ✅ Category filtering

## Implementation Status

### ✅ Phase 1: Database ✓ Cart Utilities - COMPLETE
- ✅ Database schema with Cart and CartItem models
- ✅ Cart utilities with comprehensive functions
- ✅ Cookie-based session management

### ✅ Phase 2: Product Browsing - COMPLETE
- ✅ Shop home page
- ✅ Product catalog with filtering
- ✅ Category cards and navigation

### ✅ Phase 3: Product Detail & Add to Cart - COMPLETE
- ✅ Product detail pages
- ✅ Add to cart functionality
- ✅ Cart integration

### ✅ Phase 4: Shopping Cart - COMPLETE
- ✅ Cart page with item management
- ✅ Update and remove functionality
- ✅ Cart badge in header

### ✅ Phase 5: Advanced Features - COMPLETE
- ✅ Category-specific product listing
- ✅ Cart merge on login
- ✅ Client-side category filtering

### ✅ Phase 6: Polish & Edge Cases - COMPLETE
- ✅ Edge case handling (404s for missing products, deleted product filtering)
- ✅ UI polish (animations, responsive design)
- ✅ Currency caching for performance

## What's Not Implemented

### Future Enhancements (Orders System)

The following are part of a separate order management plan:

- ⏳ Multi-step checkout with address collection
- ⏳ Order creation from cart
- ⏳ Inventory reduction on order
- ⏳ User order history
- ⏳ Admin order management
- ⏳ Payment integration

## Design Patterns Followed

### Epic Stack Patterns

- ✅ React Router actions for mutations
- ✅ Existing auth patterns
- ✅ Existing toast system for notifications
- ✅ No useEffect unless absolutely necessary

### Modern UI Patterns

- ✅ Card-based layouts
- ✅ Badge components for status
- ✅ Responsive grids
- ✅ Success/error handling
- ✅ ARIA compliance

## Notes

- Always uses current product/variant price (no snapshot)
- No featured products or quick add buttons
- No hover zoom effects
- Clean, functional experience
- Comprehensive error handling with proper HTTP status codes
- Efficient database queries with proper indexing
- Performance optimizations with caching

