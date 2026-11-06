---
paths:
  - "**/*.css"
  - "scripts/check-css-sync.mjs"
---

# CSS consistency

Loaded when a stylesheet is read. Each line is the rule; the link is the full text.

- **All six apps look identical, so put a shared style in `packages/ui/src/styles/`** (`colors.css`, `theme.css`, `utilities.css`), which each app imports as `ui/globals`. Each app's `globals.css` is only imports and `@source` lines. → `docs/lessons/css-consistency.md` (Rule)
- **A change to one `apps/*/src/app/globals.css` goes in all of them.** `pnpm check:style` (`scripts/check-css-sync.mjs`) fails on any other difference; only comments, the `@source` path and blocks between `@css-sync-ignore-start` and `@css-sync-ignore-end` may differ. A divergence needs a stated reason. → `docs/lessons/css-consistency.md` (Enforcement)
- **Every app's `globals.css` must `@source` the `ui` package**: Tailwind only generates what it scans, so a missing line shows as `inline-flex` in the markup with `display: block` computed. → `docs/lessons/css-consistency.md` (Required: UI Package Scanning)
- **Same symptoms, same causes**: a component that differs between apps means diverged `:root` or `.dark` variables; a semantic class that does not apply means diverged `@layer utilities`. Compare computed styles in two apps with Playwright. → `docs/lessons/css-consistency.md` (Common Issues)
