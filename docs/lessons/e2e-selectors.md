# E2E Selector Rules

> **Never use Tailwind classes to select or assert state. Always use test-ids, ARIA attributes, or other stable attributes.**

---

## Overview

E2E tests must use stable, semantic selectors that don't break when styling changes. Tailwind classes are implementation details that can change frequently - they should never be used for element selection or state assertions.

---

## Selector Priority

**This project prefers test IDs (`tid()`) as the primary selector** for stability across UI changes and easier E2E test tracking.

Use selectors in this order (best to worst):

| Priority | Selector Type            | Example                                   | Use Case                                  |
| -------- | ------------------------ | ----------------------------------------- | ----------------------------------------- |
| 1        | **Test ID with `tid()`** | `getByTestId('nav-item-home')`            | **Preferred for all testable elements**   |
| 2        | **Role + Name**          | `getByRole('button', { name: 'Submit' })` | Interactive elements without test ID      |
| 3        | **Label**                | `getByLabel('Email')`                     | Form inputs                               |
| 4        | **Text**                 | `getByText('Welcome')`                    | Static content                            |
| 5        | **ARIA/Data attributes** | `[aria-current="page"]`                   | State verification (combine with test ID) |

### Why Test IDs First?

- **Stable across UI refactors** - Class names, roles, and text can change
- **Explicit intent** - Clear what element is being tested
- **E2E consistency** - Same selectors work in unit and E2E tests
- **Debugging** - Easy to locate elements in DOM

---

## Test IDs

### Use the `tid()` Utility

All test IDs must be created using the project's `tid()` utility:

```tsx
// In component
import { tid } from "@/shared/infrastructure/config/tid";

<div {...tid("dashboard-header")}>
  <nav {...tid("navigation-menu")}>
    <a {...tid("nav-item-home")}>Home</a>
  </nav>
</div>;
```

```typescript
// In E2E test
await expect(page.getByTestId("dashboard-header")).toBeVisible();
await expect(page.getByTestId("navigation-menu")).toBeVisible();
```

### Benefits of `tid()`

- Returns empty object in production (smaller DOM)
- Consistent `data-testid` attribute format
- Centralized test ID management

---

## State Assertions

### Use ARIA Attributes for State

```tsx
// Component - use semantic ARIA attributes
<button
  aria-pressed={isSelected}
  {...tid("period-daily")}
>
  Daily
</button>

<a
  aria-current={isActive ? "page" : undefined}
  {...tid("nav-item-home")}
>
  Home
</a>
```

```typescript
// E2E test - assert on ARIA attributes
await expect(page.getByTestId("period-daily")).toHaveAttribute(
  "aria-pressed",
  "true",
);
await expect(page.getByTestId("nav-item-home")).toHaveAttribute(
  "aria-current",
  "page",
);
```

### Use Data Attributes for Custom State

When ARIA attributes don't apply, use `data-*` attributes:

```tsx
// Component - use data attributes for custom state
<nav
  data-collapsed={isCollapsed}
  {...tid("navigation-menu")}
>
```

```typescript
// E2E test - assert on data attributes
await expect(page.getByTestId("navigation-menu")).toHaveAttribute(
  "data-collapsed",
  "false",
);
```

### Common State Attributes

| State              | Attribute        | Values                |
| ------------------ | ---------------- | --------------------- |
| Selected/Pressed   | `aria-pressed`   | `"true"` / `"false"`  |
| Current page       | `aria-current`   | `"page"` / undefined  |
| Expanded/Collapsed | `aria-expanded`  | `"true"` / `"false"`  |
| Disabled           | `aria-disabled`  | `"true"` / `"false"`  |
| Custom collapse    | `data-collapsed` | `"true"` / `"false"`  |
| Custom state       | `data-state`     | `"open"` / `"closed"` |

---

## Forbidden Patterns

### Never Use Tailwind Classes

```typescript
// WRONG: Fragile class-based assertions
await expect(element).toHaveClass(/bg-primary/);
await expect(element).toHaveClass(/w-\[80px\]/);
await expect(element).toHaveClass(/bg-sidebar-accent/);

// CORRECT: Stable attribute assertions
await expect(element).toHaveAttribute("aria-pressed", "true");
await expect(element).toHaveAttribute("data-collapsed", "false");
await expect(element).toHaveAttribute("aria-current", "page");
```

### Never Use CSS Selectors for State

```typescript
// WRONG: CSS class selectors
await page.locator(".bg-primary");
await page.locator("[class*='selected']");

// CORRECT: Semantic selectors
await page.getByRole("button", { pressed: true });
await page.locator("[aria-pressed='true']");
```

### Never Use Inline Styles

```typescript
// WRONG: Style-based assertions
await expect(element).toHaveCSS("background-color", "rgb(0, 123, 255)");
await expect(element).toHaveCSS("width", "80px");

// CORRECT: Attribute-based assertions
await expect(element).toHaveAttribute("data-collapsed", "false");
```

### Never Assert on Translation Text

**Enforced by ESLint:** `toContainText()` and `toHaveText()` are forbidden in E2E tests.

E2E tests should verify elements exist and have content, not specific translation strings. This keeps tests:

- **Locale-independent** - Tests pass in any language
- **Refactor-safe** - Copy changes don't break tests
- **Focused** - Testing behavior, not content

```typescript
// WRONG: Testing specific translation text
await expect(page.getByTestId("dashboard-title")).toContainText("Dashboard");
await expect(page.getByTestId("card-title")).toHaveText("Quick Overview");

// CORRECT: Test element exists and has content
await expect(page.getByTestId("dashboard-title")).toBeVisible();
await expect(page.getByTestId("dashboard-title")).not.toBeEmpty();

// CORRECT: Test that i18n mechanism works (element renders with some text)
const title = page.getByTestId("dashboard-title");
await expect(title).toBeVisible();
await expect(title).not.toBeEmpty();
```

**What we test:**
| Assertion | Purpose |
|-----------|---------|
| `toBeVisible()` | Element renders in DOM |
| `not.toBeEmpty()` | i18n key resolved to some text |
| `toHaveAttribute()` | State and accessibility |

**What we don't test:**
| Assertion | Why Forbidden |
|-----------|---------------|
| `toContainText("...")` | Breaks on translation changes |
| `toHaveText("...")` | Couples test to specific locale |

---

## ARIA Attribute Guidelines

### Use Correct ARIA for Element Roles

Not all ARIA attributes work with all roles. Check compatibility:

| Role         | Supported ARIA                                   |
| ------------ | ------------------------------------------------ |
| `button`     | `aria-pressed`, `aria-expanded`, `aria-disabled` |
| `link`       | `aria-current`, `aria-disabled`                  |
| `navigation` | `aria-label` (NOT `aria-expanded`)               |
| `checkbox`   | `aria-checked`                                   |
| `tab`        | `aria-selected`                                  |

### When ARIA Doesn't Apply, Use Data Attributes

```tsx
// navigation role doesn't support aria-expanded
// Use data-* attribute instead
<nav data-collapsed={isCollapsed}>

// NOT this (invalid):
<nav aria-expanded={!isCollapsed}>
```

---

## Examples

### Toggle Button State

```tsx
// Component
<button onClick={toggleTheme} aria-pressed={isDark} {...tid("theme-toggle")}>
  {isDark ? "Dark" : "Light"}
</button>
```

```typescript
// E2E test
const toggle = page.getByTestId("theme-toggle");
await expect(toggle).toHaveAttribute("aria-pressed", "false");

await toggle.click();

await expect(toggle).toHaveAttribute("aria-pressed", "true");
```

### Navigation Active State

```tsx
// Component
<Link
  href={href}
  aria-current={isActive ? "page" : undefined}
  {...tid(`nav-item-${key}`)}
>
  {label}
</Link>
```

```typescript
// E2E test
await page.goto("/en/dashboard");
await expect(page.getByTestId("nav-item-home")).toHaveAttribute(
  "aria-current",
  "page",
);

await page.goto("/en/settings");
await expect(page.getByTestId("nav-item-home")).not.toHaveAttribute(
  "aria-current",
);
await expect(page.getByTestId("nav-item-settings")).toHaveAttribute(
  "aria-current",
  "page",
);
```

### Collapsible Panel

```tsx
// Component
<aside data-collapsed={isCollapsed} {...tid("sidebar")}>
  <button
    onClick={() => setCollapsed(!isCollapsed)}
    aria-expanded={!isCollapsed}
    {...tid("sidebar-toggle")}
  >
    Toggle
  </button>
</aside>
```

```typescript
// E2E test
const sidebar = page.getByTestId("sidebar");
const toggle = page.getByTestId("sidebar-toggle");

// Initially expanded
await expect(sidebar).toHaveAttribute("data-collapsed", "false");
await expect(toggle).toHaveAttribute("aria-expanded", "true");

// Collapse
await toggle.click();
await expect(sidebar).toHaveAttribute("data-collapsed", "true");
await expect(toggle).toHaveAttribute("aria-expanded", "false");
```

---

## Checklist

Before writing tests (unit or E2E), verify:

- [ ] **All testable elements have `tid()` test IDs** (preferred selector)
- [ ] State is exposed via ARIA or data attributes (not classes)
- [ ] No Tailwind classes in selectors or assertions
- [ ] No CSS property assertions for state
- [ ] **No `toContainText()` or `toHaveText()` assertions** (enforced by ESLint)
- [ ] ARIA attributes match element roles
- [ ] Test IDs follow naming pattern: `{component}-{element}` or `{feature}-{element}`

---

## Related

- [Testing Rules](./testing.md) - General testing guidelines
- [Component Patterns](./component-patterns.md) - Component structure
- [E2E Eval Skill](../skills/e2e-eval/SKILL.md) - `/e2e-eval`
