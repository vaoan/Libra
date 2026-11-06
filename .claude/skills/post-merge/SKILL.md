---
name: post-merge
description: Switch to develop, sync with remote, and optionally delete the previous branch.
---

# Post-Merge Cleanup

## Git Safety Warning

> **This skill switches branches and can delete branches. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/post-merge" or "post merge cleanup"
> - Do NOT run this skill automatically
> - Do NOT suggest running this skill unless explicitly asked
> - Branch deletion requires user confirmation

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Cleans up your local environment after a PR has been merged. This skill:

1. **Remembers** your current branch (the one that was merged)
2. **Switches** to the develop branch
3. **Syncs** develop with the remote (pulls latest)
4. **Asks** if you want to delete the previous branch (locally and remotely)

**This skill uses a task list to show progress.**

## Usage

```
/post-merge
```

Or natural language:

```
Post merge cleanup
Clean up after merge
Switch to develop and delete my branch
```

## When to Use

Run this after:

- A PR has been merged via GitHub UI
- Using `/merge-pr` (if you didn't delete the branch)
- Someone else merged your PR

**Typical workflow:**

```
1. /submit-pr          → Create PR
2. PR gets reviewed and merged on GitHub
3. /post-merge         → Clean up local environment
```

---

## Execution Steps (with Task Tracking)

When executing this skill, Claude MUST use the TaskCreate/TaskUpdate tools to track progress:

### Step 1: Initialize Task List

Create tasks for tracking:

```
TaskCreate({ subject: "Get current branch name", description: "Store the current branch name before switching", activeForm: "Getting current branch" })
TaskCreate({ subject: "Switch to develop", description: "Checkout the develop branch", activeForm: "Switching to develop" })
TaskCreate({ subject: "Sync develop with remote", description: "Pull latest changes from origin/develop", activeForm: "Syncing develop" })
TaskCreate({ subject: "Ask about branch deletion", description: "Prompt user whether to delete the previous branch", activeForm: "Confirming deletion" })
TaskCreate({ subject: "Report results", description: "Show summary of actions taken", activeForm: "Reporting results" })
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

### Step 2: Get Current Branch Name

**Task: "Get current branch name" → in_progress**

```
mcp__git__git_branch({
  operation: "show-current"
})
```

**Store this value as `previousBranch`.**

**Validation:**

- If already on `develop`:

  ```
  You're already on develop. Nothing to clean up.

  If you want to sync develop with remote, use:
  git pull origin develop
  ```

  Stop execution.

- If on `main`:

  ```
  You're on main. This skill is for cleaning up after merging feature branches.

  Switch to a feature branch first, or use git pull to sync main.
  ```

  Stop execution.

**Mark task completed.**

### Step 3: Check for Uncommitted Changes

**Before switching branches, check status:**

```
mcp__git__git_status()
```

**If uncommitted changes exist:**

```
AskUserQuestion({
  questions: [{
    question: "You have uncommitted changes on '{previousBranch}'. How should I handle them?",
    header: "Changes",
    options: [
      { label: "Stash changes (Recommended)", description: "Stash your changes, switch branches, then you can restore later" },
      { label: "Discard changes", description: "Permanently discard all uncommitted changes" },
      { label: "Cancel", description: "Stop the post-merge cleanup" }
    ],
    multiSelect: false
  }]
})
```

**If user chooses Stash:**

```
mcp__git__git_stash({
  mode: "push",
  message: "WIP before post-merge cleanup"
})
```

**If user chooses Discard:**

```
mcp__git__git_checkout({
  target: ".",
  force: true
})
```

**If user chooses Cancel:** Stop execution.

### Step 4: Switch to Develop

**Task: "Switch to develop" → in_progress**

```
mcp__git__git_checkout({
  target: "develop"
})
```

**Mark task completed.**

### Step 5: Sync Develop with Remote

**Task: "Sync develop with remote" → in_progress**

```
mcp__git__git_fetch({
  remote: "origin"
})

mcp__git__git_pull({
  remote: "origin",
  branch: "develop"
})
```

**Mark task completed.**

### Step 6: Ask About Branch Deletion

**Task: "Ask about branch deletion" → in_progress**

**PROTECTED BRANCHES - NEVER DELETE:**

- `main` - Production branch
- `develop` - Integration branch

**If previousBranch is protected:**

```
Branch '{previousBranch}' is protected. Skipping deletion prompt.
```

Skip to Step 7.

**If NOT protected, ask the user:**

```
AskUserQuestion({
  questions: [{
    question: "Would you like to delete the branch '{previousBranch}'?",
    header: "Delete branch",
    options: [
      { label: "Yes, delete both (Recommended)", description: "Delete the branch locally and on remote (origin)" },
      { label: "Local only", description: "Delete only the local branch, keep remote" },
      { label: "Remote only", description: "Delete only the remote branch, keep local" },
      { label: "No, keep it", description: "Keep the branch on both local and remote" }
    ],
    multiSelect: false
  }]
})
```

**Based on user selection:**

**Yes, delete both:**

See [Merge PR](../merge-pr/SKILL.md#delete-remote-branch) for the canonical delete commands.

**Local only:**

See [Merge PR](../merge-pr/SKILL.md#delete-local-branch) for the canonical delete commands.

**Remote only:**

See [Merge PR](../merge-pr/SKILL.md#delete-remote-branch) for the canonical delete commands.

**No, keep it:** No action needed.

**Mark task completed.**

### Step 7: Report Results

**Task: "Report results" → in_progress**

```
## Post-Merge Cleanup Complete

**Previous branch:** {previousBranch}
**Current branch:** develop
**Develop synced:** Yes (pulled from origin)

### Branch Deletion
{One of:}
- ✅ Deleted locally and remotely
- ✅ Deleted locally only
- ✅ Deleted remotely only
- ⏭️ Kept (user choice)
- ⏭️ Skipped (protected branch)

{If stashed:}
**Note:** Your changes were stashed. Restore them with:
git stash pop
```

**Mark all tasks completed.**

---

## MCP Tools Used

| Tool                     | Purpose                           |
| ------------------------ | --------------------------------- |
| `mcp__git__git_branch`   | Get current branch / delete local |
| `mcp__git__git_status`   | Check for uncommitted changes     |
| `mcp__git__git_stash`    | Stash changes if needed           |
| `mcp__git__git_checkout` | Switch to develop                 |
| `mcp__git__git_fetch`    | Fetch remote changes              |
| `mcp__git__git_pull`     | Pull develop from origin          |
| `mcp__git__git_push`     | Delete remote branch              |

---

## Examples

### Example 1: Clean Deletion (Both Local and Remote)

```
/post-merge
```

**On branch:** `feat/GH-42_User-Auth`

**Output:**

```
## Post-Merge Cleanup Complete

**Previous branch:** feat/GH-42_User-Auth
**Current branch:** develop
**Develop synced:** Yes (pulled from origin)

### Branch Deletion
✅ Deleted locally and remotely
```

### Example 2: Keep Branch

```
/post-merge
```

**User selects:** No, keep it

**Output:**

```
## Post-Merge Cleanup Complete

**Previous branch:** fix/GH-15_Login-Bug
**Current branch:** develop
**Develop synced:** Yes (pulled from origin)

### Branch Deletion
⏭️ Kept (user choice)
```

### Example 3: With Uncommitted Changes

```
/post-merge
```

**Claude asks:** You have uncommitted changes. Stash, discard, or cancel?

**User selects:** Stash changes

**Output:**

```
## Post-Merge Cleanup Complete

**Previous branch:** chore/GH-88_Update-Deps
**Current branch:** develop
**Develop synced:** Yes (pulled from origin)

### Branch Deletion
✅ Deleted locally and remotely

**Note:** Your changes were stashed. Restore them with:
git stash pop
```

### Example 4: Already on Develop

```
/post-merge
```

**Output:**

```
You're already on develop. Nothing to clean up.

If you want to sync develop with remote, use:
git pull origin develop
```

---

## Error Handling

### Remote Branch Already Deleted

If the remote branch was already deleted (e.g., GitHub auto-deleted it):

```
Remote branch 'feat/GH-42_User-Auth' already deleted.
Deleted local branch only.
```

### Local Branch Has Unmerged Changes

If trying to delete a branch that has commits not in develop:

```
Warning: Branch 'feat/GH-42_User-Auth' has unmerged commits.

Are you sure you want to force delete it?
- Yes, force delete
- No, keep it
```

### Network Error During Push

```
Failed to delete remote branch. Check your network connection.
Local branch was NOT deleted (to avoid data loss).

Try again with: /post-merge
Or manually: git push origin --delete feat/GH-42_User-Auth
```

---

## Configuration

### Protected Branches

The following branches are **NEVER offered for deletion**:

| Branch    | Reason             |
| --------- | ------------------ |
| `main`    | Production branch  |
| `develop` | Integration branch |

### Default Behavior

- **Fetch before pull:** Always fetches to ensure latest refs
- **Force delete:** Uses force delete for local branches (safe since they're merged)
- **No auto-delete:** Always asks user before deleting

---

## Related

- [Merge PR](../merge-pr/SKILL.md) - `/merge-pr` to merge PRs
- [Submit PR](../submit-pr/SKILL.md) - `/submit-pr` to create PRs
- [Start Task](../start-task/SKILL.md) - `/start-task` to begin new work
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch conventions
