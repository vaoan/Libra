---
name: git-workflow
description: Libra's branch names and targets, commit format, PR title limit, merge strategy, fix and hotfix flow, and release steps. Use when creating a branch, writing a commit or PR, merging, or cutting a release.
---

# Git workflow

Every step here that writes to git still needs the user's explicit ask (`docs/lessons/git-safety.md`). Full text, including branch protection setup: `docs/lessons/git-workflow.md`. Commands: `/start-task`, `/submit-pr`, `/merge-pr`, `/create-release`.

## Branches and targets

Branch name: `{type}/GH-{issue_number}_{Short-Title}`, for example `feat/GH-42_User-Authentication`. Type is one of `feat`, `fix`, `chore`, `docs`, `refactor`, `release`. Title is Title-Case with `-` for spaces; `_` separates ticket from title.

| Branch type                                 | Branch from | PR target         |
| ------------------------------------------- | ----------- | ----------------- |
| `feat/*`, `chore/*`, `refactor/*`, `docs/*` | `develop`   | `develop`, always |
| `release/*`                                 | `develop`   | `main`, always    |
| `fix/*`, regular bug                        | `develop`   | `develop`         |
| `fix/*`, critical production hotfix         | `main`      | `main`            |

The `Branch Target` check in `pr-checks.yml` fails anything else, and it is required on `main`. On a `fix/*` branch, ask the user which kind it is; do not choose. Never force push `main` or `develop`.

After a hotfix merges to `main`, get it into `develop`: cherry-pick the commit, or merge `main` into `develop`.

## Commits

```
type(scope): short description [GH-XXX]

Longer description if needed.
```

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`, `revert`. Keep commits focused. `.husky/pre-commit` runs `lint-staged` on what is staged.

## Pull requests

1. Title: `type(scope): description [GH-XXX]`. Link the issue with `Closes #XXX` or `Fixes #XXX`.
2. **The subject, everything after `type(scope): ` including `[GH-XXX]`, must be 80 characters or fewer.** The `PR Title` job checks `^.{1,80}$`. Scope and type do not count, so count from the space after the colon. The job also runs on `edited`, so correcting the title clears a failure with no new commit.
3. Body: Summary, Related Issue, Changes, Testing.

## Merging

| Target    | Method           | Why                                   |
| --------- | ---------------- | ------------------------------------- |
| `develop` | Squash and merge | Clean history, one commit per feature |
| `main`    | Merge commit     | Preserve full history for releases    |

## Releases

Version format: `vYYYY.MM.DD.N`, where `N` counts from 1 each day.

1. Create the branch: `release/GH-XXX_vYYYY.MM.DD.N`.
2. Open a PR to `main` titled `chore(release): vYYYY.MM.DD.N [GH-XXX]`. Not `release:`, which is not a valid type and fails the `PR Title` job.
3. After CI passes and the PR merges, tag the release.
4. Merge `main` back to `develop`.
