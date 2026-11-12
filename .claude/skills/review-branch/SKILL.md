---
name: review-branch
description: Review ALL code in the current branch vs develop, find every issue regardless of priority, and fix them all.
---

# Review Branch — Full Diff Review & Fix

## Description

Reviews **every file changed** in the current branch compared to `develop`. Finds all violations of DRY, SOLID, KISS, architecture rules, styling policies, naming conventions, and testing standards — then **fixes them all**, regardless of severity.

This is the "clean up everything before PR" command.

---

## Usage

```
/review-branch [base-branch]
```

Or natural language:

```
Review all code in this branch
Review and fix everything different from develop
Clean up this branch before PR
```

## Parameters

| Parameter     | Required | Description                                    |
| ------------- | -------- | ---------------------------------------------- |
| `base-branch` | No       | Branch to compare against (default: `develop`) |

---

## What Gets Reviewed

Every non-test source file changed in this branch vs the base branch, checked against:

1. **SOLID Principles** — SRP, OCP, LSP, ISP, DIP
2. **DRY** — duplicated logic, repeated constants, type duplication
3. **KISS** — unnecessary abstractions, over-engineering
4. **Architecture** — layer dependencies, feature isolation, import rules
5. **One Component Per File** — multiple components in one .tsx
6. **Styling** — semantic colors only, no raw Tailwind palette, no CSS var constants
7. **Naming** — file naming, variable naming, import ordering
8. **i18n** — no hardcoded strings, keys exist in all locales
9. **No Hardcoding** — magic numbers, inline types, inline mocks
10. **Security** — no secrets, input validation, XSS prevention
11. **Bugs** — null handling, async errors, stale closures, missing deps

Test files are also reviewed for:

- Missing vitest imports
- Mock placement (vi.mock before imports)
- Assertion quality (meaningful assertions, not just renders)
- Test isolation (proper cleanup in beforeEach)

---

## Execution Steps

### Step 1: Get the diff

```bash
git diff develop --name-only --diff-filter=ACMR
```

Separate into source files and test files.

### Step 2: Review source files

For each changed source file:

1. Read the full file
2. Check against all 11 review categories
3. Note issues with file:line references

### Step 3: Review test files

For each changed test file:

1. Read the full file
2. Check test quality, mock patterns, assertion quality
3. Note issues with file:line references

### Step 4: Fix ALL issues

Fix every issue found, regardless of severity:

- **Critical** — fix immediately
- **Warning** — fix it
- **Suggestion** — fix it too
- **Info** — if actionable, fix it

Do NOT create a report and wait. **Fix everything directly.**

### Step 5: Verify fixes

After fixing, run `/verify-code --no-build --no-smoke` to ensure:

- Format passes
- Lint passes
- TypeCheck passes
- Tests pass
- Coverage passes

### Step 6: Report what was fixed

Output a summary table:

```markdown
## Branch Review Complete

**Branch:** `feat/GH-42_Feature-Name`
**Base:** `develop`
**Files reviewed:** X source + Y test files

### Fixes Applied

| #   | Category | File:Line          | Issue                 | Fix                           |
| --- | -------- | ------------------ | --------------------- | ----------------------------- |
| 1   | ARCH     | `Component.tsx:15` | Cross-feature import  | Changed to shared import      |
| 2   | DRY      | `utils.ts:30`      | Duplicated validation | Extracted to shared           |
| 3   | STYLE    | `Card.tsx:8`       | Raw `text-red-500`    | Changed to `text-destructive` |

### No Issues Found In

- Architecture ✓
- Security ✓
- i18n ✓
```

---

## Review Checklist Reference

See [Code Review Standards](../../../docs/lessons/code-review-standards.md) for the full checklist used by each review category.

Key rules:

- [Architecture](../../rules/architecture.md) — layer dependencies, import rules
- [SOLID](../../../docs/lessons/solid-principles.md) — single responsibility, dependency inversion
- [DRY](../../../docs/lessons/dry-principle.md) — knowledge duplication, rule of three
- [KISS](../../../docs/lessons/kiss-principle.md) — simplest solution, KISS > DRY when they conflict
- [Component Patterns](../../rules/component-patterns.md) — one component per file, structure
- [Naming](../../../docs/lessons/naming-conventions.md) — file naming, variable naming
- [Tailwind](../../rules/tailwind.md) — semantic colors, class ordering
- [No Hardcoding](../../../docs/lessons/no-hardcoding.md) — constants, types, mocks in proper locations
- [Testing](../../rules/testing.md) — TDD, assertion quality, mock patterns
- [Single Source of Truth](../../rules/single-source-of-truth.md) — colors, typography, i18n

---

## Parallelization

For branches with many changed files (>20), dispatch parallel review agents:

- One agent per app directory
- Each agent reviews and fixes files in its scope
- Final agent runs `/verify-code` to ensure everything still passes

---

## Examples

### Example 1: Review current branch

```
/review-branch
```

Reviews all changes vs develop, fixes everything.

### Example 2: Review against main

```
/review-branch main
```

Reviews all changes vs main (e.g., for release branches).

---

## Related

- [Code Review](../code-review/SKILL.md) — `/code-review` for targeted file/folder review
- [Full Review](../full-review/SKILL.md) — `/full-review` for multi-agent codebase review
- [Verify Code](../verify-code/SKILL.md) — `/verify-code` for quality gates
