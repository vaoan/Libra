---
paths:
  - "**/presentation/**/*.tsx"
  - "packages/ui/**"
  - "**/*.css"
---

# Tailwind

Loaded when a component or stylesheet is read. Each line is the rule; the link is the full text. Where the design values live: `.claude/rules/single-source-of-truth.md`.

- **This is Tailwind v4, configured in CSS: there is no `tailwind.config.js`, and animation comes from `tw-animate-css`, not `tailwindcss-animate`.** → `docs/lessons/tailwind.md` (Configuration)
- **Use semantic colours, never palette or arbitrary ones**, in class strings, colour maps and style constants alike: `red-*` becomes `destructive`, `green-*` `success`, `amber-*`/`yellow-*` `warning`, `blue-*` `info`, `purple-*` `primary`, `slate-*`/`gray-*` `muted` or `muted-foreground`. → `docs/lessons/code-review-standards.md` (Tailwind/Styling Agent)
- **ESLint rejects arbitrary values in a `className` literal (`text-[10px]`, `w-[347px]`, `bg-[#f5f5f5]`)**, except in shadcn component directories. Use a token or a default size. → `docs/lessons/tailwind.md` (Performance)
- **Define a token before using it**: `bg-primary` with no `--color-primary` in the theme generates no CSS, and the content renders transparent. → `docs/lessons/tailwind.md` (WCAG Contrast Requirements)
- **Pair tokens (`text-primary-foreground` on `bg-primary`) and hold AA**: 4.5:1 for text, 3:1 for large text, UI components and focus rings, in both `:root` and `.dark`. Opacity modifiers like `text-foreground/50` fall below it, so check the computed contrast. `packages/ui/tests/contrast.test.ts` guards the token pairs, not a pair you compose. → `docs/lessons/tailwind.md` (WCAG Contrast Requirements)
- **Keep classes inline and never extract them to a JS constant; three or more repeats means a component, or `cva()` for variants.** The lesson's "Extract Repeated Patterns" example is overruled by this: repeated class strings are not a DRY violation here. → `docs/lessons/code-review-standards.md` (Tailwind Class Strings Policy)
- **Keep `"var(--foreground)"` strings inline too**, since the CSS variable already is the source of truth. Only numbers Recharts requires may be JS constants. → `docs/lessons/code-review-standards.md` (CSS Variable Strings Policy)
- **Merge conditional classes with `cn()` from `ui`, passing the caller's `className` last.** No `!` overrides, `@apply`, inline `style` objects or CSS-in-JS. → `docs/lessons/tailwind.md` (Anti-Patterns)
- **Write mobile-first (`flex-col md:flex-row`), `size-4` rather than `w-4 h-4`, and dark mode through semantic tokens rather than `dark:` pairs.** → `docs/lessons/tailwind.md` (Responsive Design)
- **Order classes: layout, positioning, sizing, spacing, typography, colours, effects, transitions, responsive, states.** → `docs/lessons/tailwind.md` (Order of Classes)
