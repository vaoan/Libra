# Single-Origin Topology Design

**Date:** 2026-09-27
**Status:** Draft, awaiting review
**Scope:** every environment serves all six apps from one hostname by path
prefix. Production and staging already do; this brings dev in line, removes
the per-app subdomain leftovers, and records what the Clerk production
instance needs.

---

## 1. Problem

The monorepo has six Next.js apps: `landing`, `store`, `auth`, `admin`,
`payments`, `studio`. In production and staging a container-level nginx
routes `/store`, `/auth`, `/admin`, `/payments`, `/studio` to six Node
processes and `/` to landing, and each app is built with a matching
`basePath`. That is the topology the owner wants: one hostname,
`store.furrycolombia.com`, nothing else.

Three things contradict it today.

1. **Dev runs six origins.** `pnpm dev` starts six `next dev` servers on
   ports 5000 to 5006 with no `basePath` and nothing in front of them.
   Cookies, Clerk sessions and `returnTo` redirects cross origins locally,
   which they never do in production. Bugs that only appear on one topology
   are found late.
2. **Per-app hostnames survive in tooling.** `scripts/cloudflared.mjs`
   generates ingress rules for `store.`, `auth.`, `admin.`, `payments.`,
   `studio.` and `landing.<zone>`. `scripts/tunnel-switch.mjs` hardcodes
   eight `*.furrycolombia.com` hostnames. Every `next.config.ts` lists a
   per-app `*.ffxivbe.org` hostname in `allowedDevOrigins`. A shared
   cookie-domain helper widens cookies to `.furrycolombia.com` so they can
   be read across subdomains that no longer exist.
3. **Clerk is about to get a production instance.** The code already
   assumes one instance and one domain, but the dashboard steps and the
   Supabase side effect are recorded nowhere.

Production is decommissioned (see `docs/production-status.md`), so this
design is the topology it comes back with. No live cookies or sessions
need migrating.

## 2. Goals and non-goals

**Goals**

- Dev serves every app from `http://localhost:5050/<path>`, matching the
  shape of `.env.ci`, `.env.staging` and `.env.prod`.
- One place declares each app's path and dev port; every consumer reads it.
- No per-app hostname remains in scripts, configs or docs.
- Cookies are host-only.
- The Clerk production setup is a written runbook with its Supabase
  consequence spelled out.
- Unit tests, E2E tests and the full quality gate set pass.

**Non-goals**

- The apex `furrycolombia.com` and `www.furrycolombia.com`. Landing lives
  at the root of `store.furrycolombia.com`; what the apex points at is not
  touched.
- Staging infrastructure hostnames (`supabase.`, `supabase-studio.`,
  `mailpit.ffxivbe.org`). They are not apps and stay.
- Bringing production back up. This design only fixes what it will run.
- Changing `docker/prod/nginx.conf` routing, `supervisord.conf`, or
  `warmer.sh`. They already implement the target topology.

## 3. Design

### 3.1 Registry: `config/app-links.json`

The JSON becomes the single routing registry. Each app entry gains a
`port` and loses `devUrl`, which was derivable.

```json
{
  "landing": { "envKey": "NEXT_PUBLIC_LANDING_URL", "path": "/", "port": 5004 },
  "store": {
    "envKey": "NEXT_PUBLIC_STORE_URL",
    "path": "/store",
    "port": 5001
  },
  "admin": {
    "envKey": "NEXT_PUBLIC_ADMIN_URL",
    "path": "/admin",
    "port": 5002
  },
  "payments": {
    "envKey": "NEXT_PUBLIC_PAYMENTS_URL",
    "path": "/payments",
    "port": 5005
  },
  "studio": {
    "envKey": "NEXT_PUBLIC_STUDIO_URL",
    "path": "/studio",
    "port": 5006
  },
  "auth": { "envKey": "NEXT_PUBLIC_AUTH_URL", "path": "/auth", "port": 5000 }
}
```

Consumers:

| Consumer                                | Reads                             |
| --------------------------------------- | --------------------------------- |
| `scripts/dev-proxy.mjs` (new)           | `path`, `port`                    |
| `scripts/start.mjs`                     | `port` (was: parsed from the URL) |
| `scripts/e2e.mjs`                       | `port` (was: parsed from the URL) |
| `scripts/app-url-resolver.js`           | `envKey`, `path` for the fallback |
| `packages/shared/src/config/appUrls.ts` | `envKey`, `path`                  |
| `apps/*/next.config.ts`                 | `path` for `basePath`             |
| `scripts/check-app-registry.sh`         | all, to cross-check `nginx.conf`  |

`docker/prod/nginx.conf` stays hand-written. The registry check
(section 3.7) makes the two agree.

### 3.2 Dev proxy: `scripts/dev-proxy.mjs`

A Node script built on the `http-proxy` package (added as a root
devDependency). Responsibilities:

- Listen on `HOST_PORT` from the loaded env file. In `.env.dev` that is
  already `5050`.
- Route each request to the app whose `path` is the longest prefix of the
  request path. A prefix matches at a segment boundary: `/store` matches
  `/store` and `/store/en/x`, not `/storefront`. Landing's `/` is the
  fallback that matches everything else.
- Proxy WebSocket upgrades with the same routing, so Turbopack HMR works
  for all six apps.
- Preserve the incoming `Host` header (`changeOrigin: false`) and set
  `X-Forwarded-Host`, `X-Forwarded-Proto` and `X-Forwarded-For`, mirroring
  the production nginx. This keeps the payments app's server-actions
  origin check and any request-origin derivation identical to production.
- On an upstream connection error, respond `502` with a `text/plain` body
  of the form `dev-proxy: <app> is not listening on :<port>`. No retries.
- Refuse to start with a clear message if `HOST_PORT` is missing or not a
  number, or if the port is already taken.

Route matching lives in a pure function exported from
`scripts/lib/dev-proxy-router.mjs`, unit-tested under
`vitest.config.scripts.js`. The server file only wires it to `http-proxy`.

`scripts/start.mjs` spawns the proxy as a seventh child after the six
`next dev` processes and terminates it with them. The proxy does not wait
for upstreams to be ready; a request to an app that is still booting gets
the 502 above and the developer reloads.

### 3.3 App configuration

In all six `apps/*/next.config.ts`:

- `basePath` is set unconditionally from the registry entry's `path`.
  Landing's path is `/`, which Next.js does not accept as a `basePath`, so
  landing sets none. `output: "standalone"` and `outputFileTracingRoot`
  stay inside the `STANDALONE === "true"` conditional, since only the CI
  Docker build sets it.
- `BASE_PATH_PREFIX` is removed from every config and from `turbo.json`'s
  env passthrough list. Nothing has ever set it.
- `allowedDevOrigins` is removed. Dev traffic now arrives on `localhost`,
  which Next.js allows by default, and the staging tunnel fronts a
  production build where the option is inert.
- Payments keeps `serverActions.allowedOrigins` derived from
  `NEXT_PUBLIC_PAYMENTS_URL`.

A consequence worth stating: `http://localhost:5001/` (an app's own port,
no prefix) now returns 404 in dev. The app is reachable at
`http://localhost:5001/store/...` directly, or through the proxy at
`http://localhost:5050/store/...`. The README's dev URL table is updated to
list the proxy URLs.

### 3.4 Environment files and URL resolution

`.env.dev` cross-app URLs change to the single origin:

```
NEXT_PUBLIC_AUTH_URL=http://localhost:5050/auth
NEXT_PUBLIC_AUTH_HOST_URL=http://localhost:5050/auth
NEXT_PUBLIC_STORE_URL=http://localhost:5050/store
NEXT_PUBLIC_ADMIN_URL=http://localhost:5050/admin
NEXT_PUBLIC_LANDING_URL=http://localhost:5050
NEXT_PUBLIC_PAYMENTS_URL=http://localhost:5050/payments
NEXT_PUBLIC_STUDIO_URL=http://localhost:5050/studio
SUPABASE_AUTH_SITE_URL=http://localhost:5050/auth/callback
```

This is byte-for-byte the shape `.env.ci` already has. `.env.staging` and
`.env.prod` are already correct and do not change here. `pnpm lint:env`
(key parity) is unaffected because no key is added or removed.

`packages/shared/src/config/appUrls.ts` simplifies: the explicit env value
wins; otherwise the registry `path` is returned in every `NODE_ENV`. On a
single origin a root-relative path is a valid cross-app link, so the
development-only `devUrl` branch is no longer needed.

`scripts/app-url-resolver.js` (E2E) keeps returning absolute URLs: the
explicit env value, else `http://localhost:${HOST_PORT}${path}`.

`scripts/cloudflared.mjs` currently derives the public zone from
`SUPABASE_AUTH_SITE_URL`. It derives it from `NEXT_PUBLIC_LANDING_URL`
instead, which is the URL that actually describes where the apps live.

### 3.5 Hostname cleanup

- `scripts/cloudflared.mjs` ingress emits one app rule for the landing
  URL's hostname (`store.ffxivbe.org` in staging) pointing at
  `http://127.0.0.1:${HOST_PORT}`, followed by the three unchanged infra
  rules and the `http_status:404` catch-all. The `www.`, `store.`,
  `auth.`, `admin.`, `payments.`, `studio.`, `landing.` and bare-zone rules
  are gone.
- `scripts/tunnel-switch.mjs`'s `CLOUDFLARE_HOSTNAMES` becomes
  `["store.furrycolombia.com"]`. The script still targets a dead GCP host
  and is otherwise left alone; retiring it is a separate decision.
- `docs/environment.md`, `README.md`, `.claude/skills/e2e-eval/SKILL.md`
  and `docs/infrastructure.md` are corrected wherever they list per-app
  hostnames or the old six-port dev URLs. `docs/infrastructure.md` keeps
  its "blueprint, not reality" banner.

### 3.6 Cookies

`getSharedCookieDomain` in `packages/shared/src/utils/cookieDomain.ts` and
its two private copies in `packages/auth/src/client/permCachePersistence.ts`
and `apps/payments/src/features/checkout/infrastructure/cartCookie.ts` are
deleted, along with the `domain:` option each passes when writing a cookie.
The store cart cookie, the payments cart cookie and the permission cache
cookie become host-only. Their unit tests are updated to assert no `domain`
attribute is written.

This is a tightening: a cookie scoped to `.furrycolombia.com` was readable
by unrelated sites on sibling subdomains.

### 3.7 Registry check

`scripts/check-app-registry.sh` gains two assertions per app directory:

1. The app has an entry in `config/app-links.json`.
2. `docker/prod/nginx.conf` contains `location <path>` (for landing,
   `location /`) and an upstream `server 127.0.0.1:<port>`.

JSON is read with a `node -e` one-liner rather than `jq`, so the script
runs on the Windows Git Bash developers use as well as in CI.

### 3.8 Clerk production instance and Supabase

The application code needs no change: each app has one `ClerkProvider`,
one `clerkMiddleware`, and no satellite-domain configuration. The
following is a runbook, executed in the Clerk and Supabase dashboards when
the production instance is created, and stored in `docs/production-status.md`
under "Bringing production back".

1. In Clerk, create the production instance with primary domain
   `store.furrycolombia.com`. Clerk will list the DNS records it needs
   (a frontend-API CNAME such as `clerk.store.furrycolombia.com`, plus
   account-portal and email records if those features are used). Create
   them in the `furrycolombia.com` Cloudflare zone, DNS-only.
2. Copy the production publishable key, secret key and frontend-API domain
   into the repository secrets `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   and `CLERK_DOMAIN`, which `.env.prod` already references.
3. In Clerk, set the sign-in, sign-up and after-sign-in paths under
   `/auth/<locale>/...` so they match the auth app's `basePath`.
4. **Update `SUPABASE_CLERK_DOMAIN` in `.env.prod`** from the development
   `regular-puma-47.clerk.accounts.dev` host to the production frontend-API
   domain, and apply the same value to the production Supabase project's
   third-party-auth provider. Supabase trusts Clerk tokens by issuer
   domain. If this step is skipped, every authenticated Supabase call in
   production silently falls back to the anon key.
5. Restrict Clerk's allowed redirect origins to
   `https://store.furrycolombia.com`.

Dev and staging keep the development instance, which already works on
`localhost` and on the staging tunnel hostname.

## 4. Error handling

| Situation                          | Behaviour                                                 |
| ---------------------------------- | --------------------------------------------------------- |
| App not yet listening when proxied | `502`, plain text naming app and port; developer reloads  |
| `HOST_PORT` unset or non-numeric   | Proxy exits 1 with a message before binding               |
| Proxy port already in use          | Proxy exits 1 naming the port; `start.mjs` exits with it  |
| Request path matches no prefix     | Routed to landing (`/` fallback), as in nginx             |
| App missing from registry          | `check-app-registry.sh` fails in CI (Quality Checks job)  |
| Registry and `nginx.conf` disagree | `check-app-registry.sh` fails naming the app and the file |

## 5. Testing and verification

**New unit tests** (Vitest, `vitest.config.scripts.js`):

- `dev-proxy-router`: longest-prefix wins; segment-boundary matching
  (`/storefront` goes to landing); root fallback; WebSocket paths under
  `/store/_next/...` route to store.
- Port and URL derivation: `start.mjs` and `e2e.mjs` helpers return the
  registry port; `app-url-resolver.js` falls back to
  `http://localhost:<HOST_PORT><path>`.
- `appUrls`: explicit env wins; otherwise the registry path, in
  development and production alike.

**Updated unit tests:** cookie persistence tests in store, payments and
`packages/auth` assert no `domain` attribute.

**E2E:** `pnpm e2e:dev` (all apps, through the proxy) and `pnpm e2e:ci`
(through nginx in the CI container) both pass. The Docker health spec in
`docker/ci/health.spec.ts` passes unchanged.

**Manual check in dev:** sign in on `localhost:5050/auth`, land back on
`localhost:5050/store` with the session visible, add to cart, open
`localhost:5050/payments` and see the cart. One origin, no cross-origin
cookie or redirect.

**Quality gates**, in order, all green: `pnpm format:check`, `pnpm lint`,
`pnpm lint:env`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`,
`bash scripts/check-app-registry.sh`.

## 6. Files touched

| Area        | Files                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry    | `config/app-links.json`, `scripts/check-app-registry.sh`                                                                                                                                                                                                                                            |
| Dev proxy   | `scripts/dev-proxy.mjs` (new), `scripts/lib/dev-proxy-router.mjs` (new), `scripts/start.mjs`, root `package.json`                                                                                                                                                                                   |
| Apps        | `apps/{landing,store,auth,admin,payments,studio}/next.config.ts`, `turbo.json`                                                                                                                                                                                                                      |
| Env         | `.env.dev`                                                                                                                                                                                                                                                                                          |
| URL helpers | `packages/shared/src/config/appUrls.ts`, `scripts/app-url-resolver.js`, `scripts/e2e.mjs`                                                                                                                                                                                                           |
| Tunnels     | `scripts/cloudflared.mjs`, `scripts/tunnel-switch.mjs`                                                                                                                                                                                                                                              |
| Cookies     | `packages/shared/src/utils/cookieDomain.ts` (deleted), `packages/shared/src/utils/index.ts`, `packages/auth/src/client/permCachePersistence.ts`, `apps/payments/src/features/checkout/infrastructure/cartCookie.ts`, `apps/store/src/shared/application/cart/cartCookiePersistence.ts`, their tests |
| Docs        | `README.md`, `docs/environment.md`, `docs/production-status.md`, `docs/infrastructure.md`, `.claude/skills/e2e-eval/SKILL.md`                                                                                                                                                                       |

## 7. Alternatives considered

- **Production nginx in Docker for dev.** Highest fidelity, but Docker must
  be up before `pnpm dev`, the config needs a templated upstream host, and
  HMR through Docker Desktop on Windows is unreliable. Rejected.
- **One Next.js app rewriting to the others.** Next.js rewrites do not
  proxy WebSockets, so HMR breaks for five apps, and it makes landing a
  special case. Rejected.
- **Keeping `devUrl` in the registry.** It duplicated `HOST_PORT` and the
  path. Removed in favour of deriving it.
