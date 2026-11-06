# Testing Rules

> "The more your tests resemble the way your software is used, the more confidence they can give you." - Testing Library

---

## Testing Strategy

This project uses a comprehensive testing approach:

| Test Type             | Framework                      | Purpose                                    | Location             |
| --------------------- | ------------------------------ | ------------------------------------------ | -------------------- |
| **Unit Tests**        | Vitest + React Testing Library | Test components, hooks, utils in isolation | `<workspace>/tests/` |
| **E2E Tests**         | Playwright                     | Test user flows in real browser            | `e2e/**/*.spec.ts`   |
| **API Mocking**       | MSW (Mock Service Worker)      | Mock API responses for testing             | `src/mocks/`         |
| **Accessibility**     | axe-core + Playwright          | WCAG compliance testing                    | Integrated in E2E    |
| **Visual Regression** | Playwright Screenshots         | Catch unintended UI changes                | `e2e/visual/`        |

---

## Test-Driven Development (TDD)

**All new features and bug fixes MUST follow TDD:**

### Red-Green-Refactor Cycle

1. **RED** - Write a failing test first
2. **GREEN** - Write minimal code to make it pass
3. **REFACTOR** - Improve code quality while keeping tests green

### Why Test-First

- Tests written after implementation prove nothing
- Test-first forces you to witness failure
- Confirms the test actually validates something meaningful
- Results in better-designed, more testable code

---

## Unit Testing (Vitest)

### What to Test

| Element        | Test Focus                                  |
| -------------- | ------------------------------------------- |
| **Components** | Rendering, user interactions, state changes |
| **Hooks**      | Return values, side effects, state updates  |
| **Utils**      | Input/output, edge cases, error handling    |
| **Services**   | Business logic, data transformations        |

### Best Practices

#### 1. Test User Behavior, Not Implementation

```typescript
// BAD: Testing implementation details
expect(component.state.isOpen).toBe(true);

// GOOD: Testing user-visible behavior
expect(screen.getByRole("dialog")).toBeInTheDocument();
```

#### 2. Prefer Test IDs with `tid()` for Stability

**This project prefers test IDs as the primary selector** for stability across UI changes and E2E consistency.

```typescript
// Priority order for this project
screen.getByTestId("submit-button"); // Preferred - stable across UI changes
screen.getByRole("button", { name: /submit/i }); // Good for interactive elements
screen.getByLabelText("Email"); // Good for form inputs
screen.getByText("Welcome"); // Acceptable for static content
```

**Why test IDs first?**

- Stable across UI refactors (class names, roles, text can change)
- Same selectors work in unit and E2E tests
- Explicit intent - clear what element is being tested
- Use `tid()` utility in components: `{...tid("submit-button")}`

See [E2E Selectors](./e2e-selectors.md) for complete selector guidelines.

#### 3. Use `findBy*` for Async Operations

```typescript
// GOOD: Waits for element to appear
const element = await screen.findByText("Data loaded");

// BAD: May fail on slow renders
const element = screen.getByText("Data loaded");
```

#### 4. Mock External Dependencies

```typescript
// Mock API calls
vi.mock("@/features/users/infrastructure/api", () => ({
  fetchUsers: vi.fn().mockResolvedValue([{ id: "1", name: "Test" }]),
}));

// Mock hooks
vi.mock("@/features/auth/application/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true }),
}));
```

#### 5. Test Edge Cases

```typescript
describe("UserCard", () => {
  it("renders user name", () => {
    /* happy path */
  });
  it("handles missing avatar gracefully", () => {
    /* edge case */
  });
  it("truncates long names", () => {
    /* edge case */
  });
  it("shows loading state", () => {
    /* loading state */
  });
  it("shows error state", () => {
    /* error state */
  });
});
```

### File Structure

Unit tests live in a flat `tests/` directory per workspace, not beside the
source. The source tree then contains only shipped code.

```
apps/store/
├── src/features/auth/presentation/components/
│   └── LoginForm/
│       ├── LoginForm.tsx
│       ├── LoginForm.types.ts
│       └── index.ts
└── tests/
    └── LoginForm.test.tsx
```

Because the directories are flat, two tests cannot share a basename. Where the
source names collide -- `constants.test.ts` existed five times in `payments`
alone -- prefix with the feature: `checkout-constants.test.ts`.

**Import the code under test by its alias, never relatively.** A test in
`tests/` is no longer a sibling of its subject, so `./LoginForm` does not
resolve. Apps use `@/`, packages use their own (`@ui`, `@shared`, `@auth`,
`@api`, `@app-components`). This is what the architecture rules already asked
for.

Two things that bite when a package is involved:

- vitest resolves aliases separately from TypeScript. A `paths` entry in
  `tsconfig.json` is not enough; the alias must also be in the vitest config's
  `resolve.alias`, and in **each project** if the config uses `projects` --
  they do not inherit the top-level one.
- A test that reads a file relative to `__dirname` breaks on the move.
  `packages/ui/tests/contrast.test.ts` reads `colors.css` and now reaches for
  it through `../src/styles/`.

Where a workspace splits suites by environment, split the directory too:
`packages/auth/tests/node/` and `packages/auth/tests/client/`, each named by
its vitest project. Flattening them into one directory silently ran the
node-environment tests under jsdom.

### Test Template

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  const defaultProps = {
    // Default props
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<ComponentName {...defaultProps} />);
    expect(screen.getByRole('...')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<ComponentName {...defaultProps} onAction={onAction} />);

    await user.click(screen.getByRole('button'));

    expect(onAction).toHaveBeenCalledWith(/* expected args */);
  });

  it('displays loading state', () => {
    render(<ComponentName {...defaultProps} isLoading />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays error state', () => {
    render(<ComponentName {...defaultProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
```

---

## E2E Testing (Playwright)

### What to Test

- Critical user journeys (login, checkout, signup)
- Cross-page navigation
- Form submissions with backend integration
- Authentication flows
- Responsive design across viewports

### Best Practices

#### 1. Use Page Object Model

```typescript
// e2e/pages/LoginPage.ts
export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }
}
```

#### 2. Use Locators, Not Selectors

```typescript
// GOOD: Resilient locators
page.getByRole("button", { name: "Submit" });
page.getByLabel("Email address");
page.getByTestId("user-profile");

// BAD: Fragile selectors
page.locator(".btn-primary");
page.locator("#email-input");
```

#### 3. Handle Async Properly

```typescript
// Playwright auto-waits, but be explicit for complex flows
await expect(page.getByText("Welcome")).toBeVisible();
await page.waitForURL("**/dashboard");
```

#### 4. Test Multiple Viewports

```typescript
const viewports = [
  { width: 1920, height: 1080, name: "desktop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 375, height: 667, name: "mobile" },
];

for (const viewport of viewports) {
  test(`renders correctly on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // ... test
  });
}
```

### File Structure

```
e2e/
├── pages/                    # Page Object Models
│   ├── LoginPage.ts
│   └── DashboardPage.ts
├── fixtures/                 # Test fixtures
│   └── auth.fixture.ts
├── tests/
│   ├── auth/
│   │   └── login.spec.ts
│   └── dashboard/
│       └── navigation.spec.ts
└── playwright.config.ts
```

---

## API Mocking (MSW)

Mock Service Worker intercepts network requests at the service worker level, providing realistic API mocking for both unit and E2E tests.

### Setup

```
src/mocks/
├── handlers/              # Request handlers by feature
│   ├── auth.ts
│   ├── users.ts
│   └── index.ts           # Exports all handlers
├── browser.ts             # Browser worker setup
├── server.ts              # Node server setup (for tests)
└── index.ts
```

### Creating Handlers

```typescript
// src/mocks/handlers/users.ts
import { http, HttpResponse } from "msw";

export const userHandlers = [
  // GET /api/users
  http.get("/api/users", () => {
    return HttpResponse.json([
      { id: "1", name: "John Doe", email: "john@example.com" },
      { id: "2", name: "Jane Smith", email: "jane@example.com" },
    ]);
  }),

  // GET /api/users/:id
  http.get("/api/users/:id", ({ params }) => {
    const { id } = params;
    return HttpResponse.json({
      id,
      name: "John Doe",
      email: "john@example.com",
    });
  }),

  // POST /api/users
  http.post("/api/users", async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: "3", ...body }, { status: 201 });
  }),

  // Error scenario
  http.get("/api/users/error", () => {
    return HttpResponse.json(
      { message: "Internal Server Error" },
      { status: 500 },
    );
  }),
];
```

### Server Setup (for Vitest)

```typescript
// src/mocks/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

// src/setupTests.ts (Vitest setup file)
import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Using in Tests

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import { UserList } from './UserList';

describe('UserList', () => {
  it('renders users from API', async () => {
    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully', async () => {
    // Override handler for this test
    server.use(
      http.get('/api/users', () => {
        return HttpResponse.json({ message: 'Error' }, { status: 500 });
      })
    );

    render(<UserList />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });
  });
});
```

### Browser Setup (for Development)

```typescript
// src/mocks/browser.ts
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// In your app entry point (conditional)
if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled") {
  const { worker } = await import("./mocks/browser");
  await worker.start();
}
```

---

## Accessibility Testing

Automated accessibility testing using axe-core.

> **What actually exists today:** `vitest-axe` runs against the shared
> components in `packages/ui` and `packages/app-components`. Those suites are
> part of the normal unit-test run, so CI enforces them — there is no separate
> accessibility job. The Playwright/`@axe-core/playwright` setup described
> further down is **not** installed; treat it as the shape to follow when
> adding page-level coverage, not as something already running. Same for the
> visual regression section below it.
>
> When adding a component to either shared package, add it to that package's
> `accessibility.test.tsx`. Both files include a test that deliberately fails
> — an unlabelled input, an icon-only button — so the suite proves it can
> still catch something.

### Unit Test Integration

```typescript
// Install: pnpm add -D @axe-core/react vitest-axe
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { expect } from 'vitest';

expect.extend(toHaveNoViolations);

describe('LoginForm Accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<LoginForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('has proper form labels', async () => {
    const { container } = render(<LoginForm />);
    const results = await axe(container, {
      rules: {
        'label': { enabled: true },
        'label-content-name-mismatch': { enabled: true },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
```

### E2E Accessibility with Playwright

```typescript
// e2e/tests/accessibility/login.a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Login Page Accessibility", () => {
  test("should have no WCAG violations", async ({ page }) => {
    await page.goto("/login");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("should have no violations on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("should be keyboard navigable", async ({ page }) => {
    await page.goto("/login");

    // Tab through form elements
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Email")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
  });
});
```

### Accessibility Test Commands

```bash
# Run accessibility tests
ppnpm test:a11y

# Run with specific WCAG level
ppnpm test:a11y -- --wcag=aa
```

### Common Checks

| Check               | Description                        |
| ------------------- | ---------------------------------- |
| Color contrast      | Text meets 4.5:1 ratio (AA)        |
| Form labels         | All inputs have associated labels  |
| Keyboard navigation | All interactive elements focusable |
| ARIA attributes     | Proper roles and states            |
| Heading hierarchy   | Logical h1-h6 structure            |
| Image alt text      | All images have descriptive alt    |

---

## Visual Regression Testing

Catch unintended UI changes with screenshot comparisons.

### Setup

```
e2e/
├── visual/
│   ├── __snapshots__/        # Baseline screenshots (committed)
│   │   ├── login-desktop.png
│   │   └── login-mobile.png
│   └── visual.spec.ts        # Visual regression tests
└── playwright.config.ts
```

### Playwright Visual Tests

```typescript
// e2e/visual/visual.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual Regression", () => {
  test("login page matches snapshot - desktop", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login-desktop.png", {
      maxDiffPixels: 100,
    });
  });

  test("login page matches snapshot - mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login-mobile.png", {
      maxDiffPixels: 100,
    });
  });

  test("dashboard with data matches snapshot", async ({ page }) => {
    await page.goto("/dashboard");
    // Wait for data to load
    await page.waitForSelector('[data-testid="dashboard-content"]');

    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test("component in isolation", async ({ page }) => {
    await page.goto("/storybook/button");

    const button = page.getByRole("button", { name: "Primary" });
    await expect(button).toHaveScreenshot("button-primary.png");
  });
});
```

### Screenshot Options

```typescript
await expect(page).toHaveScreenshot("name.png", {
  // Allowed difference thresholds
  maxDiffPixels: 100, // Max pixels that can differ
  maxDiffPixelRatio: 0.01, // Max ratio of different pixels (1%)
  threshold: 0.2, // Per-pixel color diff threshold

  // Screenshot options
  fullPage: true, // Capture full scrollable page
  mask: [page.locator(".date")], // Mask dynamic content
  animations: "disabled", // Disable CSS animations

  // Comparison
  stylePath: "./visual.css", // Custom CSS for screenshots
});
```

### Handling Dynamic Content

```typescript
test("handles dynamic content", async ({ page }) => {
  await page.goto("/dashboard");

  // Mask elements that change (dates, avatars, etc.)
  await expect(page).toHaveScreenshot("dashboard.png", {
    mask: [
      page.locator('[data-testid="current-date"]'),
      page.locator('[data-testid="user-avatar"]'),
      page.locator(".timestamp"),
    ],
  });
});

// Or replace dynamic content before screenshot
test("with static content replacement", async ({ page }) => {
  await page.goto("/dashboard");

  // Replace dynamic text
  await page.evaluate(() => {
    document.querySelectorAll(".timestamp").forEach((el) => {
      el.textContent = "2024-01-01 12:00:00";
    });
  });

  await expect(page).toHaveScreenshot("dashboard-static.png");
});
```

### Visual Test Commands

```bash
# Run visual tests
ppnpm test:visual

# Update snapshots (when changes are intentional)
ppnpm test:visual -- --update-snapshots

# Run with specific browser
ppnpm test:visual -- --project=chromium
```

### CI Configuration

Visual tests in CI should:

1. Use consistent viewport sizes
2. Run on Linux (matching CI environment)
3. Upload diff images as artifacts on failure

See `.github/workflows/pr-checks.yml` for CI integration.

---

## Testing Requirements

### For Every Task

When starting a task (`/start-task`), include tests:

1. **Before implementation**: Write failing tests (TDD)
2. **During implementation**: Keep tests passing
3. **Before PR**: All tests must pass

### Coverage Expectations

| Type       | Minimum Coverage                |
| ---------- | ------------------------------- |
| Unit Tests | 80% of components, hooks, utils |
| E2E Tests  | Critical user paths             |

### CI Integration

Tests run automatically on:

- Every commit (unit tests)
- Every PR (unit + E2E)
- Before merge (full suite)

---

## Running Tests

### Unit Tests

```bash
# Run all unit tests
pnpm test

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run specific file
pnpm test -- LoginForm.test.tsx
```

Troubleshooting test failures: see [Build Checks](./build-checks.md#test-failures).

### E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run in UI mode
pnpm test:e2e:ui

# Run specific test
pnpm test:e2e -- auth/login.spec.ts

# Run with trace
pnpm test:e2e -- --trace on
```

---

## Test Checklist

Before considering a task complete:

- [ ] Unit tests written for all new components
- [ ] Unit tests written for all new hooks
- [ ] Unit tests written for all new utilities
- [ ] Tests fail before implementation (TDD verified)
- [ ] All tests pass
- [ ] Edge cases covered
- [ ] E2E tests for critical paths (if applicable)
- [ ] Accessibility tests pass (no axe violations)
- [ ] Visual regression snapshots updated (if UI changed)
- [ ] No skipped tests (`it.skip`, `test.skip`)

---

## Anti-Patterns to Avoid

### 1. Testing Implementation Details

```typescript
// BAD
expect(component.instance().state.count).toBe(1);

// GOOD
expect(screen.getByText("Count: 1")).toBeInTheDocument();
```

### 2. Over-Mocking

```typescript
// BAD: Mocking everything
vi.mock("./utils");
vi.mock("./hooks");
vi.mock("./api");
// Test doesn't test anything real

// GOOD: Mock only external dependencies
vi.mock("@/shared/infrastructure/api/client");
```

### 3. Snapshot Overuse

```typescript
// BAD: Meaningless snapshot
expect(component).toMatchSnapshot();

// GOOD: Targeted assertions
expect(screen.getByRole("heading")).toHaveTextContent("Welcome");
```

### 4. Test Interdependence

```typescript
// BAD: Tests depend on each other
let sharedState;
it("sets up state", () => {
  sharedState = "value";
});
it("uses state", () => {
  expect(sharedState).toBe("value");
});

// GOOD: Each test is independent
beforeEach(() => {
  /* fresh setup */
});
```

---

## Resources

- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Docs](https://vitest.dev/)
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Next.js Testing Guide](https://nextjs.org/docs/app/guides/testing)
- [Testing Library Best Practices](https://github.com/testing-library/react-testing-library)

---

## Related

- [E2E Selectors](./e2e-selectors.md) - Stable selectors for E2E tests
- [Run Tests Skill](../skills/run-tests/SKILL.md) - `/run-tests`
- [E2E Eval Skill](../skills/e2e-eval/SKILL.md) - `/e2e-eval`
- [Start Task Skill](../skills/start-task/SKILL.md) - Includes testing checklist
