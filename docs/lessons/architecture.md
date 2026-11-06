# Architecture Rules

> This document covers **application-level** Clean Architecture within each app (`apps/store`, `apps/admin`).
> For **repository-level** architecture (packages, apps, dependencies), see [Monorepo Architecture](./monorepo-architecture.md).

---

## Clean Architecture Principles

### Layer Dependencies

Dependencies MUST flow inward only:

```
Presentation → Application → Domain ← Infrastructure
```

- **Domain** has NO external dependencies
- **Application** depends only on Domain
- **Presentation** depends on Application (and transitively Domain)
- **Infrastructure** implements Domain interfaces

### Feature Isolation

Each feature is a self-contained module within an app:

```
apps/[app]/src/features/[feature-name]/
├── domain/           # Business entities, types, interfaces
├── application/      # Use cases, services, hooks
├── infrastructure/   # API calls, repositories
└── presentation/     # Components, pages
```

**Rules:**

1. Features MUST NOT import directly from other features
2. Cross-feature communication goes through:
   - Shared interfaces in `/shared/domain/`
   - Global stores in `/stores/`
   - Event emitters or pub/sub patterns
3. Each feature MUST have an `index.ts` exporting its public API

### Import Rules

> **ALWAYS prefer absolute imports over relative imports.**

Absolute imports improve code readability, make refactoring safer, and prevent confusing `../../../` chains.

#### Absolute Import Requirements

| Context                 | Rule                  | Example                             |
| ----------------------- | --------------------- | ----------------------------------- |
| Cross-layer in features | **MUST** use absolute | `@/features/dashboard/domain/types` |
| Cross-feature           | **MUST** use absolute | `@/features/auth/application/hooks` |
| Shared code             | **MUST** use absolute | `@/shared/infrastructure/i18n`      |
| Same directory          | MAY use relative      | `./Component`, `./types`            |
| Test imports            | **MUST** use absolute | `@/test/utils`                      |

#### Examples

```typescript
// ✅ CORRECT: Imports from workspace packages (no @/ prefix)
import { Button, Card } from "ui";
import { formatDate, useDebounce } from "shared";

// ✅ CORRECT: Absolute imports within the app
import type { DashboardMetrics } from "@/features/dashboard/domain/types";
import { dashboardApi } from "@/features/dashboard/infrastructure";
import { useDashboard } from "@/features/dashboard/application/hooks";
import { routing } from "@/shared/infrastructure/i18n";
import { render } from "@/test/utils";

// ✅ CORRECT: Same-directory relative imports are OK
import { ComponentProps } from "./Component.types";
import { validationSchema } from "./schema";

// ❌ INCORRECT: Relative imports crossing layers
import type { DashboardMetrics } from "../domain/types";
import { dashboardApi } from "../../infrastructure";

// ❌ INCORRECT: Relative imports to shared
import { Button } from "../../../shared/presentation/components";

// ❌ INCORRECT: Deep relative imports
import { something } from "../../../utils/helpers";
```

#### Why Absolute Imports?

1. **Readability** - Clear where imports come from
2. **Refactoring** - Moving files doesn't break imports
3. **Consistency** - Same import path everywhere in codebase
4. **IDE Support** - Better autocomplete and navigation
5. **No Guessing** - No counting `../` levels

#### Detecting Violations

Look for these patterns (all are violations):

```typescript
// Any relative import going UP more than one level
from '../..'        // ❌ Violation
from '../../'       // ❌ Violation
from '../../../'    // ❌ Violation

// Relative imports to architecture layers
from '../domain'        // ❌ Violation
from '../application'   // ❌ Violation
from '../infrastructure'// ❌ Violation
from '../presentation'  // ❌ Violation

// Relative imports to shared
from '../shared'    // ❌ Violation
from '../../shared' // ❌ Violation
```

#### Path Aliases

```json
{
  "@/*": ["./src/*"]
}
```

This rule is enforced by ESLint via `no-restricted-imports`.

### App Router Usage

The `/app` directory is for **routing only**:

```typescript
// CORRECT: Thin wrapper
// app/(protected)/users/page.tsx
import { UsersPage } from '@/features/users';
export default function Page() {
  return <UsersPage />;
}

// INCORRECT: Business logic in route
// app/(protected)/users/page.tsx
export default async function Page() {
  const users = await fetchUsers();  // NO!
  return <UserList users={users} />;  // NO!
}
```

**Rules:**

1. Route files (`page.tsx`) MUST only import and render feature pages
2. Layout files MAY contain providers and shell components from `/shared`
3. API routes (`route.ts`) MAY contain logic if it's API-specific
4. Metadata exports are allowed in route files

### Shared Code Policy

There are TWO levels of shared code:

#### 1. Workspace Packages (`packages/`)

For code shared across MULTIPLE APPS. See [Monorepo Architecture](./monorepo-architecture.md).

| Package           | Contains                            | Rules                        |
| ----------------- | ----------------------------------- | ---------------------------- |
| `packages/ui`     | shadcn/ui components                | NO i18n, pure presentational |
| `packages/shared` | Utils, hooks                        | NO i18n, no app config       |
| `packages/api`    | Generated hooks, types, HTTP client | Auto-generated, DO NOT edit  |

```typescript
// Import from packages
import { Button } from "ui";
import { formatDate, tid } from "shared";
import { createBrowserSupabaseClient } from "api/supabase/browser";
import type { Database } from "api/supabase/types";
```

#### 2. App-Level Shared (`apps/[app]/src/shared/`)

For code shared across features WITHIN ONE APP:

| Location                          | What belongs there         |
| --------------------------------- | -------------------------- |
| `shared/presentation/components/` | App-specific UI components |
| `shared/application/hooks/`       | App-specific hooks         |
| `shared/infrastructure/i18n/`     | THIS app's translations    |
| `shared/infrastructure/config/`   | API config, feature flags  |

Code goes in app-level shared ONLY if:

1. It is used by 2+ features in THIS app
2. It has NO business logic specific to any feature
3. It is truly generic within the app context

**NOT in shared:**

- UserAvatar (feature-specific) → `features/users/presentation/components/`
- useAuth (feature-specific) → `features/auth/application/hooks/`
- OrderStatus type → `features/orders/domain/types/`

### Generated Code (Orval)

Auto-generated API code lives in the shared `packages/api` package:

```
packages/api/src/
├── index.ts                          # Public API (customFetch, ApiError)
├── generated/                        # Orval-generated React Query hooks
│   ├── dashboard/
│   │   ├── dashboard.ts              # Query hooks
│   │   └── dashboard.msw.ts          # MSW mock handlers
│   ├── anomalies/
│   ├── ai-suggestions/
│   ├── optimization/
│   ├── process-flow/
│   ├── historical/
│   └── ...
├── types/generated/                  # Orval-generated TypeScript types
│   ├── index.ts                      # Barrel export
│   ├── actionRequest.ts
│   └── ...
└── mutator/                          # Custom HTTP client
    ├── customFetch.ts                # Axios mutator with response unwrapping
    ├── config.ts                     # API timeouts, error config
    └── types.ts                      # ApiError type definition
```

**Rules:**

1. **NEVER edit generated files** - they are overwritten on regeneration
2. Import the Supabase clients and types from the subpaths `packages/api`
   actually exports: `api`, `api/supabase`, `api/supabase/browser`,
   `api/supabase/server`, `api/supabase/types`

> Earlier revisions of this file documented `api/types/generated` and
> `api/generated/<tag>/<tag>` subpaths, with examples from a dashboard API this
> project does not have. Those subpaths were declared in
> `packages/api/package.json` but pointed at directories that were never
> created, so following the instruction produced an import that could not
> resolve. The declarations are removed and this section now describes what the
> package exports. If Orval REST generation is reintroduced, add the export
> subpath and the generated directory together, and update this list.

**Regenerate with:**

```bash
pnpm codegen
```

### API Response Handling

The custom Orval mutator (`packages/api/src/rest/mutator/customFetch.ts`) handles API responses:

1. **Response Envelope** - Extracts `data` from `{ success: true, data: T }` wrapper
2. **No Case Transformation** - Returns data as-is to match generated TypeScript types
3. **Error Handling** - Transforms errors to consistent `ApiError` format

**Important:** API responses are returned exactly as the backend sends them. The generated TypeScript types match the OpenAPI specification, so property names may use `snake_case` (e.g., `total_suggestions`, `by_priority`). **Do NOT transform to camelCase** - this ensures type safety between runtime data and TypeScript types.

```typescript
// Example: Access properties using the exact names from the API/types
const { total_suggestions, by_priority, accuracy_rate } = suggestionMetrics;

// NOT camelCase - this would be undefined at runtime:
// const { totalSuggestions } = suggestionMetrics; // ❌ Wrong
```

### Orval Consistency Across References

When Orval types and responses are used, **all references must match the generated format** (including case and shape) across:

- **Documentation** (feature docs, READMEs, inline comments)
- **Mocks** (MSW handlers, mock data factories)
- **Domain types** (feature domain types and shared types)
- **Presentation/Application usage** (property access and mapping)

**Rules:**

1. **Single source of truth**: Orval generated types are the canonical shape. Do not “re-shape” them without explicit, centralized mappers.
2. **No silent casing changes**: If the API is `snake_case`, mocks/docs/types must use `snake_case` too.
3. **Domain alignment**: If domain types re-export or wrap Orval types, the property names must match the generated format. Avoid parallel camelCase interfaces when Orval types are used directly.
4. **Mocks match API**: MSW handlers and mock fixtures must mirror the Orval response envelope and property names.

**Violations:**

- Mocks returning `camelCase` while generated types expect `snake_case`
- Domain types redefining the same fields with different casing
- Documentation examples showing shapes that don’t match Orval outputs

**Fix:**

- Update mocks/docs/domain types to align with the generated Orval types
- Use a single mapping layer only if the product explicitly requires a different shape

---

## Enforcement

When reviewing code or generating new code:

1. Check import paths - no cross-feature imports
2. Verify layer dependencies flow inward
3. Ensure route files are thin wrappers
4. Validate shared code is truly generic
5. Enforce absolute imports for cross-layer references in features
6. Run `npm run lint` to catch import violations
