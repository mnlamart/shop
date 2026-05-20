# Documentation

This directory contains comprehensive documentation for the e-commerce features implemented in this Epic Stack instance.

## Architecture Documentation

### [Product Images](product-images.md)
Complete guide to the fixture-based image system using Picsum Photos placeholder images. Covers development workflow, production integration, and troubleshooting.

### [Relational Variants](relational-variants.md)
Detailed explanation of the normalized database structure for product variants, including schema design, query patterns, and migration strategies.

### [Admin Dashboard](admin-dashboard.md)
Comprehensive overview of the admin interface architecture, including route structure, security model, UI components, and accessibility features.

### [Implementation Notes](implementation-notes.md)
Key architectural decisions, trade-offs, and lessons learned during development. Essential reading for understanding the reasoning behind implementation choices.

### [Accessibility Testing](accessibility-testing.md)
Complete guide to accessibility testing with axe-core, covering E2E tests (Playwright), component tests (Vitest), configuration options, and best practices for maintaining WCAG compliance.

### [Order Management System](archive/order-management-system.plan.md)
Comprehensive documentation of the order management system, including Stripe integration, webhook handling, idempotency, atomic operations, and order lifecycle management.

### [Checkout Success Page](checkout-success-page.md)
Documentation of the checkout success page fallback mechanism, including polling logic, automatic fallback, and manual sync options for handling webhook failures.

### [Schema Validation](implementation-notes.md#schema-validation)
All schemas use Zod v4 syntax with the `error` parameter for consistent, user-friendly validation messages. See [Implementation Notes](implementation-notes.md) for details.

## Architecture Decision Records

Key architectural decisions are recorded as ADRs in [`decisions/`](decisions/). Each ADR captures the context, decision, alternatives considered, and consequences. ADRs are immutable once accepted — superseded decisions are linked forward, not rewritten.

- [ADR 001 — Price Storage as Integer Cents](decisions/001-price-storage-as-integer-cents.md) — why prices are stored as integer cents instead of Decimal
- [ADR 002 — Store-Level Currency Configuration](decisions/002-store-level-currency.md) — why currency is a store-level setting, not per-product
- [ADR 003 — Carrier Coupling Deferred](decisions/003-carrier-coupling-deferred.md) — why the carrier abstraction is deferred until a second carrier is queued
- [ADR 005 — SQLite Scaling Cliff Trigger Conditions](decisions/005-sqlite-scaling-cliff.md) — 5 measurable triggers for when to migrate from SQLite+LiteFS to Postgres

## Planning Documentation

Historical implementation plans and completed work are archived under [`archive/`](archive/). They preserve context for past decisions but are no longer active references:

- `archive/001-admin-product-management.md` — original admin product CRUD plan (completed)
- `archive/002-shopping-cart-system.md` — shopping cart implementation plan (completed)
- `archive/shipping-system-implementation.md` — shipping system rollout plan (completed)
- `archive/checkout-test-refactoring-plan.md` — checkout test refactor (completed)
- `archive/e2e-flaky-tests-fix-reference.md` — Playwright flakiness debugging notes
- `archive/order-management-polish.md` — order management optimization pass (completed)
- `archive/order-management-system.plan.md` — order system implementation plan

## Quick Reference

### Key Features
- **Product Management**: Full CRUD with variants, images, and inventory
- **Category System**: Hierarchical categories with cascade behavior
- **Attribute System**: Flexible, relational attribute management
- **User Management**: Admin interface for viewing and editing users, managing roles
- **Shopping Cart**: Guest and authenticated user carts with merge on login
- **Checkout Flow**: Stripe integration with webhook handling and fallback mechanism
- **Order Management**: Complete order lifecycle with status tracking and notifications
- **Image Handling**: Fixture system for development, Tigris storage for production
- **Admin Navigation**: Improved sidebar with direct links, better UX, and updated icons
- **Admin Security**: Role-based access control with ARIA compliance
- **Accessibility**: WCAG 2.1 Level AA compliance with axe-core testing
- **Schema Validation**: Zod v4 syntax with user-friendly error messages

### File Locations
- **Admin Routes**: `app/routes/admin+/`
- **Shop Routes**: `app/routes/shop+/`
- **Components**: `app/components/` (UI components)
- **Database**: `prisma/schema.prisma`
- **Schemas**: `app/schemas/` (Zod validation schemas)
- **Fixtures**: `tests/fixtures/images/products/`
- **Tests**: `tests/e2e/` (E2E tests), `tests/utils/` (test utilities)
- **Accessibility Tests**: `tests/e2e/a11y.test.ts`

### Development Workflow
1. **Database Changes**: Update `prisma/schema.prisma`, run migrations
2. **Fixture Updates**: Modify `tests/fixtures/images/products/` as needed
3. **Component Development**: Follow Epic Stack patterns and ARIA guidelines
4. **Testing**: Use Playwright for E2E, React Testing Library for components
5. **Accessibility Testing**: Run accessibility tests with axe-core (see [Accessibility Testing](accessibility-testing.md))

## Contributing

When extending or modifying the e-commerce features:

1. **Read the Architecture Docs**: Understand the existing patterns before making changes
2. **Follow Epic Stack Conventions**: Maintain consistency with the broader codebase
3. **Update Documentation**: Keep docs current with implementation changes
4. **Test Thoroughly**: Ensure both unit and E2E tests pass
5. **Consider Accessibility**: Maintain ARIA compliance in all new features

## Support

For questions about the e-commerce implementation:
- Check the relevant architecture documentation first
- Review implementation notes for design decisions
- Examine existing code patterns for consistency
- Check historical documentation for context on past decisions
- Create issues for bugs or feature requests
