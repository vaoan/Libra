---
name: commit-push
description: Commits and pushes changes using only MCP tools. Includes code review and coverage enforcement for JS/TS files. Quality checks run via git hooks.
---

# Commit and Push

## ⛔ Git Safety Warning

> **This skill commits AND pushes code. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/commit-push" or "commit and push"
> - Do NOT run this skill automatically after completing work
> - Do NOT suggest running this skill
> - Wait for explicit user request

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Commits staged/unstaged changes and pushes to remote using **only MCP tools**. This skill never uses bash git commands and never prompts for credentials - authentication is handled by the Git MCP via `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env.local`.

**For JavaScript/TypeScript files, this skill also:**

- Reviews code against project rules and fixes violations
- Checks test coverage and creates unit tests for files below 85%

> **Note:** Quality checks (format, lint, typecheck) are handled by git hooks at commit time.

---

## Usage

```
/commit-push [message]
```

or natural language:

```
Commit and push
Commit and push with message "feat: add new feature"
Push my changes
```

## Parameters

| Parameter       | Required | Description                                       |
| --------------- | -------- | ------------------------------------------------- |
| `message`       | No       | Commit message (will be prompted if not provided) |
| `--no-push`     | No       | Only commit, don't push                           |
| `--amend`       | No       | Amend the previous commit (use with caution)      |
| `--skip-checks` | No       | Skip rule review and coverage (not recommended)   |

---

## MCP Tools Used

This skill uses ONLY these MCP tools:

| Tool                   | Purpose                         |
| ---------------------- | ------------------------------- |
| `mcp__git__git_status` | Check current state             |
| `mcp__git__git_diff`   | View changes for commit message |
| `mcp__git__git_add`    | Stage files                     |
| `mcp__git__git_commit` | Create commit                   |
| `mcp__git__git_push`   | Push to remote                  |
| `mcp__git__git_log`    | View recent commits for context |

**NEVER use:**

- `Bash` with git commands
- Any tool that prompts for credentials

---

## Todo List Initialization

When this skill starts, initialize the todo list based on file types:

### For JS/TS Files Modified (Full Workflow)

```
TodoWrite([
  { content: "Set git working directory", status: "in_progress", activeForm: "Setting git directory" },
  { content: "Check status and identify changed files", status: "pending", activeForm: "Checking status" },
  { content: "Detect file types (JS/TS vs other)", status: "pending", activeForm: "Detecting file types" },
  { content: "Review code against project rules", status: "pending", activeForm: "Reviewing code" },
  { content: "Fix rule violations", status: "pending", activeForm: "Fixing violations" },
  { content: "Check coverage on changed files", status: "pending", activeForm: "Checking coverage" },
  { content: "Create tests for low coverage files", status: "pending", activeForm: "Creating tests" },
  { content: "Stage all changes", status: "pending", activeForm: "Staging changes" },
  { content: "Create commit", status: "pending", activeForm: "Creating commit" },
  { content: "Push to remote", status: "pending", activeForm: "Pushing to remote" }
])
```

### For Non-JS Files Only (Simplified Workflow)

```
TodoWrite([
  { content: "Set git working directory", status: "in_progress", activeForm: "Setting git directory" },
  { content: "Check status and identify changed files", status: "pending", activeForm: "Checking status" },
  { content: "Detect file types (JS/TS vs other)", status: "pending", activeForm: "Detecting file types" },
  { content: "Stage all changes", status: "pending", activeForm: "Staging changes" },
  { content: "Create commit", status: "pending", activeForm: "Creating commit" },
  { content: "Push to remote", status: "pending", activeForm: "Pushing to remote" }
])
```

---

## Steps

### Step 1: Set Git Working Directory

**REQUIRED before any git MCP operations.**

```
mcp__git__git_set_working_dir({
  path: "{project_root_directory}",
  validateGitRepo: true,
  includeMetadata: true
})
```

This prevents the error: "No session working directory set."

### Step 2: Check Status and Identify Changed Files

```
mcp__git__git_status()
```

Get current branch, staged changes, unstaged changes, and untracked files.

**Collect the list of all changed files** (staged, unstaged, and untracked).

### Step 3: Detect File Types

Analyze the changed files to determine if any are JavaScript/TypeScript:

**JS/TS file extensions:**

- `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`

**Non-JS file extensions (skip quality checks):**

- `.md`, `.json`, `.yaml`, `.yml`, `.css`, `.scss`, `.html`, `.svg`, `.png`, `.jpg`, etc.

```typescript
// Pseudo-code for detection
const changedFiles = [...stagedFiles, ...unstagedFiles, ...untrackedFiles];
const jstsFiles = changedFiles.filter((f) =>
  /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f),
);
const hasJsTsFiles = jstsFiles.length > 0;
```

**If NO JS/TS files changed:**

- Skip steps 4-8 (rule review, quality checks, coverage)
- Update todo list to simplified version
- Jump directly to Step 9 (Stage Changes)

**If JS/TS files changed:**

- Continue with full workflow (steps 4-8)

---

## Steps 4-7: JS/TS Quality Workflow

> **These steps ONLY run if JavaScript/TypeScript files were modified.**
>
> **Note:** Quality checks (format, lint, typecheck) run automatically via git hooks when you commit.

### Step 4: Review Code Against Project Rules

Review the changed JS/TS files against these rules:

| Rule                   | File                                                                 | What to Check                             |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------------------- |
| Semantic Colors        | [tailwind.md](../../rules/tailwind.md)                               | No `text-green-500`, use `text-success`   |
| Architecture           | [architecture.md](../../rules/architecture.md)                       | Correct layer placement, absolute imports |
| Naming                 | [naming-conventions.md](../../../docs/lessons/naming-conventions.md) | PascalCase components, camelCase hooks    |
| No Hardcoding          | [no-hardcoding.md](../../../docs/lessons/no-hardcoding.md)           | No magic numbers/strings                  |
| Component Patterns     | [component-patterns.md](../../rules/component-patterns.md)           | Proper structure                          |
| One Component Per File | [one-component-per-file.md](../../rules/one-component-per-file.md)   | One React component per `.tsx` file       |

**Read each changed file and check for violations.**

### Step 5: Fix Rule Violations

For each violation found:

1. Use `Edit` tool to fix the issue
2. Document what was fixed
3. Continue to next violation

**Common fixes:**

- Replace `text-red-500` → `text-destructive`
- Replace `text-green-500` → `text-success`
- Replace relative imports `../domain` → `@/features/[feature]/domain`
- Extract magic numbers to constants

### Step 6: Check Coverage on Changed Files

Run coverage on the changed JS/TS files:

```bash
pnpm test --coverage --run
```

**Parse coverage report** and identify files below 85% coverage.

**Coverage threshold:** 85%

Files to check coverage for:

- Components (`.tsx` files in `components/`)
- Hooks (`use*.ts` files)
- Utilities (`.ts` files in `utils/`)
- Services (`.ts` files in `services/`)

### Step 7: Create Tests for Low Coverage Files

For each file below 85% coverage:

1. **Identify file type:**
   - Component → Create component test
   - Hook → Create hook test
   - Utility → Create utility test

2. **Create test file** following [Testing Rules](../../rules/testing.md):

```typescript
// Example: ComponentName.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByRole('...')).toBeInTheDocument();
  });

  // Add more tests to reach 85% coverage
});
```

3. **Run tests** to verify they pass
4. **Re-check coverage** to confirm 85%+ achieved

---

## Steps 8-10: Commit and Push

### Step 8: Stage All Changes

Stage all files including any fixes made:

```
mcp__git__git_add({ files: ["."], all: true })
```

### Step 9: Create Commit

First, get recent commits for message style:

```
mcp__git__git_log({ maxCount: 5, oneline: true })
```

Then create the commit:

```
mcp__git__git_commit({
  message: "type(scope): description [GH-XXX]\n\nDetails here.\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
})
```

**If the commit fails due to git hooks or pre-commit checks:**

1. Analyze the output to see which files failed (e.g., Prettier formatting, ESLint warnings).
2. Run autofix commands (e.g., `npx prettier --write <file>` or `npx eslint --fix <file>`).
3. Stage the modified files again `git add <file>`.
4. Re-run the commit command.
5. DO NOT skip any problems. Keep fixing until the commit succeeds.

**Commit message format:**

Follow [commit message conventions](../../../docs/lessons/git-workflow.md#commit-messages):

- Conventional commits: `type(scope): description`
- Include ticket reference if applicable: `[GH-XXX]`
- Add Co-Authored-By line for Claude

**If quality/coverage fixes were made, include in commit message:**

```
type(scope): description [GH-XXX]

- Main changes description
- Fixed rule violations (semantic colors, imports)
- Added unit tests for coverage

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Step 10: Push to Remote

```
mcp__git__git_push({ setUpstream: true })
```

Push to the current branch. The `setUpstream` flag ensures the branch is tracked.

---

## File Type Detection Reference

### JS/TS Files (Run Full Workflow)

| Extension | Description          |
| --------- | -------------------- |
| `.ts`     | TypeScript           |
| `.tsx`    | TypeScript React     |
| `.js`     | JavaScript           |
| `.jsx`    | JavaScript React     |
| `.mjs`    | ES Module JavaScript |
| `.cjs`    | CommonJS JavaScript  |

### Non-JS Files (Skip Quality Checks)

| Extension              | Description       |
| ---------------------- | ----------------- |
| `.md`                  | Markdown          |
| `.json`                | JSON config       |
| `.yaml`, `.yml`        | YAML config       |
| `.css`, `.scss`        | Stylesheets       |
| `.html`                | HTML              |
| `.svg`, `.png`, `.jpg` | Images            |
| `.env*`                | Environment files |
| `.gitignore`           | Git ignore        |

---

## Authentication

**This skill never asks for credentials.**

Authentication is handled automatically by the Git MCP server:

1. Git MCP reads `GITHUB_PERSONAL_ACCESS_TOKEN` from `.env.local`
2. Uses secure `GIT_ASKPASS` method (token never exposed in command line)
3. Works with HTTPS remotes (`https://github.com/...`)

If push fails with authentication error:

1. Check `.env.local` has valid `GITHUB_PERSONAL_ACCESS_TOKEN`
2. Token needs `repo` scope for private repos
3. Restart Claude Code after changing tokens

---

## Error Handling

| Error                    | Solution                                               |
| ------------------------ | ------------------------------------------------------ |
| "Nothing to commit"      | No changes to commit - inform user                     |
| "Authentication failed"  | Check GITHUB_PERSONAL_ACCESS_TOKEN in .env.local       |
| "Push rejected"          | Pull/rebase first, then push                           |
| "No upstream branch"     | Use `setUpstream: true` (already default)              |
| "Pre-commit hook failed" | Check output, run `prettier --write` or fixing scripts |
| "Coverage below 85%"     | Create additional tests                                |

---

## Examples

### Example 1: JS/TS Files Changed (Full Workflow)

```
User: /commit-push
Changed files:
- src/features/dashboard/presentation/components/Chart.tsx (modified)
- src/features/dashboard/application/hooks/useMetrics.ts (new)

Claude:
☐ Set git working directory
☐ Check status and identify changed files
☐ Detect file types (JS/TS vs other)
  → JS/TS files detected: Chart.tsx, useMetrics.ts
☐ Review code against project rules
  → Found: text-green-500 in Chart.tsx (should be text-success)
  → Found: relative import in useMetrics.ts
☐ Fix rule violations
  → Fixed: text-green-500 → text-success
  → Fixed: ../domain → @/features/dashboard/domain
☐ Check coverage on changed files
  → Chart.tsx: 92% ✓
  → useMetrics.ts: 72% ✗ (below 85%)
☐ Create tests for low coverage files
  → Created: useMetrics.test.ts
  → New coverage: 88% ✓
☐ Stage all changes
☐ Create commit (git hooks run quality checks)
☐ Push to remote

Committed: feat(dashboard): add metrics hook and chart component [GH-42]
Pushed to origin/feat/GH-42_Dashboard-Metrics
```

### Example 2: Only Non-JS Files Changed (Simplified Workflow)

```
User: /commit-push

Changed files:
- README.md (modified)
- .env.example (modified)

Claude:
☐ Set git working directory
☐ Check status and identify changed files
☐ Detect file types (JS/TS vs other)
  → No JS/TS files detected, skipping quality checks
☐ Stage all changes
☐ Create commit
☐ Push to remote

Committed: docs: update README and environment example
Pushed to origin/docs/GH-55_Update-Docs
```

### Example 3: Mixed Files (JS/TS + Others)

```
User: /commit-push

Changed files:
- src/components/Button.tsx (modified)
- README.md (modified)
- package.json (modified)

Claude:
☐ Set git working directory
☐ Check status and identify changed files
☐ Detect file types (JS/TS vs other)
  → JS/TS files detected: Button.tsx
  → Running full workflow for JS/TS files
☐ Review code against project rules
  → No violations found
☐ Fix rule violations
  → None needed
☐ Check coverage on changed files
  → Button.tsx: 95% ✓
☐ Create tests for low coverage files
  → None needed (all above 85%)
☐ Stage all changes
☐ Create commit (git hooks run quality checks)
☐ Push to remote

Committed: feat(ui): update button component [GH-60]
Pushed to origin/feat/GH-60_Button-Update
```

### Example 4: With Skip Checks Flag

```
User: /commit-push --skip-checks

Changed files:
- src/features/auth/LoginForm.tsx (modified)

Claude:
☐ Set git working directory
☐ Check status and identify changed files
☐ Detect file types (JS/TS vs other)
  → JS/TS files detected, but --skip-checks flag used
  → Skipping rule review and coverage checks
☐ Stage all changes
☐ Create commit (git hooks still run)
☐ Push to remote

⚠️ Warning: Rule review and coverage checks were skipped
Committed: fix(auth): quick login fix [GH-70]
Pushed to origin/fix/GH-70_Login-Fix
```

---

## Related

- [Git Workflow](../../../docs/lessons/git-workflow.md) - Commit message conventions
- [Submit PR](../submit-pr/SKILL.md) - Full PR workflow
- [Sync with Develop](../sync-with-develop/SKILL.md) - Sync and review workflow
- [MCP-First Rule](../../../docs/lessons/mcp-first.md) - Always use MCP tools
- [Testing Rules](../../rules/testing.md) - Test writing guidelines
