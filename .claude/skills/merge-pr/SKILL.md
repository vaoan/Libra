---
name: merge-pr
description: Merge a pull request with safety checks and appropriate strategy.
---

# Merge PR

## ⛔ Git Safety Warning

> **This skill merges and deletes branches. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/merge-pr" or "merge the PR"
> - Do NOT run this skill automatically
> - Do NOT suggest running this skill
> - This is a DESTRUCTIVE operation (deletes branch after merge)

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Merges a pull request for the current branch (or specified PR number). Automatically selects the merge strategy based on the target branch:

- **PR → develop**: Squash and merge (clean history)
- **PR → main**: Create merge commit (preserve history)

After merge, **automatically deletes the source branch** (with protection for `develop` and `main`).

**This skill uses a task list to show progress during the merge.**

## Usage

```
/merge-pr [pr_number]
```

Or natural language:

```
Merge the PR for this branch
Merge PR #42
Squash merge my PR
```

## Parameters

| Parameter   | Required | Description                                                      |
| ----------- | -------- | ---------------------------------------------------------------- |
| `pr_number` | No       | PR number to merge. If not provided, finds PR for current branch |

---

## Execution Steps (with Task Tracking)

When executing this skill, Claude MUST use the TodoWrite tool to track progress:

### Step 1: Initialize Task List

Create a task list with the following items:

```
TodoWrite([
  { content: "Find PR for current branch", status: "in_progress", activeForm: "Finding PR" },
  { content: "Validate PR is mergeable", status: "pending", activeForm: "Validating PR status" },
  { content: "Determine merge strategy", status: "pending", activeForm: "Determining merge strategy" },
  { content: "Execute merge", status: "pending", activeForm: "Merging PR" },
  { content: "Switch to base branch", status: "pending", activeForm: "Switching branch" },
  { content: "Ask about branch deletion", status: "pending", activeForm: "Confirming deletion" },
  { content: "Report results", status: "pending", activeForm: "Reporting results" }
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

### Step 2: Find PR to Merge

**Task: "Find PR for current branch" → in_progress**

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

2. Find open PR for this branch:

   ```
   mcp__github__list_pull_requests({
     owner: "{repo_owner}",
     repo: "{repo_name}",
     state: "open",
     head: "{owner}:{current_branch}"
   })
   ```

3. If no PR found:

   ```
   Error: No open PR found for branch '{branch}'.

   Create a PR first with /submit-pr or specify a PR number:
   /merge-pr 42
   ```

4. If multiple PRs found (unlikely):

   ```
   Multiple PRs found for this branch:
   - #12: Title 1
   - #15: Title 2

   Specify which PR to merge:
   /merge-pr 12
   ```

**Mark task completed:**

```
TodoWrite([
  { content: "Find PR for current branch", status: "completed", activeForm: "Finding PR" },
  { content: "Validate PR is mergeable", status: "in_progress", activeForm: "Validating PR status" },
  ...
])
```

### Step 3: Validate PR Status

**Task: "Validate PR is mergeable" → in_progress**

Check that PR is mergeable:

```
mcp__github__get_pull_request_status({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number}
})
```

**Validation checks:**

1. PR is open (not already merged or closed)
2. No merge conflicts
3. Status checks passed (if required)

**If not mergeable:**

```
Cannot merge PR #{number}:
- {reason}

Fix the issues and try again.
```

**Mark task completed:**

```
TodoWrite([
  { content: "Find PR for current branch", status: "completed", activeForm: "Finding PR" },
  { content: "Validate PR is mergeable", status: "completed", activeForm: "Validating PR status" },
  { content: "Determine merge strategy", status: "in_progress", activeForm: "Determining merge strategy" },
  ...
])
```

### Step 4: Determine Merge Strategy

**Task: "Determine merge strategy" → in_progress**

Based on the PR's base (target) branch:

| Base Branch | Merge Method | Reason                                    |
| ----------- | ------------ | ----------------------------------------- |
| `develop`   | `squash`     | Clean history, single commit per feature  |
| `main`      | `merge`      | Preserve full commit history for releases |
| Other       | `squash`     | Default to squash for feature branches    |

Display merge details:

```
Ready to merge PR #{number}

**Title:** {pr_title}
**Branch:** {head} → {base}
**Method:** {Squash and merge | Create merge commit}
**Commits:** {commit_count}
```

**Mark task completed:**

```
TodoWrite([
  ...
  { content: "Determine merge strategy", status: "completed", activeForm: "Determining merge strategy" },
  { content: "Execute merge", status: "in_progress", activeForm: "Merging PR" },
  ...
])
```

### Step 5: Execute Merge

**Task: "Execute merge" → in_progress**

```
mcp__github__merge_pull_request({
  owner: "{repo_owner}",
  repo: "{repo_name}",
  pull_number: {pr_number},
  merge_method: "{squash | merge}",
  commit_title: "{pr_title} (#{pr_number})",
  commit_message: "{pr_body_summary}"
})
```

**Merge methods:**

- `squash` - Squash and merge (combines all commits)
- `merge` - Create a merge commit (preserves commits)
- `rebase` - Rebase and merge (not used in this workflow)

**Mark task completed:**

```
TodoWrite([
  ...
  { content: "Execute merge", status: "completed", activeForm: "Merging PR" },
  { content: "Switch to base branch", status: "in_progress", activeForm: "Switching branch" },
  ...
])
```

### Step 6: Switch to Base Branch

**Task: "Switch to base branch" → in_progress**

After merge, switch to the base branch and pull latest:

```
# Switch to the base branch (e.g., develop)
mcp__git__git_checkout({
  target: "{base_branch}"  // e.g., "develop"
})

# Pull latest changes (includes the just-merged PR)
mcp__git__git_pull({
  remote: "origin",
  branch: "{base_branch}"
})
```

**Output:**

```
Switched to branch 'develop' and pulled latest changes.
```

**Mark task completed:**

```
TodoWrite([
  ...
  { content: "Switch to base branch", status: "completed", activeForm: "Switching branch" },
  { content: "Ask about branch deletion", status: "in_progress", activeForm: "Confirming deletion" },
  ...
])
```

### Step 7: Ask About Branch Deletion

**Task: "Ask about branch deletion" → in_progress**

**PROTECTED BRANCHES - NEVER DELETE:**

- `main` - Production branch
- `develop` - Integration branch

**Check if branch is protected:**

```
const PROTECTED_BRANCHES = ['main', 'develop'];
const headBranch = pr.head.ref;  // e.g., "feat/GH-42_User-Auth"

if (PROTECTED_BRANCHES.includes(headBranch)) {
  // Skip - branch is protected, don't even ask
  console.log(`Branch '${headBranch}' is protected. Skipping deletion.`);
}
```

**If NOT protected, ask the user:**

```
The PR has been merged. Would you like to delete the branch 'feat/GH-42_User-Auth'?

- **Yes** - Delete branch (remote and local)
- **No** - Keep the branch
```

**If user says Yes:**

```
# Delete remote branch
mcp__git__git_push({
  remote: "origin",
  branch: headBranch,
  delete: true
})

# Delete local branch
mcp__git__git_branch({
  operation: "delete",
  name: headBranch,
  force: true  // Use force since branch is already merged
})
```

**After deletion:**

```
Branch 'feat/GH-42_User-Auth' deleted (remote and local).
```

**If user says No:**

```
Branch 'feat/GH-42_User-Auth' kept.
```

**Mark task completed:**

```
TodoWrite([
  ...
  { content: "Ask about branch deletion", status: "completed", activeForm: "Confirming deletion" },
  { content: "Report results", status: "in_progress", activeForm: "Reporting results" }
])
```

### Step 8: Report Results

**Task: "Report results" → in_progress**

After successful merge:

1. **Report success:**

   ```
   ## PR Merged Successfully

   **PR:** #{number} - {title}
   **Method:** {Squash and merge | Merge commit}
   **Merged into:** {base_branch}
   **Current branch:** {base_branch} (switched and pulled)
   **Source branch:** {Deleted | Kept | Protected - not deleted}
   ```

**Mark all tasks completed:**

```
TodoWrite([
  { content: "Find PR for current branch", status: "completed", activeForm: "Finding PR" },
  { content: "Validate PR is mergeable", status: "completed", activeForm: "Validating PR status" },
  { content: "Determine merge strategy", status: "completed", activeForm: "Determining merge strategy" },
  { content: "Execute merge", status: "completed", activeForm: "Merging PR" },
  { content: "Switch to base branch", status: "completed", activeForm: "Switching branch" },
  { content: "Ask about branch deletion", status: "completed", activeForm: "Confirming deletion" },
  { content: "Report results", status: "completed", activeForm: "Reporting results" }
])
```

---

## Merge Strategy Rationale

### Squash and Merge (→ develop)

Used for feature/fix branches merging into develop:

- Creates a single, clean commit
- Commit message is the PR title
- Easy to revert if needed
- Keeps develop history readable

**Example:**

```
Before: feat/GH-42 has 15 commits (WIP, fix, more fixes...)
After:  develop gets 1 commit: "feat(auth): add login form [GH-42] (#12)"
```

### Merge Commit (→ main)

Used for develop/release branches merging into main:

- Preserves full commit history
- Creates merge commit as a marker
- Shows all individual changes in release
- Better for auditing production changes

**Example:**

```
Before: develop has 50 commits since last release
After:  main gets merge commit + all 50 commits preserved
```

---

## MCP Tools Used

| Tool                                       | Purpose                                  |
| ------------------------------------------ | ---------------------------------------- |
| `mcp__git__git_branch`                     | Get current branch / delete local branch |
| `mcp__github__list_pull_requests`          | Find PR for branch                       |
| `mcp__github__get_pull_request`            | Get PR details                           |
| `mcp__github__get_pull_request_status`     | Check CI status                          |
| `mcp__github__merge_pull_request`          | Execute merge                            |
| `mcp__git__git_checkout`                   | Switch to base branch after merge        |
| `mcp__git__git_pull`                       | Pull latest changes                      |
| `mcp__git__git_push` (with `delete: true`) | Delete remote branch                     |

---

## Examples

### Example 1: Merge PR for Current Branch (User deletes branch)

```
/merge-pr
```

**On branch:** `feat/GH-42_User-Auth`

**Claude:** Merging PR #12...

```
PR merged successfully. Switching to develop branch...
Switched to 'develop' and pulled latest.

The PR has been merged. Would you like to delete the branch 'feat/GH-42_User-Auth'?
- Yes - Delete branch (remote and local)
- No - Keep the branch
```

**User:** Yes

**Output:**

```
## PR Merged Successfully

**PR:** #12 - feat(auth): add login form [GH-42]
**Method:** Squash and merge
**Merged into:** develop
**Current branch:** develop (switched and pulled)
**Source branch:** Deleted (remote and local)
```

### Example 2: Merge PR (User keeps branch)

```
/merge-pr 15
```

**Claude asks:** Would you like to delete the branch 'fix/GH-15_Null-Response'?

**User:** No

**Output:**

```
## PR Merged Successfully

**PR:** #15 - fix(api): handle null response [GH-15]
**Method:** Squash and merge
**Merged into:** develop
**Current branch:** develop (switched and pulled)
**Source branch:** Kept
```

### Example 3: Release Merge (to main - protected branch)

```
/merge-pr 20
```

**PR #20:** `develop` → `main` (release)

**Output:**

```
## PR Merged Successfully

**PR:** #20 - Release v1.2.0
**Method:** Merge commit
**Merged into:** main
**Current branch:** main (switched and pulled)
**Source branch:** Protected - 'develop' was NOT deleted

### Next Steps
- Create a git tag for this release
- Deploy to production
```

### Example 4: PR Not Mergeable

```
/merge-pr 12
```

**Output:**

```
Cannot merge PR #12:
- Merge conflicts detected
- 2 status checks failing

Fix the issues and try again:
1. Resolve conflicts: git checkout feat/GH-42 && git merge develop
2. Fix failing checks
3. Push changes
4. Run /merge-pr again
```

---

## Error Handling

### No PR Found

```
No open PR found for branch 'feat/GH-42_User-Auth'.

Options:
1. Create a PR first: /submit-pr
2. Specify PR number: /merge-pr 42
```

### PR Already Merged

```
PR #12 is already merged.

The branch was merged into develop on 2024-01-15.
```

### Merge Conflicts

```
Cannot merge PR #12: Merge conflicts detected.

Resolve conflicts:
1. git checkout feat/GH-42
2. git merge develop
3. Resolve conflicts
4. git push
5. /merge-pr
```

### Status Checks Failing

```
Cannot merge PR #12: Status checks failing.

Failing checks:
- build: Failed
- lint: Failed

Fix the issues and push again.
```

---

## Configuration

### Repository Detection

Automatically detects from git remote:

```
mcp__git__git_remote({ mode: "get-url", name: "origin" })
```

### Merge Method Override

The merge method is determined by target branch:

- Cannot be overridden via parameters
- Ensures consistent workflow across team

### Protected Branches

The following branches are **NEVER deleted** after merge:

| Branch    | Reason                                 |
| --------- | -------------------------------------- |
| `main`    | Production branch - must always exist  |
| `develop` | Integration branch - must always exist |

This protection is hardcoded in the skill and cannot be overridden.

---

## Related

- [Submit PR](../submit-pr/SKILL.md) - `/submit-pr` to create PRs
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch and merge conventions
