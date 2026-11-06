# Build Checks Rule

> **All code MUST pass quality checks before committing.**

---

## Required Checks

Before committing any code changes, you MUST run and pass all of these checks:

| Check         | Command             | Description              |
| ------------- | ------------------- | ------------------------ |
| **Format**    | `pnpm format:check` | Prettier code formatting |
| **Lint**      | `pnpm lint`         | ESLint code quality      |
| **TypeCheck** | `pnpm typecheck`    | TypeScript type safety   |
| **Tests**     | `pnpm test`         | Vitest unit tests        |
| **Build**     | `pnpm build`        | Next.js production build |

---

## Check Order

Run checks in this order (CI will fail on first error):

```bash
# 1. Format check (fastest)
pnpm format:check

# 2. Lint check
pnpm lint

# 3. Type check
pnpm typecheck

# 4. Unit tests
pnpm test

# 5. Build (slowest)
pnpm build
```

---

## Quick Fix Commands

| Issue             | Fix Command         |
| ----------------- | ------------------- |
| Format issues     | `pnpm format`       |
| Lint auto-fixable | `pnpm lint --fix`   |
| Type errors       | Manual fix required |
| Test failures     | Manual fix required |
| Build errors      | Manual fix required |

---

## Common Failures & Solutions

### 1. Format Check Failure

**Symptom:**

```
Code style issues found in X files. Run Prettier with --write to fix.
```

**Solution:**

```bash
pnpm format
```

**Prevention:**

- Configure your editor to format on save
- Use Prettier extension in VS Code

### 2. TypeScript Errors

**Symptom:**

```
error TS2304: Cannot find name 'X'.
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.
```

**Common Causes:**

- Missing imports (especially in test files: `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi`)
- Incorrect type annotations
- Using undefined variables

**Test File Imports:**

```typescript
// Always import ALL vitest functions you use
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

### 3. Lint Errors vs Warnings

**Errors (must fix):**

- Will fail CI
- Block PR merge

**Warnings (should fix):**

- Won't fail CI
- Should be addressed when possible

**Check for errors only:**

```bash
pnpm lint --max-warnings=0  # Treat warnings as errors
```

### 4. Test Failures

**Symptom:**

```
FAIL src/features/X/hooks/useX.test.tsx
```

**Debug:**

```bash
# Run specific test file
pnpm test src/features/X/hooks/useX.test.tsx

# Run in watch mode
pnpm test:watch
```

See [Testing](./testing.md#run-in-watch-mode) for watch-mode guidance.

### 5. Build Failures

**Symptom:**

```
Build failed
```

**Common Causes:**

- Import errors (module not found)
- Server/Client component mismatches
- Environment variable issues

---

## Pre-Commit Checklist

Before running `/submit-pr`:

- [ ] `pnpm format` - Fix any formatting issues
- [ ] `pnpm lint` - No errors (warnings OK)
- [ ] `pnpm typecheck` - No TypeScript errors
- [ ] `pnpm test` - All tests pass
- [ ] `pnpm build` - Build succeeds

---

## CI Pipeline

The CI runs these jobs on every PR:

### ci.yml (Main CI)

```yaml
jobs:
  changes: # Detect code/deploy changes (skip docs-only PRs)
  # These 4 jobs run IN PARALLEL after changes:
  quality: # format:check, lint, typecheck, sherif, syncpack
  unit-tests: # pnpm test:coverage (all apps)
  build: # pnpm build (with NEXT_PUBLIC_* env vars baked in)
  bundle-analysis: # ANALYZE=true build (PRs only)
  # Sequential after build:
  e2e-tests: # playwright tests (uses pre-built artifacts via next start)
  # Conditional:
  docker-build: # builds docker/ci/Dockerfile image; used by e2e-tests
```

### pr-checks.yml (PR-specific)

```yaml
jobs:
  branch-target: # Validates branch can target base
  pr-title: # Conventional commit format
  changes: # Detects what the PR touches
  security: # pnpm audit
  summary: # Posts the PR summary comment
```

> There is no separate `accessibility` or `visual-regression` job. Accessibility
> is checked by axe inside the unit tests of `packages/ui` and
> `packages/app-components`, so it runs as part of **Unit Tests**. Visual
> regression is not set up at all. See
> [Quality Gates](../../docs/standards/quality-gates.md).

---

## Test File Requirements

### Required Imports

Every test file MUST import all vitest functions used:

```typescript
// CORRECT: All functions imported
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// WRONG: Missing afterEach - will cause TypeScript error
import { describe, it, expect, beforeEach, vi } from "vitest";
```

### Common Test Imports

```typescript
// Vitest
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// React Testing Library
import { render, screen, waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// MSW
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

// Test utilities
import { render } from "@/test/utils";
```

---

## Enforcement

### Local Development

1. **Editor Integration:**
   - Enable format-on-save for Prettier
   - Enable ESLint integration
   - Enable TypeScript checking

2. **Pre-commit (optional):**
   ```bash
   # Run all checks before commit
   pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
   ```

### CI (Automatic)

- All PRs run full CI pipeline
- Failures block merge
- Required status checks:
  - `Quality Checks`
  - `Unit Tests`
  - `Build`

---

## Related

- [Testing Rules](./testing.md) - Test file patterns
- [Git Workflow](./git-workflow.md) - PR process
- [Submit PR Skill](../skills/submit-pr/SKILL.md) - `/submit-pr`
