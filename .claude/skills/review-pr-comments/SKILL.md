---
name: review-pr-comments
description: Review PR comments and address them with explicit user approvals.
---

# Review PR Comments

## ⛔ Git Safety Warning

> **This skill may commit and push after addressing comments. It requires explicit user approval at each step.**
>
> Requirements:
>
> - User must approve which comments to address
> - User must approve the code changes
> - User must explicitly say "commit" before committing
> - Do NOT auto-commit after making fixes

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Reviews pull request comments and presents them for user decision before making any code changes.

**This skill uses a task list to show progress during the review.**

## Usage

```
/review-pr-comments [pr_number]
```

Or natural language:

```
Review the PR comments
Check the comments on PR #42
Address the PR feedback
```

## Parameters

| Parameter   | Required | Description                                                       |
| ----------- | -------- | ----------------------------------------------------------------- |
| `pr_number` | No       | PR number to review. If not provided, finds PR for current branch |

---

## Critical Rules

### Rule 1: Never Auto-Fix

**NEVER automatically fix PR comments.** Always:

1. Read and summarize all comments
2. Present findings to the user
3. Wait for explicit approval on which comments to address
4. Only then make the approved changes

This rule exists because PR comments may require discussion, may be outdated, or the user may have different priorities.

### Rule 2: Check for Cyclical Fixes

**ALWAYS check PR review tracking document before making ANY fixes.** This prevents cyclical fixing where we:

- Re-fix issues that were already fixed
- Undo previous fixes
- Create conflicting changes
- Waste time on already-addressed issues

**Location**: `.ai-context/task-outputs/GH-XXXX/08-pr-review-tracking.md`

If the tracking document shows a comment was already addressed, inform the user and suggest:

1. Re-reviewing the code to verify the fix is still present
2. Updating the PR description to document the fix
3. Responding to the reviewer explaining the fix

---

## Execution Steps (with Task Tracking)

When executing this skill, Claude MUST use the TodoWrite tool to track progress:

### Step 1: Initialize Task List

Create a task list with the following items:

```
TodoWrite([
  { content: "Identify the PR to review", status: "in_progress", activeForm: "Identifying PR" },
  { content: "Check for existing review tracking", status: "pending", activeForm: "Checking review tracking" },
  { content: "Fetch PR comments from GitHub", status: "pending", activeForm: "Fetching PR comments" },
  { content: "Categorize and analyze comments", status: "pending", activeForm: "Categorizing comments" },
  { content: "Present summary to user", status: "pending", activeForm: "Presenting summary" },
  { content: "Wait for user decision", status: "pending", activeForm: "Awaiting user decision" }
])
```

After user approval, add dynamically:

```
{ content: "Address approved comments", status: "pending", activeForm: "Addressing comments" },
{ content: "Update review tracking document", status: "pending", activeForm: "Updating tracking document" },
{ content: "Run quality checks", status: "pending", activeForm: "Running quality checks" },
{ content: "Commit and push changes", status: "pending", activeForm: "Committing changes" }
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

### Step 2: Identify the Pull Request

**Task: "Identify the PR to review" → in_progress**

**If PR number provided:**

```
mcp__github__get_pull_request({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number}
})
```

**If no PR number provided:**

1. Get current branch:

   ```
   mcp__git__git_branch({ operation: "show-current" })
   ```

2. Get repository info:

   ```
   mcp__git__git_remote({ mode: "get-url", name: "origin" })
   ```

   Parse owner and repo from the URL.

3. Find open PR for this branch:

   ```
   mcp__github__list_pull_requests({
     owner: "{repo_owner}",
     repo: "{repo_name}",
     state: "open",
     head: "{owner}:{current_branch}"
   })
   ```

4. If no PR found:

   ```
   Error: No open PR found for branch '{branch}'.

   Create a PR first with /submit-pr or specify a PR number:
   /review-pr-comments 42
   ```

**Mark task completed and move to next.**

### Step 3: Check for Existing Review Tracking

**Task: "Check for existing review tracking" → in_progress**

**CRITICAL**: Before fetching new comments, check if a review tracking document already exists.

1. Determine ticket number from branch name (e.g., `feat/GH-42_Title` → `GH-42`)

2. Check if tracking document exists:
   ```
   .ai-context/task-outputs/GH-42/08-pr-review-tracking.md
   ```

**If tracking document exists:**

1. Read the entire document to see all previous review rounds
2. Note which comments have been marked as "✅ FIXED" or "✅ Verified correct"
3. Keep this information in mind when presenting summary to user
4. If a fetched comment matches a previously fixed issue, inform user

**If tracking document does NOT exist:**

- This is the first review round
- You'll create the tracking document after addressing comments

**Mark task completed and move to next.**

### Step 4: Fetch PR Comments

**Task: "Fetch PR comments from GitHub" → in_progress**

Use GitHub MCP tools to get all comments:

```
# Get review comments (inline code comments)
mcp__github__get_pull_request_comments({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number}
})

# Get reviews (overall review comments)
mcp__github__get_pull_request_reviews({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number}
})
```

**Mark task completed and move to next.**

### Step 5: Categorize Comments

**Task: "Categorize and analyze comments" → in_progress**

Group comments by severity and source:

**By Source:**

- `Bot` - Automated reviewers (Copilot, linters)
- `Human` - Team member reviews
- `Author` - PR author's responses

**By Severity:**

- **🔴 Critical (High):** Security issues, credentials in code, breaking bugs, data loss risks
- **🟡 Medium:** Logic errors, incorrect behavior, missing error handling, inconsistent data
- **🟢 Low:** Style suggestions, minor improvements, optional optimizations, nitpicks

**By Type:**

- `Code Change` - Requires code modification
- `Question` - Needs clarification/response
- `Suggestion` - Optional improvement
- `Blocker` - Must fix before merge

**Mark task completed and move to next.**

### Step 6: Present Summary to User

**Task: "Present summary to user" → in_progress**

Format the summary:

```markdown
## PR Comment Review Summary

I found **[N] comments** on PR #[NUMBER]. Here's the breakdown:

---

### 🔴 **Critical** ([count] comment[s])

| #   | Severity | File               | Issue                         | Author |
| --- | -------- | ------------------ | ----------------------------- | ------ |
| 1   | **High** | `path/to/file.tsx` | **Brief title** - Description | author |

---

### 🟡 **Medium** ([count] comment[s])

| #   | Severity | File               | Issue                         | Author |
| --- | -------- | ------------------ | ----------------------------- | ------ |
| 2   | Medium   | `path/to/file.tsx` | **Brief title** - Description | author |

---

### 🟢 **Low** ([count] comment[s])

| #   | Severity | File               | Issue                              | Author |
| --- | -------- | ------------------ | ---------------------------------- | ------ |
| 3   | Low      | `path/to/file.tsx` | **Brief title** - Minor suggestion | author |

---

## Comment Details

### Comment 1: [Title] (Critical)

**Location:** `path/to/file.tsx:line`

[Detailed description with code snippets if relevant]

**Issue:** [Explain the problem clearly]

---

## Which comments would you like me to address?

Please let me know which issues you'd like me to fix:

- **Comment 1** ([brief]) - [action description]
- **Comment 2** ([brief]) - [action description]
- **All of them**
- **None** (close review without changes)
```

**Mark task completed and move to next.**

### Step 7: Wait for User Decision

**Task: "Wait for user decision" → in_progress**

**DO NOT proceed until user explicitly indicates which comments to address.**

Valid user responses:

- Specific numbers: `1, 3` or `1 and 3`
- All: `all` or `address all`
- None: `none` or `skip`
- Questions: `what does comment 2 mean?`

**After user decision:**

Add remaining tasks to todo list and mark first as in_progress:

```
TodoWrite([
  ...completedTasks,
  { content: "Wait for user decision", status: "completed", activeForm: "Awaiting user decision" },
  { content: "Address approved comments", status: "in_progress", activeForm: "Addressing comments" },
  { content: "Update review tracking document", status: "pending", activeForm: "Updating tracking document" },
  { content: "Run quality checks", status: "pending", activeForm: "Running quality checks" },
  { content: "Commit and push changes", status: "pending", activeForm: "Committing changes" }
])
```

### Step 8: Address Approved Comments

**Task: "Address approved comments" → in_progress**

Only after user approval:

**For Code Changes:**

1. Read the relevant file(s)
2. Understand the context
3. Make the requested change
4. Verify the change is correct

**For Questions/Responses:**

1. Draft a response
2. Show to user for approval
3. Post comment via GitHub MCP if approved:

```
mcp__github__add_issue_comment({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  issue_number: {pr_number},
  body: "[response]"
})
```

**Mark task completed and move to next.**

### Step 9: Update Review Tracking Document

**Task: "Update review tracking document" → in_progress**

**Create or update** `.ai-context/task-outputs/GH-XXXX/08-pr-review-tracking.md`:

```markdown
# PR Review Tracking: GH-XXXX

## PR Information

- **PR Number**: #XXXX
- **PR URL**: https://github.com/{owner}/{repo}/pull/XXXX
- **Branch**: `{branch-name}`
- **Status**: Code Review

---

## Review Round 1 (YYYY-MM-DD)

### Reviewers

- {reviewer1} ({N} comments)
- {reviewer2} ({N} comments)

### Total Comments

{N} code review comments

### Comments Addressed

#### Critical Issues ({count})

**1. {Brief Title}** ✅ FIXED

- **File**: `path/to/file.tsx:line`
- **Issue**: {Description of the issue}
- **Reviewer**: {reviewer-name}
- **Fix Applied**: {What was done to fix it}
- **Commit**: `{hash}` - {commit message}
- **Status**: ✅ Fixed and verified

### Summary

- **Total Comments**: {N}
- **Fixed in This Round**: {N} comments
- **Skipped**: {N} comments
- **Status**: All {N} comments addressed ✅

### Quality Checks After Fixes

- ✅ Format check - Passed
- ✅ Lint check - Passed
- ✅ Build - Passed

---

## Review Round 2 (Pending)

_Awaiting next round of review..._
```

**Mark task completed and move to next.**

### Step 10: Run Quality Checks

**Task: "Run quality checks" → in_progress**

After making code changes, run the project's quality checks:

```bash
pnpm run format   # Format code
pnpm run lint     # Lint code
pnpm run build    # Build project
```

**Mark task completed and move to next.**

### Step 11: Commit and Push Changes

**Task: "Commit and push changes" → in_progress**

If changes were made, use MCP git tools:

```
# Stage all changes
mcp__git__git_add({
  files: ["."],
  all: true
})

# Create commit
mcp__git__git_commit({
  message: "fix: address PR review feedback [GH-XXX]\n\n- [List each addressed comment briefly]\n\nCo-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
})

# Push to remote
mcp__git__git_push()
```

**Mark task completed.**

### Step 12: Report Results

Summarize what was done:

```markdown
## PR Review Complete

**Addressed:**

- Comment 1: Changed X to Y in file.tsx
- Comment 3: Added error handling

**Responded:**

- Comment 5: Posted explanation about design decision

**Skipped (per your request):**

- Comment 2: Style preference

**Quality Checks:** ✅ All passed

**Changes pushed:** commit [hash]
```

**Mark all tasks completed:**

```
TodoWrite([
  { content: "Identify the PR to review", status: "completed", activeForm: "Identifying PR" },
  { content: "Check for existing review tracking", status: "completed", activeForm: "Checking review tracking" },
  { content: "Fetch PR comments from GitHub", status: "completed", activeForm: "Fetching PR comments" },
  { content: "Categorize and analyze comments", status: "completed", activeForm: "Categorizing comments" },
  { content: "Present summary to user", status: "completed", activeForm: "Presenting summary" },
  { content: "Wait for user decision", status: "completed", activeForm: "Awaiting user decision" },
  { content: "Address approved comments", status: "completed", activeForm: "Addressing comments" },
  { content: "Update review tracking document", status: "completed", activeForm: "Updating tracking document" },
  { content: "Run quality checks", status: "completed", activeForm: "Running quality checks" },
  { content: "Commit and push changes", status: "completed", activeForm: "Committing changes" }
])
```

---

## MCP Tools Used

| Tool                                     | Purpose                    |
| ---------------------------------------- | -------------------------- |
| `mcp__git__git_branch`                   | Get current branch         |
| `mcp__git__git_remote`                   | Get repository URL         |
| `mcp__git__git_add`                      | Stage changes for commit   |
| `mcp__git__git_commit`                   | Create commit with message |
| `mcp__git__git_push`                     | Push commits to remote     |
| `mcp__github__list_pull_requests`        | Find PR for branch         |
| `mcp__github__get_pull_request`          | Get PR details             |
| `mcp__github__get_pull_request_comments` | Get inline review comments |
| `mcp__github__get_pull_request_reviews`  | Get overall reviews        |
| `mcp__github__add_issue_comment`         | Post response comment      |

---

## Comment Type Guidelines

### When to Fix (Code Change)

- Bug identified
- Security issue
- Missing error handling
- Incorrect logic
- Breaking change

### When to Respond Only

- Design decision questions
- "Why did you..." questions
- Alternative approach suggestions (if current is valid)
- Style preferences not in project standards

### When to Discuss First

- Architectural concerns
- Performance implications
- Breaking API changes
- Scope creep suggestions

---

## Common Reviewer Patterns

### GitHub Copilot / Bots

- Often flags informational items as issues
- Suggestions are often optional
- Good at spotting inconsistencies
- May not understand project context

### Human Reviewers

- Comments usually require action
- Questions deserve thoughtful responses
- May have context not in the PR

---

## Status Indicators

Use these consistently in tracking documents:

- ✅ **FIXED** - Issue resolved and verified
- ⏳ **IN PROGRESS** - Currently being addressed
- ❌ **NOT FIXED** - Needs attention
- ℹ️ **NO ACTION NEEDED** - Already correct or not applicable
- 🔄 **FIXED IN PREVIOUS COMMITS** - Already addressed before review

---

## Examples

### Example 1: Review Current Branch PR

```
/review-pr-comments
```

### Example 2: Review Specific PR

```
/review-pr-comments 42
```

### Example 3: Full Workflow

```
User: review pr comments

Claude: [Fetches PR #42 comments]

## PR Comment Review Summary

I found **3 comments** on PR #42. Here's the breakdown:

---

### 🔴 **Critical** (1 comment)

| # | Severity | File | Issue | Author |
|---|----------|------|-------|--------|
| 1 | **High** | `src/auth/login.tsx` | **Missing input validation** | reviewer1 |

---

### 🟡 **Medium** (2 comments)

| # | Severity | File | Issue | Author |
|---|----------|------|-------|--------|
| 2 | Medium | `src/api/client.ts` | **Missing error handling** | reviewer1 |
| 3 | Medium | `src/utils/format.ts` | **Inconsistent date format** | copilot |

---

## Which comments would you like me to address?

- **Comment 1** (Validation) - Add input sanitization
- **Comment 2** (Error handling) - Add try/catch
- **Comment 3** (Date format) - Use consistent ISO format
- **All of them**
- **None**

User: 1 and 2, skip 3

Claude: [Makes changes to comments 1 and 2 only]
[Runs quality checks]
[Commits and pushes]

## PR Review Complete

**Addressed:**
- Comment 1: Added input validation to login form
- Comment 2: Added error handling to API client

**Skipped (per your request):**
- Comment 3: Date format is intentional for display

**Quality Checks:** ✅ All passed
**Changes pushed:** commit abc1234
```

---

## Error Handling

### No PR Found

```
No open PR found for branch 'feat/GH-42_User-Auth'.

Options:
1. Create a PR first: /submit-pr
2. Specify PR number: /review-pr-comments 42
```

### No Comments

```
PR #42 has no review comments.

The PR is ready for merge or awaiting initial review.
```

### Already Addressed

```
Comment 1 appears to have been addressed in a previous review round.

The tracking document shows this was fixed in commit abc1234.

Options:
1. Verify the fix is still in place
2. Respond to the reviewer explaining it's already fixed
3. Skip this comment
```

---

## Related

- [Submit PR](../submit-pr/SKILL.md) - `/submit-pr` to create PRs
- [Merge PR](../merge-pr/SKILL.md) - `/merge-pr` to merge PRs
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch and merge conventions
