---
paths:
  - "**/presentation/**/*.tsx"
  - "**/*.css"
  - "**/i18n/messages/*.json"
---

# Single source of truth

Loaded when a component, stylesheet or locale file is read. Each line is the rule; the link is the full text.

- **Colours come from the theme in `packages/ui/src/styles/colors.css`, never a palette class or chart literal.** `stroke="#8884d8"` becomes `var(--chart-1)`. No token fits: add one in the theme, add a utility in `utilities.css`, and comment when to use it. → `docs/lessons/single-source-of-truth.md` (Colors: Semantic Only)
- **Text takes a semantic class from `packages/ui/src/styles/utilities.css`** (`text-body`, `text-metric-value`, and so on), not `text-[13px]` or a bare `text-sm` with no stated role. Recharts ignores `className`, so its numeric sizes come from a named constant. → `docs/lessons/single-source-of-truth.md` (Typography: Semantic Only)
- **Add a translation key to both `en.json` and `es.json` in that app's `src/shared/infrastructure/i18n/messages/` before using it.** Each app owns its own files, so a key shared by two apps goes in both. → `docs/lessons/single-source-of-truth.md` (Internationalization (i18n): Complete Translations)
- **Check the key's shape**: the `useTranslations()` namespace must exist at the top level, and a key holding an object needs its leaf (`t("slaBreaches.title")`, not `t("slaBreaches")`). Both fail only at runtime. → `docs/lessons/single-source-of-truth.md` (Common Mistakes)
- **Every value has one home**: business constants in `features/<feature>/domain/constants.ts`, types in `domain/types/`, config in `shared/infrastructure/config/`. → `docs/lessons/single-source-of-truth.md` (Sources of Truth)
