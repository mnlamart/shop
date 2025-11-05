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

### [Order Management System](order-management-system.plan.md)
Comprehensive documentation of the order management system, including Stripe integration, webhook handling, idempotency, atomic operations, and order lifecycle management.

### [Checkout Success Page](checkout-success-page.md)
Documentation of the checkout success page fallback mechanism, including polling logic, automatic fallback, and manual sync options for handling webhook failures.

### [Schema Validation](implementation-notes.md#schema-validation)
All schemas use Zod v4 syntax with the `error` parameter for consistent, user-friendly validation messages. See [Implementation Notes](implementation-notes.md) for details.

## Planning Documentation

### [Admin Product Management Plan](plans/001-admin-product-management.md)
Original implementation plan with status updates and completion notes. Shows the evolution from initial requirements to final implementation.

### [Shopping Cart System Plan](plans/002-shopping-cart-system.md)
Implementation plan for the shopping cart system, including guest and authenticated user flows, cart merging, and checkout integration.

### [Checkout Test Refactoring Plan](checkout-test-refactoring-plan.md)
Plan for refactoring checkout tests when they are re-enabled. Currently, checkout tests are skipped and will be re-implemented when payment provider is integrated.

## Quick Reference

### Key Features
- **Product Management**: Full CRUD with variants, images, and inventory
- **Category System**: Hierarchical categories with cascade behavior
- **Attribute System**: Flexible, relational attribute management
- **Shopping Cart**: Guest and authenticated user carts with merge on login
- **Checkout Flow**: Stripe integration with webhook handling and fallback mechanism
- **Order Management**: Complete order lifecycle with status tracking and notifications
- **Image Handling**: Fixture system for development, Tigris storage for production
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
