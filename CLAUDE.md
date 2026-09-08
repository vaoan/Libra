# Project Documentation

> This document serves as the primary reference for AI assistants and developers working on this project. It is designed to be **portable** and can be used as a template for new projects.

---

## Table of Contents

- [Monorepo Overview](#monorepo-overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Patterns & Conventions](#patterns--conventions)
- [Design Principles](#design-principles)
- [Quick Reference](#quick-reference)

---

## Monorepo Overview

This is a **pnpm workspace monorepo** — a store and payment platform for selling products, services, tickets, promos, coupons, and other goods.

### Structure

```
libra/
├── apps/                          # Applications
│   ├── store/                     # Main storefront (REFERENCE STANDARD)
│   ├── landing/                   # Public landing page
│   ├── payments/                  # Payment processing
│   ├── admin/                     # Back-office admin panel (must comply with store)
│   ├── auth/                      # Authentication provider
│   └── studio/                    # Seller dashboard
├── packages/                      # Shared packages
│   ├── api/                       # Generated API hooks, types, HTTP client
│   ├── ui/                        # Shared UI components (shadcn/ui)
│   ├── shared/                    # Shared utilities and hooks
│   ├── auth/                      # Auth domain logic, providers
│   └── app-components/            # App-level shared components (uses next-intl)
├── scripts/                       # Dev tooling scripts
│   ├── start.mjs                  # Entry point for pnpm dev
│   ├── build.mjs                  # Entry point for pnpm build
│   ├── load-env.mjs               # Env loader with $secret: resolution
│   ├── lint-envs.mjs              # Verifies all .env.X files are in sync
│   └── supabase-cmd.mjs           # Supabase CLI wrapper
├── orval.config.ts                # Orval code generation config
├── eslint.config.mjs              # Monorepo-wide ESLint
├── package.json                   # Root workspace config
└── pnpm-workspace.yaml            # Workspace definition
```

### Key Principles

| Principle                 | Description                                     |
| ------------------------- | ----------------------------------------------- |
| **Store is the standard** | All apps must comply with store's rules         |
| **Packages are pure**     | No i18n, no business logic, no app config       |
| **Props injection**       | Apps inject translations into shared components |
| **Single ESLint**         | One config enforces rules across all workspaces |

> **Full documentation:** See [Monorepo Architecture](.claude/rules/monorepo-architecture.md) for complete monorepo patterns, package rules, and i18n strategy.

---

## Architecture

This project follows **Clean Architecture** at two levels: repository-level (packages → apps dependency direction) and application-level (feature-based organization with domain/application/infrastructure/presentation layers).

**Layer dependency rule:** `Presentation → Application → Domain ← Infrastructure`

> **Full documentation:** See [Architecture Rules](.claude/rules/architecture.md) for layer details, feature structure, and import rules.

---

## Technology Stack

### Core

| Technology     | Purpose                         |
| -------------- | ------------------------------- |
| **Next.js 16** | React framework with App Router |
| **TypeScript** | Type safety                     |
| **React 19**   | UI library                      |
| **pnpm**       | Package manager with workspaces |

### UI & Styling

| Technology          | Purpose                  |
| ------------------- | ------------------------ |
| **Tailwind CSS v4** | Utility-first CSS        |
| **shadcn/ui**       | Component primitives     |
| **Radix UI**        | Accessible UI primitives |

### State & Data

| Technology         | Purpose                            |
| ------------------ | ---------------------------------- |
| **TanStack Query** | Server state management            |
| **nuqs**           | Type-safe URL state management     |
| **Axios**          | REST API client                    |
| **Orval**          | API code generation → packages/api |

### Internationalization

| Technology    | Purpose          |
| ------------- | ---------------- |
| **next-intl** | i18n for Next.js |

### Testing

| Technology          | Purpose           |
| ------------------- | ----------------- |
| **Vitest**          | Unit testing      |
| **Testing Library** | Component testing |
| **Playwright**      | E2E testing       |

---

## Patterns & Conventions

### File Naming

| Type       | Convention                  | Example         |
| ---------- | --------------------------- | --------------- |
| Components | PascalCase                  | `LoginForm.tsx` |
| Hooks      | camelCase with `use` prefix | `useAuth.ts`    |
| Utilities  | camelCase                   | `formatDate.ts` |
| Types      | PascalCase                  | `UserTypes.ts`  |

See [Naming Conventions](.claude/rules/naming-conventions.md) for complete rules.

### Import Aliases

Apps use `@/*` for internal imports and `ui`, `api`, `shared` for workspace packages. Always prefer absolute imports over relative for cross-layer references.

### i18n: Props Injection Pattern

Shared packages have NO i18n. Apps inject translated strings as props into shared components.

---

## Design Principles

This project strictly follows **DRY**, **SOLID**, and **KISS** principles.

### DRY - Don't Repeat Yourself

| Do                                  | Don't                       |
| ----------------------------------- | --------------------------- |
| Extract repeated logic to utilities | Copy-paste code blocks      |
| Create shared types                 | Define same interface twice |
| Use constants for magic values      | Repeat strings/numbers      |

### SOLID Principles

| Principle                 | Application                                    |
| ------------------------- | ---------------------------------------------- |
| **S**ingle Responsibility | One component/hook = one purpose               |
| **O**pen/Closed           | Extend via props/composition, not modification |

<!-- cspell:ignore ependency -- the bold marker in **D**ependency splits the
     word, and "ependency" is the half that is left. **S**ingle and **O**pen
     survive the same treatment only because "ingle" and "pen" are words. -->

| **D**ependency Inversion | Depend on abstractions (hooks), not implementations |

### KISS - Keep It Simple

Prefer the simplest solution. If DRY and KISS conflict, favor KISS.

### Libraries Over Manual Code

**Always prefer well-known, community-backed libraries over hand-rolled code.** If a battle-tested package exists for the problem, use it. Do not write custom implementations for solved problems.

| Do                                             | Don't                                    |
| ---------------------------------------------- | ---------------------------------------- |
| Use `cookies-next` for cookie management       | Write raw `document.cookie` manipulation |
| Use `next-intl` for i18n                       | Build a custom translation system        |
| Use `zod` / `valibot` for validation           | Write manual type guards for form data   |
| Use `date-fns` / `dayjs` for date manipulation | Write custom date parsing/formatting     |
| Use `react-hook-form` for forms                | Build custom form state management       |
| Use established Radix/shadcn primitives        | Build custom accessible UI from scratch  |

**When to write custom code:** Only when no suitable library exists, when the library would be massive overkill for a trivial task, or when the problem is domain-specific business logic that no library could solve.

---

## Quick Reference

### Environment Variables

See [Environment System](docs/environment.md) for the full reference.

| Command                    | Description                             |
| -------------------------- | --------------------------------------- |
| `pnpm dev`                 | Start all apps with `.env.dev`          |
| `pnpm dev --env test`      | Start all apps with `.env.test`         |
| `pnpm build`               | Build with `.env.prod`                  |
| `pnpm build --env staging` | Build with `.env.staging`               |
| `pnpm lint:env`            | Verify all env files have the same keys |
| `pnpm sync-secrets`        | Sync `.secrets` from GitHub             |

Debug viewer: http://localhost:5002/en/env (requires `ENV_DEBUG=true` in env file)

### Workspace Commands

| Command                 | Description                             |
| ----------------------- | --------------------------------------- |
| `pnpm dev`              | Start all apps with `.env.dev`          |
| `pnpm dev --env X`      | Start all apps with `.env.X`            |
| `pnpm build`            | Build all apps with `.env.prod`         |
| `pnpm build --env X`    | Build all apps with `.env.X`            |
| `pnpm lint`             | Lint all workspaces                     |
| `pnpm lint:env`         | Verify all env files have the same keys |
| `pnpm typecheck`        | Type-check all workspaces               |
| `pnpm test`             | Run all tests                           |
| `pnpm codegen`          | Generate API clients (Orval)            |
| `pnpm codegen:supabase` | Regenerate Supabase types               |
| `pnpm supabase:start`   | Start local Supabase CLI instance       |
| `pnpm supabase:stop`    | Stop local Supabase CLI instance        |
| `pnpm supabase:reset`   | Reset local Supabase DB                 |
| `pnpm sync-secrets`     | Sync `.secrets` from GitHub             |

### App Ports

| App      | Port | Purpose                           |
| -------- | ---- | --------------------------------- |
| auth     | 5000 | Authentication provider (`/auth`) |
| store    | 5001 | Main storefront (`/store`)        |
| admin    | 5002 | Back-office admin (`/admin`)      |
| landing  | 5004 | Public landing page (root `/`)    |
| payments | 5005 | Payment processing (`/payments`)  |
| studio   | 5006 | Seller dashboard (`/studio`)      |

### Creating Features (in apps)

1. Create folder: `apps/[app]/src/features/[feature-name]/`
2. Add layers: `domain/`, `application/`, `infrastructure/`, `presentation/`
3. Create `index.ts` with public exports
4. Add route in `app/` that imports from feature

### Adding to Shared Packages

Before adding to a package, verify:

- Used by 2+ apps
- No i18n needed
- No app config needed
- Pure (no side effects)

If any fail, keep in app's `shared/` folder instead.

---

## Related Documentation

### Core Rules

- [Monorepo Architecture](.claude/rules/monorepo-architecture.md)
- [Architecture Rules](.claude/rules/architecture.md)
- [SOLID Principles](.claude/rules/solid-principles.md)
- [DRY Principle](.claude/rules/dry-principle.md)
- [KISS Principle](.claude/rules/kiss-principle.md)
- [Libraries Over Manual Code](.claude/rules/libraries-over-manual-code.md)

### Code Quality

- [Naming Conventions](.claude/rules/naming-conventions.md)
- [Component Patterns](.claude/rules/component-patterns.md)
- [No Hardcoding](.claude/rules/no-hardcoding.md)
- [Single Source of Truth](.claude/rules/single-source-of-truth.md)
- [Tailwind CSS](.claude/rules/tailwind.md)
- [CSS Consistency](.claude/rules/css-consistency.md)

### Testing & Quality

- [Testing](.claude/rules/testing.md)
- [Checkout Stock Integrity](.claude/rules/checkout-stock-integrity.md)
- [Checkout Stock Integrity Standard](docs/standards/checkout-stock-integrity.md)
- [Quality Gates](docs/standards/quality-gates.md) — what the checks verify, what is staged, and the gates that were found not to work
- [E2E Selectors](.claude/rules/e2e-selectors.md)
- [Build Checks](.claude/rules/build-checks.md)
- [Code Review Standards](.claude/rules/code-review-standards.md)

### Git & Workflow

- [Git Workflow](.claude/rules/git-workflow.md)
- [Git Safety](.claude/rules/git-safety.md)

### Database & Infrastructure

- [Supabase Full Wipe & Re-Migration](.claude/rules/supabase-wipe.md) — PAT tokens, drop schema, apply migrations for dev/prod

### AI Configuration

- [Generated Code Policy](.claude/rules/generated-code-policy.md)
- [AI Docs DRY](.claude/rules/ai-docs-dry.md)
- [Portability](.claude/rules/portability.md)

### Skills

- [Create Feature](.claude/skills/create-feature/SKILL.md) - `/create-feature [name]`
- [Create Component](.claude/skills/create-component/SKILL.md) - `/create-component [name]`
- [Start Task](.claude/skills/start-task/SKILL.md) - `/start-task <ticket> [type]`
- [Submit PR](.claude/skills/submit-pr/SKILL.md) - `/submit-pr`
- [Full Review](.claude/skills/full-review/SKILL.md) - `/full-review`
- [Verify Code](.claude/skills/verify-code/SKILL.md) - `/verify-code`
- [Review Branch](.claude/skills/review-branch/SKILL.md) - `/review-branch`
- [E2E Eval](.claude/skills/e2e-eval/SKILL.md) - `/e2e-eval [env] [options]`

See all skills in `.claude/skills/` folder.

---

> **Portability Notice**: This document and the entire `.claude/` folder are designed to be **100% portable**. See [Portability Rule](.claude/rules/portability.md) for guidelines.
