---
paths:
  - "**/presentation/**/*.tsx"
  - "packages/ui/**"
  - "packages/app-components/**"
---

# Component patterns

Loaded when a component is read. Each line is the rule; the link is the full text. Naming is in root; one-component-per-file has its own rule.

- **Order a component body: hooks, derived values, handlers, early returns for loading and empty, then the render.** → `docs/lessons/component-patterns.md` (Standard Component Template)
- **Stay a Server Component unless it needs interaction, state, effects or browser APIs**, and pass server data into the client child as props. Add `'use client'` only at that boundary. → `docs/lessons/component-patterns.md` (Server vs Client Components)
- **Components render; hooks and services decide.** Pricing and other business rules go in `application/`, and data fetching in a container or hook so the presenter stays pure. → `docs/lessons/component-patterns.md` (Business Logic in Components)
- **Group a multi-file component in its own folder**: `LoginForm/` with `index.ts`, `LoginForm.tsx`, `LoginForm.types.ts`, `LoginForm.schema.ts`. The test goes in the workspace's `tests/`, not this folder; the lesson's co-located test predates that. → `docs/lessons/component-patterns.md` (Co-located Files)
- **Split a component that grows into focused children, and use context or composition rather than drilling a prop through levels that ignore it.** → `docs/lessons/component-patterns.md` (Anti-Patterns to Avoid)
- **`packages/ui` is shadcn on Radix with no i18n and no data**: take labels as props with an English default (`closeLabel = "Close"`), and the app injects the translation. `packages/app-components` is the shared package that does use `next-intl`. → `docs/lessons/monorepo-architecture.md` (i18n Strategy: Props Injection Pattern)
- **Reach for `/create-component` when adding one**, so the structure starts right. → `.claude/skills/create-component/SKILL.md`
