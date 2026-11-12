---
name: create-release
description: Create a production release by merging develop into main with a PR and release notes.
---

# Create Release

## Git Safety Warning

> **This skill creates branches and PRs to main. It MUST be explicitly invoked by the user.**
>
> Requirements:
>
> - User must explicitly say "/create-release" or "create a release"
> - Do NOT run this skill automatically
> - Do NOT suggest running this skill
> - This creates a PR that targets PRODUCTION (main)

See [Git Safety Rule](../../../docs/lessons/git-safety.md)

---

## Description

Creates a production release by merging `develop` into `main` via a `release/*` branch. Uses a standardized naming convention and creates a PR with release notes.

**This skill uses a task list to show progress during the release.**

## Usage

```
/create-release
```

Or natural language:

```
Create a release
Deploy to production
Merge develop to main
```

## When to Use

**Use this skill when:**

- Features in `develop` are ready for production
- QA has approved changes
- You need to deploy to production

**Do NOT use if:**

- QA testing is incomplete
- There are known blocking issues
- `develop` and `main` are identical

---

## CI Compatibility

This skill is designed to pass all GitHub Actions checks in `pr-checks.yml`:

| CI Check          | Requirement                                             | How We Comply                           |
| ----------------- | ------------------------------------------------------- | --------------------------------------- |
| **Branch Target** | Only `release/*` or `fix/*` can target `main`           | Create a `release/vYYYY.MM.DD.N` branch |
| **PR Title**      | Conventional commit format (`type(scope): description`) | Use `chore(release): vYYYY.MM.DD.N`     |

---

## Release Naming Convention

**Version format:** `vYYYY.MM.DD.N`

- `YYYY` = 4-digit year
- `MM` = 2-digit month (zero-padded)
- `DD` = 2-digit day (zero-padded)
- `N` = Sequential number for releases on the same day (starts at 1)

**Branch name:** `release/vYYYY.MM.DD.N`
**PR title:** `chore(release): vYYYY.MM.DD.N`

**Examples:**

| Day          | Release # | Branch                  | PR Title                        |
| ------------ | --------- | ----------------------- | ------------------------------- |
| Jan 9, 2025  | 1st       | `release/v2025.01.09.1` | `chore(release): v2025.01.09.1` |
| Jan 9, 2025  | 2nd       | `release/v2025.01.09.2` | `chore(release): v2025.01.09.2` |
| Dec 15, 2025 | 1st       | `release/v2025.12.15.1` | `chore(release): v2025.12.15.1` |

---

## Execution Steps (with Task Tracking)

When executing this skill, Claude MUST use task tools to track progress:

### Step 1: Initialize Task List

Create tasks:

1. Verify current state
2. Check develop is ahead of main
3. Determine release number
4. Create release branch and PR
5. Wait for CI checks
6. Confirm with user
7. Merge release PR
8. Switch to develop and clean up
9. Report results

### Step 2: Verify Current State

**Task: "Verify current state" -> in_progress**

**Switch to develop and update:**

```bash
git checkout develop
git pull origin develop
git status
```

**Verify:**

- On `develop` branch
- Working tree is clean
- No uncommitted changes

### Step 3: Verify Develop is Ahead of Main

**Task: "Check develop is ahead of main" -> in_progress**

**Check if there are commits to release:**

```bash
git fetch origin main
git log main..develop --oneline
```

**If no commits:**

```
Nothing to release. Develop and main are identical.
```

STOP - Do not continue.

**If commits exist, list them and continue.**

### Step 4: Determine Release Number

**Task: "Determine release number" -> in_progress**

**Check for existing releases today:**

```bash
gh pr list --base main --state all --limit 10 --json title,number,state
```

Look for PRs with today's date pattern in the title:

- If `vYYYY.MM.DD.1` exists -> use `.2`
- If `vYYYY.MM.DD.2` exists -> use `.3`
- If no releases today -> use `.1`

**Generate names:**

```
version = vYYYY.MM.DD.N
branch  = release/vYYYY.MM.DD.N
title   = chore(release): vYYYY.MM.DD.N
```

### Step 5: Create Release Branch and PR

**Task: "Create release branch and PR" -> in_progress**

**CRITICAL: A `release/*` branch is required because the Branch Target CI check
only allows `release/*` and `fix/*` branches to target `main`.**

1. **Create the release branch from develop:**

```bash
git checkout -b release/vYYYY.MM.DD.N develop
git push -u origin release/vYYYY.MM.DD.N
```

2. **Create the PR with conventional commit title:**

```bash
gh pr create \
  --title "chore(release): vYYYY.MM.DD.N" \
  --head "release/vYYYY.MM.DD.N" \
  --base main \
  --body "..."
```

**PR Body Template:**

```markdown
## Production Release

**Release:** `vYYYY.MM.DD.N`

---

## Changes Included

[List commits/PRs since last release]

- abc1234 feat(auth): add login form
- def5678 fix(api): handle errors

---

## Pre-Release Checklist

- [x] All PRs merged to develop have been reviewed
- [x] Quality checks passed
- [ ] QA testing complete (if applicable)

---

## Post-Merge Actions

After merging:

1. Monitor deployment
2. Verify production site
3. Check error monitoring
```

### Step 6: Wait for CI Checks

**Task: "Wait for CI checks" -> in_progress**

Wait for all CI checks to pass on the release PR:

```bash
gh pr checks {pr_number} --watch
```

**If any check fails:**

- Report the failure to the user
- Do NOT proceed with merge
- The user must fix the issue and re-run

### Step 7: Confirm with User

**Task: "Confirm with user" -> in_progress**

**Ask for confirmation before merging:**

```
Ready to merge release?

**Release:** vYYYY.MM.DD.N
**PR:** #{pr_number}
**Changes:** {N} commits
**Target:** main (production)

This will deploy to production. Proceed with merge?

- **Yes** - Merge the release
- **No** - Cancel (PR will remain open)
```

**If user says No:**

```
Release cancelled. PR #{pr_number} remains open.

You can merge it later from GitHub or run /merge-pr {pr_number}
```

STOP - Do not continue.

### Step 8: Merge Release PR

**Task: "Merge release PR" -> in_progress**

**Use merge commit (NOT squash) to preserve history:**

```bash
gh pr merge {pr_number} --merge --delete-branch
```

**Why merge commit for releases:**

- Preserves full commit history
- Shows all individual changes in release
- Better for auditing production changes
- Creates clear release marker

**The `--delete-branch` flag cleans up the release branch after merge.**

### Step 9: Switch to Develop and Clean Up

**Task: "Switch to develop and clean up" -> in_progress**

After merge, switch back to `develop` for continued development:

```bash
git checkout develop
git pull origin develop
```

**Note:** A GitHub Action (`release.yml`) automatically creates a GitHub Release
with tag and auto-generated release notes when the release PR is merged.

### Step 10: Report Results

**Task: "Report results" -> in_progress**

```
## Release Complete

**Release:** vYYYY.MM.DD.N
**PR:** #{pr_number}
**Method:** Merge commit
**Commits:** {N} released to production
**Current branch:** develop
**GitHub Release:** Auto-created by CI with tag vYYYY.MM.DD.N

### Next Steps

1. Monitor deployment
2. Verify production site
3. Check error monitoring
```

Mark all tasks completed.

---

## Release Types

### Regular Release

- Branch flow: `develop` -> `release/vYYYY.MM.DD.N` -> `main`
- PR title: `chore(release): vYYYY.MM.DD.N`
- Contains accumulated features from develop

### Hotfix Release

For urgent production fixes:

1. Create `fix/GH-XXX_Description` from `main`
2. Make fix
3. PR directly to `main` with title `fix(scope): description [GH-XXX]`
4. After merge, sync `main` back to `develop`

---

## Common Issues

**Branch Target check fails:**

- Ensure the branch name starts with `release/`
- Do NOT PR directly from `develop` to `main`

**PR Title check fails:**

- Must use conventional commit format: `chore(release): vYYYY.MM.DD.N`
- Do NOT use plain text like `release 2025.01.09.1`

**No changes to release:**

- Check `git log main..develop --oneline`
- If empty, nothing to release

**Merge conflicts:**

- Resolve conflicts locally on the release branch
- Push resolved changes
- Wait for CI to re-run

**Wrong release number:**

- Check GitHub for today's releases
- Increment from highest number

---

## Examples

### Example 1: First Release of the Day

```
/create-release
```

**Creates:**

- Branch: `release/v2025.01.09.1`
- PR: `chore(release): v2025.01.09.1` targeting `main`

**Output:**

```
## Release Complete

**Release:** v2025.01.09.1
**PR:** #42
**Method:** Merge commit
**Commits:** 12 released to production
```

### Example 2: Second Release Same Day

```
/create-release
```

**Detects:** `v2025.01.09.1` already exists, increments to `.2`

**Creates:**

- Branch: `release/v2025.01.09.2`
- PR: `chore(release): v2025.01.09.2` targeting `main`

### Example 3: Nothing to Release

```
/create-release
```

**Output:**

```
Nothing to release. Develop and main are identical.

No new commits since last release.
```

---

## Related

- [Merge PR](../merge-pr/SKILL.md) - Merge any PR
- [Submit PR](../submit-pr/SKILL.md) - Submit feature PRs to develop
- [Git Workflow](../../../docs/lessons/git-workflow.md) - Branch conventions
