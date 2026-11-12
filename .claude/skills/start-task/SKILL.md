---
name: start-task
description: Initializes a task with git branch, documentation artifacts, AND automatic codebase analysis.
---

# Start Task

## ⛔ Git Safety Warning

> **This skill creates a git branch. It does NOT commit or push anything.**
>
> After this skill completes:
>
> - Do NOT auto-commit any changes
> - Do NOT push to remote
> - Wait for user to explicitly request commits

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Initializes a new task by:

1. **Creating a git branch** with proper naming conventions
2. **Setting up task documentation** folder with numbered artifacts
3. **Fetching issue details** from GitHub
4. **Automatically analyzing the codebase** to identify relevant files and patterns
5. **Creating analysis artifact** (02-analysis.md) with findings and design questions
6. **Handing off to `/brainstorming`** — armed with codebase context to design before implementing

This skill creates a structured workspace, performs initial analysis, and transitions directly into a design dialogue so decisions are made deliberately before any code is written.

---

## Usage

```
/start-task <ticket> [type] [title]
```

Or natural language:

```
Start working on issue 42 as a feature
Create a fix branch for GH-15
Start task GH-88 as chore
```

## Parameters

| Parameter | Required | Description                                                                                                                                                         |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ticket`  | Yes      | GitHub issue number. Accepts: `42`, `#42`, or `GH-42`                                                                                                               |
| `type`    | No       | Branch type: `feat`, `fix`, `chore`, `docs`, `release`. Auto-detected from labels if not provided. Note: `fix` handles both regular bugs and hotfixes (see Step 3b) |
| `title`   | No       | Custom title. Fetches from GitHub issue if not provided                                                                                                             |

---

## Artifact System

This skill creates a structured documentation folder for each task:

```
.ai-context/
└── task-outputs/
    └── GH-{number}/
        ├── 00-task-overview.md      # Issue details, acceptance criteria
        ├── 01-setup.md              # Branch info, environment setup
        ├── 02-analysis.md           # Codebase analysis (created during analysis)
        ├── 03-implementation-plan.md # Implementation + TESTING PLAN (TDD)
        ├── 04-implementation-log.md  # Change log (updated during work)
        ├── 05-testing-results.md     # Test outcomes (created during testing)
        ├── 06-review-notes.md        # PR review notes (created during review)
        └── images/                   # Downloaded images from issue
```

### Artifact Lifecycle

| #   | Artifact                 | Created By                | Contains                                                           |
| --- | ------------------------ | ------------------------- | ------------------------------------------------------------------ |
| 00  | `task-overview.md`       | `/start-task`             | Issue details, acceptance criteria, images                         |
| 01  | `setup.md`               | `/start-task`             | Branch info, environment, quick links                              |
| 02  | `analysis.md`            | `/start-task`             | **Automatically created** - Relevant files, patterns, requirements |
| 03  | `implementation-plan.md` | Planning phase            | **Testing Plan (TDD)** + Implementation steps                      |
| 04  | `implementation-log.md`  | Implementation            | Changes, decisions, commits, quality checks                        |
| 05  | `testing-results.md`     | `/run-tests`, `/e2e-eval` | Test results, coverage, manual testing                             |
| 06  | `review-notes.md`        | PR review                 | Review comments, responses                                         |

**Benefits:**

- Track progress across sessions
- Document decisions and rationale
- **Test-first planning with TDD**
- Easy handoff to other developers
- Audit trail for changes
- Context preservation for AI assistance

---

## Branch Format

```
{type}/GH-{number}_{Title}
```

### Branch Types

| Type      | Purpose                     | GitHub Labels                    |
| --------- | --------------------------- | -------------------------------- |
| `feat`    | New feature                 | `feature`, `enhancement`         |
| `fix`     | Bug fix (regular or hotfix) | `bug`, `fix`, `hotfix`, `urgent` |
| `chore`   | Maintenance/cleanup         | `chore`, `maintenance`           |
| `docs`    | Documentation               | `documentation`, `docs`          |
| `release` | Release preparation         | `release`                        |

**Examples:**

- `feat/GH-42_User-Authentication`
- `fix/GH-15_Login-Redirect-Error`
- `chore/GH-88_Update-Dependencies`
- `docs/GH-92_API-Documentation`

---

## Workflow Steps

### Step 1: Parse Input

Extract ticket number from various formats:

- `42` → `42`
- `#42` → `42`
- `GH-42` → `42`
- `gh-42` → `42`

### Step 2: Fetch Issue Details

Use `mcp__github__get_issue` to fetch complete issue information:

```
mcp__github__get_issue({
  owner: "<repo-owner>",
  repo: "<repo-name>",
  issue_number: <number>
})
```

Extract:

- Title
- Description/body
- Labels (for branch type detection)
- Assignees
- Milestone
- Comments
- Any linked images

### Step 3: Determine Branch Type

**If type provided:** Use it directly.

**If type NOT provided:**

1. Check issue labels for type hints:
   - `bug`, `fix`, `hotfix`, `urgent` → `fix`
   - `feature`, `enhancement` → `feat`
   - `chore`, `maintenance` → `chore`
   - `documentation`, `docs` → `docs`
   - `release` → `release`

2. If no matching label, ask the user:

```
AskUserQuestion({
  questions: [{
    question: "What type of branch is this?",
    header: "Branch Type",
    options: [
      { label: "feat", description: "New feature or enhancement" },
      { label: "fix", description: "Bug fix" },
      { label: "chore", description: "Maintenance or cleanup task" },
      { label: "docs", description: "Documentation changes" }
    ],
    multiSelect: false
  }]
})
```

### Step 3b: Determine Source Branch (Fix Branches Only)

**CRITICAL:** When the branch type is `fix`, you MUST ask the user for the source branch.

Fix branches can be:

1. **Regular bug fix** → Branch from `develop` (goes through integration testing)
2. **Critical hotfix** → Branch from `main` (for urgent production issues)

**Ask the user:**

```
AskUserQuestion({
  questions: [{
    question: "Is this a regular bug fix or a critical production hotfix?",
    header: "Source",
    options: [
      { label: "develop (Recommended)", description: "Regular bug fix - branch from develop, PR to develop" },
      { label: "main", description: "Critical hotfix - branch from main, PR to main" }
    ],
    multiSelect: false
  }]
})
```

**Store the answer** - this determines:

1. Which branch to create from (source/startPoint)
2. Which branch to target when creating the PR (via `/submit-pr`)
3. Documentation in task artifacts

| User Choice | Source Branch | PR Target | Use Case                    |
| ----------- | ------------- | --------- | --------------------------- |
| `develop`   | `develop`     | `develop` | Regular bug fix, non-urgent |
| `main`      | `main`        | `main`    | Critical production hotfix  |

**For all other branch types:** Always use `develop` as source (no question needed).

### Step 4: Create Task Documentation Folder

Create the artifact directory structure:

```bash
mkdir -p .ai-context/task-outputs/GH-{number}/images
```

### Step 5: Download Issue Images

If the issue body or comments contain images:

1. Parse markdown for image URLs
2. Download each image to `.ai-context/task-outputs/GH-{number}/images/`
3. Name files descriptively: `01-screenshot.png`, `02-mockup.png`, etc.

### Step 6: Create Task Overview (00-task-overview.md)

Create the first artifact with all issue information:

```markdown
# Task Overview: GH-{number}

## Issue Details

| Field         | Value        |
| ------------- | ------------ |
| **Issue**     | #{number}    |
| **Title**     | {title}      |
| **Type**      | {type}       |
| **Labels**    | {labels}     |
| **Assignee**  | {assignee}   |
| **Milestone** | {milestone}  |
| **Created**   | {created_at} |

## Description

{issue body/description}

## Acceptance Criteria

{extracted from description or listed as bullet points}

## Comments Summary

{summary of relevant comments}

## Visual Context

{list of downloaded images with descriptions}

## Dependencies

- [ ] List any blocking issues
- [ ] External dependencies

## Missing Information

- [ ] Questions that need clarification
```

### Step 6b: Set Git Working Directory

**REQUIRED before any git MCP operations.**

```
mcp__git__git_set_working_dir({
  path: "{project_root_directory}",
  validateGitRepo: true,
  includeMetadata: true
})
```

This prevents the error: "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first."

The `includeMetadata: true` option returns useful repository context (status, branches, remotes, recent commits).

### Step 7: Git Branch Setup

**Determine source branch:**

- For `fix` branches: Use the source from Step 3b (`develop` or `main`)
- For all other types: Always use `develop`

1. **Fetch latest from origin:**

   ```
   mcp__git__git_fetch({ remote: "origin" })
   ```

2. **Checkout and pull source branch:**

   ```
   // Use {source_branch} from Step 3b (for fix) or "develop" (for others)
   mcp__git__git_checkout({ target: "{source_branch}" })
   mcp__git__git_pull({ branch: "{source_branch}" })
   ```

3. **Generate branch name:**
   - Format title: Replace spaces with `-`, remove special chars, Title-Case
   - Limit to ~50 characters at word boundary
   - Pattern: `{type}/GH-{number}_{Formatted-Title}`

4. **Create and checkout branch:**
   ```
   mcp__git__git_branch({
     operation: "create",
     name: "<branch-name>",
     startPoint: "{source_branch}"  // "develop" or "main" for fix branches
   })
   mcp__git__git_checkout({ target: "<branch-name>" })
   ```

### Step 8: Create Setup Documentation (01-setup.md)

Document the branch setup:

```markdown
# Setup: GH-{number}

## Branch Information

| Field         | Value             |
| ------------- | ----------------- |
| **Branch**    | `{branch-name}`   |
| **Source**    | `{source_branch}` |
| **PR Target** | `{pr_target}`     |
| **Created**   | {timestamp}       |

## Source Branch Context

{For fix branches only - explain why this source was chosen}

**Source:** `{source_branch}`
**Reason:** {One of the following}

- Regular bug fix - branched from `develop`, will PR to `develop` for integration testing
- Critical hotfix - branched from `main`, will PR directly to `main` for immediate deployment

## Git Status

{output of git status}

## Environment

- Node.js: {version}
- Package Manager: {npm/yarn/pnpm}
- Framework: Next.js {version}

## Quick Links

- [GitHub Issue](https://github.com/{owner}/{repo}/issues/{number})
- [Task Artifacts](./)

## Next Steps

1. Analyze codebase → Creates `02-analysis.md` (with Design Questions brief)
2. Design session → `/brainstorming` creates spec in `docs/superpowers/specs/`
3. Implementation plan → `/writing-plans` creates `03-implementation-plan.md`
4. Implement with TDD → Updates `04-implementation-log.md`
5. Run tests → Creates `05-testing-results.md`
6. Submit PR → `/submit-pr` (will target `{pr_target}`)
```

### Step 9: Display Setup Summary

Output a brief setup summary (analysis will follow automatically):

```markdown
## Setup Complete

| Field      | Value           |
| ---------- | --------------- |
| **Issue**  | #42 - {title}   |
| **Type**   | {type}          |
| **Branch** | `{branch-name}` |

Created: `00-task-overview.md`, `01-setup.md`

**Proceeding to codebase analysis...**
```

---

## Phase 2: Automatic Analysis

> **CRITICAL: This phase runs automatically after setup. Do NOT stop after Step 9.**

### Step 10: Analyze Codebase

Based on the task requirements, automatically analyze the codebase:

1. **Identify relevant areas** from the issue description:
   - Keywords, feature names, component names
   - Technical requirements mentioned
   - Files or patterns referenced

2. **Search the codebase** using Glob and Grep:

   ```
   # Find related files
   Glob({ pattern: "**/*{keyword}*" })

   # Search for patterns
   Grep({ pattern: "relevant-pattern", path: "src/" })
   ```

3. **Read existing implementations**:
   - Similar features in the codebase
   - Existing patterns that should be followed
   - Infrastructure (API clients, hooks, services)

4. **Document findings** for each relevant area:
   - File paths and purposes
   - Existing patterns to follow
   - Gaps between requirements and existing code

### Step 11: Create Analysis Artifact (02-analysis.md)

Create `.ai-context/task-outputs/GH-{number}/02-analysis.md`:

```markdown
# Analysis: GH-{number}

## Task Summary

{Brief description of what needs to be done}

## Relevant Files

| File               | Purpose     | Action Needed     |
| ------------------ | ----------- | ----------------- |
| `src/features/...` | Description | Modify/Create/Use |
| `src/shared/...`   | Description | Reference         |

## Existing Patterns

### Pattern 1: {Name}

- **Location**: `path/to/example`
- **Description**: How it works
- **Relevance**: Why it matters for this task

### Pattern 2: {Name}

{repeat as needed}

## Requirements Analysis

| Requirement     | Existing Support | Gap/Action      |
| --------------- | ---------------- | --------------- |
| {Requirement 1} | {What exists}    | {What's needed} |
| {Requirement 2} | {What exists}    | {What's needed} |

## Technical Considerations

- {Consideration 1}
- {Consideration 2}
- {Performance, breaking changes, migrations, etc.}

## Implementation Summary

### Files to Create

- `path/to/new/file.tsx` - Description

### Files to Modify

- `path/to/existing/file.tsx` - What to change

### Key Insights

- {Insight 1}
- {Insight 2}

## Questions/Blockers

- [ ] {Any clarifications needed}

## Design Questions

> Seed context for /brainstorming. These questions were surfaced by codebase analysis
> and will drive the clarifying questions phase.

### What we know (pre-answered by analysis)

- Relevant files: [list key files from Relevant Files table above]
- Existing patterns to follow: [list key patterns from Existing Patterns above]
- Hard constraints: [migrations needed, breaking changes, DB schema impacts — or "None identified"]

### Open questions for design dialogue

- [ ] {Genuine unknown 1 surfaced during analysis — e.g., "Should this be a new hook or extend the existing one?"}
- [ ] {Genuine unknown 2 — e.g., "Does this belong in the feature layer or shared?"}

> If no real unknowns exist, this list may have 0–1 items. Brainstorming will move quickly to approach proposals.

### Suggested design scope

{1–2 sentences on what a complete implementation covers, derived from the issue requirements and analysis findings}
```

### Step 12: Display Analysis Summary

After creating 02-analysis.md, show a brief handoff message:

```markdown
## Analysis Complete

### Artifacts Created

| File                  | Status                                       |
| --------------------- | -------------------------------------------- |
| `00-task-overview.md` | ✅ Created                                   |
| `01-setup.md`         | ✅ Created                                   |
| `02-analysis.md`      | ✅ Created (includes Design Questions brief) |

### Key Findings

- {count} relevant files identified
- {count} existing patterns documented
- {count} open design questions surfaced

**Proceeding to design dialogue...**
```

> **Do NOT add "Ready for Implementation" or Related Skills here.** The next step is brainstorming, not implementation.

### Step 13: Hand off to brainstorming

> **CRITICAL: This is the terminal step. Invoke brainstorming automatically — do NOT wait for the user to ask.**

Invoke the brainstorming skill with pre-loaded context:

```
Skill('superpowers:brainstorming', args: `
  Context pre-loaded from start-task for GH-{number}.

  Before starting:
  1. Read .ai-context/task-outputs/GH-{number}/02-analysis.md
  2. Skip the "Explore project context" step — codebase analysis is already done
  3. Open the dialogue using the "Design Questions" section of 02-analysis.md as your agenda

  Start your first message with:
  "I've reviewed the codebase analysis for GH-{number}. [Summarize what we know in 1-2 sentences.]
   I want to understand [first open question from Design Questions]..."

  Then continue the normal brainstorming flow:
  - Clarifying questions (one at a time, using Design Questions as agenda)
  - 2–3 approach proposals with trade-offs
  - Design sections presented for approval
  - Spec doc written to docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
  - GitHub issue comment posted with design decisions (if issue exists)
  - writing-plans invoked as terminal step
`)
```

**GitHub issue comment** (posted by brainstorming after spec approval, before writing-plans):

```markdown
## Design Decision — {YYYY-MM-DD}

**Approach chosen:** {one-sentence summary of the selected approach}

**Key decisions:**

- {Decision 1}
- {Decision 2}

**Constraints identified:**

- {Hard constraints surfaced during brainstorming — or "None"}

**Spec:** `docs/superpowers/specs/{YYYY-MM-DD}-{topic}-design.md`
**Implementation plan:** Will be created at `.ai-context/task-outputs/GH-{number}/03-implementation-plan.md`
```

Post via: `mcp__github__add_issue_comment({ owner, repo, issue_number: {number}, body: comment })`

Only post if a GitHub issue exists (branch contains `GH-{number}` and issue was successfully fetched in Step 2). Skip silently if no issue.

---

## Artifact Templates

### 02-analysis.md (Created During Analysis Phase)

```markdown
# Analysis: GH-{number}

## Branch Context

| Field         | Value             |
| ------------- | ----------------- |
| **Branch**    | `{branch-name}`   |
| **Type**      | `{type}`          |
| **Source**    | `{source_branch}` |
| **PR Target** | `{pr_target}`     |

{For fix branches, include this section:}

### Fix Branch Strategy

**Source Branch:** `{source_branch}`
**Target Branch:** `{pr_target}`
**Rationale:** {One of:}

- **Regular Fix (develop → develop):** This fix is not urgent. It will go through the normal integration testing process in `develop` before being released.
- **Hotfix (main → main):** This is a critical production issue that needs immediate deployment. The fix branches from `main` and will be merged directly to `main`.

{If hotfix, add:}

> ⚠️ **Hotfix Note:** After this PR is merged to `main`, ensure the fix is also cherry-picked or merged into `develop` to prevent regression.

## Relevant Files

| File               | Purpose | Action Needed |
| ------------------ | ------- | ------------- |
| `src/features/...` | ...     | Modify        |
| `src/shared/...`   | ...     | Use           |

## Existing Patterns

### Component Pattern

{describe existing component patterns in codebase}

### Data Fetching Pattern

{describe how data is fetched}

### State Management Pattern

{describe state management approach}

## Requirements Analysis

| Requirement | Existing Support | Gap |
| ----------- | ---------------- | --- |
| ...         | ...              | ... |

## Technical Considerations

- Performance implications
- Breaking changes
- Migration needs
  {For hotfixes, add:}
- Impact on current `develop` branch (need to sync after merge)

## Questions/Blockers

- [ ] Any clarifications needed

## Design Questions

> Seed context for /brainstorming. These questions were surfaced by codebase analysis
> and will drive the clarifying questions phase.

### What we know (pre-answered by analysis)

- Relevant files: [list key files from Relevant Files table above]
- Existing patterns to follow: [list key patterns from Existing Patterns above]
- Hard constraints: [migrations needed, breaking changes, DB schema impacts — or "None identified"]

### Open questions for design dialogue

- [ ] {Genuine unknown 1 surfaced during analysis}
- [ ] {Genuine unknown 2 — if any}

> If no real unknowns exist, this list may have 0–1 items. Brainstorming will move quickly to approach proposals.

### Suggested design scope

{1–2 sentences on what a complete implementation covers, derived from the issue requirements and analysis findings}
```

### 03-implementation-plan.md (Created During Planning Phase)

````markdown
# Implementation Plan: GH-{number}

## Overview

Brief description of the implementation approach.

## Files to Modify/Create

| File      | Action | Description   |
| --------- | ------ | ------------- |
| `src/...` | Create | New component |
| `src/...` | Modify | Add feature   |

---

## Testing Plan (TDD - Write Tests First)

> **TDD Cycle:** RED (write failing test) → GREEN (minimal code to pass) → REFACTOR (improve while green)

### Unit Tests to Write

| Test File                | Test Cases                   | Priority |
| ------------------------ | ---------------------------- | -------- |
| `ComponentName.test.tsx` | render, interactions, states | High     |
| `useHookName.test.ts`    | return values, side effects  | High     |
| `utilityName.test.ts`    | input/output, edge cases     | Medium   |

### Test Scenarios

#### Component: {ComponentName}

| Scenario                   | Expected Behavior          | Priority |
| -------------------------- | -------------------------- | -------- |
| Renders with default props | Shows expected UI elements | High     |
| Handles user click         | Calls onClick handler      | High     |
| Displays loading state     | Shows spinner/skeleton     | Medium   |
| Displays error state       | Shows error message        | Medium   |
| Handles empty data         | Shows empty state message  | Low      |

#### Hook: {useHookName}

| Scenario       | Expected Behavior              | Priority |
| -------------- | ------------------------------ | -------- |
| Initial state  | Returns correct initial values | High     |
| After action   | State updates correctly        | High     |
| Error handling | Returns error state            | Medium   |
| Cleanup        | Cleans up on unmount           | Medium   |

#### Utility: {utilityName}

| Input           | Expected Output         | Edge Case? |
| --------------- | ----------------------- | ---------- |
| Normal input    | Expected result         | No         |
| Empty input     | Default/empty result    | Yes        |
| Invalid input   | Throws or returns error | Yes        |
| Boundary values | Correct handling        | Yes        |

### E2E Tests (if applicable)

| User Flow   | Steps                                    | Expected Outcome      |
| ----------- | ---------------------------------------- | --------------------- |
| {Flow name} | 1. Navigate to... 2. Click... 3. Fill... | Success message shown |

### Test Coverage Goals

| Metric     | Target | Notes                |
| ---------- | ------ | -------------------- |
| Statements | 80%+   | New code only        |
| Branches   | 70%+   | Cover main paths     |
| Functions  | 80%+   | All public functions |
| Lines      | 80%+   | New code only        |

---

## Implementation Steps

### Step 1: Write Failing Tests (RED)

**Test Files to Create:**

- `src/features/.../ComponentName.test.tsx`
- `src/features/.../useHookName.test.ts`

**Test Cases:**

```typescript
describe("ComponentName", () => {
  it("should render correctly", () => {
    // Test implementation
  });

  it("should handle user interaction", () => {
    // Test implementation
  });
});
```
````

**Run:** `/run-tests` - Expect: FAIL (tests written, no implementation)

### Step 2: Implement Minimal Code (GREEN)

**Files:** `path/to/file.tsx`

**Changes:**

- Change 1
- Change 2

**Run:** `/run-tests` - Expect: PASS

### Step 3: Refactor (Keep GREEN)

**Improvements:**

- Extract shared logic
- Improve naming
- Add types

**Run:** `/run-tests` - Expect: PASS (still)

### Step 4: {Next Feature}

Repeat RED → GREEN → REFACTOR cycle.

---

## Pre-PR Checklist

- [ ] All unit tests pass (`/run-tests`)
- [ ] All E2E tests pass (`/e2e-eval`)
- [ ] Coverage meets targets
- [ ] No skipped tests
- [ ] Edge cases covered
- [ ] Tests are meaningful (not just for coverage)

## Rollback Plan

Steps to revert if needed.

````

### 04-implementation-log.md (Updated During Implementation)

```markdown
# Implementation Log: GH-{number}

## Progress

| Step | Status | Notes |
|------|--------|-------|
| 1. ... | ✅ Done | ... |
| 2. ... | 🔄 In Progress | ... |
| 3. ... | ⏳ Pending | ... |

## Changes Made

### {timestamp} - {description}

**Files Modified:**
- `path/to/file.tsx` - {what changed}

**Design Decisions:**
- Decision 1: Reason

**Commits:**
- `abc123` - commit message

## Quality Checks

| Check | Status | Notes |
|-------|--------|-------|
| Format | ✅ | `npm run format` |
| Lint | ✅ | `npm run lint` |
| Types | ✅ | `npm run typecheck` |
| Build | ✅ | `npm run build` |
| Tests | ✅ | `npm run test` |

## Blockers Encountered

- Blocker 1: How resolved
````

### 05-testing-results.md (Created During Testing Phase)

```markdown
# Testing Results: GH-{number}

## Unit Tests

### New Tests Added

| Test File            | Tests | Status  |
| -------------------- | ----- | ------- |
| `Component.test.tsx` | 5     | ✅ Pass |
| `useHook.test.ts`    | 3     | ✅ Pass |

### Test Coverage

| File | Statements | Branches | Functions | Lines |
| ---- | ---------- | -------- | --------- | ----- |
| ...  | ...%       | ...%     | ...%      | ...%  |

## E2E Tests

### Scenarios Tested

| Scenario    | Browser | Status  |
| ----------- | ------- | ------- |
| User can... | Chrome  | ✅ Pass |
| User can... | Firefox | ✅ Pass |

## Regression Testing

| Existing Feature | Status  | Notes      |
| ---------------- | ------- | ---------- |
| Login flow       | ✅ Pass | No changes |
| ...              | ...     | ...        |

## Manual Testing Checklist

- [ ] Tested on Chrome
- [ ] Tested on Firefox
- [ ] Tested on mobile viewport
- [ ] Tested with keyboard navigation
- [ ] Tested with screen reader
```

---

## Error Handling

### Issue Not Found

```
Error: GitHub issue #999 not found.

Please verify:
1. The issue number is correct
2. The issue exists in this repository
3. You have access to view the issue
```

### Already on a Task Branch

```
Warning: You're currently on branch `feat/GH-42_Other-Task`.

Options:
1. Switch anyway (uncommitted changes may be lost)
2. Cancel and commit current changes first
3. Use /checkpoint to save current progress
```

### Branch Already Exists

```
Warning: Branch `feat/GH-42_User-Auth` already exists.

Options:
1. Switch to existing branch
2. Delete and recreate (if no remote)
3. Create with different name
4. Cancel
```

### Uncommitted Changes

```
Warning: You have uncommitted changes.

Options:
1. Stash changes and continue
2. Commit changes first (/commit-push)
3. Save checkpoint (/checkpoint)
4. Cancel
```

---

## Implementation Notes

### For Claude (executing this skill):

> **CRITICAL: Do NOT stop after creating 00 and 01 artifacts. You MUST continue to Phase 2 (Analysis) automatically.**

1. **Always use MCP tools** for git and GitHub operations
2. **Parse ticket flexibly** - accept #42, GH-42, or just 42
3. **Format titles consistently** - Title-Case with hyphens
4. **Auto-detect branch type** from labels when possible
5. **For fix branches, ALWAYS ask for source branch** (develop or main) - see Step 3b
6. **Create all artifacts** in `.ai-context/task-outputs/GH-{number}/`
7. **Download images** from issue body and comments
8. **Handle errors gracefully** with helpful messages
9. **Verify source branch** is up to date before branching (develop or main depending on fix type)
10. **Document source branch choice** in 01-setup.md and 02-analysis.md for fix branches
11. **ALWAYS proceed to Phase 2** - After creating 00 and 01, automatically analyze the codebase and create 02-analysis.md
12. **Use Task tool with Explore agent** for complex codebase analysis to find relevant files and patterns
13. **ALWAYS invoke brainstorming at Step 13** - Do NOT end at analysis. The brainstorming handoff is automatic and non-optional. The Design Questions section of 02-analysis.md is the brief; brainstorming reads it and skips its own context-gathering step.

### Title Formatting Function

```
Input: "Add user authentication feature!"
Output: "Add-User-Authentication-Feature"

Rules:
1. Remove special characters except hyphens
2. Replace spaces with hyphens
3. Title-Case each word
4. Remove consecutive hyphens
5. Trim to ~50 chars at word boundary
```

### Image Download

```
Regex for markdown images: /!\[([^\]]*)\]\(([^)]+)\)/g

For each image:
1. Extract URL
2. Determine file extension
3. Download to images/ folder
4. Update reference in 00-task-overview.md
```

---

## Examples

### Example 1: Full Command with Type

```
/start-task GH-42 feat
```

**Creates:**

- Branch: `feat/GH-42_Add-User-Authentication`
- Folder: `.ai-context/task-outputs/GH-42/`
- Files: `00-task-overview.md`, `01-setup.md`

### Example 2: Auto-Detect Type from Labels

```
/start-task 42
```

**If issue #42 has label `bug`:**

- Auto-selects type: `fix`
- Branch: `fix/GH-42_Login-Error`

### Example 3: Natural Language

```
Start working on issue 88 as a chore
```

**Creates:**

- Branch: `chore/GH-88_Update-Dependencies`
- Full artifact folder with documentation

### Example 4: Custom Title

```
/start-task 15 fix "Login Bug"
```

**Creates:**

- Branch: `fix/GH-15_Login-Bug`
- Uses custom title instead of issue title

---

## Related Skills

| Skill                                              | Purpose                     | When to Use                      |
| -------------------------------------------------- | --------------------------- | -------------------------------- |
| [Run Tests](../run-tests/SKILL.md)                 | Unit testing with Vitest    | After writing/modifying code     |
| [E2E Eval](../e2e-eval/SKILL.md)                   | E2E testing with Playwright | Before submitting PR             |
| [Submit PR](../submit-pr/SKILL.md)                 | Create pull request         | When implementation complete     |
| [Commit Push](../commit-push/SKILL.md)             | Commit and push changes     | During implementation            |
| [Checkpoint](../checkpoint/SKILL.md)               | Save progress               | End of session or context switch |
| [Resume Checkpoint](../resume-checkpoint/SKILL.md) | Resume saved work           | Starting new session             |

---

## Related Rules

- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch naming conventions
- [Testing Rules](../../rules/testing.md) - TDD requirements and best practices
- [Git Safety](../../../docs/lessons/git-safety.md) - Git safety and commit guidelines
