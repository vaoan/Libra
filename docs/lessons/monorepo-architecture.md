# Monorepo Architecture

> This document defines the overall monorepo structure and how Clean Architecture applies at both the repository level and within individual applications.

---

## Overview

This project is a **pnpm workspace monorepo** containing multiple Next.js applications that share common packages. The architecture follows Clean Architecture principles at two levels:

1. **Repository Level** - How packages and apps relate to each other
2. **Application Level** - How features within each app are structured

### Expert Sources

This architecture is informed by:

- [Uncle Bob's Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) - The Dependency Rule
- [Feature-Sliced Design - Monorepo Guide 2025](https://feature-sliced.design/blog/frontend-monorepo-explained) - Modular architecture
- [Clean Architecture for Frontend](https://github.com/falsy/clean-architecture-for-frontend) - Shared domain packages
- [pnpm Workspaces Best Practices](https://pnpm.io/workspaces) - Workspace management

---

## Repository Structure

```
monorepo/
├── apps/                          # Applications (consume packages)
│   ├── web/                       # Main web application (REFERENCE STANDARD)
│   │   └── src/
│   │       ├── app/               # Next.js App Router (routing only)
│   │       ├── features/          # Feature modules (Clean Architecture)
│   │       ├── shared/            # App-specific shared code
│   │       │   └── infrastructure/
│   │       │       └── i18n/      # App's own translations
│   │       ├── mocks/             # MSW handlers and mock data
│   │       └── test/              # Test utilities
│   ├── admin/                     # Admin panel (MUST COMPLY with web standards)
│   │   └── src/
│   │       ├── app/
│   │       ├── features/
│   │       └── shared/
│   │           └── infrastructure/
│   │               └── i18n/      # Admin's own translations
├── packages/                      # Shared packages (consumed by apps)
│   ├── api/                       # Generated API hooks, types, HTTP client
│   │   └── src/
│   │       ├── generated/         # Orval-generated React Query hooks
│   │       ├── types/generated/   # Orval-generated TypeScript types
│   │       └── mutator/           # Custom Axios mutator
│   ├── ui/                        # Shared UI components (shadcn/ui)
│   │   └── src/
│   │       ├── components/        # Pure presentational components
│   │       └── utils/             # UI utilities (cn, etc.)
│   └── shared/                    # Shared utilities and hooks
│       └── src/
│           ├── hooks/             # Framework-agnostic hooks
│           └── utils/             # Pure utility functions
├── orval.config.ts                # Orval code generation config
├── eslint.config.mjs              # Monorepo-wide ESLint (single config)
├── package.json                   # Root scripts and shared devDependencies
├── pnpm-workspace.yaml            # Workspace definition
└── tsconfig.base.json             # Shared TypeScript config
```

---

## The Dependency Rule (Repository Level)

At the repository level, dependencies flow in ONE direction:

```
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATIONS                             │
│                    (apps/store, apps/admin)                        │
│         Full Clean Architecture, i18n, feature modules           │
├─────────────────────────────────────────────────────────────────┤
│                      SHARED PACKAGES                             │
│            (packages/api, packages/ui, packages/shared)          │
│     API hooks & types, UI components, utilities & hooks          │
└─────────────────────────────────────────────────────────────────┘
                              ↑
                    Dependencies flow UP
                    (packages know nothing about apps)
```

### Rules

| Rule                              | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| **Apps depend on packages**       | Apps import from `api`, `ui`, and `shared` packages       |
| **Packages NEVER depend on apps** | Packages have no knowledge of consuming apps              |
| **Packages are pure**             | No i18n, no app-specific config, no environment variables |
| **Apps own their config**         | Each app has its own i18n, env, routing, providers        |

---

## Package Types

### UI Package (`packages/ui`)

**Purpose:** Pure, presentational UI components based on shadcn/ui and Radix primitives.

**Contains:**

- Radix-based UI components (Button, Card, Sheet, etc.)
- Utility functions (cn for className merging)
- Component variants (using class-variance-authority)

**Does NOT contain:**

- Translations or i18n hooks
- Business logic
- Data fetching
- App-specific configuration

**Export Pattern:**

```typescript
// packages/ui/src/index.ts
export { cn } from "./utils/cn";
export * from "./components/button";
export * from "./components/card";
// ... pure UI components only
```

**Consumption:**

```typescript
// In any app
import { Button, Card, cn } from "ui";
```

### API Package (`packages/api`)

**Purpose:** Centralized Orval-generated API hooks, TypeScript types, and custom HTTP client.

**Contains:**

- Orval-generated React Query hooks (`src/generated/`)
- Orval-generated TypeScript types (`src/types/generated/`)
- Custom Axios mutator with response unwrapping (`src/mutator/`)

**Does NOT contain:**

- App-specific API configuration (refresh intervals, defaults)
- Business logic
- i18n or translations

**Export Pattern:**

```typescript
// packages/api/src/index.ts
export { customFetch } from "./mutator/customFetch";
export type { ApiError } from "./mutator/types";
// Supabase clients and types are imported via subpath:
// import { createBrowserSupabaseClient } from "api/supabase/browser";
// import type { Database } from "api/supabase/types";
```

**Consumption:**

```typescript
// In any app
import { createBrowserSupabaseClient } from "api/supabase/browser";
import { createServerSupabaseClient } from "api/supabase/server";
import type { Database } from "api/supabase/types";
```

**Regenerate with:**

```bash
pnpm codegen
```

**Note:** All files in `generated/` and `types/generated/` are auto-generated. **NEVER edit them directly.** See [Generated Code Policy](./generated-code-policy.md).

### Shared Package (`packages/shared`)

**Purpose:** Framework-agnostic utilities and hooks that any app might need.

**Contains:**

- Pure utility functions (formatters, validators, etc.)
- Generic React hooks (useDebounce, useLocalStorage, etc.)
- Shared TypeScript types (if truly generic)

**Does NOT contain:**

- i18n or translations
- API clients or data fetching
- Business domain logic
- App-specific types

**Export Pattern:**

```typescript
// packages/shared/src/index.ts
export * from "./utils";
export * from "./hooks";
```

**Consumption:**

```typescript
// In any app
import { formatDate, useDebounce } from "shared";
import { formatDate } from "shared/utils";
```

### Import Rules in Packages

**Packages MUST use absolute imports for cross-directory references.** Same-directory relative imports (e.g., `./Component`) are allowed.

| Context                            | Rule                  | Example                        |
| ---------------------------------- | --------------------- | ------------------------------ |
| Same directory                     | MAY use relative      | `./ThemeProvider`              |
| Cross-directory in packages/shared | **MUST** use absolute | `@shared/hooks/useTheme`       |
| Cross-directory in packages/ui     | **MUST** use absolute | `@ui/utils/cn`                 |
| Generated code                     | Any imports allowed   | (generated files are excluded) |

**Path Aliases:**

```json
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["./src/*"]
    }
  }
}

// packages/ui/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@ui/*": ["./src/*"]
    }
  }
}
```

**Examples:**

```typescript
// ✅ CORRECT: Absolute imports for cross-directory
import { useTheme } from "@shared/hooks/useTheme";
import { cn } from "@ui/utils/cn";

// ✅ CORRECT: Same-directory relative import
export { ThemeProvider } from "./ThemeProvider";

// ❌ INCORRECT: Relative import crossing directories
import { useTheme } from "../hooks/useTheme";
import { cn } from "../utils/cn";
```

This rule is enforced by ESLint via `no-restricted-imports`.

---

## i18n Strategy: Props Injection Pattern

Shared packages MUST NOT have i18n dependencies. Instead, apps inject translated strings as props.

### Why?

Following the [Dependency Inversion Principle](https://medium.com/@ahmed.ally2/clean-architecture-with-dependency-rule-6a41f899e3c2):

- Packages should not depend on app-specific concerns (i18n is app-specific)
- Each app can have different locales, different translation backends
- Components remain pure and testable without i18n setup

### Implementation

**In shared UI package:**

```typescript
// packages/ui/src/components/sheet.tsx
interface SheetContentProps {
  // ... other props
  closeLabel?: string;  // App injects translated label
}

function SheetContent({ closeLabel = "Close", ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Close aria-label={closeLabel}>
      <X className="size-4" />
    </SheetPrimitive.Close>
  );
}
```

**In consuming app:**

```typescript
// apps/store/src/features/some-feature/presentation/components/MySheet.tsx
"use client";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent } from "ui";

export function MySheet() {
  const t = useTranslations("common");

  return (
    <Sheet>
      <SheetContent closeLabel={t("close")}>
        {/* content */}
      </SheetContent>
    </Sheet>
  );
}
```

### Each App Owns Its Translations

```
apps/store/src/shared/infrastructure/i18n/
├── messages/
│   ├── en.json    # Web app English translations
│   └── es.json    # Web app Spanish translations
├── routing.ts     # Web app locale routing
└── request.ts     # Web app i18n config

apps/admin/src/shared/infrastructure/i18n/
├── messages/
│   ├── en.json    # Admin app English translations
│   └── es.json    # Admin app Spanish translations
├── routing.ts     # Admin app locale routing
└── request.ts     # Admin app i18n config
```

---

## Standard App: Web

The `apps/store` application is the **reference standard**, matching
[CLAUDE.md](../../CLAUDE.md#key-principles). All other apps MUST comply with its:

- ESLint configuration (enforced at monorepo root)
- Clean Architecture patterns
- Testing standards
- i18n setup patterns
- Component patterns

### Compliance Enforcement

```javascript
// eslint.config.mjs (root level)
// Single config applies to ALL apps and packages
files: [`apps/*/src/**/*.{ts,tsx}`, `packages/*/src/**/*.{ts,tsx}`],
```

This means:

- Same SOLID, DRY, KISS rules for all apps
- Same i18n strictness (no hardcoded strings)
- Same architectural boundaries
- Same import rules

---

## Application-Level Architecture

Within each app, Clean Architecture applies as documented in [Architecture Rules](./architecture.md):

```
apps/[app]/src/
├── app/                    # Next.js routing (thin wrappers only)
├── features/               # Feature modules
│   └── [feature]/
│       ├── domain/         # Types, interfaces, business rules
│       ├── application/    # Use cases, services, hooks
│       ├── infrastructure/ # API calls, external integrations
│       └── presentation/   # Components, pages
├── shared/                 # App-specific shared code
│   ├── domain/             # Shared types
│   ├── application/        # Shared hooks, utils
│   ├── infrastructure/     # i18n, providers, config
│   └── presentation/       # Shared UI components
└── mocks/                  # MSW and test mocks
```

---

## Workspace Configuration

### pnpm-workspace.yaml

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### Package References

Apps reference packages using `workspace:*`:

```json
// apps/store/package.json
{
  "dependencies": {
    "api": "workspace:*",
    "ui": "workspace:*",
    "shared": "workspace:*"
  }
}
```

### TypeScript Path Aliases

Each app has its own path aliases:

```json
// apps/store/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "api": ["../../packages/api/src"],
      "api/*": ["../../packages/api/src/*"],
      "ui": ["../../packages/ui/src"],
      "ui/*": ["../../packages/ui/src/*"],
      "shared": ["../../packages/shared/src"],
      "shared/*": ["../../packages/shared/src/*"]
    }
  }
}
```

### Next.js Transpilation

Apps must transpile workspace packages:

```typescript
// apps/store/next.config.ts
const nextConfig = {
  transpilePackages: ["api", "ui", "shared"],
};
```

---

## Source-to-Source Compilation

Packages are consumed as source code, not pre-built bundles:

```json
// packages/ui/package.json
{
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

### Benefits

1. **Tree-shaking** - Apps' bundlers can eliminate unused code
2. **No build step** - Packages don't need separate build process
3. **Hot reload** - Changes in packages reflect immediately in apps
4. **Simpler setup** - No version management between packages

### Trade-offs

- Packages must use ES Modules syntax
- TypeScript config must be compatible across all packages
- Bundler handles all transpilation

---

## Adding New Apps

When adding a new application:

1. **Create app folder**: `apps/[app-name]/`
2. **Copy structure from store**: Use `apps/store` as template
3. **Set up i18n**: Create own `shared/infrastructure/i18n/` with locale files
4. **Configure TypeScript**: Extend `tsconfig.base.json`, add path aliases
5. **Add transpilePackages**: Include `api`, `ui`, and `shared`
6. **Verify lint compliance**: Run `pnpm lint` - no exceptions allowed

---

## Adding to Shared Packages

Before adding code to a shared package, verify:

| Question                      | If No                   |
| ----------------------------- | ----------------------- |
| Is it used by 2+ apps?        | Keep in app's `shared/` |
| Is it framework-agnostic?     | Keep in app             |
| Does it need i18n?            | Keep in app             |
| Does it need app config?      | Keep in app             |
| Is it pure (no side effects)? | Keep in app             |

### Adding a UI Component

```bash
# 1. Create in packages/ui/src/components/
# 2. Export from packages/ui/src/index.ts
# 3. Ensure no i18n - use props for labels
# 4. Run lint and typecheck
pnpm lint && pnpm typecheck
```

### Adding a Utility

```bash
# 1. Create in packages/shared/src/utils/
# 2. Export from packages/shared/src/utils/index.ts
# 3. Ensure pure function (no side effects)
# 4. Run lint and typecheck
pnpm lint && pnpm typecheck
```

---

## Commands

| Command            | Description                    |
| ------------------ | ------------------------------ |
| `pnpm dev`         | Start all apps with `.env.dev` |
| `pnpm dev --env X` | Start all apps with `.env.X`   |
| `pnpm build`       | Build all workspaces           |
| `pnpm lint`        | Lint all apps and packages     |
| `pnpm typecheck`   | Type-check all workspaces      |
| `pnpm test`        | Run web app tests              |

---

## Related

- [Architecture Rules](./architecture.md) - Application-level Clean Architecture
- [Component Patterns](./component-patterns.md) - Component structure
- [Naming Conventions](./naming-conventions.md) - File and code naming
- [i18n Skill](../skills/i18n/SKILL.md) - Internationalization setup
