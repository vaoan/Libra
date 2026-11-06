# Git Safety Rule

## ⛔ CRITICAL: This Rule Overrides All Others

> **NEVER execute git write operations without explicit user permission.**

This rule exists because unauthorized commits, pushes, or branch modifications can:

- Pollute git history
- Push incomplete or broken code
- Cause merge conflicts
- Trigger CI/CD pipelines unexpectedly
- Deploy code to production accidentally

---

## Forbidden Operations (Require Explicit Permission)

### Tier 1: NEVER Without Permission

These operations modify git history or remote state:

| Operation         | MCP Tool                           | Risk Level  |
| ----------------- | ---------------------------------- | ----------- |
| Commit            | `mcp__git__git_commit`             | 🔴 HIGH     |
| Push              | `mcp__git__git_push`               | 🔴 HIGH     |
| Force Push        | `mcp__git__git_push` (force)       | 🔴 CRITICAL |
| Merge             | `mcp__git__git_merge`              | 🔴 HIGH     |
| Rebase            | `mcp__git__git_rebase`             | 🔴 CRITICAL |
| Reset             | `mcp__git__git_reset`              | 🔴 CRITICAL |
| Cherry-pick       | `mcp__git__git_cherry_pick`        | 🟡 MEDIUM   |
| Amend             | `mcp__git__git_commit` (amend)     | 🔴 CRITICAL |
| Tag create/delete | `mcp__git__git_tag`                | 🟡 MEDIUM   |
| Branch delete     | `mcp__git__git_branch` (delete)    | 🟡 MEDIUM   |
| Stash drop/clear  | `mcp__git__git_stash` (drop/clear) | 🟡 MEDIUM   |
| Clean             | `mcp__git__git_clean`              | 🔴 HIGH     |

### Tier 2: Ask Before Executing

These operations change working state:

| Operation       | MCP Tool                          | Ask First                           |
| --------------- | --------------------------------- | ----------------------------------- |
| Checkout branch | `mcp__git__git_checkout`          | "Should I switch to branch X?"      |
| Create branch   | `mcp__git__git_branch` (create)   | "Should I create branch X?"         |
| Stash push      | `mcp__git__git_stash` (push)      | "Should I stash your changes?"      |
| Stash pop/apply | `mcp__git__git_stash` (pop/apply) | "Should I restore stashed changes?" |
| Pull            | `mcp__git__git_pull`              | "Should I pull latest changes?"     |

### Tier 3: Safe (No Permission Needed)

Read-only operations:

| Operation   | MCP Tool                      | Safe |
| ----------- | ----------------------------- | ---- |
| Status      | `mcp__git__git_status`        | ✅   |
| Diff        | `mcp__git__git_diff`          | ✅   |
| Log         | `mcp__git__git_log`           | ✅   |
| Show        | `mcp__git__git_show`          | ✅   |
| Branch list | `mcp__git__git_branch` (list) | ✅   |
| Remote list | `mcp__git__git_remote` (list) | ✅   |
| Fetch       | `mcp__git__git_fetch`         | ✅   |
| Blame       | `mcp__git__git_blame`         | ✅   |
| Stash list  | `mcp__git__git_stash` (list)  | ✅   |
| Reflog      | `mcp__git__git_reflog`        | ✅   |

---

## Required User Phrases

Only proceed with Tier 1 operations when user says one of these:

### For Commit:

- "commit this"
- "commit the changes"
- "commit it"
- "make a commit"
- "create a commit"

### For Push:

- "push"
- "push it"
- "push the changes"
- "push to remote"

### For Merge:

- "merge this"
- "merge the branch"
- "merge X into Y"

### NOT Sufficient (Do NOT commit):

- "looks good" ❌
- "that's fine" ❌
- "ok" ❌
- "done" ❌
- "nice work" ❌
- User just moved on to another topic ❌

---

## Workflow: After Making Code Changes

```
┌─────────────────────────────────────────┐
│         Code Changes Made               │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  1. STOP - Do NOT commit automatically  │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  2. REPORT - List files changed         │
│     "I've updated the following files:" │
│     - file1.ts                          │
│     - file2.ts                          │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  3. WAIT - For user instruction         │
│     Do NOT ask "should I commit?"       │
│     Just wait silently for direction    │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  4. Only commit if user explicitly says │
│     "commit this" or similar            │
└─────────────────────────────────────────┘
```

---

## Skills That Involve Git

These skills have their own git safety sections:

| Skill                | Git Operations          | Safety                       |
| -------------------- | ----------------------- | ---------------------------- |
| `/start-task`        | branch create, checkout | Ask before creating          |
| `/submit-pr`         | commit, push, PR create | Requires explicit invocation |
| `/commit-push`       | commit, push            | Requires explicit invocation |
| `/merge-pr`          | merge                   | Requires explicit invocation |
| `/sync-with-develop` | pull, merge/rebase      | Requires explicit invocation |
| `/checkpoint`        | may stash               | Ask before stashing          |

**Important:** Even when a skill is invoked, individual git operations within may still need confirmation depending on context.

---

## What To Do If You Almost Violate This Rule

If you catch yourself about to execute a forbidden operation:

1. **STOP** - Do not execute the tool call
2. **INFORM** - Tell the user: "I was about to [commit/push/etc] but stopped because I need your permission first."
3. **ASK** - "Would you like me to [commit/push/etc] these changes?"
4. **WAIT** - For explicit confirmation

---

## Examples

### WRONG:

```
User: "Update the button color to blue"
Assistant: *makes changes*
Assistant: *commits changes* ← VIOLATION
Assistant: "Done! I've updated the button and committed the changes."
```

### CORRECT:

```
User: "Update the button color to blue"
Assistant: *makes changes*
Assistant: "I've updated the button color to blue in src/components/Button.tsx"
*waits*

User: "commit this"
Assistant: *now commits*
Assistant: "Committed: fix(ui): update button color to blue"
```

### WRONG:

```
User: "Fix the login bug"
Assistant: *makes changes*
Assistant: "Should I commit these changes?" ← Don't even ask
```

### CORRECT:

```
User: "Fix the login bug"
Assistant: *makes changes*
Assistant: "I've fixed the login bug. Changed files:
- src/features/auth/LoginForm.tsx
- src/features/auth/useAuth.ts"
*waits silently for instruction*
```

---

## Related

- [Git Workflow](./git-workflow.md) - Branch and PR conventions
- [MCP-First Rule](./mcp-first.md) - Use MCP tools for git
