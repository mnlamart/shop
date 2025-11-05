# Accessibility Testing with axe-core

## Introduction

### What is axe-core?

axe-core is a fast, secure, and lightweight accessibility testing engine for websites and HTML-based user interfaces. It's designed to integrate seamlessly with existing test environments and automatically detect accessibility violations.

### Why Use Automated Accessibility Testing?

- **Early Detection**: Catch accessibility issues during development, not after deployment
- **Consistent Testing**: Standardized accessibility checks across all tests
- **Developer Feedback**: Immediate feedback during development
- **Compliance**: Ensure WCAG compliance automatically
- **Prevention**: Prevent regressions with automated tests
- **Documentation**: Clear violation reports help developers fix issues

### WCAG Compliance Overview

We target **WCAG 2.1 Level AA compliance**, which is the industry standard for web accessibility. This includes:

- **Level A**: Basic accessibility requirements (minimum level)
- **Level AA**: Enhanced accessibility (recommended for most websites)
- **Level AAA**: Highest level (not required for most sites)

### How It Fits Into Our Development Workflow

Accessibility testing is integrated into:

- **E2E Tests**: Playwright tests check full page accessibility
- **Component Tests**: Vitest tests check component-level accessibility
- **CI/CD Pipeline**: Automated checks prevent accessibility regressions
- **Development**: Developers can run accessibility checks locally

## Getting Started

### Installation

Install the required packages:

```bash
npm install --save-dev @axe-core/playwright axe-core
```

### Basic Setup Requirements

- **Playwright**: Already installed for E2E testing
- **Vitest**: Already installed for component testing
- **React Testing Library**: Already installed for component rendering

### Running Your First Accessibility Test

**E2E Test Example:**

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('homepage should be accessible', async ({ page }) => {
  await page.goto('/')
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**Component Test Example:**

```typescript
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import * as axe from 'axe-core'

test('component should be accessible', async () => {
  const { container } = render(<YourComponent />)
  const results = await axe.run(container)
  expect(results.violations).toEqual([])
})
```

## Writing Accessibility Tests

### E2E Tests (Playwright)

Use `@axe-core/playwright` with Playwright's `AxeBuilder` API:

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('page should be accessible', async ({ page }) => {
  await page.goto('/your-page')
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**Key Points:**
- Use `AxeBuilder` with the Playwright `page` object
- Chain methods to configure the scan
- Call `.analyze()` to run the scan
- Check `results.violations` array

### Component Tests (Vitest)

Use `axe-core` directly with React Testing Library:

```typescript
import { render } from '@testing-library/react'
import * as axe from 'axe-core'

test('component should be accessible', async () => {
  const { container } = render(<YourComponent />)
  const results = await axe.run(container)
  expect(results.violations).toEqual([])
})
```

**Key Points:**
- Use `render()` from React Testing Library
- Pass the `container` to `axe.run()`
- Check `results.violations` array
- Configure axe-core globally if needed (see Configuration section)

## Common Patterns

### Testing Forms with Validation Errors

Forms should be accessible even when showing validation errors:

```typescript
test('form with errors should be accessible', async ({ page }) => {
  await page.goto('/checkout')
  
  // Submit form to trigger validation errors
  await page.getByRole('button', { name: /submit/i }).click()
  
  // Wait for errors to appear
  await page.waitForSelector('[role="alert"]')
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**What to Test:**
- Error messages are associated with form fields (`aria-describedby`, `aria-invalid`)
- Error messages are announced to screen readers (`role="alert"`)
- Required fields are properly labeled
- Form labels are correctly associated with inputs

### Testing Modals and Dialogs

Modals require special accessibility considerations:

```typescript
test('modal should be accessible', async ({ page }) => {
  await page.goto('/admin/orders')
  
  // Open modal
  await page.getByRole('button', { name: /cancel order/i }).click()
  
  // Wait for modal to appear
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**What to Test:**
- Modal has `role="dialog"` or `role="alertdialog"`
- Modal has `aria-modal="true"`
- Modal has `aria-labelledby` pointing to title
- Focus is trapped within modal
- Escape key closes modal
- Focus returns to trigger when closed

### Testing Dynamic Content

Test content that appears or changes dynamically:

```typescript
test('toast notification should be accessible', async ({ page }) => {
  await page.goto('/admin/orders/ORD-123')
  
  // Trigger action that shows toast
  await page.getByRole('button', { name: /update status/i }).click()
  
  // Wait for toast to appear
  await page.waitForSelector('[role="status"]', { timeout: 5000 })
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**What to Test:**
- Toast notifications have appropriate ARIA roles (`role="status"` or `role="alert"`)
- Dynamic content is announced to screen readers
- Loading states don't break accessibility
- Content changes don't trap keyboard focus

### Testing Navigation

Ensure keyboard navigation works correctly:

```typescript
test('navigation should be keyboard accessible', async ({ page }) => {
  await page.goto('/')
  
  // Test tab navigation
  await page.keyboard.press('Tab')
  const focusedElement = page.locator(':focus')
  await expect(focusedElement).toBeVisible()
  
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

**What to Test:**
- All interactive elements are keyboard accessible
- Focus indicators are visible
- Tab order is logical
- Skip links are available for main content
- Focus is managed correctly (modals, dropdowns)

## Configuration Options

### AxeBuilder API Methods

The `AxeBuilder` class provides several methods for configuring scans:

#### `.withTags(['wcag2a', 'wcag2aa'])`

Filter rules by tags:

```typescript
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'best-practice'])
  .analyze()
```

**Available Tags:**
- `wcag2a` - WCAG 2.0 Level A rules
- `wcag2aa` - WCAG 2.0 Level AA rules
- `wcag21aa` - WCAG 2.1 Level AA rules
- `best-practice` - Best practice recommendations

#### `.exclude('#element')`

Exclude elements from the scan:

```typescript
const results = await new AxeBuilder({ page })
  .exclude('.third-party-widget')
  .exclude('#ad-banner')
  .analyze()
```

Use this for:
- Third-party widgets you can't control
- Temporary elements
- Known issues being fixed separately

**Note**: Always document why elements are excluded.

#### `.include('#element')`

Include only specific elements:

```typescript
const results = await new AxeBuilder({ page })
  .include('main')
  .include('footer')
  .analyze()
```

Use this to test specific sections of a page.

#### `.disableRules(['rule-id'])`

Disable specific rules:

```typescript
const results = await new AxeBuilder({ page })
  .disableRules(['duplicate-id'])
  .analyze()
```

Use this for:
- Rules with known false positives
- Rules being addressed separately
- Temporary workarounds

**Note**: Always document why rules are disabled and create tickets to fix them.

### Global Configuration (axe.configure)

For component tests, configure axe-core globally:

```typescript
import * as axe from 'axe-core'

// Configure once in test setup
axe.configure({
  tags: ['wcag2a', 'wcag2aa', 'best-practice'],
  rules: {
    'color-contrast': { enabled: true },
    'keyboard-navigation': { enabled: true },
    'landmark-one-main': { enabled: false }
  }
})
```

**Important**: `axe.configure()` must be applied in each frame/iframe where testing occurs.

## Fixing Common Violations

### Missing ARIA Labels

**How to Identify:**
- Violation: "Elements must have accessible names"
- Rule ID: `aria-hidden-focus`, `button-name`, `link-name`

**How to Fix:**

```tsx
// Bad: Icon-only button without label
<button>
  <Icon name="arrow-left" />
</button>

// Good: Add aria-label
<button aria-label="Back to orders">
  <Icon name="arrow-left" aria-hidden="true" />
</button>

// Good: Use visible text
<button>
  <Icon name="arrow-left" />
  Back to Orders
</button>
```

### Color Contrast Issues

**How to Identify:**
- Violation: "Elements must have sufficient color contrast"
- Rule ID: `color-contrast`
- Impact: Serious (WCAG AA requires 4.5:1 for normal text, 3:1 for large text)

**Understanding Contrast Ratios:**
- **WCAG AA**: 4.5:1 for normal text, 3:1 for large text (18pt+ or 14pt+ bold)
- **WCAG AAA**: 7:1 for normal text, 4.5:1 for large text

**Tools for Checking Contrast:**
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Browser DevTools (Chrome Accessibility panel)
- axe DevTools browser extension

**How to Fix:**
- Increase contrast between text and background
- Use darker text on light backgrounds
- Use lighter text on dark backgrounds
- Ensure focus indicators meet contrast requirements

### Keyboard Navigation Problems

**How to Identify:**
- Violation: "Interactive elements must be keyboard accessible"
- Rule ID: `keyboard-navigation`, `focus-order-semantics`

**Common Issues:**

1. **Missing Focus Indicators:**
```css
/* Bad: No visible focus */
button:focus {
  outline: none;
}

/* Good: Visible focus indicator */
button:focus {
  outline: 2px solid blue;
  outline-offset: 2px;
}
```

2. **Tab Order Issues:**
- Ensure logical tab order
- Use `tabIndex` sparingly (prefer natural order)
- Avoid `tabIndex > 0`

3. **Keyboard Traps:**
- Modals should trap focus
- Dropdowns should allow escape
- Ensure users can navigate away from all elements

### Missing Form Labels

**How to Identify:**
- Violation: "Form elements must have labels"
- Rule ID: `label`

**How to Fix:**

```tsx
// Bad: No label
<input type="text" name="email" />

// Good: Explicit label
<label htmlFor="email">Email</label>
<input type="text" id="email" name="email" />

// Good: Wrapped label
<label>
  Email
  <input type="text" name="email" />
</label>

// Good: aria-label for screen readers
<input 
  type="text" 
  name="email" 
  aria-label="Email address"
/>

// Good: aria-labelledby
<label id="email-label">Email</label>
<input 
  type="text" 
  name="email" 
  aria-labelledby="email-label"
/>
```

**Note**: Placeholders are not labels. Always provide a proper label.

### Improper Heading Hierarchy

**How to Identify:**
- Violation: "Heading levels should only increase by one"
- Rule ID: `heading-order`

**How to Fix:**

```tsx
// Bad: Skipping heading levels
<h1>Page Title</h1>
<h3>Section Title</h3> {/* Skipped h2 */}

// Good: Sequential heading levels
<h1>Page Title</h1>
<h2>Section Title</h2>
<h3>Subsection Title</h3>
```

**Best Practices:**
- Use one `h1` per page
- Don't skip heading levels
- Use headings for structure, not styling
- Maintain logical hierarchy

### Missing Alt Text

**How to Identify:**
- Violation: "Images must have alternate text"
- Rule ID: `image-alt`

**When Alt Text is Required:**
- All informative images need alt text
- Decorative images should have empty alt (`alt=""`)
- Images with text should include that text in alt

**How to Fix:**

```tsx
// Bad: Missing alt
<img src="logo.png" />

// Good: Informative image
<img src="logo.png" alt="Company Logo" />

// Good: Decorative image
<img src="decoration.png" alt="" aria-hidden="true" />

// Good: Image with text
<img src="banner.png" alt="Special Offer: 50% Off All Items" />
```

## Best Practices

### When to Run Accessibility Tests

1. **In CI/CD Pipeline**
   - Run on every pull request
   - Fail builds on critical violations
   - Generate accessibility reports

2. **Before Committing Code**
   - Run locally before pushing
   - Fix violations immediately
   - Document any temporary exclusions

3. **During Code Review**
   - Review accessibility test results
   - Verify fixes for violations
   - Check for new violations

4. **Manual Testing Checklist**
   - Test with keyboard only
   - Test with screen reader
   - Test with browser zoom (200%)
   - Test color contrast manually

### Handling Known Violations

**Documenting Rule Exclusions:**

```typescript
// Document why rule is disabled
const results = await new AxeBuilder({ page })
  .disableRules(['duplicate-id']) // TODO: Fix duplicate IDs in third-party widget
  .analyze()
```

**Temporary vs Permanent Exclusions:**

- **Temporary**: Use `.exclude()` for elements being fixed
- **Permanent**: Use `.disableRules()` for third-party code you can't control
- **Always**: Create tickets for excluded violations

**Creating Tickets:**
- Include violation details
- Include affected elements
- Include WCAG rule reference
- Set priority based on impact level

### Balancing Strictness with Velocity

**Starting Point:**
- Begin with WCAG 2.1 Level AA (`wcag2a`, `wcag2aa`)
- Add `best-practice` tags gradually
- Focus on critical and serious violations first

**Prioritizing Violations:**
- **Critical**: Blocks users, fix immediately
- **Serious**: Major impact, fix soon
- **Moderate**: Moderate impact, fix in next sprint
- **Minor**: Low impact, fix when convenient

**Incremental Improvement:**
- Don't try to fix everything at once
- Set accessibility goals per sprint
- Track violations over time
- Celebrate improvements

### Performance Considerations

**Test Execution Time:**
- Accessibility scans add ~1-3 seconds per page
- Run on critical pages in every test
- Run on all pages in dedicated accessibility suite

**When to Skip Accessibility Checks:**
- Very large pages (use `.include()` to test sections)
- Pages with many third-party widgets (exclude widgets)
- Performance-critical test suites (run separately)

**Optimizing Test Runs:**
- Use `.include()` to test specific sections
- Use `.exclude()` to skip known issues temporarily
- Run full scans in dedicated accessibility test suite
- Cache results when possible

## Troubleshooting

### Common Errors

#### "axe-core not found" errors

**Solution:**
```bash
npm install --save-dev @axe-core/playwright axe-core
```

Ensure both packages are installed.

#### Frame/iframe configuration issues

**Problem**: axe-core doesn't test content in iframes by default.

**Solution**: Use `fromFrames` option (advanced) or test iframe content separately.

#### jsdom compatibility issues

**Problem**: Some axe-core features don't work with jsdom in component tests.

**Solution**: 
- Use Vitest browser mode for complex components
- Test accessibility in E2E tests for full browser environment
- Use `axe-core` directly with jsdom for simple components

### Understanding Violation Reports

**Violation Object Structure:**

```typescript
{
  id: 'color-contrast',           // Rule ID
  impact: 'serious',              // Impact level
  description: 'Ensures...',      // Rule description
  help: 'Fix color contrast...',  // How to fix
  helpUrl: 'https://...',         // Detailed help URL
  nodes: [                        // Affected elements
    {
      html: '<button>...</button>',
      target: ['button.submit'],
      failureSummary: 'Fix any of the following:...'
    }
  ]
}
```

**Impact Levels:**
- **critical**: Blocks users completely
- **serious**: Major impact on users
- **moderate**: Moderate impact
- **minor**: Low impact

**Finding Affected Elements:**
- Use `violation.nodes[].target` to find CSS selectors
- Use `violation.nodes[].html` to see the HTML
- Use browser DevTools to inspect elements

### Debugging Accessibility Issues

#### Using Browser DevTools

1. Open Chrome DevTools
2. Go to "Lighthouse" tab
3. Run accessibility audit
4. Review violations and fixes

#### Screen Reader Testing

**macOS (VoiceOver):**
- Enable: System Preferences → Accessibility → VoiceOver
- Test navigation: Cmd + F5 to toggle
- Use VO keys: VO + Right Arrow to navigate

**Windows (NVDA):**
- Download NVDA (free screen reader)
- Test navigation with keyboard
- Listen to announcements

#### Keyboard-Only Navigation Testing

1. Disable mouse/trackpad
2. Navigate with Tab, Shift+Tab, Arrow keys
3. Activate with Enter/Space
4. Ensure all functionality is accessible
5. Check focus indicators are visible

## Resources

### Official Documentation

- [axe-core GitHub](https://github.com/dequelabs/axe-core)
- [@axe-core/playwright](https://github.com/dequelabs/axe-core/tree/develop/packages/playwright)
- [Playwright Accessibility Testing](https://playwright.dev/docs/accessibility-testing)

### WCAG Guidelines

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [WebAIM WCAG Checklist](https://webaim.org/standards/wcag/checklist)

### Testing Tools

- **axe DevTools**: Browser extension for Chrome/Firefox
- **WAVE**: Web Accessibility Evaluation Tool browser extension
- **Lighthouse**: Built into Chrome DevTools
- **Screen Readers**: VoiceOver (macOS), NVDA (Windows), JAWS (Windows)

### Screen Reader Testing Guides

- [WebAIM Screen Reader Testing Guide](https://webaim.org/articles/screenreader_testing/)
- [A11y Project Screen Reader Testing](https://www.a11yproject.com/posts/getting-started-with-screen-readers/)

## Examples

### Complete E2E Test Example

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Admin Order Page', () => {
  test('should be accessible', async ({ page }) => {
    await page.goto('/admin/orders/ORD-123')
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    
    expect(results.violations).toEqual([])
  })
  
  test('should be accessible excluding third-party widgets', async ({ page }) => {
    await page.goto('/admin/orders/ORD-123')
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('.third-party-widget')
      .analyze()
    
    expect(results.violations).toEqual([])
  })
  
  test('should handle form submission accessibility', async ({ page }) => {
    await page.goto('/admin/orders/ORD-123')
    
    // Fill form
    await page.getByLabel('Status').selectOption('SHIPPED')
    await page.getByLabel('Tracking Number').fill('TRACK123')
    
    // Submit form
    await page.getByRole('button', { name: /update status/i }).click()
    
    // Wait for success message
    await page.waitForSelector('[role="status"]', { timeout: 5000 })
    
    // Check accessibility after form submission
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    
    expect(results.violations).toEqual([])
  })
})
```

### Complete Component Test Example

```typescript
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import * as axe from 'axe-core'
import { OrderDetail } from './OrderDetail'

test('OrderDetail component should be accessible', async () => {
  const mockOrder = {
    id: '1',
    orderNumber: 'ORD-123',
    status: 'PENDING',
    // ... other order properties
  }
  
  const { container } = render(
    <OrderDetail order={mockOrder} />
  )
  
  const results = await axe.run(container)
  expect(results.violations).toEqual([])
})

test('OrderDetail form should be accessible', async () => {
  const mockOrder = {
    id: '1',
    orderNumber: 'ORD-123',
    status: 'PENDING',
  }
  
  const { container } = render(
    <OrderDetail order={mockOrder} />
  )
  
  // Test form accessibility
  const results = await axe.run(container, {
    tags: ['wcag2a', 'wcag2aa']
  })
  
  expect(results.violations).toEqual([])
})
```

### Testing Modal Accessibility

```typescript
test('cancel order modal should be accessible', async ({ page }) => {
  await page.goto('/admin/orders/ORD-123')
  
  // Open modal
  await page.getByRole('button', { name: /cancel order/i }).click()
  
  // Wait for modal
  const modal = page.getByRole('dialog')
  await expect(modal).toBeVisible()
  
  // Test modal accessibility
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
  
  // Test keyboard navigation
  await page.keyboard.press('Escape')
  await expect(modal).not.toBeVisible()
})
```

### Testing Toast Notifications

```typescript
test('toast notification should be accessible', async ({ page }) => {
  await page.goto('/admin/orders/ORD-123')
  
  // Trigger action that shows toast
  await page.getByRole('button', { name: /update status/i }).click()
  
  // Wait for toast
  const toast = page.getByRole('status')
  await expect(toast).toBeVisible({ timeout: 5000 })
  
  // Test accessibility
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  
  expect(results.violations).toEqual([])
})
```

## Next Steps

1. **Install Packages**: Run `npm install --save-dev @axe-core/playwright axe-core`
2. **Create Test Utilities**: Set up helper functions in `tests/utils/a11y.ts`
3. **Add to Existing Tests**: Integrate accessibility checks into critical user flows
4. **Create Test Suite**: Build dedicated accessibility test suite
5. **Fix Violations**: Address any violations found in initial scans
6. **Document Exclusions**: Document any temporary exclusions with tickets

## Additional Notes

- Keep documentation up-to-date as implementation progresses
- Link to official docs for detailed API reference
- Include real examples from the project when available
- Review and update examples as patterns evolve
- Share learnings with the team

