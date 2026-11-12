---
paths:
  - "**/e2e/**"
  - "**/*.spec.ts"
  - "**/playwright*"
---

# E2E selectors and assertions

Loaded when a Playwright spec or its config is read. Each line is the rule; the link is the full text.

- **Select in this order: `getByTestId` with a `tid()` id, role and name, label, text, then ARIA or data attributes for state.** Test ids survive UI refactors. Name them `{component}-{element}` or `{feature}-{element}`. → `docs/lessons/e2e-selectors.md` (Selector Priority)
- **Add missing ids with `{...tid("x")}`, imported from `shared`**, not a hand-written `data-testid`. It returns nothing in production unless `NEXT_PUBLIC_ENABLE_TEST_IDS` is `true`, so a spec against production depends on that flag. → `docs/lessons/e2e-selectors.md` (Test IDs)
- **Never select or assert on Tailwind classes or computed style; expose the state instead.** ESLint rejects `toHaveClass`, `toHaveCSS` and class selectors in E2E. Add an ARIA or `data-*` attribute to the component and assert `toHaveAttribute`. → `docs/lessons/e2e-selectors.md` (Forbidden Patterns)
- **Never assert translation text; ESLint rejects `toContainText` and `toHaveText`.** Use `toBeVisible()` plus `not.toBeEmpty()`, so the suite passes in `en` and `es`. → `docs/lessons/e2e-selectors.md` (Never Assert on Translation Text)
- **Match ARIA to the role**: `button` takes `aria-pressed` or `aria-expanded`, `link` takes `aria-current`, `tab` takes `aria-selected`, `checkbox` takes `aria-checked`. `navigation` does not support `aria-expanded`, so use `data-collapsed`. → `docs/lessons/e2e-selectors.md` (ARIA Attribute Guidelines)
- **A wait is removable only before an assertion that is positive and retries.** Before `toBeHidden()`, `not.toContain` or `toHaveCount(0)` it is load-bearing: without it the check passes on an unrendered page. A one-shot read such as `page.url()` never retries, so use `await expect(page).toHaveURL(...)`. → `docs/standards/quality-gates.md` (The timing rules)
- **Use locators and Page Objects (`e2e/pages/`), and cover critical journeys at desktop, tablet and mobile widths.** → `docs/lessons/testing.md` (E2E Testing)
- **Run a suite with `pnpm --filter <app> test:e2e`, or `pnpm e2e:dev` for the env-aware runner.** `pnpm e2e:prod` drives live production: only when the owner asks, per `docs/production-e2e.md`. Skill: `/e2e-eval`. → `docs/lessons/testing.md` (Running Tests)
