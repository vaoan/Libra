# Kebab-case file naming migration

**Status:** approved design, not yet implemented
**Date:** 2026-09-06
**Phase:** 0 of the orrery programme
**Decision record:** `orrery/docs/decisions/0001-file-naming.md`
**Parent design:** `orrery/docs/specs/2026-09-06-orrery-design.md`

Rename every source, test, and e2e file in this repository to kebab-case, and
close the enforcement gaps that let the current convention drift unobserved.

## Why

libra's documented file-naming convention cannot be enforced by its own linter.
`.claude/rules/naming-conventions.md` specifies PascalCase components, camelCase
hooks and utilities, PascalCase services and repositories. The ls-lint rule that
is supposed to hold it is:

```
.ts: kebab-case | regex:^[a-z][a-zA-Z0-9]*$ | regex:^[A-Z][A-Za-z0-9]*$
```

That accepts all three forms in every location. `FormatDate.ts` passes lint while
violating the documented rule. The rule is aspirational; the enforcement is
permissive. kebab-case is the only convention where the rule and the enforcement
are the same artifact. Full reasoning, including what was weighed against it, is
in ADR 0001.

## Scope

| Location                                                        | Files     | To rename |
| --------------------------------------------------------------- | --------- | --------- |
| `apps/*/src`, `packages/*/src`                                  | 677       | 396       |
| `apps/*/tests`, `apps/*/test`, `packages/*/tests`, `apps/*/e2e` | 390       | 298       |
| **Total**                                                       | **1,067** | **694**   |

Per workspace, in `src` only:

```
apps/payments  97    packages/shared          29
apps/admin     89    apps/auth                13
apps/studio    64    packages/app-components  12
apps/store     58    apps/landing             11
                     packages/ui              10
                     packages/auth            10
                     packages/api              3
```

Of the 396 `src` violations, 244 are PascalCase and 152 are camelCase. None fall
outside those two forms.

**No lockstep collateral.** The repository has zero `.stories.tsx` and zero
`.module.css` files, so no sibling files must rename in step with a component.

**Not in scope:** identifier casing (variables, functions, constants, enum-like
objects). `naming-conventions.md` keeps that guidance unchanged. Only the
file-naming table is rewritten.

## Enforcement — three layers

All three land with the migration, not after it.

**1. ESLint.** `unicorn/filename-case` is currently `"off"` at
`eslint.config.mjs:916`. `eslint-plugin-unicorn` is already a dependency.

```js
"unicorn/filename-case": ["error", { case: "kebabCase" }]
```

**2. ls-lint.** The permissive triple-regex is replaced, and coverage extends to
directories that are currently unlinted for naming — `apps/*/tests`,
`apps/*/test`, and `packages/*/tests`, where 298 of the violations accumulated
unobserved.

```yaml
ls:
  apps/*/src:
    {
      .ts: kebab-case,
      .tsx: kebab-case,
      .js: kebab-case,
      .css: kebab-case,
      .json: kebab-case,
    }
  apps/*/tests: { .ts: kebab-case, .tsx: kebab-case }
  apps/*/test: { .ts: kebab-case, .tsx: kebab-case }
  apps/*/e2e: { .ts: kebab-case, .spec.ts: kebab-case }
  packages/*/src: { .ts: kebab-case, .tsx: kebab-case }
  packages/*/tests: { .ts: kebab-case, .tsx: kebab-case }
```

The documented shadcn/ui exception is deleted. Those files are already lowercase
and become compliant by default.

**3. tsconfig.** `forceConsistentCasingInFileNames: true` is already set in
`tsconfig.base.json` and stays. It is the verification gate for the migration:
any import left pointing at an old casing fails typecheck.

## Procedure

**Use a TypeScript-aware codemod, not `git mv` plus find-and-replace.** A
`ts-morph` script walks the module graph and rewrites every import specifier,
including barrel `index.ts` re-exports. A regex approach misses re-exports and
leaves 694 files to debug by hand.

Three hazards, each handled explicitly:

**Case-only renames.** Six files are single-word PascalCase (`Button.tsx` ->
`button.tsx`). `git config core.ignorecase` is `true` in this repository, so
`git mv Button.tsx button.tsx` silently no-ops. These route through a temporary
name — `Button.tsx` -> `Button.tsx.tmp` -> `button.tsx` — as two commits' worth
of index operations in one commit. This is a silent failure if missed, not a
loud one.

**Dynamic imports.** Eleven `import()` call sites exist. Codemods rewrite static
specifiers reliably and computed ones not at all. Each is reviewed by hand and
listed in the PR description.

**Non-TypeScript references.** Any file path appearing in `next.config.ts`,
Playwright configs, Docker build files, or `package.json` scripts is grepped for
after the codemod runs and before typecheck.

### Sequencing

One PR per workspace — 11 reviewable diffs rather than a single 694-file diff
nobody can read. Order runs smallest-blast-radius first so the codemod is proven
on low-risk workspaces before it touches the largest:

```
packages/api (3)  ->  packages/ui (10)  ->  packages/auth (10)
  ->  packages/app-components (12)  ->  apps/landing (11)  ->  apps/auth (13)
  ->  packages/shared (29)  ->  apps/store (58)  ->  apps/studio (64)
  ->  apps/admin (89)  ->  apps/payments (97)
```

Enforcement lands in a final twelfth PR, once every workspace is compliant.
Turning it on earlier would redden CI for the duration.

### Verification, per PR

```
pnpm typecheck     # forceConsistentCasingInFileNames catches any missed import
pnpm lint
pnpm test
pnpm build
```

Plus `pnpm e2e:ci` on the workspaces that have e2e coverage, and `pnpm ls-lint`
on the final enforcement PR.

## Codemod tests

The codemod runs against 694 real files, so it gets fixtures first:

- a barrel `index.ts` re-exporting a renamed module
- a case-only rename on a case-insensitive filesystem
- a dynamic `import()` with a static specifier (rewritten) and one with a
  computed specifier (flagged, not rewritten)
- a file imported through a `@/` path alias
- a test file importing a renamed source file across the `src`/`tests` boundary

## Consequences

- `naming-conventions.md`'s file-naming table is rewritten to a single rule.
  Its identifier-casing guidance is untouched.
- The shadcn/ui exception disappears.
- `git blame` gains a rename boundary on 694 files. `git log --follow` continues
  to work; reviewers should use `--find-renames` on the migration commits.
- aeleos requires no changes — it is already at 0 violations of 173 files — but
  gains `forceConsistentCasingInFileNames`, which it currently lacks, in Phase 1.
- After this phase, ls-lint reconciliation between the two repos becomes a
  superset merge rather than a conflict, which is why this runs before the
  orrery extraction.
