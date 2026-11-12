---
paths:
  - "apps/*/src/features/*/index.ts"
  - "apps/*/src/features/*/domain/**"
  - "apps/*/src/features/*/infrastructure/**"
  - "apps/*/src/app/**"
  - "scripts/check-feature-boundaries.mjs"
---

# Application architecture

Loaded when a feature's barrel, domain or infrastructure, or an `app/` route, is read. Each line is the rule; the link is the full text. Repository level: `.claude/rules/monorepo-architecture.md`.

- **Dependencies point inward: `Presentation → Application → Domain ← Infrastructure`.** Domain imports nothing external; infrastructure implements domain interfaces. → `docs/lessons/architecture.md` (Layer Dependencies)
- **A feature never imports another feature.** Share through `shared/domain/`, `stores/` or events. `pnpm check:boundaries` fails a new crossing. → `docs/lessons/architecture.md` (Feature Isolation)
- **Each feature's `index.ts` is its public API for code outside it, routes included.** Inside a feature, import the layer directly rather than through its own barrel. If a route needs something, widen the barrel. → `docs/standards/quality-gates.md` (The feature barrel rule)
- **Use absolute imports across layers, features and shared code (`@/features/auth/application/hooks`); only same-directory imports may be relative (`./types`).** ESLint `no-restricted-imports` rejects `../domain` and `../../`. → `docs/lessons/architecture.md` (Import Rules)
- **`apps/*/src/app/` is routing only.** `page.tsx` imports and renders a feature page; layouts may add providers and shell; only `route.ts` may hold logic, and only API-specific logic. → `docs/lessons/architecture.md` (App Router Usage)
- **App-level `shared/` is for code used by two or more features in this app with no feature's business logic in it.** `UserAvatar` belongs in `features/users/`. Across apps, it goes in `packages/`. → `docs/lessons/architecture.md` (Shared Code Policy)
- **Import from `packages/api` only by the subpaths it exports: `api`, `api/supabase`, `api/supabase/browser`, `api/supabase/server`, `api/supabase/types`.** Older docs' `api/types/generated` and `api/generated/<tag>` never resolved. → `docs/lessons/architecture.md` (Generated Code (Orval))
- **Keep API fields exactly as the backend sends them.** `packages/api/src/rest/mutator/customFetch.ts` unwraps `{ success, data }` and does not change case, so `total_suggestions` stays `snake_case`; `totalSuggestions` is `undefined` at runtime. → `docs/lessons/architecture.md` (API Response Handling)
- **Mocks, domain types and docs use the generated shape too.** No parallel camelCase interfaces; a different shape needs one explicit mapping layer and a product reason. → `docs/lessons/architecture.md` (Orval Consistency Across References)
