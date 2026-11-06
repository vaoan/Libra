# Git Workflow

## Branch Strategy

### Protected Branches

| Branch    | Purpose               | Protection                          |
| --------- | --------------------- | ----------------------------------- |
| `main`    | Production-ready code | Require PR + checks, no direct push |
| `develop` | Integration branch    | Require PR + checks, no force push  |

### Working Branches

All work branches are created from `develop` and merged back to `develop` via PR.

```
main (production)
  ↑ PR (release/* and fix/* ONLY)
develop (integration)
  ↑ PR
feat/GH-XXX_Title
chore/GH-XXX_Title
release/GH-XXX_vYYYY.MM.DD.N
fix/GH-XXX_Title (hotfixes go directly to main)
```

---

## Critical Rule: Branch Targeting

> **`release/*` branches ALWAYS target `main`.**
> **`fix/*` branches can target EITHER `main` OR `develop` (user choice).**
> **ALL other branches MUST target `develop`.**

This is **non-negotiable** and enforced at multiple levels:

### Why This Rule Exists

- `main` = **production code only**
- Features must be tested via `develop` before production
- Only approved releases and intentional hotfixes go to production
- Prevents accidental deployment of incomplete features

### Branch → Target Mapping

| Branch Type | Pattern      | Target              | Notes          |
| ----------- | ------------ | ------------------- | -------------- |
| Feature     | `feat/*`     | `develop`           | Always develop |
| Chore       | `chore/*`    | `develop`           | Always develop |
| Refactor    | `refactor/*` | `develop`           | Always develop |
| Docs        | `docs/*`     | `develop`           | Always develop |
| Release     | `release/*`  | `main`              | Always main    |
| Fix         | `fix/*`      | `develop` or `main` | **Ask user**   |

### Fix Branch Workflow

Fix branches are special because they can work with either `develop` or `main`.

#### Starting a Fix Branch

When using `/start-task` with a `fix` type, you will be asked:

```
Is this a regular bug fix or a critical production hotfix?

- develop (Recommended) - Regular bug fix, branch from develop, PR to develop
- main - Critical hotfix, branch from main, PR to main
```

This determines:

1. **Source branch** - Where the fix branch is created from
2. **PR target** - Where the PR will be merged (via `/submit-pr`)

| Fix Type | Source Branch | PR Target | Use Case                                          |
| -------- | ------------- | --------- | ------------------------------------------------- |
| Regular  | `develop`     | `develop` | Non-urgent bugs, goes through integration testing |
| Hotfix   | `main`        | `main`    | Critical production issues, immediate deployment  |

#### Creating the Fix PR

When using `/submit-pr` on a `fix/*` branch, you will be asked:

```
This is a fix branch. Where should this PR target?

- develop (Recommended) - Regular bug fix, goes through integration testing
- main - Critical hotfix, deploys directly to production
```

> **Tip:** The default should match what was selected during `/start-task`. If you branched from `develop`, target `develop`. If you branched from `main` (hotfix), target `main`.

#### Hotfix Sync Reminder

After a hotfix is merged to `main`, ensure it's also in `develop`:

```bash
# Option 1: Cherry-pick the fix commit to develop
git checkout develop
git cherry-pick <commit-hash>

# Option 2: Merge main into develop (if appropriate)
git checkout develop
git merge main
```

### Enforcement

1. **Skill Level**: `/submit-pr` asks for target on fix branches
2. **GitHub Actions**: `Branch Target` check validates allowed combinations
3. **Branch Protection**: `main` requires `Branch Target` check to pass

### Error Message

If you try to PR a non-release/fix branch to main:

```
❌ Branch 'feat/GH-42_Login' cannot target 'main'.

Only release/* and fix/* branches can merge to main.

Allowed patterns:
  - release/* → main (production releases)
  - fix/* → main (hotfixes) or develop (regular fixes)

All other branches must target 'develop'.
```

---

## Branch Naming Convention

```
{type}/GH-{issue_number}_{Short-Title}
```

### Branch Types

| Type       | Purpose                     | Example                           |
| ---------- | --------------------------- | --------------------------------- |
| `feat`     | New feature                 | `feat/GH-42_User-Authentication`  |
| `fix`      | Bug fix (regular or hotfix) | `fix/GH-15_Login-Error`           |
| `chore`    | Maintenance                 | `chore/GH-88_Update-Dependencies` |
| `docs`     | Documentation               | `docs/GH-92_API-Documentation`    |
| `refactor` | Code refactoring            | `refactor/GH-55_Cleanup-Auth`     |
| `release`  | Release preparation         | `release/GH-100_v2026.04.22.1`    |

### Naming Rules

1. **Type**: Must be one of `feat`, `fix`, `chore`, `docs`, `refactor`, `release`
2. **Prefix**: Always `GH-` followed by the GitHub issue number
3. **Title**: Short description in Title-Case, spaces replaced with `-`
4. **Separator**: Use `_` between ticket and title

**Examples:**

```
feat/GH-42_User-Authentication
fix/GH-15_Fix-Login-Redirect
chore/GH-88_Update-Dependencies
release/GH-100_v2026.04.22.1
```

---

## Workflow

### Starting a Task

Use the `/start-task` command:

```bash
/start-task GH-42 feat              # Create feature branch
/start-task 42 fix                  # Create fix branch (# or GH- optional)
/start-task GH-88 chore             # Create chore branch
```

This will:

1. Fetch latest `develop` branch
2. Create branch with proper naming
3. Checkout the new branch

### Submitting a PR

Use the `/submit-pr` command:

```bash
/submit-pr                          # Create PR to develop
/submit-pr --draft                  # Create draft PR
/submit-pr --skip-checks            # Skip quality checks
```

This will:

1. Run quality checks (format, lint, build)
2. Commit any uncommitted changes
3. Push branch to origin
4. Create or update PR to `develop`
5. Link to GitHub issue

---

## Commit Messages

Use conventional commit format with ticket reference:

```
type(scope): short description [GH-XXX]

Longer description if needed.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

### Types

| Type       | Description                 |
| ---------- | --------------------------- |
| `feat`     | New feature                 |
| `fix`      | Bug fix                     |
| `refactor` | Code refactoring            |
| `docs`     | Documentation               |
| `style`    | Formatting (no code change) |
| `test`     | Adding tests                |
| `chore`    | Maintenance tasks           |
| `perf`     | Performance improvement     |
| `revert`   | Revert a previous commit    |

### Examples

```
feat(auth): add login form validation [GH-42]

fix(api): handle null response from server [GH-15]

chore(deps): update React to v19 [GH-88]
```

---

## Pull Requests

### Creating PRs

1. All PRs target `develop` (except releases)
2. Use descriptive title: `type(scope): description [GH-XXX]`
3. Link to GitHub issue with `Closes #XXX` or `Fixes #XXX`
4. Include summary of changes

#### The title length the CI check actually enforces

The **subject** — everything after `type(scope): `, including the `[GH-XXX]`
suffix — must be **80 characters or fewer**. The `PR Title` job enforces it with
`subjectPattern: ^.{1,80}$` and fails with "PR title must be less than 80
characters".

The scope and type are not counted, so the whole title can exceed 80 while
still passing, and a title well under 100 can still fail. Count from the space
after the colon:

```
fix(payments): report range filters used a column that does not exist [GH-000]
               ^------------------------ 63 characters -------------------^
```

The job runs on `edited`, so correcting the title clears the failure without
pushing a commit — see [The PR Title check could not see a corrected
title](../../docs/standards/quality-gates.md).

### PR Template

```markdown
## Summary

Brief description of changes.

## Related Issue

Closes #XXX

## Changes

- Change 1
- Change 2

## Testing

How to test these changes.
```

### Merging

Use the `/merge-pr` command to merge PRs with the correct strategy:

```bash
/merge-pr              # Merge PR for current branch
/merge-pr 42           # Merge specific PR
```

**Merge strategies by target branch:**

| Target    | Method           | Reason                                |
| --------- | ---------------- | ------------------------------------- |
| `develop` | Squash and merge | Clean history, one commit per feature |
| `main`    | Merge commit     | Preserve full history for releases    |

- Feature/fix/chore PRs → squash merge to `develop`
- Release PRs → merge commit to `main`

---

## Release Workflow

Release versions use a date-based format: `vYYYY.MM.DD.N` where `N` is a sequential counter starting at 1 per day.

1. Create release branch: `release/GH-XXX_vYYYY.MM.DD.N`
2. Create PR to `main` with title: `chore(release): vYYYY.MM.DD.N [GH-XXX]`
3. After CI passes and PR is merged, tag the release
4. Merge `main` back to `develop`

> **Critical:** Release PR titles MUST use `chore(release):` — NOT `release:`. The PR Title CI check only accepts valid conventional commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `revert`. The word `release` alone is **not** a valid type.

**Example:**

```
Branch: release/GH-152_v2026.04.22.1
PR title: chore(release): v2026.04.22.1 [GH-152]
```

---

## Rules

- **Never** force push to `main` or `develop`
- **Never** commit secrets or tokens
- **Always** create PRs for code review
- **Always** link to GitHub issue
- **Keep** commits focused and atomic
- **Use** conventional commit format

---

## Branch Protection Setup

### GitHub UI Setup Instructions

#### Protect `main` Branch

1. Go to **Repository → Settings → Branches**
2. Click **Add branch protection rule**
3. Branch name pattern: `main`
4. Enable:
   - [x] **Require a pull request before merging**
     - [x] Require approvals: `0` in a solo repo, or `1+` if you have other reviewers
     - [x] Dismiss stale PR approvals when new commits are pushed
   - [x] **Require status checks to pass before merging**
     - [x] Require branches to be up to date before merging
     - Add required checks: `Branch Target`, `Quality Checks`, `Unit Tests`, `Docker Build`
   - [x] **Do not allow bypassing the above settings** (enforce on admins)
   - [ ] **Allow force pushes** (NEVER enable this)
   - [ ] **Allow deletions** (NEVER enable this)
5. Click **Create**

#### Current `main` Protection (Configured)

| Setting                | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Required approvals     | 0                                                               |
| Dismiss stale reviews  | Yes                                                             |
| Required status checks | `Branch Target`, `Quality Checks`, `Unit Tests`, `Docker Build` |
| Require up-to-date     | Yes                                                             |
| Enforce on admins      | Yes                                                             |
| Force pushes           | Disabled                                                        |
| Deletions              | Disabled                                                        |

#### Protect `develop` Branch

1. Add another rule for `develop`
2. Enable:
   - [x] **Require a pull request before merging**
     - [x] Require approvals: `0`
     - [x] Dismiss stale PR approvals when new commits are pushed
   - [x] **Require status checks to pass before merging**
     - [x] Require branches to be up to date before merging
     - Add required checks: `Branch Target`, `Quality Checks`, `Unit Tests`, `Docker Build`
   - [x] **Do not allow bypassing the above settings** (enforce on admins)
   - [ ] **Allow force pushes** (leave unchecked)
   - [ ] **Allow deletions** (leave unchecked)
3. Click **Create**

### Verification

After setup, test protection:

1. Try to push directly to `main`:

   ```bash
   git checkout main
   git commit --allow-empty -m "test"
   git push origin main  # Should be rejected
   ```

2. Create a PR instead - should work.

---

## Related

- [Start Task Skill](../skills/start-task/SKILL.md) - `/start-task`
- [Submit PR Skill](../skills/submit-pr/SKILL.md) - `/submit-pr`
- [Merge PR Skill](../skills/merge-pr/SKILL.md) - `/merge-pr`
- [Git Safety](./git-safety.md) - Git safety and commit guidelines
