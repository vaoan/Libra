import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";
import reactHooks from "eslint-plugin-react-hooks";
import unusedImports from "eslint-plugin-unused-imports";
import security from "eslint-plugin-security";
import tsParser from "@typescript-eslint/parser";
import boundaries from "eslint-plugin-boundaries";
import sonarjs from "eslint-plugin-sonarjs";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "@vitest/eslint-plugin";
import tanstackQuery from "@tanstack/eslint-plugin-query";
import unicorn from "eslint-plugin-unicorn";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import playwright from "eslint-plugin-playwright";

// Monorepo paths
const APP_SRC = "apps/*/src";
const PKG_SRC = "packages/*/src";
// Unit tests live in a flat tests/ directory per workspace, not in src/.
const APP_TESTS = "apps/*/tests";
const PKG_TESTS = "packages/*/tests";

const sonarRules = sonarjs.configs.recommended.rules;
const unicornRules = unicorn.configs["flat/recommended"].rules;

// ── Playwright E2E specs ─────────────────────────────────────────────────────
// These files were previously linted by nothing at all: `pnpm lint` only covers
// apps/*/src, so 26 spec files had no rules applied. The recommended set is
// enabled here, with the two high-count timing rules staged as warnings so the
// ratchet is visible rather than deferred.
const playwrightConfig = {
  files: ["apps/*/e2e/**/*.ts", "apps/*/test/e2e/**/*.ts"],
  ...playwright.configs["flat/recommended"],
  rules: {
    ...playwright.configs["flat/recommended"].rules,
    // Staged, not disabled. Every rule not listed below is an error, because
    // the suite is already clean against it — including missing-playwright-await,
    // which catches an assertion that never runs.
    //
    // Driven to zero and promoted to error (2026-08-30). Both fixes were
    // applied by pattern rather than by `eslint --fix`, so the unsafe fixer
    // below could not run alongside them, and all 25 rewrites were read in the
    // diff. These need an explicit "error": the recommended set ships them as
    // warnings, so dropping them from the staged list below is not enough --
    // verified by planting a violation and watching it fail.
    "playwright/no-useless-not": "error",
    "playwright/no-conditional-expect": "error",
    "playwright/no-force-option": "error",
    "playwright/no-conditional-in-test": "error",
    // prefer-web-first-assertions is an error, but every one of the suite's 15
    // hits is exempted in place. All 15 compare a value captured earlier
    // against one captured later -- "this block's testid now equals the one
    // that block had before the drag" -- which toHaveAttribute cannot express.
    // This is the rule whose --fix rewrote `const href = await
    // link.getAttribute("href")` into `const href = link`, turning a string
    // into a Locator and breaking three assertions in a shared helper. It stays
    // armed so the genuine pattern, expect(await x.isVisible()).toBe(true),
    // is still caught.
    "playwright/prefer-web-first-assertions": "error",
    "playwright/consistent-spacing-between-blocks": "error",
    //
    // The rules below have real violations today and are warnings with their
    // counts recorded, to be driven to zero and promoted to error one at a time.
    // Counts measured 2026-08-30. NOTE: several of these are auto-fixable, but
    // `eslint --fix` must NOT be run blindly over them — prefer-web-first-assertions
    // rewrote `const href = await link.getAttribute("href")` into
    // `const href = link`, silently turning a string into a Locator and breaking
    // the three assertions below it. Typecheck caught it; review every hunk.
    // Both were "warn" with backlogs of 118 and 96. The backlog is gone: every
    // site either waits on the condition it actually cared about, or carries a
    // disable naming the third-party page it cannot anchor against.
    // Set to match aeleos, which enforces these and Libra did not set at all.
    // A rule nobody wrote down is not a rule the codebase is held to.
    "playwright/no-focused-test": "error",
    "playwright/no-element-handle": "error",
    "playwright/no-page-pause": "error",
    "playwright/no-standalone-expect": "error",
    "playwright/no-useless-await": "error",
    "playwright/valid-expect": "error",
    "playwright/no-eval": "off",

    "playwright/no-networkidle": "error",
    "playwright/no-wait-for-timeout": "error",
    // expect-expect is an ERROR, not a warning: a test that asserts nothing
    // passes no matter how the product behaves, so it is the one defect a test
    // suite cannot detect on its own. It reported 11 violations before this
    // configuration and all 11 were false: 3 were Playwright setup/teardown
    // projects (excluded below) and 8 were tests whose assertions live in a
    // helper the rule cannot see through. Each helper named here was checked to
    // contain real assertions. With the rule reading correctly it reports zero,
    // so it can block CI and a genuinely assertion-free test gets caught.
    "playwright/expect-expect": [
      "error",
      {
        assertFunctionNames: [
          "expectVisible",
          "expectHidden",
          "expectAuthenticatedAcrossApps",
          "createProduct",
          "createPaymentMethod",
          "setPermissions",
        ],
      },
    ],
    // allowConditional matches aeleos. `test.skip(cond, reason)` is a runtime
    // guard -- a suite that declines to run without live OAuth credentials, or
    // without a seeded product -- not a disabled test. A bare test.skip() still
    // fails, which is the case worth catching.
    "playwright/no-skipped-test": ["error", { allowConditional: true }],
  },
};

// Playwright "setup" and "teardown" projects use test() to run fixture work
// (seeding a session, cleaning up users). They legitimately assert nothing, so
// expect-expect does not apply to them.
const playwrightSetupConfig = {
  files: [
    "apps/*/e2e/**/*.setup.ts",
    "apps/*/e2e/**/*.teardown.ts",
    "apps/*/e2e/**/setup-*.ts",
  ],
  rules: {
    "playwright/expect-expect": "off",
    // Fixture work is branchy by nature: skip the teardown when there is no
    // state file, bail when a key is absent. Those are not a test taking
    // different paths on different runs.
    "playwright/no-conditional-in-test": "off",
  },
};

const eslintConfig = defineConfig([
  // ESLint's own core correctness rules. These were never composed here, so 41
  // rules that catch real defects (no-unsafe-finally, no-dupe-keys,
  // no-unreachable, ...) were simply absent. Scoped to source, matching how the
  // other recommended sets below are scoped.
  {
    files: [
      `${APP_SRC}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.{ts,tsx,js,jsx}`,
    ],
    ...js.configs.recommended,
  },
  ...nextVitals,
  ...nextTs,
  i18next.configs["flat/recommended"],
  ...tanstackQuery.configs["flat/recommended"].map((config) => ({
    ...config,
    files: [
      `${APP_SRC}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.{ts,tsx,js,jsx}`,
    ],
  })),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next, re-globbed for a monorepo. These
    // shipped as ".next/**", which only ever matched a .next at the repo root
    // -- and the build output lives at apps/<app>/.next. `eslint .` was
    // linting 212 files of minified output per app, ~28k messages each.
    // `pnpm lint` never showed it because it lists src directories explicitly,
    // so the gate passed by not looking. "**/node_modules/**" below was
    // already correct, which is what the others should have looked like.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    "**/node_modules/**",
    // Git-ignored agent scratch: throwaway probe scripts, not shipped code.
    ".superpowers/**",
    // Frozen snapshot of the pre-rework tests. Linting a read-only copy would
    // only ever demand edits to a file that is meant to stay identical to what
    // it is a copy of. Deleted when the rework is verified complete.
    "tests/legacy/**",
    // Auto-generated files (Orval REST API clients and types)
    "packages/api/src/rest/generated/**",
    "packages/api/src/rest/types/generated/**",
    // Auto-generated files (GraphQL codegen)
    "packages/api/src/graphql/generated/**",
    // Auto-generated files (Supabase CLI types)
    "packages/api/src/supabase/types.ts",
    "packages/api/src/types/database.ts",
    // Tooling
    ".claude/**",
    // Auto-generated MSW service worker
    "**/public/mockServiceWorker.js",
  ]),
  // Accessibility (jsx-a11y) — WCAG AA compliance
  // Plugin already registered by next/core-web-vitals, just override rules
  {
    files: [`${APP_SRC}/**/*.{tsx,jsx}`, `${PKG_SRC}/**/*.{tsx,jsx}`],
    rules: {
      // Enforce alt text on images
      "jsx-a11y/alt-text": "error",
      // Enforce valid ARIA attributes
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-proptypes": "error",
      "jsx-a11y/aria-role": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      // Enforce heading order
      "jsx-a11y/heading-has-content": "error",
      // Enforce labels on form elements
      "jsx-a11y/label-has-associated-control": "error",
      // Enforce interactive elements are focusable
      "jsx-a11y/interactive-supports-focus": "error",
      // Enforce click events have key events
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      // Allow custom components with role/handlers (common in Radix/shadcn)
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },
  // E2E Tests - Playwright specific rules
  // Prevent testing specific translation text - only test element existence
  // See: Translation-agnostic E2E tests principle
  {
    files: ["**/e2e/**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Playwright's `use()` function triggers react-hooks false positives
      "react-hooks/rules-of-hooks": "off",
      // e2e-selectors.md's headline rule -- "never use Tailwind classes to
      // select or assert state" -- had no lint rule behind it, so it was
      // advice rather than a gate. Three specs were violating it: a drag
      // handle checked by cursor-grab, which a class rename would have failed
      // and an element that merely looked grabbable would have passed, and the
      // theme suite reading the .dark class Tailwind happens to key off.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toHaveClass']",
          message:
            "Don't assert CSS classes in E2E tests -- they are styling details that rename freely. Assert an ARIA or data attribute instead (see .claude/rules/e2e-selectors.md).",
        },
        {
          selector: "CallExpression[callee.property.name='toHaveCSS']",
          message:
            "Don't assert computed styles in E2E tests. Expose the state as an ARIA or data attribute and assert that (see .claude/rules/e2e-selectors.md).",
        },
        {
          selector:
            "CallExpression[callee.property.name='locator'][arguments.0.value=/^[.][a-zA-Z]/]",
          message:
            "Don't select by CSS class in E2E tests. Use getByTestId, or a role/attribute selector (see .claude/rules/e2e-selectors.md).",
        },
        {
          selector:
            "CallExpression[callee.property.name='locator'][arguments.0.value=/class/]",
          message:
            "Don't select by class attribute in E2E tests. Use getByTestId, or a role/attribute selector (see .claude/rules/e2e-selectors.md).",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByRole|getAllByRole|queryByRole|queryAllByRole|findByRole|findAllByRole)$/]",
          message:
            "Use getByTestId instead of getByRole in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByRole|getAllByRole|queryByRole|queryAllByRole|findByRole|findAllByRole)$/]",
          message:
            "Use getByTestId instead of role-based queries in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByText|getAllByText|queryByText|queryAllByText|findByText|findAllByText)$/]",
          message:
            "Use getByTestId instead of getByText in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByText|getAllByText|queryByText|queryAllByText|findByText|findAllByText)$/]",
          message:
            "Use getByTestId instead of text-based queries in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByLabel|getByLabelText|getAllByLabel|getAllByLabelText|queryByLabel|queryByLabelText|queryAllByLabel|queryAllByLabelText|findByLabel|findByLabelText|findAllByLabel|findAllByLabelText)$/]",
          message:
            "Use getByTestId instead of label-based selectors in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByLabel|getByLabelText|getAllByLabel|getAllByLabelText|queryByLabel|queryByLabelText|queryAllByLabel|queryAllByLabelText|findByLabel|findByLabelText|findAllByLabel|findAllByLabelText)$/]",
          message:
            "Use getByTestId instead of label-based selectors in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByPlaceholder|getByPlaceholderText|getAllByPlaceholder|getAllByPlaceholderText|queryByPlaceholder|queryByPlaceholderText|queryAllByPlaceholder|queryAllByPlaceholderText|findByPlaceholder|findByPlaceholderText|findAllByPlaceholder|findAllByPlaceholderText)$/]",
          message:
            "Use getByTestId instead of placeholder-based selectors in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByPlaceholder|getByPlaceholderText|getAllByPlaceholder|getAllByPlaceholderText|queryByPlaceholder|queryByPlaceholderText|queryAllByPlaceholder|queryAllByPlaceholderText|findByPlaceholder|findByPlaceholderText|findAllByPlaceholder|findAllByPlaceholderText)$/]",
          message:
            "Use getByTestId instead of placeholder-based selectors in E2E tests. Add {...tid('element-name')} to your component.",
        },
        {
          selector: "CallExpression[callee.property.name='toContainText']",
          message:
            "Don't assert specific translation text in E2E tests. Use toBeVisible() or not.toBeEmpty() instead to keep tests translation-agnostic.",
        },
        {
          selector: "CallExpression[callee.property.name='toHaveText']",
          message:
            "Don't assert specific translation text in E2E tests. Use toBeVisible() or not.toBeEmpty() instead to keep tests translation-agnostic.",
        },
        {
          selector:
            "CallExpression[callee.property.name='locator'] Literal[value=/data-testid/]",
          message:
            "Use page.getByTestId('id') instead of page.locator('[data-testid=\"id\"]'). getByTestId is cleaner and more maintainable.",
        },
        // Ban hardcoded Supabase ports and fallback URLs in e2e files
        {
          selector: "Literal[value=54321]",
          message:
            "Do not hardcode Supabase port 54321 in e2e files. Read NEXT_PUBLIC_SUPABASE_URL from process.env.",
        },
        {
          selector: "Literal[value=64321]",
          message:
            "Do not hardcode Supabase port 64321 in e2e files. Read NEXT_PUBLIC_SUPABASE_URL from process.env.",
        },
        {
          selector: "Literal[value=/127\\.0\\.0\\.1:(54321|64321)/]",
          message:
            "Do not hardcode Supabase fallback URLs in e2e files. Read NEXT_PUBLIC_SUPABASE_URL from process.env.",
        },
        {
          selector:
            "CallExpression[callee.name='getLocalSupabaseEnv'], CallExpression[callee.object.name='getLocalSupabaseEnv']",
          message:
            "getLocalSupabaseEnv() is banned in e2e files. Read credentials directly from process.env.",
        },
      ],
    },
  },
  // E2E Tests - ban local-supabase-env imports
  {
    files: ["**/e2e/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/local-supabase-env*", "**/local-supabase-env.js"],
              message:
                "local-supabase-env is banned in e2e files. Read credentials directly from process.env.",
            },
          ],
        },
      ],
    },
  },
  // Enforce one React component per file
  // See: .claude/rules/one-component-per-file.md
  {
    files: [`${APP_SRC}/**/*.tsx`, `${PKG_SRC}/**/*.tsx`],
    ignores: [
      // Only shadcn/ui components excluded (third-party compound component pattern)
      "**/shared/presentation/components/ui/**",
      // UI package contains shadcn/ui components (compound component pattern)
      "packages/ui/src/**",
      // Test files may have mock components
      "**/*.test.tsx",
      "**/*.spec.tsx",
    ],
    rules: {
      "react/no-multi-comp": ["error", { ignoreStateless: false }],
    },
  },
  // Register the plugins the moved tests reference in inline disables, WITHOUT
  // enabling their rule sets.
  //
  // An `eslint-disable-next-line sonarjs/no-hardcoded-ip` is itself an error
  // when that plugin is not registered for the file, so the tests did not just
  // lose coverage when they moved out of src/ -- they failed outright. Turning
  // the full source rule sets on for them instead produced 1988 errors: these
  // are tests, and were never written against rules meant for shipped code.
  {
    files: [
      `${APP_TESTS}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_TESTS}/**/*.{ts,tsx,js,jsx}`,
    ],
    plugins: { sonarjs, unicorn, vitest },
  },
  // Testing rules for Vitest + Testing Library (unit tests only)
  {
    files: [
      `${APP_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
      `${PKG_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
    ],
    // Exclude shadcn/ui component tests - they test generic UI primitives
    // using standard Testing Library queries (getByRole, getByText) which
    // is appropriate for testing component APIs, not business features
    ignores: [
      // Every test in packages/ui covers a shadcn/ui primitive, so the whole
      // directory is the exclusion. The two apps/*/**/components/ui patterns
      // this replaces never matched a file: no app has ever had one.
      `${PKG_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
    ],
    ...testingLibrary.configs["flat/react"],
    rules: {
      ...testingLibrary.configs["flat/react"].rules,
      "testing-library/no-container": "off",
      "testing-library/prefer-screen-queries": "off",
      "testing-library/render-result-naming-convention": "off",
      // Enforce getByTestId only - prefer test IDs for stability
      // See: .claude/rules/e2e-selectors.md
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(getByRole|getAllByRole|queryByRole|queryAllByRole|findByRole|findAllByRole)$/]",
          message:
            "Use getByTestId instead of getByRole. Test IDs are more stable across UI changes. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByRole|getAllByRole|queryByRole|queryAllByRole|findByRole|findAllByRole)$/]",
          message:
            "Use getByTestId instead of role-based queries. Test IDs are more stable across UI changes. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByText|getAllByText|queryByText|queryAllByText|findByText|findAllByText)$/]",
          message:
            "Use getByTestId instead of getByText. Test IDs are more stable across text/i18n changes. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByText|getAllByText|queryByText|queryAllByText|findByText|findAllByText)$/]",
          message:
            "Use getByTestId instead of text-based queries. Test IDs are more stable across text/i18n changes. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByLabelText|getAllByLabelText|queryByLabelText|queryAllByLabelText|findByLabelText|findAllByLabelText)$/]",
          message:
            "Use getByTestId instead of getByLabelText. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByLabelText|getAllByLabelText|queryByLabelText|queryAllByLabelText|findByLabelText|findAllByLabelText)$/]",
          message:
            "Use getByTestId instead of label-based queries. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByPlaceholderText|getAllByPlaceholderText|queryByPlaceholderText|queryAllByPlaceholderText|findByPlaceholderText|findAllByPlaceholderText)$/]",
          message:
            "Use getByTestId instead of getByPlaceholderText. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByPlaceholderText|getAllByPlaceholderText|queryByPlaceholderText|queryAllByPlaceholderText|findByPlaceholderText|findAllByPlaceholderText)$/]",
          message:
            "Use getByTestId instead of placeholder-based queries. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByAltText|getAllByAltText|queryByAltText|queryAllByAltText|findByAltText|findAllByAltText)$/]",
          message:
            "Use getByTestId instead of getByAltText. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByAltText|getAllByAltText|queryByAltText|queryAllByAltText|findByAltText|findAllByAltText)$/]",
          message:
            "Use getByTestId instead of alt-text queries. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByTitle|getAllByTitle|queryByTitle|queryAllByTitle|findByTitle|findAllByTitle)$/]",
          message:
            "Use getByTestId instead of getByTitle. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByTitle|getAllByTitle|queryByTitle|queryAllByTitle|findByTitle|findAllByTitle)$/]",
          message:
            "Use getByTestId instead of title-based queries. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(getByDisplayValue|getAllByDisplayValue|queryByDisplayValue|queryAllByDisplayValue|findByDisplayValue|findAllByDisplayValue)$/]",
          message:
            "Use getByTestId instead of getByDisplayValue. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
        {
          selector:
            "CallExpression[callee.name=/^(getByDisplayValue|getAllByDisplayValue|queryByDisplayValue|queryAllByDisplayValue|findByDisplayValue|findAllByDisplayValue)$/]",
          message:
            "Use getByTestId instead of display-value queries. Test IDs are more stable. Add {...tid('element-name')} to your component.",
        },
      ],
    },
  },
  // Enforce stable negative assertions with test IDs (no queryByText in unit tests)
  //
  // Staged as a warning with its count, not because the rule is wrong but
  // because it has never actually run. It was declared for `apps/*/src/**`,
  // where a later block redefining no-restricted-syntax overrode it, so the
  // 37 violations below have been accumulating unreported. Moving the tests
  // out of src/ is what made it live.
  //
  // 37 violations across 26 files as of this commit. Drive to zero and
  // promote to "error", the same ratchet used for the Playwright rules.
  {
    files: [
      `${APP_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
      `${PKG_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
    ],
    ignores: [
      // Every test in packages/ui covers a shadcn/ui primitive, so the whole
      // directory is the exclusion. The two apps/*/**/components/ui patterns
      // this replaces never matched a file: no app has ever had one.
      `${PKG_TESTS}/**/*.test.{ts,tsx,js,jsx}`,
    ],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "CallExpression[callee.property.name='queryByText']",
          message:
            "Use queryByTestId (or role-based test id wrappers) instead of queryByText to avoid text/i18n-coupled assertions.",
        },
        {
          selector: "CallExpression[callee.name='queryByText']",
          message:
            "Use queryByTestId (or role-based test id wrappers) instead of queryByText to avoid text/i18n-coupled assertions.",
        },
      ],
    },
  },
  {
    files: [
      `${APP_SRC}/**/*.test.{ts,tsx,js,jsx}`,
      `${APP_SRC}/**/*.spec.{ts,tsx,js,jsx}`,
    ],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // Prevent skipped/disabled tests from being committed
      // Catches: it.skip, test.skip, describe.skip, xit, xdescribe, xtest
      "vitest/no-disabled-tests": "error",
      // Prevent focused tests from being committed (would skip other tests in CI)
      // Catches: it.only, test.only, describe.only, fit, fdescribe
      "vitest/no-focused-tests": "error",
    },
  },
  {
    files: [
      `${APP_SRC}/**/*.test.{ts,tsx,js,jsx}`,
      `${APP_SRC}/**/*.spec.{ts,tsx,js,jsx}`,
    ],
    ...vitest.configs.env,
  },
  // General JS/TS linting enhancements
  {
    files: [
      `${APP_SRC}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.{ts,tsx,js,jsx}`,
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
      security,
      boundaries,
      sonarjs,
      unicorn,
    },
    rules: {
      ...sonarRules,
      ...unicornRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      // Introduced by newer plugin versions and currently too noisy for existing code;
      // keep runtime/toolchain upgrades decoupled from broad behavioral refactors.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "@tanstack/query/exhaustive-deps": "off",
      "unused-imports/no-unused-imports": "error",
      // Two rules covered this ground and disagreed. tseslint's recommended
      // preset brings @typescript-eslint/no-unused-vars with no ignore
      // pattern, so it reported `_obj` and `_url` -- deliberately-unused mock
      // parameters written to the very convention the rule below declares one
      // line away. The preset's copy won because it was never turned off, so
      // the declared convention did nothing. One rule now, at error, honouring
      // the underscore prefix.
      "unused-imports/no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          "newlines-between": "always",
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
            {
              pattern: "@shared/**",
              group: "internal",
              position: "after",
            },
            {
              pattern: "@ui/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // --- Security ---
      // Catches dangerouslySetInnerHTML usage (XSS risk)
      // Require explicit justification for any innerHTML injection
      "react/no-danger": "error",

      // Catches non-null assertions (user!.name) which mask potential null bugs
      "@typescript-eslint/no-non-null-assertion": "error",

      // Enforce `import type` for type-only imports (smaller bundles, clearer intent)
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // --- Naming Conventions ---
      // Enforces consistent naming across the codebase
      "@typescript-eslint/naming-convention": [
        "error",
        // Default: camelCase
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        // Variables: camelCase, UPPER_CASE (constants), PascalCase (React components)
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
        },
        // Functions: camelCase or PascalCase (React components)
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        // Parameters: camelCase (allow leading underscore for unused)
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
        // Types, interfaces, type aliases, enums: PascalCase
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        // Enum members: PascalCase or UPPER_CASE
        {
          selector: "enumMember",
          format: ["PascalCase", "UPPER_CASE"],
        },
        // Object/class properties: flexible (API responses, CSS classes, headers, data attributes)
        {
          selector: "property",
          format: ["camelCase", "UPPER_CASE", "PascalCase", "snake_case"],
          leadingUnderscore: "allow",
        },
        // Properties that require quotes (kebab-case, spaces, special chars) are exempt
        {
          selector: "property",
          modifiers: ["requiresQuotes"],
          format: null,
        },
        // Allow React's __html property (dangerouslySetInnerHTML)
        {
          selector: "property",
          filter: { regex: "^__html$", match: true },
          format: null,
        },
        // Destructured variables: allow snake_case (from API responses)
        {
          selector: "variable",
          modifiers: ["destructured"],
          format: ["camelCase", "UPPER_CASE", "PascalCase", "snake_case"],
        },
        // Class accessors (getters/setters): allow UPPER_CASE for constants
        {
          selector: "classicAccessor",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
        },
        // Imports: no restriction (third-party libraries use various conventions)
        {
          selector: "import",
          format: null,
        },
      ],

      // --- Performance ---
      // Catches context values recreated every render (wrap in useMemo)
      "react/jsx-no-constructed-context-values": "error",

      // Catches nested component definitions (recreated every render, loses state)
      "react/no-unstable-nested-components": "error",

      // --- Bug Prevention ---
      // Buttons must have an explicit type (button, submit, reset) to prevent
      // accidental form submissions when type defaults to "submit"
      "react/button-has-type": "error",

      // Catches array index used as key (causes bugs on reorder/filter)
      "react/no-array-index-key": "error",

      // Forbid direct DOM queries — use refs, Radix primitives, or test IDs instead.
      // querySelector bypasses React's rendering model and breaks with SSR/concurrent mode.
      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "querySelector",
          message:
            "Avoid document.querySelector — use React refs or Radix UI primitives.",
        },
        {
          object: "document",
          property: "querySelectorAll",
          message:
            "Avoid document.querySelectorAll — use React refs or Radix UI primitives.",
        },
      ],

      // Catches console.log left in production code (debug leaks)
      "no-console": ["error", { allow: ["warn", "error"] }],

      "security/detect-object-injection": "off",
      "unicorn/prefer-query-selector": "off", // we ban querySelector via no-restricted-properties
      "unicorn/no-array-reduce": "off",
      "unicorn/no-array-sort": "off",
      "unicorn/no-await-expression-member": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/prefer-single-call": "off",
      "@next/next/no-html-link-for-pages": "off",

      // ==========================================
      // STRICT SONARJS RULES
      // Enforces SOLID, DRY, KISS principles
      // ==========================================

      // --- Single Responsibility / Complexity Control ---
      // Cognitive complexity measures how difficult code is to understand
      // Lower = easier to maintain (KISS principle)
      "sonarjs/cognitive-complexity": ["error", 15],

      // Cyclomatic complexity counts independent paths through code
      // High values indicate functions doing too much (violates SRP)
      "sonarjs/cyclomatic-complexity": ["error", { threshold: 15 }],

      // Limit function length - large functions violate Single Responsibility
      "sonarjs/max-lines-per-function": ["error", { maximum: 100 }],

      // Limit file size - large files often violate Single Responsibility
      "sonarjs/max-lines": ["error", { maximum: 400 }],

      // Limit nesting depth - deeply nested code is hard to understand (KISS)
      "sonarjs/nested-control-flow": ["error", { maximumNestingLevel: 4 }],

      // Nested conditionals enabled (uses recommended settings)
      // Simplify complex conditions (KISS)
      "sonarjs/no-nested-conditional": "error",

      // Limit expression complexity - break up complex expressions
      "sonarjs/expression-complexity": ["error", { max: 4 }],

      // --- DRY Principle ---
      // Detect duplicate strings (magic strings) - use constants instead
      // Threshold: 2 means any string repeated 2+ times triggers an error
      // Ignores: CSS variable strings, i18n keys, short class strings
      "sonarjs/no-duplicate-string": [
        "error",
        {
          threshold: 2,
          // Ignore CSS variables and Tailwind semantic classes
          ignoreStrings:
            "var\\(--[a-zA-Z0-9-]+\\)|text-[a-z-]+|bg-[a-z-]+|common\\.[a-zA-Z]+",
        },
      ],

      // Detect magic numbers - use named constants instead
      // Example: MAX_RETRIES = 3, TIMEOUT_MS = 5000
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],

      // --- Code Simplification (KISS) ---
      // Collapse nested if statements when possible
      // Detect identical functions - DRY violation (threshold: 3 lines)
      "sonarjs/no-identical-functions": ["error", 3],

      "sonarjs/no-collapsible-if": "error",

      // Return directly instead of assigning to variable first
      "sonarjs/prefer-immediate-return": "error",

      // Prevent nested switch statements - refactor to separate functions
      "sonarjs/no-nested-switch": "error",

      // --- Additional Code Quality ---
      // Detect strings comparison issues
      "sonarjs/strings-comparison": "error",

      // Warn about TODO/FIXME comments (track technical debt)
      "sonarjs/todo-tag": "warn",
      "sonarjs/fixme-tag": "warn",
      "boundaries/no-unknown": "error",
      "boundaries/no-unknown-files": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              from: { type: "shared" },
              allow: { to: { type: ["shared"] } },
            },
            {
              from: { type: "shared-layouts" },
              allow: { to: { type: ["shared", "feature"] } },
            },
            {
              from: { type: "feature" },
              allow: { to: { type: ["shared", "feature", "mocks"] } },
            },
            {
              from: { type: "app" },
              allow: { to: { type: ["shared", "shared-layouts", "feature"] } },
            },
            {
              from: { type: "test" },
              allow: { to: { type: ["shared", "feature", "app", "test"] } },
            },
            {
              from: { type: "mocks" },
              allow: {
                to: { type: ["shared", "feature", "app", "test", "mocks"] },
              },
            },
            {
              from: { type: "root" },
              allow: { to: { type: ["shared", "feature", "app", "mocks"] } },
            },
          ],
        },
      ],
      // Rule for data-testid moved to app-specific config below
      // Packages can use data-testid directly (no tid() utility available)
    },
    settings: {
      "boundaries/elements": [
        {
          type: "shared-layouts",
          pattern: [
            "apps/*/src/shared/presentation/layouts/**",
            "packages/*/src/presentation/layouts/**",
          ],
        },
        {
          type: "shared",
          pattern: ["apps/*/src/shared/**", "packages/*/src/**"],
        },
        { type: "feature", pattern: "apps/*/src/features/**" },
        { type: "app", pattern: "apps/*/src/app/**" },
        { type: "test", pattern: "apps/*/src/test/**" },
        { type: "mocks", pattern: "apps/*/src/mocks/**" },
        { type: "root", pattern: "apps/*/src/proxy.ts" },
      ],
    },
  },
  // Unicorn overrides for existing code patterns
  {
    rules: {
      "unicorn/filename-case": "off",
      "unicorn/no-null": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/prefer-top-level-await": "off",
      "unicorn/prefer-module": "off",
    },
  },
  // Boundaries: relax rules for unit tests and test utilities
  {
    files: [
      `${APP_SRC}/**/*.test.{ts,tsx,js,jsx}`,
      `${APP_SRC}/**/*.spec.{ts,tsx,js,jsx}`,
      `${APP_SRC}/test/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.test.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.spec.{ts,tsx,js,jsx}`,
    ],
    rules: {
      "boundaries/dependencies": "off",
      "boundaries/no-unknown": "off",
      "boundaries/no-unknown-files": "off",
      "sonarjs/assertions-in-tests": "off",
      "sonarjs/pseudo-random": "off",
      // Test files often have many test cases - relax size limits
      "sonarjs/max-lines": "off",
      "sonarjs/max-lines-per-function": "off",
      // Test data may have duplicate strings for readability
      "sonarjs/no-duplicate-string": "off",
      // Test data often uses magic numbers for assertions
      "@typescript-eslint/no-magic-numbers": "off",
      // Test assertions commonly use ! for type narrowing on known test data
      "@typescript-eslint/no-non-null-assertion": "off",
      // Test fixtures and mocks use various naming conventions
      "@typescript-eslint/naming-convention": "off",
      // Tests use console.log for debugging
      "no-console": "off",
      // Type imports are less critical in tests
      "@typescript-eslint/consistent-type-imports": "off",
      // Test setup may require more complex expressions
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/cyclomatic-complexity": "off",
    },
  },
  {
    files: [`${APP_SRC}/mocks/**/*.{ts,tsx,js,jsx}`],
    rules: {
      "sonarjs/pseudo-random": "off",
      // Mock data often has duplicate strings for realistic test data
      "sonarjs/no-duplicate-string": "off",
      // Mock data generators may have complex structures
      "sonarjs/max-lines": "off",
      "sonarjs/cognitive-complexity": "off",
      // Mock data inherently uses numeric values for test scenarios
      "@typescript-eslint/no-magic-numbers": "off",
      // Mock data uses API-shaped names (snake_case, etc.)
      "@typescript-eslint/naming-convention": "off",
      // Mock files may use console for debugging
      "no-console": "off",
    },
  },
  {
    files: [`${APP_SRC}/proxy.ts`, `${APP_SRC}/middleware.ts`],
    rules: {
      "boundaries/no-unknown-files": "off",
    },
  },
  // Constants files define magic numbers and semantic strings - they ARE the single source of truth
  // See: .claude/rules/no-hardcoding.md
  {
    files: [
      `${APP_SRC}/**/constants/*.ts`,
      `${APP_SRC}/**/constants.ts`,
      `${APP_SRC}/**/domain/constants.ts`,
      `${APP_SRC}/**/theme/constants.ts`,
      `${PKG_SRC}/**/constants/*.ts`,
      `${PKG_SRC}/**/constants.ts`,
    ],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      // Constants files may have repeated semantic class names (e.g., text-success, text-destructive)
      // as they define configurations for different states/variants
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Export utilities have PDF/Excel formatting constants (font sizes, colors, margins)
  // These are library-specific configuration values that don't benefit from centralization
  {
    files: [`${APP_SRC}/shared/application/utils/exportUtils.ts`],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
  // UI package components have standard default prop values (shadcn/ui patterns)
  // These are component API defaults (size=48, max=100, sideOffset=4) that are
  // part of the component's public interface, not business logic magic numbers
  // Also contains repeated Tailwind class strings which are the component's styling
  {
    files: [
      `${PKG_SRC}/components/**/*.tsx`,
      `${APP_SRC}/**/components/ui/**/*.tsx`,
    ],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Infrastructure transformers and utilities - legitimately complex
  {
    files: [
      `${APP_SRC}/**/infrastructure/transformers/**`,
      `${APP_SRC}/shared/application/utils/exportUtils.ts`,
      `${APP_SRC}/shared/application/utils/export.ts`,
      `${APP_SRC}/shared/infrastructure/api/orval-mutator.ts`,
    ],
    rules: {
      // Export utilities are large by nature (many export formats)
      "sonarjs/max-lines": "off",
      "sonarjs/max-lines-per-function": "off",
      // Data transformation may have complex conditionals
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/cognitive-complexity": "off",
      // May repeat format strings and error messages
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Data transformation hooks - legitimately complex due to API response mapping
  {
    files: [
      `${APP_SRC}/**/application/hooks/useHistoricalData.ts`,
      `${APP_SRC}/**/application/hooks/useAISuggestions.ts`,
      `${APP_SRC}/**/application/hooks/useProcessFlowData.ts`,
      `${APP_SRC}/**/application/hooks/useDashboard.ts`,
    ],
    rules: {
      // These hooks transform API responses to UI-ready data with many fields
      "sonarjs/max-lines-per-function": "off",
      "sonarjs/cyclomatic-complexity": "off",
      "sonarjs/cognitive-complexity": "off",
      // Expression complexity for null-coalescing chains in data mapping
      "sonarjs/expression-complexity": "off",
    },
  },
  // Large presentation components - may have many UI sections
  {
    files: [
      `${APP_SRC}/**/presentation/components/MetricsSidebar/**`,
      `${APP_SRC}/**/presentation/components/AIInsightsSidebar/**`,
      `${APP_SRC}/**/presentation/components/LiveMetricsSidebar/**`,
      `${APP_SRC}/**/presentation/components/ProcessPerformanceTable/**`,
    ],
    rules: {
      // UI components with multiple metric sections
      "sonarjs/max-lines-per-function": "off",
      "sonarjs/cyclomatic-complexity": "off",
      // Semantic Tailwind classes repeated for different metric trend states
      // Translation keys may be repeated for responsive design (hidden sm:inline vs sm:hidden)
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Layouts and navigation - have repeated Tailwind classes for responsive patterns
  {
    files: [
      `${APP_SRC}/**/presentation/layouts/**/*.tsx`,
      `${APP_SRC}/**/layouts/**/*.tsx`,
      `${APP_SRC}/**/presentation/components/Sidebar/**/*.tsx`,
    ],
    rules: {
      // Classes like "h-6 w-auto dark:hidden" repeated for logo light/dark variants
      // Navigation items may have repeated href placeholders like "#"
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Chart components - CSS variable strings must stay inline (not extracted to JS)
  // See: .claude/rules/code-review-standards.md#css-variable-strings-policy
  {
    files: [
      `${APP_SRC}/**/presentation/components/**/*Chart.tsx`,
      `${APP_SRC}/**/presentation/components/**/*Card.tsx`,
    ],
    rules: {
      // CSS variables like "var(--muted-foreground)" are repeated for Recharts styling
      // These MUST stay as inline strings, not extracted to JS constants
      "sonarjs/no-duplicate-string": "off",
    },
  },
  // Strict i18n: Disallow ALL hardcoded user-facing strings
  // Mode "all" catches JSX text, attributes, and string literals in code
  // Exceptions are explicitly listed in words/ignoreAttribute/callees
  {
    files: [`${APP_SRC}/**/*.{ts,tsx,js,jsx}`],
    ignores: [
      // Test files (assertions, mock data, test descriptions)
      "**/*.test.*",
      "**/*.spec.*",
      "**/test/**",
      // Mock data files (simulate API responses - not i18n-ed on frontend)
      "**/mocks/**",
      "**/infrastructure/transformers/mockDataTransformer.*",
      // Generated code (Orval API clients and types)
      "**/shared/domain/types/generated/**",
      "**/shared/infrastructure/api/generated/**",
      // Infrastructure layer (technical error messages, not user-facing)
      "**/shared/infrastructure/api/orval-mutator.ts",
      "**/shared/infrastructure/config/environment.ts",
      "**/shared/application/utils/logger.ts",
      // Export utilities (report generation - static content, not i18n-ed)
      "**/shared/application/utils/export.ts",
      "**/shared/application/utils/exportUtils.ts",
      // Chart colors (CSS variable strings)
      "**/shared/presentation/theme/chartColors.ts",
      // UI components (SVG path generation)
      "**/shared/presentation/components/ui/sparkline.tsx",
      // Dev-only providers (brief loading states)
      "**/shared/infrastructure/providers/MSWProvider.tsx",
      // Data transformation utilities (chart labels, computed values)
      "**/application/utils/transformers.ts",
      "**/application/mappers/**",
    ],
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "all",
          "should-validate-template": true,
          // Attributes that MUST be internationalized
          "jsx-attributes": {
            include: [
              "alt",
              "aria-description",
              "aria-label",
              "aria-labelledby",
              "aria-valuetext",
              "label",
              "placeholder",
              "title",
            ],
          },
          // Attributes that are ALLOWED to have literal strings (technical, not user-facing)
          ignoreAttribute: [
            // HTML/React standard attributes
            "className",
            "class",
            "id",
            "name",
            "type",
            "href",
            "src",
            "srcSet",
            "data-testid",
            "data-state",
            "data-collapsed",
            "data-side",
            "data-align",
            "role",
            "htmlFor",
            "target",
            "rel",
            "method",
            "action",
            "encType",
            "autoComplete",
            "inputMode",
            "pattern",
            "accept",
            "xmlns",
            "viewBox",
            "fill",
            "stroke",
            "strokeWidth",
            "strokeLinecap",
            "strokeLinejoin",
            "d",
            "cx",
            "cy",
            "r",
            "x",
            "y",
            "x1",
            "x2",
            "y1",
            "y2",
            "width",
            "height",
            "transform",
            "clipPath",
            "clipRule",
            "fillRule",
            // Component prop names (technical configuration)
            "variant",
            "size",
            "align",
            "side",
            "orientation",
            "direction",
            "position",
            "layout",
            "mode",
            "theme",
            "color",
            "severity",
            "status",
            "priority",
            "asChild",
            "sideOffset",
            "alignOffset",
            "collisionPadding",
            // Next.js specific
            "locale",
            "prefetch",
            "scroll",
            "shallow",
            "replace",
            "passHref",
            "legacyBehavior",
            // Form/Input specific
            "defaultValue",
            "defaultChecked",
            // Recharts specific
            "dataKey",
            "tickFormatter",
            "domain",
            "ticks",
            "tickLine",
            "axisLine",
            "strokeDasharray",
            "animationDuration",
            "animationEasing",
            "connectNulls",
            "dot",
            "activeDot",
            "legendType",
            "stackId",
            // Framer Motion / Animation
            "initial",
            "animate",
            "exit",
            "transition",
            "whileHover",
            "whileTap",
            "whileFocus",
            "whileInView",
            // Testing/Dev attributes
            "tid",
          ],
          // Technical strings that are ALLOWED (not user-facing)
          words: {
            exclude: [
              // React/Next.js directives
              /^"?use (client|server)"?$/,
              // CSS values and units
              /^[0-9]+(%|px|em|rem|vh|vw|ch|ex|cm|mm|in|pt|pc|deg|rad|grad|turn|s|ms)?$/,
              // Numeric strings (for interpolation placeholders)
              /^[0-9]+\.?[0-9]*$/,
              // Color formats
              /^#[0-9a-fA-F]{3,8}$/,
              /^(rgb|rgba|hsl|hsla|oklch)\(.+\)$/,
              /^var\(--[a-zA-Z0-9-]+\)$/,
              /^var\(--[a-zA-Z0-9-]+,\s*var\(--[a-zA-Z0-9-]+\)\)$/, // Nested var() for fallbacks
              // CSS variable names as object keys
              /^--[a-zA-Z0-9-]+$/,
              // Tailwind classes and CSS class strings
              /^[a-z][a-z0-9-/:[\]()_]*$/,
              // CSS class combinations (with spaces)
              /^[a-z][a-z0-9-/:[\]()_\s]*$/,
              // URLs and paths
              /^(https?:\/\/|\/|\.\/|\.\.\/)/,
              // Environment variables
              /^(NEXT_PUBLIC_|NODE_ENV)/,
              // Technical identifiers
              /^[A-Z][A-Z0-9_]+$/, // SCREAMING_SNAKE CONSTANTS
              /^[a-z]+[A-Z][a-zA-Z]+$/, // camelCase identifiers
              /^[a-z]+\.[a-z]+/, // dot.notation keys
              // Font variable names
              /^--font-[a-z-]+$/,
              /^variable:\s*"--[a-z-]+"$/,
              // Single characters and empty
              /^.?$/,
              // Date/time format patterns and Intl options
              /^[YMDHhmsaAzZ\-\/\.\:\s]+$/,
              /^(2-digit|numeric|long|short|narrow)$/,
              // Locale codes
              /^[a-z]{2}(-[A-Z]{2})?$/,
              // Object keys that are technical (navigation, config)
              /^key:\s*"[a-zA-Z]+"$/,
              // Font family strings
              /^(sans-serif|serif|monospace|cursive|fantasy|system-ui)$/,
              // Media query strings
              /^\(prefers-[a-z-]+:\s*[a-z]+\)$/,
              // File extensions
              /^\.(json|csv|xlsx?|pdf|txt|md)$/,
              // BOM character
              /^\\uFEFF$/,
              // Quote escaping
              /^""$/,
              // Percentage format (including parenthesized)
              /^[+-]?[0-9]+%$/,
              /^\([0-9.]+%\)$/,
              // Stage names (API identifiers, not user-facing)
              /Stage$/,
              // Chart/graph point labels (data visualization, not UI text)
              /^Point\s+\d+$/,
              // MIME types
              /^(text|application|image|audio|video)\/[a-zA-Z0-9.+-]+;?.*$/,
              // SVG path data
              /^[MLCZHVSQTAmlczhvsqta0-9,.\s-]+$/,
              // Template literal for log formatting (timestamp placeholders)
              /^\[.+\]\s*\[.+\]/,
              // Technical placeholders in strings
              /\[REDACTED\]/,
              /\[truncated\]/,
              /\[params-redacted\]/,
            ],
          },
          // Function calls that are ALLOWED to have literal strings
          callees: {
            exclude: [
              // i18n functions (use translation keys)
              /^t$/,
              /^t[A-Z]/, // tCommon, tMetrics, etc.
              "useTranslations",
              "getTranslations",
              // Test ID utility
              "tid",
              // Console/logging (dev only)
              "console.log",
              "console.warn",
              "console.error",
              "console.info",
              "console.debug",
              // Logger utility
              /^logger\./,
              // Error handling
              "Error",
              "TypeError",
              "RangeError",
              "throw",
              // Technical functions
              "require",
              "import",
              "document.getElementById",
              "document.querySelector",
              "document.querySelectorAll",
              "localStorage.getItem",
              "localStorage.setItem",
              "sessionStorage.getItem",
              "sessionStorage.setItem",
              "JSON.parse",
              "JSON.stringify",
              "Object.keys",
              "Object.values",
              "Object.entries",
              "Array.from",
              "Set",
              "Map",
              "URLSearchParams",
              "encodeURIComponent",
              "decodeURIComponent",
              // String manipulation
              "replaceAll",
              "replace",
              "split",
              "join",
              "match",
              "matchAll",
              "startsWith",
              "endsWith",
              "includes",
              "padStart",
              "padEnd",
              // Media queries
              "matchMedia",
              "globalThis.matchMedia",
              "window.matchMedia",
              // Router functions
              "router.push",
              "router.replace",
              "router.prefetch",
              "useRouter",
              "usePathname",
              "useSearchParams",
              "redirect",
              // Next.js functions
              "getStaticProps",
              "getServerSideProps",
              "generateStaticParams",
              "generateMetadata",
              "cookies",
              "headers",
              // React hooks with string args (component names for debugging)
              "useRecommendationSelection",
              "useState",
              // React Query
              "useQuery",
              "useMutation",
              "queryClient.invalidateQueries",
              "queryClient.setQueryData",
              // Classname utilities
              "cn",
              "clsx",
              "cva",
              "twMerge",
              // Date/Intl formatting
              "toLocaleString",
              "toLocaleDateString",
              "toLocaleTimeString",
              "Intl.DateTimeFormat",
              "Intl.NumberFormat",
              "Intl.RelativeTimeFormat",
              // Test utilities
              "describe",
              "it",
              "test",
              "expect",
              "vi.mock",
              "vi.fn",
              "vi.spyOn",
              "beforeEach",
              "afterEach",
              "beforeAll",
              "afterAll",
            ],
          },
        },
      ],
    },
  },
  {
    files: ["**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}"],
    rules: {
      "i18next/no-literal-string": "off",
    },
  },
  // Custom rules for import enforcement
  {
    files: [`${APP_SRC}/features/**/*.{ts,tsx}`],
    rules: {
      // Enforce absolute imports for cross-layer imports in features
      // Allows: './Component' (same directory), '@/features/*', '@/shared/*'
      // Disallows: '../' patterns that cross architectural layers
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**/domain/*", "../**/domain"],
              message: "Use absolute import: @/features/[feature]/domain/...",
            },
            {
              group: ["../**/application/*", "../**/application"],
              message:
                "Use absolute import: @/features/[feature]/application/...",
            },
            {
              group: ["../**/infrastructure/*", "../**/infrastructure"],
              message:
                "Use absolute import: @/features/[feature]/infrastructure/...",
            },
            {
              group: ["../**/presentation/*", "../**/presentation"],
              message:
                "Use absolute import: @/features/[feature]/presentation/...",
            },
          ],
        },
      ],
    },
  },
  // Enforce using "ui" package instead of local ui imports
  {
    files: [`${APP_SRC}/**/*.{ts,tsx}`],
    ignores: [
      // Allow local ui imports only in the ui directory itself (for internal use)
      `${APP_SRC}/shared/presentation/components/ui/**`,
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/shared/presentation/components/ui/*",
                "@/shared/presentation/components/ui",
              ],
              message:
                "Import from 'ui' package instead: import { Component } from 'ui'",
            },
            {
              group: [
                "*/shared/presentation/components/ui/*",
                "*/shared/presentation/components/ui",
              ],
              message:
                "Import from 'ui' package instead: import { Component } from 'ui'",
            },
          ],
        },
      ],
    },
  },
  // Enforce absolute imports - disallow deep relative imports (../../..)
  {
    files: [`${APP_SRC}/**/*.{ts,tsx}`, `${PKG_SRC}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../../../*"],
              message:
                "Avoid deep relative imports. Use absolute imports with @/ alias.",
            },
          ],
        },
      ],
    },
  },
  // Prevent apps from using internal package aliases (@ui/*, @shared/*)
  // Apps should use package names (ui, shared) not internal aliases
  {
    files: [`${APP_SRC}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@ui/*"],
              message:
                "Import from 'ui' package instead of internal @ui/ alias. Example: import { Button } from 'ui'",
            },
            {
              group: ["@shared/*"],
              message:
                "Import from 'shared' package instead of internal @shared/ alias. Example: import { useTheme } from 'shared'",
            },
          ],
        },
      ],
    },
  },
  // Enforce tid() utility for test IDs in apps and packages (stripped in production)
  // tid() is centralized in packages/shared
  // Also: Enforce centralized process.env access (only in config files)
  // See: .claude/rules/no-hardcoding.md
  {
    files: [`${APP_SRC}/**/*.{ts,tsx}`, "packages/*/src/**/*.{ts,tsx}"],
    ignores: [
      // Test files can use data-testid for simplicity
      `${APP_SRC}/**/*.test.{ts,tsx}`,
      `${APP_SRC}/**/*.spec.{ts,tsx}`,
      "packages/*/src/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.spec.{ts,tsx}",
      // The tid utility itself defines the attribute name
      "packages/shared/src/utils/tid.ts",
      // Centralized config files are the ONLY place allowed to read process.env
      `${APP_SRC}/**/infrastructure/config/**`,
      // API package mutators are the centralized config for HTTP and GraphQL clients
      "packages/api/src/rest/mutator/**",
      "packages/api/src/graphql/mutator/**",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='data-testid']",
          message:
            "Use the tid() utility from 'shared' instead of data-testid literals so test IDs are stripped in production.",
        },
        {
          selector:
            "MemberExpression[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']",
          message:
            "Access process.env only from centralized config files (shared/infrastructure/config/). Import runtimeEnv from your app's environment config instead.",
        },
      ],
    },
  },
  // ThemeScript uses dangerouslySetInnerHTML legitimately for theme flash prevention
  // The injected script is a hardcoded string (not user input), so no XSS risk
  {
    files: ["packages/shared/src/components/ThemeScript.tsx"],
    rules: {
      "react/no-danger": "off",
    },
  },
  // Logger utility IS the abstraction for console - allow all console methods
  {
    files: [`${APP_SRC}/shared/application/utils/logger.ts`],
    rules: {
      "no-console": "off",
    },
  },
  // MSW providers use console.log for dev-only mock readiness messages
  {
    files: [`${APP_SRC}/shared/infrastructure/providers/MSWProvider.tsx`],
    rules: {
      "no-console": "off",
    },
  },
  // Enforce absolute imports in packages/shared (non-generated code)
  // Same-directory imports (./Component) are allowed
  // Cross-directory imports must use @shared/* alias
  {
    files: ["packages/shared/src/**/*.{ts,tsx}"],
    ignores: [
      // Generated files can use any imports
      "packages/shared/src/**/generated/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Use absolute import with @shared/ alias instead of relative imports. Example: @shared/hooks/useTheme",
            },
          ],
        },
      ],
    },
  },
  // Enforce absolute imports in packages/ui
  // Same-directory imports (./Component) are allowed
  // Cross-directory imports must use @ui/* alias
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Use absolute import with @ui/ alias instead of relative imports. Example: @ui/utils/cn",
            },
          ],
        },
      ],
    },
  },
  // Enforce absolute imports in packages/api (non-generated code)
  // Same-directory imports (./config) are allowed
  // Cross-directory imports must use @api/* alias
  {
    files: ["packages/api/src/**/*.{ts,tsx}"],
    ignores: [
      // Generated files can use any imports
      "packages/api/src/**/generated/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*"],
              message:
                "Use absolute import with @api/ alias instead of relative imports. Example: @api/mutator/customFetch",
            },
          ],
        },
      ],
    },
  },
  // Tailwind CSS quality — catch deprecated, duplicate, and conflicting classes
  // See: .claude/rules/tailwind.md
  {
    ...betterTailwindcss.configs["recommended"],
    files: [
      `${APP_SRC}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.{ts,tsx,js,jsx}`,
    ],
    rules: {
      ...betterTailwindcss.configs["recommended"].rules,
      // Catch deprecated classes (e.g. flex-shrink-0 → shrink-0, rounded → rounded-sm)
      "better-tailwindcss/no-deprecated-classes": [
        "error",
        {
          entryPoint: "apps/store/src/app/globals.css",
        },
      ],
      // Simplify verbose classes (e.g. bg-[var(--x)] → bg-(--x), rotate-[30deg] → rotate-30)
      "better-tailwindcss/enforce-canonical-classes": [
        "error",
        {
          entryPoint: "apps/store/src/app/globals.css",
        },
      ],
      // Catch duplicate classes in the same className string
      "better-tailwindcss/no-duplicate-classes": [
        "error",
        {
          entryPoint: "apps/store/src/app/globals.css",
        },
      ],
      // Catch conflicting classes (e.g. p-4 + p-6 on same element)
      "better-tailwindcss/no-conflicting-classes": [
        "error",
        {
          entryPoint: "apps/store/src/app/globals.css",
        },
      ],
      // Remove extra whitespace in class strings
      "better-tailwindcss/no-unnecessary-whitespace": [
        "warn",
        {
          entryPoint: "apps/store/src/app/globals.css",
        },
      ],
      // Too many false positives with custom @layer utilities classes — disable
      "better-tailwindcss/no-unknown-classes": "off",
      // Too opinionated for existing codebase — disable
      "better-tailwindcss/enforce-consistent-class-order": "off",
      "better-tailwindcss/enforce-consistent-line-wrapping": "off",
    },
  },
  // Ban arbitrary Tailwind values — use semantic tokens instead
  // Example violations: text-[10px], w-[347px], bg-[#f5f5f5], mt-[23px]
  // Allowed exceptions: tracking-[0.15em], tracking-[0.2em] (no semantic equivalent)
  // See: .claude/rules/tailwind.md, .claude/rules/single-source-of-truth.md
  {
    files: [
      `${APP_SRC}/**/*.{ts,tsx,js,jsx}`,
      `${PKG_SRC}/**/*.{ts,tsx,js,jsx}`,
    ],
    ignores: [
      // shadcn/ui components legitimately use arbitrary values (ring-[3px], etc.)
      `${PKG_SRC}/components/**/*.tsx`,
      `${APP_SRC}/**/components/ui/**/*.tsx`,
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\w+\\-\\[\\d+[a-z]*\\]/]",
          message:
            "Avoid arbitrary Tailwind values (e.g. text-[10px], w-[347px]). Use semantic design tokens or Tailwind defaults instead. See: .claude/rules/tailwind.md",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(bg|text|border|ring|outline|shadow|from|to|via)\\-\\[#[0-9a-fA-F]+\\]/]",
          message:
            "Avoid arbitrary color values (e.g. bg-[#f5f5f5]). Use semantic color tokens (bg-primary, text-muted-foreground, etc.) instead. See: .claude/rules/single-source-of-truth.md",
        },
      ],
    },
  },
  // Enforce nuqs for URL-worthy state in web and admin application hooks
  // useState in application/hooks MUST be justified — prefer useQueryStates from nuqs
  // See: .claude/rules/url-state.md
  {
    files: [
      "apps/web/src/**/application/hooks/**/*.{ts,tsx}",
      "apps/admin/src/**/application/hooks/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useState"],
              message:
                "Use useQueryStates from 'nuqs' for URL-persisted state in application hooks. Only use useState for ephemeral UI state (e.g., Date.now(), local form input). See: .claude/rules/url-state.md",
            },
          ],
        },
      ],
    },
  },
  // Enforce feature flag access through helpers (hasFlag, hasAllFlags, hasAnyFlag)
  // or hooks (useHasFlag). Direct property access on the flags record is forbidden.
  // See: apps/web/src/shared/application/utils/featureFlagChecks.ts
  {
    files: [`${APP_SRC}/**/*.{ts,tsx}`],
    ignores: [
      // The helpers ARE the abstraction — they must access flags directly
      `${APP_SRC}/shared/application/utils/featureFlagChecks.ts`,
      // useHasFlag hook is a thin convenience wrapper over direct access
      `${APP_SRC}/shared/application/hooks/useHasFlag.ts`,
      // Context internals (mergeFlags, DEFAULT_FLAGS) need direct access
      `${APP_SRC}/shared/application/context/FeatureFlagsContext.tsx`,
      // FeatureFlagGate delegates to helpers internally
      `${APP_SRC}/shared/presentation/components/FeatureFlagGate.tsx`,
      // Test files may construct flag records directly
      `${APP_SRC}/**/*.test.{ts,tsx}`,
      `${APP_SRC}/**/*.spec.{ts,tsx}`,
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[computed=true][object.name='flags'][property.type='MemberExpression'][property.object.name='FeatureFlag']",
          message:
            "Do not access flags[FeatureFlag.X] directly. Use hasFlag(FeatureFlag.X, flags) or useHasFlag(FeatureFlag.X). See: shared/application/utils/featureFlagChecks.ts",
        },
        {
          selector:
            "MemberExpression[computed=false][object.name='flags'][property.name=/^show/]",
          message:
            "Do not access flags.showXxx directly. Use hasFlag(FeatureFlag.X, flags) or useHasFlag(FeatureFlag.X). See: shared/application/utils/featureFlagChecks.ts",
        },
      ],
    },
  },
  playwrightConfig,
  playwrightSetupConfig,

  // The unused-variable convention, applied everywhere rather than only under
  // apps/*/src and packages/*/src. Tests, scripts and root config files were
  // outside every block that set it, so they fell through to the preset's
  // copy -- which has no underscore convention at all. That went unnoticed
  // while `pnpm lint` only looked at a hand-listed set of source directories.
  // Last in the array so it wins over the preset for every file.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "unused-imports/no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
