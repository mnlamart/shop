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

## Planning Documentation

### [Admin Product Management Plan](plans/001-admin-product-management.md)
Original implementation plan with status updates and completion notes. Shows the evolution from initial requirements to final implementation.

## Quick Reference

### Key Features
- **Product Management**: Full CRUD with variants, images, and inventory
- **Category System**: Hierarchical categories with cascade behavior
- **Attribute System**: Flexible, relational attribute management
- **Image Handling**: Fixture system for development, Tigris storage for production
- **Admin Security**: Role-based access control with ARIA compliance

### File Locations
- **Routes**: `app/routes/admin+/`
- **Components**: `app/components/` (UI components)
- **Database**: `prisma/schema.prisma`
- **Fixtures**: `tests/fixtures/images/products/`
- **Tests**: `tests/e2e/admin/`

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
- Create issues for bugs or feature requests
