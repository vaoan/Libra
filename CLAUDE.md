# CLAUDE.md

Guidance for Claude Code in this repository, short on purpose: each line links to the lesson that holds the full text and the reason, and lessons are read when relevant, not on every turn. Index and budget: `docs/lessons/README.md`.

## What Libra is

A pnpm workspace monorepo: a store and payment platform selling products, services, tickets, promos and coupons. It is **in production** (`docs/production-status.md`).

Six Next.js 16 apps in `apps/`: `store` (the reference standard every other app complies with), `landing`, `payments`, `admin`, `auth`, `studio`. Shared packages in `packages/`: `api` (generated hooks, types, HTTP client), `ui` (shadcn/ui), `shared` (utilities and hooks), `auth`, `app-components`. Tree, stack and pattern overview: `docs/lessons/project-overview.md`.

Each feature lives in `apps/<app>/src/features/<feature>/` with `domain/`, `application/`, `infrastructure/`, `presentation/` and an `index.ts`; dependencies run `Presentation → Application → Domain ← Infrastructure`. Packages are consumed as source and hold no app config. Each app owns its translations; `packages/ui` components take translated strings as props.

## Invariants

- **Production is live.** Run nothing against the production database or a deployed service unless the owner asks in this conversation; `/supabase-wipe` and `pnpm e2e:prod` count. Runbooks: `docs/production-incident-playbook.md`, `docs/production-e2e.md`.
- **Do not commit, push, force push, merge, rebase, reset, amend, cherry-pick, tag, delete a branch, drop a stash or clean unless the user says so in words** ("commit this", "push"). "Looks good", "ok" and "done" are not permission, and neither is moving on. Do not ask "should I commit?": list what changed and wait. Never force push `main` or `develop`. Invoking a skill such as `/commit-push` is explicit permission to start it, but individual git operations inside it may still need confirmation. → `docs/lessons/git-safety.md`, `docs/lessons/commit-policy.md`
- **Ask first before switching or creating a branch, stashing or pulling**; these change the user's working state. Status, diff, log, show, blame and fetch need no ask. → `docs/lessons/git-safety.md`
- **Branch from `develop` as `type/GH-n_Title` and PR into `develop`.** Only `release/*` and `fix/*` may target `main`, and a `fix/*` target is the user's choice. PR subject at most 80 characters. Full steps: `/git-workflow`.
- **Secrets stay in `.secrets` and `.env.local`, never in git.** `pnpm sync-secrets` pulls from GitHub and overwrites `.secrets`; it does not publish. → `docs/lessons/telegram-notifications.md`
- **A sub-agent writes its result to `.ai-context/reports/{type}_{YYYY-MM-DDTHH-MM-SS}.json` before returning, and returns the path**, so the work survives an orchestrator that dies. Never a bare return, or a name without the timestamp. → `docs/lessons/multi-agent-persistence.md`

## Principles, as they apply here

- **SOLID**: one concern per component, hook and service. Components never call APIs or `localStorage` directly: a hook abstracts it. Vary behaviour through props and composition, and split a large hook return into composable hooks. → `docs/lessons/solid-principles.md`
- **DRY**: extract knowledge duplicated in two places (a validation rule, an API URL, a type) now; structure only at the third repeat. Tailwind class strings, `var(--x)` strings and explicit test bodies are not violations. → `docs/lessons/dry-principle.md`
- **KISS**: when DRY and KISS conflict, KISS wins. A DRY finding is a suggestion unless the duplication causes bugs or real maintenance risk, and small local duplication is fine. → `docs/lessons/kiss-principle.md`
- **No hardcoding**: magic numbers and status or role strings go in `domain/constants.ts`, types in `domain/types/`, mock data under `src/mocks/`, runtime config in `shared/infrastructure/config/`. ESLint enforces magic numbers outside constants files. Array indices, Tailwind classes and test descriptions may stay inline. → `docs/lessons/no-hardcoding.md`
- **Libraries over hand-rolled**: check first for `cookies-next`, `next-intl`, `react-hook-form`, `zod`/`valibot`, `date-fns`/`dayjs`, `@tanstack/react-query`, `@tanstack/react-table`, `nuqs`, Radix/shadcn, `clsx` + `tailwind-merge`, `lucide-react`, `msw`. Do not silence a lint warning to use a raw API. Write custom code for domain logic, one-liners, or thin wrappers. → `docs/lessons/libraries-over-manual-code.md`
- **Portability**: the template job moved to Orrery, so these instructions may name Libra's own apps and paths. Real secrets, personal data and internal URLs still stay out. → `docs/lessons/portability.md`
- **MCP first**: `.mcp.json` registers `git`, `github`, `playwright`, `chrome-devtools`, `shadcn` and `next-devtools`. Prefer an `mcp__*` tool, then Read/Edit/Grep, then Bash for what has neither (install, build, lint). → `docs/lessons/mcp-first.md`
- **Naming**: components and types PascalCase; hooks `use*`, utils and constants files camelCase; feature folders kebab-case; handlers `handle*`, callback props `on*`, booleans `is/has/can/should`; exported constants SCREAMING_SNAKE. shadcn files in `components/ui/` stay lowercase. Imports run React/Next, third party, shared, feature, then types. → `docs/lessons/naming-conventions.md`
- **Telegram alerts**: adding a thread means `.secrets`, the `env:` block in `sync-secrets.yml`, and `gh secret set` with the value on stdin. → `docs/lessons/telegram-notifications.md`

## Commands

Environment reference: `docs/environment.md`. Debug viewer: http://localhost:5050/admin/en/env (requires `ENV_DEBUG=true` in env file)

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

**Before calling work finished, run in this order: `pnpm format:check`, `pnpm lint` (no warnings allowed), `pnpm typecheck`, `pnpm test`, `pnpm build`.** Other gates CI runs: `pnpm check:style`, `pnpm check:boundaries`, `pnpm check:doc-refs`, `pnpm check:tools`. → `docs/lessons/build-checks.md`

| App      | Port | Purpose                           |
| -------- | ---- | --------------------------------- |
| auth     | 5000 | Authentication provider (`/auth`) |
| store    | 5001 | Main storefront (`/store`)        |
| admin    | 5002 | Back-office admin (`/admin`)      |
| landing  | 5004 | Public landing page (root `/`)    |
| payments | 5005 | Payment processing (`/payments`)  |
| studio   | 5006 | Seller dashboard (`/studio`)      |

## Where the rules live

**`.claude/rules/`**, loaded only when a matching file is read: `testing`, `e2e-selectors`, `storybook`, `tailwind`, `css-consistency`, `single-source-of-truth`, `component-patterns`, `one-component-per-file`, `url-state`, `architecture`, `monorepo-architecture`, `checkout-stock-integrity`, `generated-code-policy`, `mcp-standards`, `ai-docs-dry`, `build-checks`.

**`.claude/skills/`**, loaded when invoked. Procedures from the old rules: `/git-workflow`, `/code-review-standards`, `/supabase-wipe` (the owner runs it). Others include `/create-feature`, `/create-component`, `/start-task`, `/submit-pr`, `/full-review`, `/verify-code`, `/review-branch`, `/e2e-eval`; all of them: `.claude/skills/README.md`.

**`docs/lessons/`**, read when relevant: the full text of every rule, plus `project-overview.md`. **`docs/standards/`**: `quality-gates.md` says what the checks really verify and which gates were found not to work; `checkout-stock-integrity.md` holds the stock and payment invariant. **`docs/adr/`** records why a boundary exists.
