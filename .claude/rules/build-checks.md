---
paths:
  - "scripts/**"
  - "turbo.json"
  - ".github/workflows/**"
  - ".husky/**"
---

# Build checks

Loaded when a script, workflow or hook is read. Each line is the rule; the link is the full text.

- **Before calling work finished run, in this order: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.** CI fails on the first error, and `pnpm lint` allows no warnings. Fix with `pnpm format` and `pnpm lint --fix`. → `docs/lessons/build-checks.md` (Check Order)
- **Prove a check you add or promote can fail: write the violation, watch it get rejected, delete it, and record that in `docs/standards/quality-gates.md`.** A gate nobody tried to fail is not yet a gate. → `docs/standards/quality-gates.md` (The rule)
- **The hooks are partial.** `.husky/pre-commit` runs `lint-staged` on staged files only; `.husky/pre-push` runs tests for changed workspaces and skips docs-only pushes. Repo hygiene (`cspell`, `jscpd`, `knip`, `ls-lint` and the `scripts/check-*` gates) runs only in CI's `quality` job. → `.github/workflows/ci.yml`
- **CI skips itself on a docs-only PR, and "docs-only" is defined by a filter in `ci.yml` and `pr-checks.yml`.** A new kind of file that changes how code is built, checked or resolved must be added to the `code` filter, or its changes go unchecked. → `docs/standards/quality-gates.md` (CI's change filter had holes)
- **A gate only counts when it runs in a workflow**, so a new script in `package.json` also goes into `ci.yml`. A check that compares against the base branch needs `fetch-depth: 0`. → `docs/standards/quality-gates.md` (A gate in package.json is not a gate)
- **Accessibility has no CI job of its own: it runs inside Unit Tests. Visual regression is not set up.** → `docs/lessons/build-checks.md` (CI Pipeline)
