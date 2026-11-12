---
name: sync-with-develop
description: Sync a feature branch with develop using safe, guided steps.
---

# Sync with Develop

## Git Safety Warning

> **This skill pulls and merges code. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/sync-with-develop" or "sync with develop"
> - Do NOT run this skill automatically
> - Do NOT suggest running this skill unless explicitly asked
> - May create merge commits

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Keeps your feature branch up to date with the latest develop branch changes. Includes **interactive merge strategy selection**, **automatic code review**, **quality checks with auto-fix**, and **coverage enforcement** to ensure incoming code follows project rules and standards.

**This skill uses a task list to show progress during the sync.**

## Usage

```
/sync-with-develop
```

Or natural language:

```
Sync my branch with develop
Update my branch from develop
Pull latest develop changes
```

## When to Use

Sync regularly to:

- Get latest code changes from team
- Prevent large merge conflicts later
- Ensure compatibility with latest develop
- Before creating a PR
- After major changes merged to develop

**How often:** At least daily, or before starting a new work session

---

## Execution Steps (with Task Tracking)

When executing this skill, Claude MUST use the `TaskCreate`, `TaskUpdate`, and `TaskList` tools to track progress. Create all tasks upfront so the user can see the full plan, then update their status as you work through each step.

### Step 1: Initialize Task List

Create all 12 tasks upfront, note their returned IDs, then start the first one:

```
TaskCreate({ subject: "Check current branch status", description: "Verify we are on a feature branch and check for uncommitted changes", activeForm: "Checking branch status" })
TaskCreate({ subject: "Fetch latest from origin", description: "Fetch remote changes and update local develop branch", activeForm: "Fetching latest changes" })
TaskCreate({ subject: "Check commits behind develop", description: "Count how many commits the feature branch is behind develop", activeForm: "Checking commits behind" })
TaskCreate({ subject: "Ask merge strategy preference", description: "Ask user whether to use standard merge, prioritize our changes, or prioritize develop changes", activeForm: "Getting merge strategy" })
TaskCreate({ subject: "Merge develop into feature branch", description: "Merge origin/develop into the current feature branch using the selected strategy", activeForm: "Merging develop changes" })
TaskCreate({ subject: "Handle conflicts (if any)", description: "Check for and resolve any merge conflicts that arose", activeForm: "Resolving conflicts" })
TaskCreate({ subject: "Review incoming code against rules", description: "Check changed files against project rules: colors, imports, naming, components, tests", activeForm: "Reviewing code" })
TaskCreate({ subject: "Fix rule violations", description: "Apply fixes for any rule violations found in incoming code", activeForm: "Fixing violations" })
TaskCreate({ subject: "Run quality checks and fix issues", description: "Run format, lint, typecheck and tests; fix any issues found", activeForm: "Running quality checks" })
TaskCreate({ subject: "Check coverage on changed files", description: "Run coverage report and identify files below 85% threshold", activeForm: "Checking coverage" })
TaskCreate({ subject: "Create tests for low coverage files", description: "Write unit tests for files that do not meet the 85% line coverage threshold", activeForm: "Creating tests" })
TaskCreate({ subject: "Report results", description: "Generate and display the final sync summary report", activeForm: "Reporting results" })

// Start the first task — use the ID returned by the first TaskCreate above:
TaskUpdate({ taskId: "{check-branch-task-id}", status: "in_progress" })
```

### Step 1b: Set Git Working Directory

**REQUIRED before any git MCP operations.**

```
mcp__git__git_set_working_dir({
  path: "{project_root_directory}",
  validateGitRepo: true,
  includeMetadata: true
})
```

This prevents the error: "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first."

### Step 2: Check Current Status

**Task: "Check current branch status" -> in_progress**

**Get current branch:**

```
mcp__git__git_branch({
  operation: "show-current"
})
```

**Verify:**

- On feature branch (e.g., `feat/GH-XXX_Title`)
- NOT on `develop` or `main`

**If on develop or main:**

```
Cannot sync - you're on '{branch}', not a feature branch.

Switch to your feature branch first:
/checkout feat/GH-XXX_Branch-Name
```

**Check for uncommitted changes:**

```
mcp__git__git_status()
```

**If uncommitted changes exist, ask user:**

```
AskUserQuestion({
  questions: [{
    question: "You have uncommitted changes. How should I handle them?",
    header: "Changes",
    options: [
      { label: "Commit first (Recommended)", description: "Create a WIP commit with your current changes before syncing" },
      { label: "Stash temporarily", description: "Stash changes, sync, then restore them after" },
      { label: "Cancel sync", description: "Stop the sync so you can handle changes manually" }
    ],
    multiSelect: false
  }]
})
```

**If user chooses stash:**

```
mcp__git__git_stash({
  mode: "push",
  message: "WIP before sync"
})
```

**Mark task completed and update next:**

```
TaskUpdate({ taskId: "{check-branch-task-id}", status: "completed" })
TaskUpdate({ taskId: "{fetch-latest-task-id}", status: "in_progress" })
```

### Step 3: Fetch Latest Develop

**Task: "Fetch latest from origin" -> in_progress**

```
# Fetch all remote changes
mcp__git__git_fetch({
  remote: "origin"
})

# Update local develop branch
mcp__git__git_checkout({
  target: "develop"
})

mcp__git__git_pull({
  remote: "origin",
  branch: "develop"
})

# Switch back to feature branch
mcp__git__git_checkout({
  target: "-"  // Previous branch
})
```

**Verify fetch successful:**

```
mcp__git__git_log({
  branch: "origin/develop",
  maxCount: 5,
  oneline: true
})
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{fetch-latest-task-id}", status: "completed" })
TaskUpdate({ taskId: "{check-commits-task-id}", status: "in_progress" })
```

### Step 4: Check How Far Behind

**Task: "Check commits behind develop" -> in_progress**

**Compare your branch with develop:**

```
mcp__git__git_log({
  branch: "HEAD..origin/develop",
  oneline: true
})
```

**Count commits behind (if Git MCP doesn't provide count):**

```bash
git rev-list --count HEAD..origin/develop
```

**If 0 commits behind:**

```
Your branch is up to date with develop. No sync needed.
```

Skip to Step 13 (Report results).

**If commits behind:**

```
Your branch is {N} commits behind develop.

Commits to merge:
- abc1234 feat: add user authentication
- def5678 fix: handle null response
- ...
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{check-commits-task-id}", status: "completed" })
TaskUpdate({ taskId: "{merge-strategy-task-id}", status: "in_progress" })
```

### Step 5: Ask Merge Strategy Preference

**Task: "Ask merge strategy preference" -> in_progress**

**IMPORTANT: Ask user which merge strategy to use:**

```
AskUserQuestion({
  questions: [{
    question: "Which merge strategy should I use?",
    header: "Strategy",
    options: [
      { label: "Standard merge (Recommended)", description: "Normal merge - Git will try to auto-merge, stops on conflicts for manual resolution" },
      { label: "Prioritize my changes", description: "Use -X ours - On conflicts, automatically keep your current branch changes" },
      { label: "Prioritize develop changes", description: "Use -X theirs - On conflicts, automatically take develop's changes" }
    ],
    multiSelect: false
  }]
})
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{merge-strategy-task-id}", status: "completed" })
TaskUpdate({ taskId: "{merge-branch-task-id}", status: "in_progress" })
```

### Step 6: Merge Develop into Feature Branch

**Task: "Merge develop into feature branch" -> in_progress**

**Based on user selection:**

**Standard merge:**

```
mcp__git__git_merge({
  branch: "origin/develop"
})
```

**Prioritize my changes (-X ours):**

```bash
git merge origin/develop -X ours
```

**Prioritize develop changes (-X theirs):**

```bash
git merge origin/develop -X theirs
```

**Store list of changed files for later steps:**

```bash
git diff --name-only HEAD~1
```

Save this list as `changedFiles` for use in quality checks and coverage steps.

**Mark task completed:**

```
TaskUpdate({ taskId: "{merge-branch-task-id}", status: "completed" })
TaskUpdate({ taskId: "{handle-conflicts-task-id}", status: "in_progress" })
```

### Step 7: Handle Conflicts (If Any)

**Task: "Handle conflicts (if any)" -> in_progress**

**Check for conflicts:**

```
mcp__git__git_status()
```

**If conflicts exist:**

```
Merge conflicts detected in:
- src/features/auth/LoginForm.tsx
- src/shared/utils/api.ts

Options:
1. I can help resolve these conflicts
2. Resolve manually

Which would you prefer?
```

**After resolving conflicts:**

```
mcp__git__git_add({
  files: ["."]
})
```

Then continue the merge:

```bash
git merge --continue
```

**If no conflicts:**

```
No conflicts. Merge completed cleanly.
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{handle-conflicts-task-id}", status: "completed" })
TaskUpdate({ taskId: "{review-code-task-id}", status: "in_progress" })
```

### Step 8: Review Incoming Code Against Rules

**Task: "Review incoming code against rules" -> in_progress**

**Get list of files changed by the merge:**

```
mcp__git__git_diff({
  source: "HEAD~1",
  nameOnly: true
})
```

**Review changed files against project rules:**

| Rule                                                              | Check For                                                              |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Single Source of Truth](../../rules/single-source-of-truth.md)   | Non-semantic colors (e.g., `text-green-500` instead of `text-success`) |
| [No Hardcoding](../../../docs/lessons/no-hardcoding.md)           | Magic numbers, hardcoded strings, inline types                         |
| [Architecture](../../rules/architecture.md)                       | Relative imports crossing layers (`../domain`), cross-feature imports  |
| [Naming Conventions](../../../docs/lessons/naming-conventions.md) | Incorrect file/variable naming                                         |
| [Component Patterns](../../rules/component-patterns.md)           | Missing `'use client'` directive, wrong component structure            |
| [One Component Per File](../../rules/one-component-per-file.md)   | Multiple React components in one `.tsx` file                           |

**Read each changed file and identify violations:**

```
Read({ file_path: "{changed_file}" })
```

**Document found violations:**

```
## Code Review Results

Found {N} rule violations in incoming code:

1. **{file}:{line}** - {rule violated}
   - Issue: {description}
   - Fix: {suggested fix}

2. ...
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{review-code-task-id}", status: "completed" })
TaskUpdate({ taskId: "{fix-violations-task-id}", status: "in_progress" })
```

### Step 9: Fix Rule Violations

**Task: "Fix rule violations" -> in_progress**

**For each violation found, apply the fix:**

**Common fixes:**

| Violation                                             | Fix                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `text-green-500`                                      | Replace with `text-success`                                                    |
| `text-red-500`                                        | Replace with `text-destructive`                                                |
| `text-yellow-500`                                     | Replace with `text-warning`                                                    |
| `text-blue-500`                                       | Replace with `text-info`                                                       |
| `import { X } from '../domain'`                       | Replace with `import { X } from '@/features/[feature]/domain'`                 |
| Missing vitest imports                                | Add `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'` |
| `import { ... } from '@testing-library/react'`        | Replace with `import { ... } from '@/test/utils'`                              |
| `import userEvent from '@testing-library/user-event'` | Remove; use `fireEvent` from `@/test/utils` instead                            |
| Inline types                                          | Extract to `types.ts` file                                                     |

**Use Edit tool to fix each violation:**

```
Edit({
  file_path: "{file}",
  old_string: "{violation}",
  new_string: "{fix}"
})
```

**Report fixes applied:**

```
## Fixes Applied

Fixed {N} rule violations:

1. {file}:{line} - {description of fix}
2. ...
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{fix-violations-task-id}", status: "completed" })
TaskUpdate({ taskId: "{quality-checks-task-id}", status: "in_progress" })
```

### Step 10: Run Quality Checks and Fix Issues

**Task: "Run quality checks and fix issues" -> in_progress**

Run quality checks on the changed files and fix any issues:

**1. Format with Prettier:**

```bash
pnpm format
```

This auto-fixes formatting issues.

**2. Lint with ESLint:**

```bash
pnpm lint --fix
```

This auto-fixes linting issues where possible.

**3. Check for remaining lint errors:**

```bash
pnpm lint
```

If errors remain, manually fix them using the Edit tool.

**4. Type check:**

```bash
pnpm typecheck
```

If type errors exist, fix them using the Edit tool.

**5. Run tests on changed files:**

```bash
pnpm test --run
```

If tests fail, investigate and fix the issues.

**Report quality check results:**

```
## Quality Check Results

| Check | Status | Issues Fixed |
|-------|--------|--------------|
| Format (Prettier) | ✅ Pass | {N} files formatted |
| Lint (ESLint) | ✅ Pass | {N} issues auto-fixed |
| TypeCheck | ✅ Pass | {N} type errors fixed |
| Tests | ✅ Pass | All {N} tests passing |
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{quality-checks-task-id}", status: "completed" })
TaskUpdate({ taskId: "{check-coverage-task-id}", status: "in_progress" })
```

### Step 11: Check Coverage on Changed Files

**Task: "Check coverage on changed files" -> in_progress**

**Run coverage on the changed files:**

```bash
pnpm test --coverage --run
```

**Parse coverage report to get per-file coverage:**

Look at the coverage output or read the coverage report file (usually `coverage/coverage-summary.json` or similar).

**Identify files below 85% coverage:**

For each changed file (`.ts`, `.tsx` excluding test files):

- Check line coverage percentage
- If < 85%, add to `lowCoverageFiles` list

**Report coverage results:**

```
## Coverage Results

| File | Lines | Branches | Functions | Status |
|------|-------|----------|-----------|--------|
| src/features/auth/LoginForm.tsx | 92% | 88% | 100% | ✅ Pass |
| src/shared/utils/format.ts | 72% | 65% | 80% | ❌ Below 85% |
| src/features/dashboard/hooks/useMetrics.ts | 45% | 40% | 50% | ❌ Below 85% |

**Files needing tests:** 2 files below 85% coverage threshold
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{check-coverage-task-id}", status: "completed" })
TaskUpdate({ taskId: "{create-tests-task-id}", status: "in_progress" })
```

### Step 12: Create Tests for Low Coverage Files

**Task: "Create tests for low coverage files" -> in_progress**

**If no files below 85% coverage:**

```
All changed files meet the 85% coverage threshold. No additional tests needed.
```

Skip to Step 13.

**If files below 85% coverage:**

For each file in `lowCoverageFiles`:

1. **Read the source file:**

   ```
   Read({ file_path: "{source_file}" })
   ```

2. **Identify untested code paths:**
   - Functions without test coverage
   - Branches not covered
   - Edge cases not tested

3. **Create or update test file:**

   **For components** (`*.tsx`):

   ```typescript
   import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
   import { render, screen, fireEvent, waitFor } from '@/test/utils';
   import { ComponentName } from './ComponentName';

   // JSDOM does not implement scrollIntoView — mock it if the component calls it
   // beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = vi.fn(); });

   // NOTE: @testing-library/user-event is NOT installed in this project.
   // Use fireEvent from @/test/utils for all interactions.

   describe('ComponentName', () => {
     // Test rendering
     it('renders correctly', () => { ... });

     // Test user interactions (use fireEvent, not userEvent)
     it('handles click events', () => {
       fireEvent.click(screen.getByRole('button'));
     });

     // Test edge cases
     it('handles empty state', () => { ... });
     it('handles error state', () => { ... });
     it('handles loading state', () => { ... });
   });
   ```

   **For hooks** (`use*.ts`):

   ```typescript
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { renderHook, act, waitFor } from '@/test/utils';
   import { useHookName } from './useHookName';

   describe('useHookName', () => {
     it('returns initial state', () => { ... });
     it('updates state correctly', () => { ... });
     it('handles errors', () => { ... });
   });
   ```

   **For utilities** (`*.ts`):

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { functionName } from './utilityFile';

   describe('functionName', () => {
     it('handles normal input', () => { ... });
     it('handles edge cases', () => { ... });
     it('handles invalid input', () => { ... });
   });
   ```

4. **Write the test file:**

   ```
   Write({ file_path: "{test_file_path}", content: "{test_content}" })
   ```

5. **Run the new tests to verify:**

   ```bash
   pnpm test {test_file_path} --run
   ```

6. **Re-run coverage to verify improvement:**
   ```bash
   pnpm test --coverage --run
   ```

**Report tests created:**

```
## Tests Created

| File | Tests Added | New Coverage |
|------|-------------|--------------|
| src/shared/utils/format.test.ts | 5 tests | 72% → 91% ✅ |
| src/features/dashboard/hooks/useMetrics.test.ts | 8 tests | 45% → 88% ✅ |

All files now meet the 85% coverage threshold.
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{create-tests-task-id}", status: "completed" })
TaskUpdate({ taskId: "{report-task-id}", status: "in_progress" })
```

### Step 13: Restore Stashed Changes

**If you stashed changes at start:**

```
mcp__git__git_stash({
  mode: "pop"
})
```

Resolve any conflicts with stashed changes.

### Step 14: Report Results

**Task: "Report results" -> in_progress**

```
## Sync Complete

**Branch:** {feature_branch}
**Commits merged:** {N} from develop
**Merge strategy:** {Standard | Prioritize mine | Prioritize develop}
**Conflicts:** {None | Resolved in X files}

### Code Quality Summary

| Category | Found | Fixed |
|----------|-------|-------|
| Rule violations | {N} | {N} |
| Format issues | {N} | {N} |
| Lint errors | {N} | {N} |
| Type errors | {N} | {N} |

### Test Coverage

| Status | Count |
|--------|-------|
| Files checked | {N} |
| Files ≥85% coverage | {N} |
| Files <85% (tests created) | {N} |
| Tests created | {N} |

**Quality checks:** All passed
**Coverage:** All files ≥85%

Your branch is now up to date with develop.
```

**Mark task completed:**

```
TaskUpdate({ taskId: "{report-task-id}", status: "completed" })
```

---

## Merge Strategies Explained

| Strategy               | Flag        | When to Use                                                   |
| ---------------------- | ----------- | ------------------------------------------------------------- |
| **Standard**           | (none)      | Normal workflow, want to review conflicts manually            |
| **Prioritize mine**    | `-X ours`   | Your changes are correct, develop changes should not override |
| **Prioritize develop** | `-X theirs` | Want to take develop's version on any conflict                |

**Important:** The `-X ours` and `-X theirs` flags only affect conflicting lines. Non-conflicting changes from both sides are always merged.

---

## Coverage Threshold

**Minimum coverage: 85%**

Files below this threshold will have unit tests created automatically. The coverage check looks at:

- **Line coverage** - Percentage of lines executed
- **Branch coverage** - Percentage of branches (if/else) executed
- **Function coverage** - Percentage of functions called

A file passes if its **line coverage** is ≥85%.

---

## MCP Tools Used

| Tool                     | Purpose                    |
| ------------------------ | -------------------------- |
| `mcp__git__git_branch`   | Get/verify current branch  |
| `mcp__git__git_status`   | Check uncommitted changes  |
| `mcp__git__git_stash`    | Stash/pop changes          |
| `mcp__git__git_fetch`    | Fetch remote changes       |
| `mcp__git__git_checkout` | Switch branches            |
| `mcp__git__git_pull`     | Pull develop changes       |
| `mcp__git__git_merge`    | Merge develop into feature |
| `mcp__git__git_log`      | Check commits behind       |
| `mcp__git__git_diff`     | Get changed files          |
| `mcp__git__git_add`      | Stage conflict resolutions |

---

## Rules Checked During Review

| Rule                   | File                                                                 | What's Checked                       |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Single Source of Truth | [single-source-of-truth.md](../../rules/single-source-of-truth.md)   | Semantic colors, typography          |
| No Hardcoding          | [no-hardcoding.md](../../../docs/lessons/no-hardcoding.md)           | Magic numbers, strings, inline types |
| Architecture           | [architecture.md](../../rules/architecture.md)                       | Import paths, layer dependencies     |
| Naming Conventions     | [naming-conventions.md](../../../docs/lessons/naming-conventions.md) | File and variable naming             |
| Component Patterns     | [component-patterns.md](../../rules/component-patterns.md)           | Component structure                  |
| Testing                | [testing.md](../../rules/testing.md)                                 | Test file imports                    |

---

## Common Issues

**Merge conflicts:**

- Choose "Prioritize mine" if your changes should take precedence
- Choose "Standard" if you want to manually review each conflict

**Build fails after merge:**

- Check for breaking changes in develop
- Update code to match new patterns
- Run codegen if schema changed

**Tests fail after merge:**

- Check if test expectations changed
- Update tests if needed
- Verify logic still correct

**Low coverage:**

- Tests will be auto-created for files <85%
- Review generated tests for accuracy
- Add additional edge cases if needed

---

## Examples

### Example 1: Clean Sync with Full Quality Pass

```
/sync-with-develop
```

**Output:**

```
## Sync Complete

**Branch:** feat/GH-42_User-Authentication
**Commits merged:** 5 from develop
**Merge strategy:** Standard
**Conflicts:** None

### Code Quality Summary

| Category | Found | Fixed |
|----------|-------|-------|
| Rule violations | 3 | 3 |
| Format issues | 12 | 12 |
| Lint errors | 2 | 2 |
| Type errors | 0 | 0 |

### Test Coverage

| Status | Count |
|--------|-------|
| Files checked | 8 |
| Files ≥85% coverage | 8 |
| Files <85% (tests created) | 0 |
| Tests created | 0 |

**Quality checks:** All passed
**Coverage:** All files ≥85%

Your branch is now up to date with develop.
```

### Example 2: Sync with Tests Created

```
/sync-with-develop
```

**Output:**

```
## Sync Complete

**Branch:** feat/GH-42_User-Authentication
**Commits merged:** 3 from develop
**Merge strategy:** Prioritize mine (-X ours)
**Conflicts:** Auto-resolved (kept our changes)

### Code Quality Summary

| Category | Found | Fixed |
|----------|-------|-------|
| Rule violations | 1 | 1 |
| Format issues | 5 | 5 |
| Lint errors | 0 | 0 |
| Type errors | 1 | 1 |

### Test Coverage

| Status | Count |
|--------|-------|
| Files checked | 4 |
| Files ≥85% coverage | 2 |
| Files <85% (tests created) | 2 |
| Tests created | 13 |

**Quality checks:** All passed
**Coverage:** All files ≥85%

Your branch is now up to date with develop.
```

### Example 3: Already Up to Date

```
/sync-with-develop
```

**Output:**

```
Your branch is up to date with develop. No sync needed.

**Branch:** feat/GH-42_User-Authentication
**Commits behind:** 0
```

---

## Related

- [Submit PR](../submit-pr/SKILL.md) - After syncing, submit your PR
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch conventions
- [Code Review Standards](../../../docs/lessons/code-review-standards.md) - Review guidelines
- [Testing Rules](../../rules/testing.md) - Test patterns and requirements
