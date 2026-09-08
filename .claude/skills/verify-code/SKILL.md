---
name: verify-code
description: Run all quality gates (format, lint, typecheck, tests, coverage, build, smoke) and fix failures. No skipping, no exceptions.
---

# Coverage — Full Quality Gate

## Description

Runs **every quality check** in the CI pipeline, fixes failures inline, and reports results. This is the "make everything green" command.

**Philosophy:** Fix the code, not the rules. Do not use `--no-verify`, `eslint-disable`, `@ts-ignore`, `test.skip`, or any other bypass unless there is a genuine, documented reason. Every exception must be justified at the end.

---

## Usage

```
/coverage [options]
```

Or natural language:

```
Run all quality checks
Make sure everything passes
Full coverage check
```

## Parameters

| Parameter    | Required | Description                                               |
| ------------ | -------- | --------------------------------------------------------- |
| `--fix`      | No       | Auto-fix failures (default behavior)                      |
| `--report`   | No       | Only report issues, don't fix                             |
| `--no-smoke` | No       | Skip smoke tests (requires `pnpm dev` + Supabase running) |
| `--no-build` | No       | Skip production build (saves ~2min)                       |

---

## Execution Order

Run checks fastest-first. Stop and fix each failure before proceeding.

```
Step 1 → Format          pnpm format:check       (fix: pnpm format)
Step 2 → Lint            pnpm lint               (fix: pnpm lint --fix, then manual)
Step 3 → TypeCheck       pnpm typecheck          (fix: manual)
Step 4 → Unit Tests      pnpm test               (fix: manual)
Step 5 → Coverage        pnpm test:coverage      (fix: write tests or adjust exclusions)
Step 6 → Build           pnpm build              (fix: manual)
Step 7 → Smoke Tests     pnpm smoke              (requires dev servers + Supabase)
```

---

## Steps (with Task Tracking)

### Step 1: Initialize Task List

Create a task list to track progress:

```
TodoWrite([
  { content: "Format check", status: "in_progress" },
  { content: "Lint check", status: "pending" },
  { content: "TypeScript check", status: "pending" },
  { content: "Unit tests", status: "pending" },
  { content: "Coverage thresholds", status: "pending" },
  { content: "Production build", status: "pending" },
  { content: "Smoke tests", status: "pending" },
  { content: "Report results", status: "pending" }
])
```

### Step 2: Format Check

```bash
pnpm format:check
```

**If failures:**

```bash
pnpm format
```

Then re-run `pnpm format:check` to confirm. Do NOT skip files.

### Step 3: Lint Check

```bash
pnpm lint
```

**If failures:**

1. First try auto-fix: `pnpm lint --fix`
2. Re-run `pnpm lint` to check remaining errors
3. For remaining errors — fix them manually in the source code
4. **Do NOT add `eslint-disable` comments** unless:
   - The rule genuinely doesn't apply (e.g., `no-node-access` in a test using `container.querySelector` for Radix data-slot selectors)
   - The rule conflicts with a required pattern (e.g., `vi.mock` must come before imports, violating `import/order`)
   - Document WHY in the disable comment

### Step 4: TypeScript Check

```bash
pnpm typecheck
```

**If failures:**

Fix TypeScript errors in the source files. Common issues:

- Missing type imports
- Incorrect generic parameters
- Type mismatches after refactoring

Do NOT use `@ts-ignore` or `@ts-expect-error` unless the type system genuinely cannot express the correct type (e.g., complex generics in third-party libraries). Document WHY.

### Step 5: Unit Tests

```bash
pnpm test
```

**If failures:**

1. Read the failure output to understand what's failing
2. Fix the source code or the test — whichever is actually wrong
3. Do NOT use `test.skip` or `describe.skip`
4. Re-run until all pass

### Step 6: Coverage Thresholds

```bash
pnpm test:coverage
```

This runs all app/package test suites with coverage enabled. **85% is the
target**, and most workspaces meet it on all four metrics. Two do not, and
their thresholds are pinned just under measured coverage rather than at the
target, so the gap can only close:

| workspace         | statements | branches | functions | lines |
| ----------------- | ---------: | -------: | --------: | ----: |
| `packages/api`    |         81 |       78 |        71 |    86 |
| `packages/shared` |         87 |       78 |        92 |    90 |

Pinning to measured coverage rather than to the target cuts both ways: it is
below 85 where coverage is, and **above** 85 where coverage is better, so the
slack cannot be spent without the gate noticing.

**If failures:**

1. Check which workspace failed and which metric is below its threshold
2. Write meaningful tests to cover the gap — see [Testing Rules](../../rules/testing.md)
3. If a file is legitimately untestable (type-only, re-export shim, complex RHF internal), add it to the workspace's `vitest.config.ts` coverage exclusions with a comment explaining WHY
4. Do NOT lower a threshold to make a failure go away. They are ratchets: raise
   them when coverage improves, and treat a drop as a missing test

### Step 7: Production Build

```bash
pnpm build
```

**If failures:**

Fix build errors. Common issues:

- Import errors (module not found after moving files)
- Server/Client component mismatches
- Missing environment variables

### Step 8: Smoke Tests (Optional)

**Requires:** All apps running (`pnpm dev`) and Supabase running.

```bash
pnpm smoke
```

**If not available** (servers not running), skip with a note in the report.

**If failures:**

1. Read the Playwright output
2. Fix the failing tests or the app code
3. Do NOT skip tests

---

## Fix Rules

### Absolutely No Skipping

| Pattern                 | Verdict  | Alternative                               |
| ----------------------- | -------- | ----------------------------------------- |
| `eslint-disable`        | AVOID    | Fix the code. Use only with WHY comment.  |
| `@ts-ignore`            | AVOID    | Fix the types. Use only for library bugs. |
| `test.skip`             | NEVER    | Fix the test or delete it.                |
| `--no-verify`           | NEVER    | Fix the hook failure.                     |
| `passWithNoTests: true` | OK       | Already in configs, harmless.             |
| Coverage exclusion      | JUSTIFY  | Only for genuinely untestable files.      |
| `any` cast              | MINIMIZE | Use only at mock boundaries in tests.     |

### When Exceptions Are Acceptable

An exception is acceptable ONLY when:

1. The code is genuinely correct and the tool is wrong
2. You can explain WHY in one sentence
3. The explanation references a specific technical constraint

**Examples of acceptable exceptions:**

```typescript
// eslint-disable-next-line testing-library/no-node-access -- Radix data-slot has no accessible role
container.querySelector("[data-slot='tabs']");

// eslint-disable-next-line import/order -- vi.mock must be hoisted before the import it mocks
import { myFunction } from "./myModule";

/* eslint-disable react/display-name -- mock factory components in vi.mock */
```

**Examples of unacceptable exceptions:**

```typescript
// @ts-ignore  ← WHY? Fix the type.
// eslint-disable-next-line  ← No rule specified, no reason given
test.skip("flaky test", ...)  ← Fix it or delete it
```

---

## Report Format

After all checks complete, output a summary:

```markdown
## Quality Gate Report

| Check     | Status  | Details             |
| --------- | ------- | ------------------- |
| Format    | ✅ PASS |                     |
| Lint      | ✅ PASS | 3 warnings (OK)     |
| TypeCheck | ✅ PASS |                     |
| Tests     | ✅ PASS | 1,200 tests         |
| Coverage  | ✅ PASS | All apps 85%+       |
| Build     | ✅ PASS |                     |
| Smoke     | ⏭ SKIP | Servers not running |

### Exceptions Added (0)

None.

### Exceptions Added (if any)

| File               | Exception                                       | Justification                                   |
| ------------------ | ----------------------------------------------- | ----------------------------------------------- |
| `tabs.test.tsx:44` | `eslint-disable testing-library/no-node-access` | Radix data-slot selector has no accessible role |
```

---

## Coverage Per Workspace

When checking coverage, verify each workspace individually:

| Workspace         | Command                                | Threshold |
| ----------------- | -------------------------------------- | --------- |
| `apps/admin`      | `pnpm --filter admin test:coverage`    | 85%       |
| `apps/auth`       | `pnpm --filter auth-app test:coverage` | 85%       |
| `apps/store`      | `pnpm --filter store test:coverage`    | 85%       |
| `apps/studio`     | `pnpm --filter studio test:coverage`   | 85%       |
| `apps/payments`   | `pnpm --filter payments test:coverage` | 85%       |
| `apps/landing`    | N/A (passWithNoTests)                  | —         |
| `packages/shared` | Part of `pnpm test:coverage`           | 85%       |
| `packages/ui`     | Part of `pnpm test:coverage`           | 85%       |

---

## Examples

### Example 1: Full run

```
/coverage
```

Runs all 7 steps, fixes failures, reports results.

### Example 2: Quick check (no build/smoke)

```
/coverage --no-build --no-smoke
```

Runs format, lint, typecheck, tests, coverage only.

### Example 3: Report only

```
/coverage --report
```

Runs all checks but does not modify any files. Lists all failures for manual review.

---

## Related

- [Build Checks Rule](../../rules/build-checks.md) — CI pipeline definition
- [Testing Rules](../../rules/testing.md) — Test writing guidelines
- [Run Tests Skill](../run-tests/SKILL.md) — `/run-tests` for unit tests only
- [E2E Eval Skill](../e2e-eval/SKILL.md) — `/e2e-eval` for E2E runs
- [Submit PR Skill](../submit-pr/SKILL.md) — `/submit-pr` runs CI after push
