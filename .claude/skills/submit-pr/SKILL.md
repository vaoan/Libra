---
name: submit-pr
description: Submit a pull request to the target branch. Handles commit creation, pushing, and PR submission with proper descriptions.
---

# Submit PR

## ⛔ Git Safety Warning

> **This skill commits and pushes code. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/submit-pr" or "submit a PR" or "create a pull request"
> - Do NOT run this skill automatically after completing work
> - Do NOT suggest running this skill
> - Wait for explicit user request
> - **NEVER use `--no-verify` on any git command** (commit, push, merge). All hooks must run.

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Submits a pull request for the current branch. Handles all aspects of PR creation including:

- Committing uncommitted changes
- Pushing to remote (git hooks run quality checks automatically)
- Creating or updating a PR with proper description
- Linking to GitHub issues
- **Monitoring CI checks and auto-fixing failures** (up to 5 iterations)

> **Note:** Quality checks (format, lint, build) are handled by git hooks during commit/push, not by this skill.
> After the PR is created, the skill enters a CI monitoring loop that watches for failures, analyzes logs, applies fixes, and re-pushes until all checks pass. Use `--no-monitor` to skip this phase.

## Usage

```
/submit-pr [options]
```

Or natural language:

```
Submit a PR for this branch
Create a pull request
Push and create PR
```

## Parameters

| Parameter      | Required | Description                                  |
| -------------- | -------- | -------------------------------------------- |
| `--draft`      | No       | Create as draft PR                           |
| `--no-monitor` | No       | Skip CI monitoring (just create PR and exit) |

---

## Branch Targeting

> **See [Branch Targeting Rules](../../../docs/lessons/git-workflow.md#critical-rule-branch-targeting) for complete documentation.**

**Quick reference:**

- `release/*` → always targets `main`
- `fix/*` → ask user (develop for regular fixes, main for hotfixes)
- All other branches → always target `develop`

---

## Execution Steps

### Step 1: Initialize Task Tracking

Create a todo list to track progress:

```
TodoWrite([
  { content: "Check current branch and status", status: "in_progress", activeForm: "Checking branch status" },
  { content: "Stage and commit changes", status: "pending", activeForm: "Committing changes" },
  { content: "Push to remote", status: "pending", activeForm: "Pushing to remote" },
  { content: "Create or update PR", status: "pending", activeForm: "Creating pull request" },
  { content: "Monitor CI and fix failures", status: "pending", activeForm: "Monitoring CI checks" }
])
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

### Step 2: Check Current Branch and Determine Target

**Using MCP Git tools:**

```
mcp__git__git_status()
mcp__git__git_branch({ operation: "show-current" })
```

**Validate:**

1. Not on `main` or `develop` branch (protected branches)
2. Extract ticket number from branch name (e.g., `feat/GH-42_Title` → `42`)
3. Determine branch type from prefix (`feat`, `fix`, `chore`, `release`)

**If on protected branch:**

```
Error: Cannot create PR from protected branch '{branch}'.
Please create a feature branch first using /start-task.
```

**CRITICAL: Determine Target Branch:**

```javascript
function getTargetBranch(branchName, userChoice = null) {
  // Release branches ALWAYS go to main
  if (branchName.startsWith("release/")) {
    return "main";
  }

  // Fix branches can go to EITHER - ASK USER
  if (branchName.startsWith("fix/")) {
    // userChoice will be provided after asking
    return userChoice; // 'develop' or 'main'
  }

  // ALL other branches go to develop
  return "develop";
}
```

**For fix/\* branches, ASK the user:**

```
AskUserQuestion({
  questions: [{
    question: "This is a fix branch. Where should this PR target?",
    header: "Target",
    options: [
      { label: "develop (Recommended)", description: "Regular bug fix - goes through integration testing" },
      { label: "main", description: "Critical hotfix - deploys directly to production" }
    ],
    multiSelect: false
  }]
})
```

**Validation Example:**

| Current Branch        | Target       | Reason                                |
| --------------------- | ------------ | ------------------------------------- |
| `feat/GH-42_Login`    | `develop`    | Feature branch - always develop       |
| `chore/GH-88_Deps`    | `develop`    | Chore branch - always develop         |
| `release/GH-100_v1.0` | `main`       | Release branch - always main          |
| `fix/GH-99_Hotfix`    | **ASK USER** | Fix can be regular or hotfix          |
| `ai-structure`        | `develop`    | No valid prefix - defaults to develop |

**If branch cannot target main:**

```
Error: Cannot target 'main' from '{branch}'.

Only release/* and fix/* branches can merge to main.
Your branch type '{type}' must target 'develop'.

This is a critical rule to protect production code.
```

### Step 3: Stage and Commit Changes

**Check for uncommitted changes:**

```
mcp__git__git_status()
```

**If changes exist:**

1. Stage all changes:

   ```
   mcp__git__git_add({ files: ["."] })
   ```

2. Generate commit message following conventional commits:

   ```
   {type}({scope}): {description} [GH-{number}]

   {detailed_description}

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

3. Create commit:
   ```
   mcp__git__git_commit({
     message: "{generated_message}"
   })
   ```

### Step 4: Push to Remote

**Check if branch exists on remote:**

```
mcp__git__git_remote({ mode: "list" })
```

**Push with upstream tracking:**

```
mcp__git__git_push({
  setUpstream: true,
  branch: "{current_branch}"
})
```

**Fallback to CLI if MCP fails:**

```bash
git push -u origin {current_branch}
```

### Step 5: Check for Existing PR

**Using MCP GitHub tools:**

```
mcp__github__list_pull_requests({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  state: "open",
  head: "{owner}:{branch}"
})
```

**Determine action:**

- If PR exists → Update existing PR
- If no PR → Create new PR

### Step 6: Get Issue Details (if ticket found)

**If branch has ticket number (GH-XXX):**

```
mcp__github__get_issue({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  issue_number: {number}
})
```

Extract:

- Issue title
- Issue description
- Labels

### Step 7: Generate PR Description

**PR Title Format:**

```
{type}({scope}): {description} [GH-{number}]
```

**PR Body Template:**

```markdown
## Summary

{Brief description of changes based on commits and issue}

## Related Issue

Closes #{issue_number}

## Changes

- {Change 1 from commits}
- {Change 2 from commits}
- {Change 3 from commits}

## Testing

{Testing instructions or checklist}

---

Generated with [Claude Code](https://claude.com/claude-code)
```

### Step 8: Create or Update PR

**Create New PR:**

```
mcp__github__create_pull_request({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  title: "{pr_title}",
  body: "{pr_body}",
  head: "{current_branch}",
  base: "{target_branch}",  // Usually "develop"
  draft: {is_draft}
})
```

**Update Existing PR:**

```
mcp__github__github_update_pull_request({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number},
  title: "{pr_title}",
  body: "{pr_body}"
})
```

**Fallback to CLI if MCP fails:**

```bash
# Create PR
gh pr create --title "{title}" --body "{body}" --base {base} [--draft]

# Update PR
gh pr edit {pr_number} --title "{title}" --body "{body}"
```

### Step 9: Display Summary

```markdown
## PR Submitted Successfully

**PR:** #{pr_number} - {pr_title}
**URL:** {pr_url}
**Status:** {draft ? "Draft" : "Ready for Review"}
**Base:** {base_branch}

{is_new ? "Created new PR" : "Updated existing PR"}
```

### Step 10: Monitor CI and Auto-Fix Loop

After the PR is created/updated, enter a CI monitoring loop that watches for failures, fixes them, and re-pushes until all checks pass.

**Overview:**

```
┌─────────────────────────────────────────┐
│  Push complete / PR created             │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Wait for CI run to start               │
│  gh run list --branch {branch} --limit 1│
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│  Watch CI run until completion          │
│  gh run watch {run_id}                  │
└────────────────┬────────────────────────┘
                 ▼
           ┌─────┴─────┐
           │ CI Passed? │
           └─────┬─────┘
          Yes    │    No
           │     │     │
           ▼     │     ▼
┌──────────┐  ┌──────────────────────────┐
│  Done!   │  │  Download failure logs    │
│  Report  │  │  gh run view {id} --log  │
│  success │  └───────────┬──────────────┘
└──────────┘              ▼
              ┌──────────────────────────┐
              │  Analyze failures        │
              │  Identify root cause     │
              │  Apply fixes             │
              └───────────┬──────────────┘
                          ▼
              ┌──────────────────────────┐
              │  Commit & Push fixes     │
              │  (triggers new CI run)   │
              └───────────┬──────────────┘
                          ▼
                  (Back to Watch CI)
```

**Maximum iterations:** 5 (to prevent infinite loops)

#### Step 10a: Wait for CI Run to Start

```bash
# Wait a few seconds for CI to trigger, then find the latest run
gh run list --branch {current_branch} --limit 1 --json databaseId,status,conclusion,name,createdAt
```

If no run found after waiting, inform the user and exit the loop.

#### Step 10b: Watch the CI Run

```bash
# Watch the run until it completes (blocking)
gh run watch {run_id} --exit-status
```

If the command exits with code 0, CI passed. Otherwise, CI failed.

#### Step 10c: On CI Failure — Analyze Logs

```bash
# Get the failed run details
gh run view {run_id} --json jobs

# For each failed job, get logs
gh run view {run_id} --log-failed
```

**Parse the logs to identify failure types:**

| Failure Type   | Log Pattern                        | Fix Strategy                                  |
| -------------- | ---------------------------------- | --------------------------------------------- |
| Lint errors    | `eslint`, `error`, rule names      | Run `pnpm lint --fix`, fix remaining manually |
| Type errors    | `error TS`, `typecheck`            | Fix TypeScript type issues                    |
| Test failures  | `FAIL`, `AssertionError`, `vitest` | Fix failing tests                             |
| Build errors   | `Build failed`, `Module not found` | Fix import/build issues                       |
| Format errors  | `Prettier`, `format:check`         | Run `pnpm format`                             |
| Security/audit | `pnpm audit`, `vulnerability`      | Update dependencies or document exceptions    |

#### Step 10d: Apply Fixes

Based on the failure type:

1. **Format issues:** Run `pnpm format` to auto-fix
2. **Lint issues:** Run `pnpm lint --fix`, then manually fix remaining errors
3. **Type errors:** Read the failing files, fix type issues
4. **Test failures:** Run failing tests locally, debug and fix
5. **Build errors:** Resolve import paths, missing modules, etc.

**After fixing, verify locally:**

```bash
# Run the same checks that CI runs
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

#### Step 10e: Commit and Push Fixes

```bash
# Stage fixed files (specific files, not -A)
git add {changed_files}

# Commit with descriptive message
git commit -m "fix(ci): {description of what was fixed} [GH-{number}]

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push (triggers new CI run)
git push
```

Then loop back to **Step 10a** to monitor the new CI run.

#### Step 10f: Loop Termination

The loop terminates when:

1. **All CI checks pass** → Report success
2. **Max iterations reached (5)** → Report remaining failures to user
3. **Unfixable error** (e.g., infrastructure issue, flaky external service) → Report to user with logs

**On success:**

```markdown
## CI Passed

All CI checks are green after {iteration_count} iteration(s).

**PR:** #{pr_number} - {pr_title}
**URL:** {pr_url}
**Status:** Ready for Review
```

**On max iterations reached:**

```markdown
## CI Still Failing After {max_iterations} Fix Attempts

**PR:** #{pr_number}
**URL:** {pr_url}

### Remaining Failures

- {failure_1_description}
- {failure_2_description}

### What Was Fixed

- Iteration 1: {fix_description}
- Iteration 2: {fix_description}
  ...

Please review the remaining failures manually.
```

**On unfixable error:**

```markdown
## CI Failure — Manual Intervention Required

The following CI failure cannot be auto-fixed:

**Job:** {job_name}
**Error:** {error_summary}
**Reason:** {why_it_cannot_be_auto_fixed}

This may be caused by:

- Infrastructure/network issues
- Flaky external dependencies
- Secrets or environment configuration
- Issues outside the codebase
```

---

## MCP Tool Strategy

### Available MCP Tools

**Git Operations (mcp**git**):**

- `git_status` - Check working tree status
- `git_branch` - Branch operations
- `git_add` - Stage files
- `git_commit` - Create commits
- `git_push` - Push to remote
- `git_log` - View commit history
- `git_diff` - View changes

**GitHub Operations (mcp**github**):**

- `list_pull_requests` - List PRs
- `create_pull_request` - Create new PR
- `github_update_pull_request` - Update existing PR
- `get_pull_request` - Get PR details
- `get_issue` - Get issue details

### Fallback Strategy

1. **Try MCP tools first** - They provide better integration
2. **Fall back to CLI** - If MCP fails, use `gh` and `git` commands
3. **Report failures** - Always inform user of issues

---

## Examples

### Example 1: Basic PR Submission

```
/submit-pr
```

**Output:**

```
## PR Submitted Successfully

**PR:** #12 - feat(auth): add login form validation [GH-42]
**URL:** https://github.com/owner/repo/pull/12
**Status:** Ready for Review
**Base:** develop

Created new PR

### Next Steps
- Review the PR at the URL above
- Request reviewers if needed
- Address any CI/CD feedback
```

### Example 2: Draft PR

```
/submit-pr --draft
```

**Output:**

```
## PR Submitted Successfully

**PR:** #13 - fix(api): handle null response [GH-15]
**URL:** https://github.com/owner/repo/pull/13
**Status:** Draft
**Base:** develop

Created new PR as draft
```

### Example 3: Update Existing PR

```
/submit-pr
```

**Output:**

```
## PR Updated Successfully

**PR:** #12 - feat(auth): add login form validation [GH-42]
**URL:** https://github.com/owner/repo/pull/12
**Status:** Ready for Review

Updated existing PR with new commits
```

---

## Error Handling

### Protected Branch Error

```
Error: Cannot create PR from 'main'.

You're on a protected branch. Create a feature branch first:

/start-task GH-{number} {type}
```

### Push Failure

```
Error: Failed to push to remote.

Possible causes:
1. No network connection
2. Authentication issues
3. Remote branch has new commits

Try: git pull --rebase origin {branch}
```

### PR Creation Failure

```
Error: Failed to create PR via MCP.

Falling back to GitHub CLI...

If this also fails, create the PR manually:
https://github.com/{owner}/{repo}/compare/{base}...{branch}
```

---

## Configuration

### Target Branch Detection

The skill determines the target branch using these rules:

| Branch Pattern | Target              | User Choice?        |
| -------------- | ------------------- | ------------------- |
| `release/*`    | `main`              | No - always main    |
| `fix/*`        | `develop` or `main` | **Yes - ask user**  |
| `feat/*`       | `develop`           | No - always develop |
| `chore/*`      | `develop`           | No - always develop |
| `refactor/*`   | `develop`           | No - always develop |
| Any other      | `develop`           | No - always develop |

**Fix branches are special:**

- Regular bug fixes → target `develop` (goes through integration)
- Critical hotfixes → target `main` (deploys to production immediately)
- The skill MUST ask the user which target to use

**There is NO way to override other branch types to target `main`.**

This is enforced because:

- `main` = production code only
- Only releases and intentional hotfixes go to production
- All feature work must integrate via `develop` first

### Repository Detection

Automatically detects repository info from:

```
mcp__git__git_remote({ mode: "get-url", name: "origin" })
```

Parses owner and repo from:

- `https://github.com/{owner}/{repo}.git`
- `git@github.com:{owner}/{repo}.git`

---

## Implementation Notes

### For Claude (executing this skill):

1. **Always use TodoWrite** to track progress through steps
2. **Use MCP tools first**, fall back to CLI only on failure
3. **Parse branch name** to extract ticket number and type
4. **Generate meaningful PR descriptions** from commits and issues
5. **Handle all error cases** with helpful messages
6. **Support both new and existing PRs** (detect and handle appropriately)
7. **Monitor CI after PR creation** using `gh run list` and `gh run watch`
8. **Auto-fix CI failures** by analyzing logs, applying fixes, committing, and pushing
9. **Loop up to 5 times** — stop and report if failures persist
10. **Skip CI monitoring** if `--no-monitor` flag is passed
11. **NEVER skip hooks** — Do not use `--no-verify` on `git commit`, `git push`, or `git merge`. If a hook fails, fix the underlying issue and retry. Bypassing hooks masks real problems and can push broken code.

### Commit Message Generation

When generating commit messages:

1. Analyze staged changes using `git_diff`
2. Determine scope from changed files/folders
3. Write concise but descriptive message
4. Always include ticket reference `[GH-XXX]`
5. Add Co-Authored-By line

### PR Description Quality

Good PR descriptions include:

1. **Summary** - What and why (not how)
2. **Issue link** - Closes #XXX for auto-close
3. **Change list** - Bullet points of changes
4. **Testing** - How to verify the changes

---

## Related

- [Start Task](../start-task/SKILL.md) - `/start-task` to create branches
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch naming and targeting conventions
- [Git Safety](../../../docs/lessons/git-safety.md) - Git safety and commit guidelines
