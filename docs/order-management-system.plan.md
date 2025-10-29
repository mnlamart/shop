<!-- dd4ee9d0-71f1-4eee-9761-97297b21536d 8b1a038a-0cd3-43e8-ae79-56045d600dce -->
# Order Management System

## Overview

Complete order management system that converts cart items into orders, tracks status, manages inventory, and provides user and admin interfaces. Orders support both authenticated users and guests, with email notifications and comprehensive status tracking.

## Database Schema

### Order Model

```prisma
model Order {
  id          String   @id @default(cuid())
  orderNumber String   @unique // Human-readable: "ORD-001234"
  userId      String?  // Null for guest orders
  email       String   // Required for guest orders, copied from user for auth users
  
  // Price snapshots (stored in cents)
  subtotal    Int      // Sum of item prices
  total       Int      // Subtotal + shipping + tax (future)
  
  // Shipping information
  shippingName     String
  shippingStreet   String
  shippingCity     String
  shippingState    String?
  shippingPostal   String
  shippingCountry  String
  
  // Payment information (Stripe)
  stripeCheckoutSessionId String @unique // Stripe Checkout Session ID
  stripePaymentIntentId   String?        // Stripe PaymentIntent ID (from webhook)
  stripeChargeId          String?        // Stripe Charge ID (from webhook)
  
  // Status tracking
  status      OrderStatus @default(CONFIRMED) // Auto-confirmed on successful payment
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  items       OrderItem[]
  
  @@index([userId])
  @@index([orderNumber])
  @@index([status])
  @@index([email])
  @@index([createdAt])
  @@index([stripeCheckoutSessionId])
  @@index([stripePaymentIntentId])
}
```

### OrderItem Model

```prisma
model OrderItem {
  id          String  @id @default(cuid())
  orderId     String
  productId   String
  variantId   String?
  
  // Price snapshots (in cents) - captured at order time
  price       Int     // Price per unit at time of order
  quantity    Int     @default(1)
  
  createdAt   DateTime @default(now())
  
  order       Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product     Product         @relation(fields: [productId], references: [id], onDelete: Restrict)
  variant     ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
  
  @@index([orderId])
  @@index([productId])
}
```

### OrderStatus Enum

```prisma
enum OrderStatus {
  PENDING      // Order created, awaiting confirmation
  CONFIRMED    // Order confirmed, processing
  SHIPPED      // Order shipped
  DELIVERED    // Order delivered
  CANCELLED    // Order cancelled
}
```

**Key Design Decisions:**

- OrderNumber: Unique, human-readable identifier (e.g., "ORD-001234")
- Price Snapshots: Store prices at order time (unlike cart which uses current prices)
- Guest Orders: Support orders without user accounts via email
- Cascade Behavior: OrderItems cascade delete with orders, but products are restricted to prevent accidental deletion
- **Stock Tracking:**
  - Products with variants: Stock tracked at variant level only (`ProductVariant.stockQuantity`)
  - Products without variants: Stock tracked at product level (`Product.stockQuantity`, nullable)
  - If `Product.stockQuantity` is `null`, treated as unlimited inventory (no validation)
- **Error Handling:** Uses `invariant()` for assertions instead of `throw Error()` for better error messages and stack traces

## Order Utilities (`app/utils/order.server.ts`)

Core functions and types:

### Types

- `StockIssue` - Extracted type for stock availability issues:
  ```typescript
  type StockIssue = {
    productName: string
    requested: number
    available: number
  }
  ```

### Error Classes

- `StockValidationError` - Thrown when multiple items have stock issues (contains `issues: StockIssue[]`)
- `StockUnavailableError` - Thrown for single item stock issues (contains `data: StockIssue`)

### Functions

1. `validateStockAvailability(cartId)` - Validate stock for all cart items
   - Checks variant-level stock when variant exists
   - Checks product-level stock when no variant exists
   - Uses `invariant()` for assertions (cart existence, variant existence)
   - Throws `StockValidationError` with list of stock issues

2. `createOrderFromCart(...)` - Convert cart to order
   - Uses `invariant()` for assertions (cart existence, empty check)
   - Validates cart has items
   - Checks inventory availability (variant and product-level)
   - Creates order with price snapshots
   - Reduces inventory quantities atomically (variant and product-level)
   - Generates unique order number
   - Uses transaction for atomicity

3. `getOrderById(orderId)` - Get order with full details
   - Includes order items with product/variant data
   - Includes user if authenticated

4. `getUserOrders(userId)` - Get all orders for user
   - Ordered by createdAt DESC
   - Includes summary data

5. `getGuestOrder(orderNumber, email)` - Get guest order by order number and email
   - Validates email matches for security

6. `updateOrderStatus(orderId, status)` - Update order status (admin only)
   - Validates status transitions
   - Sends email notifications on status change

7. `getOrderByCheckoutSessionId(checkoutSessionId)` - Get order by Stripe Checkout Session ID
   - Used for webhook idempotency checks

8. `generateOrderNumber()` - Generate unique order number (in `order-number.server.ts`)
   - Format: "ORD-" + 6-digit zero-padded number
   - Uses database transaction for atomicity and race condition prevention

## Routes Structure

### Shop Routes (`app/routes/shop+/`)

```
shop+/
├── checkout.tsx              # Checkout page with shipping form
└── orders/
    ├── index.tsx             # User order history
    └── $orderNumber.tsx      # Order details view
```

### Admin Routes (`app/routes/admin+/`)

```
admin+/
└── orders+/
    ├── index.tsx             # Order list with filtering
    ├── $orderNumber.tsx      # Order detail view
    └── $orderNumber.status.ts # Update order status action
```

## Implementation Details

### 1. Checkout Page (`shop+/checkout.tsx`)

**Features:**

- Shipping address form with validation
- Order summary with itemized breakdown
- Stock validation before order creation
- Guest checkout support (email required)
- Authenticated users: auto-fill from profile
- Create order action that converts cart to order

**Form Fields:**

- Shipping Name (required)
- Shipping Street (required)
- Shipping City (required)
- Shipping State (optional)
- Shipping Postal Code (required)
- Shipping Country (required, default: "US")
- Email (required for guests, auto-filled for users)

**Validation:**

- All required fields must be filled
- Email format validation
- Postal code format (basic validation)
- Cart must not be empty
- Stock availability check

### 2. Order Creation Flow with Stripe Checkout Session

**Process:**

**Phase 1: Pre-Payment Validation (Checkout Action)**
1. User submits checkout form with shipping info
2. **Pre-Payment Stock Check**: Validate stock availability BEFORE creating Checkout Session
   - If insufficient stock → Return error immediately (no payment attempted)
3. Calculate order total (including shipping, tax if applicable)
4. Create Stripe Checkout Session with order total, line items, and metadata
   - Store cart ID, user ID, and shipping info in session metadata
5. Store Checkout Session ID temporarily (session/cookie)
6. Redirect user to Stripe's hosted checkout page (`session.url`)

**Phase 2: Payment Processing (Stripe Hosted Checkout)**
7. User completes payment on Stripe's hosted checkout page
8. Stripe redirects back to success URL (with `session_id` parameter)

**Phase 3: Order Creation (Webhook Handler)**
9. Stripe webhook receives `checkout.session.completed` event
10. **Verify Webhook Signature**: Validate request came from Stripe
11. Extract Checkout Session ID and metadata
12. **Idempotency Check**: Check if order already exists (by Checkout Session ID)
    - If exists → Return success (handle webhook retries gracefully)
13. Retrieve Checkout Session from Stripe to get payment details
14. Get cart from metadata
15. **Load Cart Data**: Fetch cart with items and products BEFORE transaction
16. **Transaction-Based Order Creation**:
    - Start database transaction with timeout
    - Re-check stock (final validation, handles race conditions)
    - If insufficient: throw error (triggers refund handling)
    - If sufficient: atomically (all in transaction):
      - Reduce ProductVariant.stockQuantity for all items
      - Create Order with shipping info and Stripe payment IDs
      - Create OrderItems with price snapshots
17. **Success**: Send order confirmation email, clear cart
18. **Failure (Insufficient Stock)**: Handle refund (see Refund Handling below)

**Checkout Session Creation:**

```typescript
// In checkout action, AFTER stock validation
const session = await stripe.checkout.sessions.create({
  line_items: cart.items.map(item => ({
    price_data: {
      currency: currency.code.toLowerCase(),
      product_data: {
        name: item.product.name,
        description: item.product.description || undefined,
      },
      unit_amount: item.variantId 
        ? (item.variant.price ?? item.product.price)
        : item.product.price,
    },
    quantity: item.quantity,
  })),
  mode: 'payment',
  success_url: `${getDomainUrl(request)}/shop/orders?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${getDomainUrl(request)}/shop/checkout?canceled=true`,
  customer_email: shippingData.email,
  metadata: {
    cartId: cart.id,
    userId: userId || '',
    shippingName: shippingData.name,
    shippingStreet: shippingData.street,
    shippingCity: shippingData.city,
    shippingState: shippingData.state || '',
    shippingPostal: shippingData.postal,
    shippingCountry: shippingData.country,
  },
  payment_intent_data: {
    metadata: {
      cartId: cart.id,
    },
  },
})

return redirect(session.url) // Redirect to Stripe Checkout
```

**Webhook Handler Implementation:**

```typescript
// app/routes/webhooks+/stripe.ts
export async function action({ request }: Route.ActionArgs) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Response('Missing webhook secret', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
      300 // tolerance in seconds
    )
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    
    // Idempotency check
    const existingOrder = await prisma.order.findUnique({
      where: { stripeCheckoutSessionId: session.id }
    })
    if (existingOrder) {
      return json({ received: true, orderId: existingOrder.id })
    }

    // Load cart data BEFORE transaction (more efficient)
    const cartId = session.metadata?.cartId
    if (!cartId) {
      throw new Error('Missing cartId in session metadata')
    }

    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: {
          include: { product: true }
        }
      }
    })

    if (!cart || cart.items.length === 0) {
      throw new Error('Cart not found or empty')
    }

    // Create order in transaction
    try {
      const order = await prisma.$transaction(async (tx) => {
        // 1. Re-check stock (final validation, handles race conditions)
        for (const item of cart.items) {
          if (item.variantId) {
            const variant = await tx.productVariant.findUnique({
              where: { id: item.variantId },
            })
            if (!variant || variant.stockQuantity < item.quantity) {
              throw new StockUnavailableError({
                productName: item.product.name,
                requested: item.quantity,
                available: variant?.stockQuantity ?? 0
              })
            }
          }
        }

        // 2. Reduce stock atomically
        for (const item of cart.items) {
          if (item.variantId) {
            // Reduce variant stock
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stockQuantity: { decrement: item.quantity } }
            })
          } else {
            // Reduce product stock (if it has stock tracking)
            const product = await tx.product.findUnique({
              where: { id: item.productId },
              select: { stockQuantity: true }
            })
            if (product && product.stockQuantity !== null) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stockQuantity: { decrement: item.quantity } }
              })
            }
          }
        }

        // 3. Create order and order items atomically
        const order = await tx.order.create({
          data: {
            orderNumber: await generateOrderNumber(),
            userId: session.metadata?.userId || null,
            email: session.customer_email || session.metadata?.email || '',
            subtotal: session.amount_subtotal,
            total: session.amount_total,
            shippingName: session.metadata?.shippingName || '',
            shippingStreet: session.metadata?.shippingStreet || '',
            shippingCity: session.metadata?.shippingCity || '',
            shippingState: session.metadata?.shippingState || null,
            shippingPostal: session.metadata?.shippingPostal || '',
            shippingCountry: session.metadata?.shippingCountry || 'US',
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: session.payment_intent as string || null,
            status: 'CONFIRMED',
          }
        })

        await Promise.all(
          cart.items.map(item => 
            tx.orderItem.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                variantId: item.variantId,
                price: item.variantId
                  ? (item.variant?.price ?? item.product.price)
                  : item.product.price,
                quantity: item.quantity,
              }
            })
          )
        )

        return order
      }, {
        timeout: 30000, // 30 second timeout
      })

      // Send confirmation email
      await sendOrderConfirmationEmail(order)

      // Clear cart
      await prisma.cart.delete({ where: { id: cartId } })

      return json({ received: true, orderId: order.id })
    } catch (error) {
      if (error instanceof StockUnavailableError) {
        // Handle refund (see Refund Handling section)
        return handleStockUnavailableRefund(session, error)
      }
      throw error
    }
  }

  return json({ received: true })
}
```

**Error Handling:**

- Stock unavailable: Transaction rolls back, show specific items, handle Stripe refund if payment already processed
- Cart empty: Redirect to cart
- Validation errors: Display inline
- Payment failed: No order created, no inventory change
- Webhook retries: Idempotent handling (check if order already exists by checkout session ID)
- Webhook signature verification: Always verify Stripe signatures before processing
- Transaction timeout: Set explicit 30-second timeout to prevent hanging transactions

### 3. User Order History (`shop+/orders+/index.tsx`)

**Features:**

- List of user's orders (authenticated users only)
- Order number, date, status, total
- Link to order details
- Empty state message

**Guest Orders:**

- Access via order number lookup form
- Requires email verification

### 4. Order Details View (`shop+/orders+/$orderNumber.tsx`)

**Features:**

- Full order information
- Itemized list with product details
- Shipping address
- Order status with visual indicator
- Order number display
- Created date/time

### 5. Admin Order Management (`admin+/orders+/`)

**List Page (`index.tsx`):**

- Table of all orders
- Filters: Status, Date range, Email/Order Number search
- Sortable columns
- Quick status update actions
- Link to detail view

**Detail Page (`$orderNumber.tsx`):**

- Complete order information
- Status update dropdown (admin only)
- Customer information
- Order items table
- Timeline/history of status changes

**Status Update Action (`$orderNumber.status.ts`):**

- Validates status transitions
- Updates order status
- Sends email notification
- Redirects with toast confirmation

## Email Notifications

### Order Confirmation Email

**Trigger:** When order is created

**Recipient:** Order email address

**Content:**

- Order number
- Order summary
- Shipping address
- Itemized list
- Total amount
- Link to view order details

### Status Update Email

**Trigger:** When admin changes order status

**Recipient:** Order email address

**Content:**

- Order number
- New status
- Tracking information (if shipped)
- Link to view order

**Implementation:**

- Use `app/utils/email.server.ts` (Resend)
- Create React Email templates
- Store email templates in `app/components/emails/`

## Inventory Management

### Stock Reduction Strategy

- **On Order Creation:** Immediately reduce stock quantities atomically
  - For items with variants: Reduce `ProductVariant.stockQuantity`
  - For items without variants: Reduce `Product.stockQuantity` (if set)
- **Stock Levels:**
  - Products with variants: Stock tracked at variant level only
  - Products without variants: Stock tracked at product level (nullable)
  - If `Product.stockQuantity` is `null`, treat as unlimited (no stock checking)
- **On Cancellation:** Restore stock if order cancelled (future)
- **Validation:** Check stock before order creation, fail if insufficient

### Stock Checking Logic

**Two-Level Stock System:**

```typescript
// Before creating order
for (const item of cart.items) {
  if (item.variantId) {
    // Item has variant - check variant-level stock
    const variant = await prisma.productVariant.findUnique({
      where: { id: item.variantId },
      select: { id: true, stockQuantity: true }
    })
    invariant(variant, `Variant ${item.variantId} not found`)
    if (variant.stockQuantity < item.quantity) {
      throw new StockValidationError([{
        productName: item.product.name,
        requested: item.quantity,
        available: variant.stockQuantity
      }])
    }
  } else {
    // Item has no variant - check product-level stock
    if (item.product.stockQuantity !== null) {
      // Product has stock tracking
      if (item.product.stockQuantity < item.quantity) {
        throw new StockValidationError([{
          productName: item.product.name,
          requested: item.quantity,
          available: item.product.stockQuantity
        }])
      }
    }
    // If stockQuantity is null, treat as unlimited (no validation)
  }
}
```

**Database Schema:**

- `Product.stockQuantity Int?` - Nullable stock quantity for products without variants
- `ProductVariant.stockQuantity Int` - Required stock quantity for variants

**Common Practice:**
- Products with variants track stock at variant level (each variant has its own stock)
- Products without variants can track stock at product level (single stock pool)
- Products without stockQuantity set are treated as unlimited inventory

## UI Components

### Order Status Badge

- Visual indicator for order status
- Color-coded (pending=yellow, confirmed=blue, shipped=green, etc.)
- Use Badge component from shadcn

### Order Summary Card

- Reusable component for checkout and order details
- Shows items, subtotal, total
- Responsive design

## Testing Strategy

### Stripe Payment Testing

**Multiple testing approaches for different scenarios:**

#### 1. MSW Mocking (Unit/Integration Tests)

Mock Stripe API calls using MSW (following existing pattern):

**File:** `tests/mocks/stripe.ts`

```typescript
import { faker } from '@faker-js/faker'
import { HttpResponse, http } from 'msw'

export const handlers = [
  // Mock Checkout Session creation
  http.post('https://api.stripe.com/v1/checkout/sessions', async ({ request }) => {
    requireHeader(request.headers, 'Authorization')
    const body = await request.formData()
    
    return HttpResponse.json({
      id: `cs_test_${faker.string.alphanumeric(24)}`,
      object: 'checkout.session',
      url: `https://checkout.stripe.com/test/${faker.string.alphanumeric(24)}`,
      status: 'open',
      payment_intent: `pi_test_${faker.string.alphanumeric(24)}`,
      amount_total: Number(body.get('amount')) || 0,
      amount_subtotal: Number(body.get('amount')) || 0,
      customer_email: body.get('customer_email'),
      metadata: {
        cartId: body.get('metadata[cartId]') || '',
        userId: body.get('metadata[userId]') || '',
      },
    })
  }),

  // Mock Checkout Session retrieval
  http.get('https://api.stripe.com/v1/checkout/sessions/:id', async ({ request }) => {
    requireHeader(request.headers, 'Authorization')
    const id = request.url.split('/').pop()?.split('?')[0]
    
    return HttpResponse.json({
      id: id || `cs_test_${faker.string.alphanumeric(24)}`,
      object: 'checkout.session',
      status: 'complete',
      payment_status: 'paid',
      payment_intent: `pi_test_${faker.string.alphanumeric(24)}`,
      customer_email: 'test@example.com',
      metadata: {},
    })
  }),
  
  // Mock refund creation
  http.post('https://api.stripe.com/v1/refunds', async ({ request }) => {
    const body = await request.formData()
    return HttpResponse.json({
      id: `re_${faker.string.alphanumeric(24)}`,
      amount: Number(body.get('amount')),
      status: 'succeeded',
      payment_intent: body.get('payment_intent'),
    })
  }),
]
```

**Benefits:**

- Fast (no network calls)
- Deterministic test results
- Easy to simulate edge cases (payment failures, webhook retries)
- No Stripe API keys needed for tests

#### 2. Stripe Test Mode (E2E Tests with Real Flow)

Use Stripe test API keys and test cards:

**Test Cards (Stripe provides):**

- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Insufficient funds: `4000 0000 0000 9995`

**Environment Setup:**

```typescript
// In E2E test setup
process.env.STRIPE_SECRET_KEY = 'sk_test_...' // Stripe test key
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_...' // Stripe test key
```

**E2E Test Example:**

```typescript
test('can complete checkout with successful payment', async ({ page }) => {
  // Fill checkout form
  await page.fill('[name="shippingName"]', 'Test User')
  // ... other fields
  
  // Submit and redirect to Stripe Checkout
  await page.click('button[type="submit"]')
  await page.waitForURL(/checkout\.stripe\.com/)
  
  // Use Stripe test card
  await page.fill('[name="cardNumber"]', '4242 4242 4242 4242')
  await page.fill('[name="cardExpiry"]', '12/34')
  await page.fill('[name="cardCvc"]', '123')
  
  // Complete payment
  await page.click('button:has-text("Pay")')
  
  // Verify redirect to success page
  await page.waitForURL(/orders/)
  await expect(page.locator('text=Order confirmed')).toBeVisible()
})
```

#### 3. Stripe Test Mode (Development & E2E)

**Stripe Test Mode Overview:**

Stripe provides a complete test environment that works identically to production but uses test data:

**Test API Keys:**

- Secret Key: Starts with `sk_test_...`
- Publishable Key: Starts with `pk_test_...`
- Get from: https://dashboard.stripe.com/test/apikeys

**Test Card Numbers:**

All transactions succeed automatically (no real money):

- **Success**: `4242 4242 4242 4242`
- **Requires Authentication (3D Secure)**: `4000 0027 6000 3184`
- **Decline (Generic)**: `4000 0000 0000 0002`
- **Insufficient Funds**: `4000 0000 0000 9995`
- **Expired Card**: `4000 0000 0000 0069`
- **Processing Error**: `4000 0000 0000 0119`

**Test Card Details (Use Any):**

- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

**Development Setup:**

```bash
# .env.local (for local development)
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_... # From Stripe CLI or dashboard
```

**Local Development with Stripe CLI:**

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe
# or: npm install -g stripe-cli

# Login to your Stripe account
stripe login

# Forward webhooks to local server (runs in background)
stripe listen --forward-to localhost:3000/webhooks/stripe

# This will output a webhook signing secret:
# > Ready! Your webhook signing secret is whsec_xxxxx
# Add this to your .env.local as STRIPE_WEBHOOK_SECRET
```

**Benefits for Development:**

1. **No Real Money:** All transactions are simulated
2. **Full Feature Parity:** Test mode works exactly like production
3. **Test Dashboard:** View all test transactions in Stripe Dashboard (Test Mode toggle)
4. **Webhook Testing:** Use Stripe CLI to forward webhooks to localhost
5. **Test Scenarios:** Use different test cards to test various outcomes
6. **No Rate Limits:** Test as much as you want

**Stripe Dashboard (Test Mode):**

1. Toggle "Test Mode" in Stripe Dashboard
2. View all test payments, customers, webhooks
3. Manually trigger webhook events
4. See payment logs and errors

**Development Workflow:**

```typescript
// app/utils/stripe.server.ts
import Stripe from 'stripe'

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || '',
  {
    apiVersion: '2024-11-20.acacia', // Use stable version
    maxNetworkRetries: 2,
    timeout: 30000,
  }
)

// Automatically uses test mode if key starts with sk_test_
// No code changes needed between test/production!

// Stripe error handling utility
export function handleStripeError(err: unknown) {
  if (err instanceof Stripe.errors.StripeCardError) {
    return { type: 'card_error', message: err.message, code: err.code }
  } else if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return { type: 'invalid_request', message: err.message, param: err.param }
  } else if (err instanceof Stripe.errors.StripeAPIError) {
    return { type: 'api_error', message: err.message }
  } else if (err instanceof Stripe.errors.StripeConnectionError) {
    return { type: 'connection_error', message: err.message }
  } else if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return { type: 'authentication_error', message: err.message }
  } else if (err instanceof Stripe.errors.StripeRateLimitError) {
    return { type: 'rate_limit_error', message: err.message }
  }
  return { type: 'unknown_error', message: 'An unexpected error occurred' }
}
```

**Testing Different Payment Scenarios:**

```bash
# Test successful payment
Use card: 4242 4242 4242 4242

# Test payment failure
Use card: 4000 0000 0000 0002

# Test 3D Secure authentication (requires auth in test mode)
Use card: 4000 0027 6000 3184

# Trigger test webhook events
stripe trigger checkout.session.completed
stripe trigger checkout.session.async_payment_succeeded
stripe trigger checkout.session.async_payment_failed
```

**Benefits:**

- Test webhook handling without deploying
- Real Stripe events for local testing
- Perfect for manual testing during development
- Can test full payment flow including webhooks

#### 4. Hybrid Approach (Recommended)

- **Unit/Integration Tests**: Use MSW mocks (fast, deterministic)
- **E2E Tests**: Use Stripe Test Mode with test cards (realistic flow)
- **Local Development**: Use Stripe Test Mode + Stripe CLI for webhooks

### E2E Tests (`tests/e2e/orders.test.ts`)

**Payment Flow Tests:**

- Create order with successful payment (using test card `4242 4242 4242 4242`)
- Handle payment failure (using decline card `4000 0000 0000 0002`)
- Test webhook signature verification (valid and invalid signatures)
- Test webhook retry handling (simulate Stripe webhook retries)
- Test idempotency (duplicate webhook events)
- Test refund scenario (insufficient stock after payment)
- Guest checkout with payment
- Authenticated user checkout with payment
- Test Checkout Session redirect flow

**Order Flow Tests:**

- Create order from cart
- Guest checkout flow
- Authenticated user checkout
- Order history display
- Admin order management
- Status update workflow
- Inventory reduction validation
- Email notification triggers

### Unit/Integration Tests (`tests/order.server.test.ts`)

**Payment Utilities Tests (with MSW mocks):**

- Checkout Session creation
- Webhook signature verification
- Webhook event processing (idempotency, `checkout.session.completed`)
- Refund creation
- Stripe error handling (CardError, InvalidRequestError, etc.)

**Order Utilities Tests:**

- Order utility functions
- Order number generation
- Stock validation logic
- Price snapshot calculations
- Transaction-based order creation

### Test Environment Setup

**Add to `tests/setup/setup-test-env.ts`:**

```typescript
// Mock Stripe in test environment
if (process.env.MOCKS === 'true') {
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock'
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock'
}
```

**Add Stripe mock to `tests/mocks/index.ts`:**

```typescript
import { handlers as stripeHandlers } from './stripe.ts'

export const server = setupServer(
  ...resendHandlers,
  ...githubHandlers,
  ...tigrisHandlers,
  ...pwnedPasswordApiHandlers,
  ...stripeHandlers, // Add Stripe mocks
)
```

## Migration Strategy

1. Create Prisma migration for Order and OrderItem models
2. Add OrderStatus enum
3. Update User model to include orders relation
4. Update Product and ProductVariant to include orderItems relation
5. Run migration: `npx prisma migrate dev --name add_orders`
6. Update Prisma client

## File Structure

```
app/routes/
├── shop+/
│   ├── checkout.tsx
│   └── orders+/
│       ├── index.tsx
│       └── $orderNumber.tsx
├── admin+/
│   └── orders+/
│       ├── index.tsx
│       ├── $orderNumber.tsx
│       └── $orderNumber.status.ts
└── webhooks+/
    └── stripe.ts            # Stripe webhook handler

app/utils/
├── order.server.ts          # Order utilities
├── order-number.server.ts   # Order number generation
└── stripe.server.ts         # Stripe client initialization

app/components/
└── emails/
    ├── order-confirmation.tsx
    └── order-status-update.tsx

prisma/
└── migrations/
    └── YYYYMMDDHHMMSS_add_orders/
        └── migration.sql
```

## Implementation Order (TDD Approach)

**Note:** Following Test-Driven Development - write tests first, then implement to pass tests.

### Phase 1: Database & Core Utilities (TDD)

1. Write tests for order schema relationships
2. Create database schema (Order, OrderItem, OrderStatus enum)
3. Write tests for `generateOrderNumber()` function
4. Implement `generateOrderNumber()` utility
5. Write tests for stock validation (`validateStockAvailability`)
6. Implement stock validation utility
7. Write tests for order creation transaction logic
8. Implement `createOrderFromCart()` with transaction
9. Write tests for order retrieval functions
10. Implement `getOrderById()`, `getUserOrders()`, `getGuestOrder()`
11. Run Prisma migration

### Phase 2: Stripe Integration (TDD)

12. Write tests for Checkout Session creation
13. Implement Stripe Checkout Session creation in checkout action
14. Write tests for webhook signature verification
15. Write tests for webhook handler (idempotency, success, failures)
16. Implement Stripe webhook handler with transaction and signature verification
17. Write tests for refund handling
18. Implement refund logic for edge cases
19. Write tests for Stripe error handling
20. Implement explicit Stripe error handling (CardError, InvalidRequestError, etc.)
21. Write tests for email notifications on order creation
22. Implement order confirmation email

### Phase 3: Checkout Flow (TDD)

20. Write E2E tests for checkout page (validation, stock check)
21. Build checkout page with shipping form
22. Write E2E tests for checkout action (pre-payment stock validation)
23. Implement checkout action with pre-payment stock check
24. Write E2E tests for Stripe Checkout Session redirect
25. Integrate Stripe Checkout Session redirect to hosted checkout page

### Phase 4: User-Facing Features (TDD)

26. Write E2E tests for user order history
27. Build user order history page
28. Write E2E tests for order details view
29. Build order details view
30. Write tests for guest order lookup
31. Implement guest order lookup functionality

### Phase 5: Admin Features (TDD)

32. Write E2E tests for admin order list
33. Build admin order list page (following MODERN_ADMIN_PAGES.md)
34. Write E2E tests for admin order detail
35. Build admin order detail page
36. Write E2E tests for status update
37. Implement status update action
38. Write tests for status update emails
39. Implement status update email notifications

### Phase 6: Testing & Polish

40. Run full E2E test suite
41. Fix any failing tests
42. Add error handling edge cases
43. Add loading states and UX polish
44. Documentation updates

## Notes

- Orders use price snapshots (unlike cart which uses current prices)
- Inventory is reduced immediately on order creation (variant-level and product-level)
- **Product-level stock tracking:** Products without variants can have `stockQuantity` set (nullable)
  - If `stockQuantity` is `null`, treated as unlimited inventory (no stock checking)
  - If `stockQuantity` is set, stock is validated and reduced on order creation
  - Variants always have stock tracking (required field)
- **Error handling:** Uses `invariant()` from `@epic-web/invariant` for assertions instead of `throw Error()`
- **Type extraction:** `StockIssue` type extracted and reused in error classes
- Guest orders accessible via order number + email verification
- Follow MODERN_ADMIN_PAGES.md patterns for admin interface
- Use existing email infrastructure (Resend)
- Maintain Epic Stack conventions (no useEffect unless necessary)
- Using Stripe Checkout Session (hosted checkout) for simpler integration
- Webhook signature verification is mandatory for security
- Transaction timeouts set to 30 seconds to prevent hanging
- Cart data loaded before transaction for better performance
- Explicit Stripe error handling for all API calls

### To-dos

- [ ] Create Order and OrderItem models in Prisma schema with OrderStatus enum, add relations to User, Product, and ProductVariant
- [ ] Create and run Prisma migration for orders system
- [ ] Implement order.server.ts utilities: createOrderFromCart, getOrderById, getUserOrders, getGuestOrder, updateOrderStatus, generateOrderNumber
- [ ] Build checkout page with shipping address form, order summary, and validation
- [ ] Implement order creation action that converts cart to order with inventory reduction and price snapshots
- [ ] Create order confirmation email template and send on order creation
- [ ] Build user order history page and order details view
- [ ] Create admin order list page with filtering and search following MODERN_ADMIN_PAGES.md patterns
- [ ] Build admin order detail page with status update functionality
- [ ] Create status update email template and send notifications on status changes
- [ ] Write comprehensive E2E tests for checkout, order history, and admin order management