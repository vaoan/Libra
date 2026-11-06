---
paths:
  - "apps/*/src/features/*/application/**"
  - "apps/*/src/features/*/domain/searchParams.ts"
---

# URL state

Loaded when a feature's application code or URL parsers are read. Each line is the rule; the link is the full text.

- **Filters, search, pagination, tabs, sort, view mode and shareable panel state go in the URL with `useQueryStates` from `nuqs`, not `useState`.** → `docs/lessons/url-state.md` (When to Use nuqs vs useState)
- **Keep `useState` only for what no URL should hold**: chat messages, file attachments, animation progress, TanStack Table internals, form input before submit. → `docs/lessons/url-state.md` (When to Use nuqs vs useState)
- **Do not rely on ESLint here outside admin.** It bans `useState` in `apps/admin/src/**/application/hooks/`, but its other glob names apps/web, which does not exist, so the store has no such guard. → `eslint.config.mjs`
- **Define parsers in `features/<feature>/domain/searchParams.ts`, never in the hook or component**, and export them as one object the hook passes to `useQueryStates`. → `docs/lessons/url-state.md` (Parser Location)
- **Use `history: "push"` for pagination, tabs and view mode so Back works, and `history: "replace"` for filters and search so typing does not fill history.** → `docs/lessons/url-state.md` (History Mode)
- **Name params in kebab-case, scoped by feature, to avoid collisions.** → `docs/lessons/url-state.md` (Param Naming)
- **`NuqsTestingAdapter` is already in the test `AllProviders` wrapper**; wrap directly only to set initial params with `searchParams`. → `docs/lessons/url-state.md` (Testing)
