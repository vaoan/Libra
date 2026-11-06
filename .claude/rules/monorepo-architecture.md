---
paths:
  - "packages/**/package.json"
  - "packages/*/src/**"
  - "apps/*/package.json"
  - "pnpm-workspace.yaml"
  - "turbo.json"
---

# Monorepo architecture

Loaded when a package's source or a workspace manifest is read. Each line is the rule; the link is the full text. The lesson's tree still says apps/web: read `apps/store`.

- **`apps/store` is the reference standard; every other app complies with it** for lint, architecture, testing, i18n and component patterns, under one root `eslint.config.mjs`. → `docs/lessons/monorepo-architecture.md` (Standard App: Web)
- **Apps import packages; a package never imports an app** or reads app config, env vars or translations. → `docs/lessons/monorepo-architecture.md` (The Dependency Rule (Repository Level))
- **`packages/ui`, `packages/shared` and `packages/api` take no i18n: the app injects translated strings as props** (`closeLabel={t("close")}`). `packages/app-components` is where `next-intl` is allowed. → `docs/lessons/monorepo-architecture.md` (i18n Strategy: Props Injection Pattern)
- **Move code into a package only if two or more apps use it, it is framework-agnostic and pure, and it needs no i18n or app config.** Otherwise it stays in the app's `shared/`. → `docs/lessons/monorepo-architecture.md` (Adding to Shared Packages)
- **Inside a package, cross-directory imports use its alias (`@ui/utils/cn`, `@shared/hooks/useTheme`); same-directory ones may be relative.** ESLint enforces it. → `docs/lessons/monorepo-architecture.md` (Import Rules in Packages)
- **Packages ship as source (`"main": "./src/index.ts"`, ES modules), with no build step**, so each app lists them in `transpilePackages` in `next.config.ts` and depends on them with `workspace:*`. → `docs/lessons/monorepo-architecture.md` (Source-to-Source Compilation)
- **New UI component: create it in `packages/ui/src/components/`, export it from `src/index.ts`, take labels as props.** New utility: `packages/shared/src/utils/`, exported from its `index.ts`. Then `pnpm lint` and `pnpm typecheck`. → `docs/lessons/monorepo-architecture.md` (Adding to Shared Packages)
- **New app: copy `apps/store`'s structure, give it its own `shared/infrastructure/i18n/`, extend `tsconfig.base.json`, add `transpilePackages`.** Register it in `scripts/select-workspaces.sh`, `.github/workflows/ci.yml`, `package.json`, `docker/ci/Dockerfile`, `docker/prod/nginx.conf` and `config/app-links.json`, or `scripts/check-app-registry.sh` fails CI. → `docs/lessons/monorepo-architecture.md` (Adding New Apps)
