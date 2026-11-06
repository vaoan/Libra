---
name: checkpoint
description: Save current work state for resuming later. Creates a checkpoint file with git status, pending tasks, and context.
---

# Checkpoint

## ⛔ Git Safety Warning

> **This skill is READ-ONLY. It does NOT commit, push, or modify git state.**
>
> Safe operations only:
>
> - Reads git status
> - Reads recent commits
> - Creates markdown files in .ai-context/
>
> If stashing is ever needed, will ASK first.

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Saves the current state of work to `.ai-context/checkpoints/{branch}/RESUME.md` so you can resume later after stopping or restarting Claude Code. Each branch has its own checkpoint folder.

Captures:

- Current git branch and status
- Recent commits
- Active todo items
- What you were working on
- Next steps

## Usage

```
/checkpoint [summary]
```

Or natural language:

```
Save checkpoint
Checkpoint my work
Save progress before restart
Create a resume point
```

## Parameters

| Parameter | Required | Description                                                  |
| --------- | -------- | ------------------------------------------------------------ |
| `summary` | No       | Brief description of current work (prompted if not provided) |

## File Location

```
.ai-context/checkpoints/{branch-name}/RESUME.md
```

**Examples:**

- `ai-structure` → `.ai-context/checkpoints/ai-structure/RESUME.md`
- `feat/GH-42_User-Auth` → `.ai-context/checkpoints/feat-GH-42_User-Auth/RESUME.md`

**Note:** Branch names with `/` are converted to `-` for folder names.

---

## Execution Steps

### Step 0: Set Git Working Directory

**REQUIRED before any git MCP operations.**

```
mcp__git__git_set_working_dir({
  path: "{project_root_directory}",
  validateGitRepo: true,
  includeMetadata: true
})
```

This prevents the error: "No session working directory set. Please specify a 'path' or use 'git_set_working_dir' first."

### Step 1: Gather Git State

Collect current repository state using MCP tools:

```
mcp__git__git_branch({ operation: "show-current" })
mcp__git__git_status()
mcp__git__git_log({ maxCount: 5, oneline: true })
mcp__git__git_diff({ staged: false, nameOnly: true })
```

Extract:

- Current branch name (used for folder path)
- Uncommitted changes (staged and unstaged)
- Recent commit history
- Modified files

### Step 2: Capture Todo State

Read current todos from the conversation context.

Document:

- Completed tasks
- In-progress tasks
- Pending tasks

### Step 3: Get Work Summary

**If summary not provided, ask:**

```
What were you working on? (Brief description)
```

Use `AskUserQuestion` with free-text option.

**If summary provided:**

- Use provided summary directly

### Step 4: Detect Repository Info

Get repository owner and name:

```
mcp__git__git_remote({ mode: "get-url", name: "origin" })
```

Parse URL to extract owner/repo.

### Step 5: Create Branch Folder

Convert branch name to folder-safe name:

- Replace `/` with `-`
- Keep other characters

```
mkdir -p .ai-context/checkpoints/{safe-branch-name}/
```

### Step 6: Generate Checkpoint File

Create/update `.ai-context/checkpoints/{branch}/RESUME.md` with this structure:

```markdown
# Session Resume: {branch}

> Last updated: {YYYY-MM-DD HH:MM}

## Current Work

{User-provided summary of what they were working on}

## Git State

**Branch:** `{current_branch}`
**Last Commit:** `{short_hash}` - {commit_message}
**Status:** {clean | X uncommitted changes}

### Uncommitted Changes

{List of modified/added/deleted files, or "None"}

### Recent Commits

{Last 5 commits in oneline format}

## Tasks

### Completed

{List of completed todos}

### In Progress

{Current in-progress task}

### Pending

{List of pending todos}

## Next Steps

{Inferred or stated next actions}

## Context

{Any additional context needed to resume work}
{Key files, MCP servers needed, repository info}

---

## Restore Checklist

When resuming, Claude should complete these steps in order:

### 1. Context Restoration

- [ ] Read `.ai-context/checkpoints/{branch}/RESUME.md` (this file)
- [ ] Read relevant rule files mentioned in Context
- [ ] Read `CLAUDE.md` for project conventions

### 2. Git State Verification

- [ ] Run `mcp__git__git_status()` to check current state
- [ ] Run `mcp__git__git_branch({ operation: "show-current" })` to confirm branch
- [ ] Review any uncommitted changes listed above

### 3. Task Restoration

- [ ] Create TodoWrite with pending tasks from "Tasks" section
- [ ] Mark completed items as done
- [ ] Set first pending item as `in_progress`

### 4. MCP Verification

- [ ] Verify required MCP servers are available
- [ ] Request restart if needed MCP is not loaded

### 5. Resume Work

- [ ] Inform user of restored context
- [ ] Confirm next steps with user
- [ ] Continue with first pending task

---

## Quick Resume Prompt
```

I'm back. Please read the checkpoint for my current branch and restore context.

```

```

### Step 7: Write File

Write the checkpoint:

```
Write({
  file_path: "{project_root}/.ai-context/checkpoints/{safe-branch}/RESUME.md",
  content: "{generated_content}"
})
```

### Step 8: Confirm Checkpoint

Display confirmation:

```markdown
## Checkpoint Saved

**File:** `.ai-context/checkpoints/{branch}/RESUME.md`
**Branch:** `{branch}`
**Time:** {timestamp}

### Summary

{brief_summary}

### Pending Tasks

{count} task(s) remaining

---

Ready to stop or restart. To resume:
```

I'm back. Please read the checkpoint for my current branch and restore context.

```

```

---

## Examples

### Example 1: Feature Branch

```
/checkpoint Implementing login form
```

**On branch:** `feat/GH-42_User-Auth`

**Output:**

```
## Checkpoint Saved

**File:** `.ai-context/checkpoints/feat-GH-42_User-Auth/RESUME.md`
**Branch:** `feat/GH-42_User-Auth`
**Time:** 2026-01-08 14:30

### Summary
Implementing login form

### Pending Tasks
2 task(s) remaining
```

### Example 2: Main Branch

```
/checkpoint
```

**On branch:** `ai-structure`

**Claude asks for summary, user provides:** "Setting up repo infrastructure"

**Output:**

```
## Checkpoint Saved

**File:** `.ai-context/checkpoints/ai-structure/RESUME.md`
**Branch:** `ai-structure`
**Time:** 2026-01-08 15:45

### Summary
Setting up repo infrastructure

### Pending Tasks
3 task(s) remaining
```

---

## Resume Instructions

When starting a new session, Claude should:

1. **Get current branch:**

   ```
   mcp__git__git_branch({ operation: "show-current" })
   ```

2. **Check for checkpoint:**

   ```
   Read(".ai-context/checkpoints/{branch}/RESUME.md")
   ```

3. **If found, offer to continue:**

   ```
   I found a checkpoint for branch `{branch}`:

   **Summary:** {summary}
   **Last Updated:** {timestamp}
   **Pending:** {pending_count} tasks

   Would you like to continue from where you left off?
   ```

4. **Follow Restore Checklist** in the RESUME.md file

---

## Branch Switching

When user switches branches:

- Previous branch checkpoint remains (can resume later)
- New branch may have its own checkpoint
- Claude should check for checkpoint on new branch

**Example:**

```
User: git checkout feat/GH-42_User-Auth
Claude: Switched to feat/GH-42_User-Auth. I found a checkpoint for this branch.
        Would you like me to restore that context?
```

---

## Cleanup

After a branch is merged and deleted:

- The checkpoint folder can be deleted
- Or kept for reference

```bash
rm -rf .ai-context/checkpoints/{merged-branch}/
```

---

## Implementation Notes

### For Claude (executing this skill):

1. **Always get branch first** - Determines checkpoint path
2. **Sanitize branch name** - Replace `/` with `-` for folder name
3. **Create folder if needed** - Ensure path exists before writing
4. **Be concise** - Keep summaries brief but informative
5. **Include actionable next steps** - Help future-you know what to do
6. **Timestamp everything** - Makes it clear when checkpoint was created

### Automatic Detection

Claude should proactively suggest `/checkpoint` when:

- User says "I need to stop/go/leave"
- User mentions restarting
- Session is getting long
- Context window is filling up

---

## Related

- [Resume Checkpoint](../resume-checkpoint/SKILL.md) - `/resume-checkpoint` to restore work state
- [Start Task](../start-task/SKILL.md) - `/start-task` to begin work
- [Submit PR](../submit-pr/SKILL.md) - `/submit-pr` to finish work
- [AI Context README](../../../.ai-context/README.md) - Folder structure
