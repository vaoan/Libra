---
paths:
  - "apps/*/tests/**"
  - "apps/*/src/**/*.test.{ts,tsx}"
  - "packages/*/tests/**"
  - "packages/*/src/**/*.test.{ts,tsx}"
  - "tests/*"
  - "tests/db/**"
  - "**/__tests__/**"
  - "**/vitest.*"
---

# Testing

Loaded when a test or vitest config is read. Each line is the rule; the link is the full text. E2E selectors have their own rule.

- **Put unit tests in the workspace's flat `tests/` directory, never beside the source**, so `src/` holds only shipped code. Basenames cannot repeat there: prefix with the feature (`checkout-constants.test.ts`). → `docs/lessons/testing.md` (File Structure)
- **Import the code under test by alias, never relatively**, because a test in `tests/` is not a sibling of its subject. Apps use `@/`; packages use `@ui`, `@shared`, `@auth`, `@api`, `@app-components`. → `docs/lessons/testing.md` (File Structure)
- **A new alias goes in vitest's `resolve.alias` too, and in each `projects` entry**: vitest does not read tsconfig `paths`, and projects do not inherit the top-level alias. → `docs/lessons/testing.md` (File Structure)
- **Keep suites split by environment in separate directories named by vitest project** (`packages/auth/tests/node/`, `packages/auth/tests/client/`): flattening them silently ran the node tests under jsdom. → `docs/lessons/testing.md` (File Structure)
- **A test that reads a file through `__dirname` reaches from `tests/` into `src/`**, as `packages/ui/tests/contrast.test.ts` does through `../src/styles/`. → `docs/lessons/testing.md` (File Structure)
- **Write the failing test first and watch it fail**, for every new feature and bug fix: a test written after the code has proved nothing. → `docs/lessons/testing.md` (Test-Driven Development)
- **Import every vitest function you use from `vitest`**, including `afterEach` and `vi`: a missing one is a TypeScript failure in CI, not a runtime one. → `docs/lessons/build-checks.md` (Test File Requirements)
- **Select by test id first (`tid()` in the component, `getByTestId` in the test), then role and name, label, text**; test ids survive UI refactors and match the E2E selector. Use `findBy*` for anything async. → `docs/lessons/testing.md` (Best Practices)
- **Assert what the user sees, not internals or classes, and skip broad `toMatchSnapshot`.** Each test sets up its own state in `beforeEach`. → `docs/lessons/testing.md` (Anti-Patterns to Avoid)
- **Mock only external boundaries, and do it with MSW handlers in the app's `src/mocks/`**, overriding per test with `server.use(...)`; mocking your own utils and hooks leaves nothing under test. → `docs/lessons/testing.md` (API Mocking)
- **Cover loading, error and empty states as well as the happy path, and leave no `it.skip`.** Coverage target is 80% of components, hooks and utils. → `docs/lessons/testing.md` (Test Checklist)
- **A component added to `packages/ui` or `packages/app-components` goes into that package's `accessibility.test.tsx`** (`vitest-axe`, part of the unit run, no separate job). Each file keeps a test that deliberately fails, so the suite proves it can still catch something; do not delete it. → `docs/lessons/testing.md` (Accessibility Testing)
- **Do not trust the lesson's Playwright a11y and visual-regression sections as running.** No `test:a11y` or `test:visual` script exists and visual regression is not set up; page-level axe covers only landing's public routes, because the authenticated apps need a session fixture first. → `docs/standards/quality-gates.md` (Accessibility)
- **Never drop a test case to get green.** CI compares `tests/INVENTORY.md` against the tree and fails on any missing name. If it fails, restore the case; regenerate the inventory (`pnpm test:inventory`) only after checking each reported name, because regenerating buries a real loss. `pnpm test:inventory:diff` runs the same check. → `.github/workflows/ci.yml` (Check no test case was dropped)
- **Run with** `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`, `pnpm --filter <app> test`; `pnpm test:workflows` for the tests under `scripts/`; `pnpm test:db` for `tests/db/`. Skill: `/run-tests`. → `docs/lessons/testing.md` (Running Tests)
