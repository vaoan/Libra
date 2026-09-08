# Environment System

This document explains how the environment system works end-to-end: how env files are structured, how secrets are resolved, how ports are derived, how the dev server starts, how Docker images are built, and how Supabase and Cloudflare tunnels are configured.

---

## Table of Contents

- [Overview](#overview)
- [Env Files](#env-files)
- [Secret Resolution](#secret-resolution)
- [Port System](#port-system)
- [Dev Server](#dev-server)
- [Docker Build and Container](#docker-build-and-container)
- [Supabase Docker Stack](#supabase-docker-stack)
- [Cloudflare Tunnel](#cloudflare-tunnel)
- [Env Parity Checker](#env-parity-checker)
- [Environment Reference](#environment-reference)

---

## Overview

Every script in this project reads configuration from a single `.env.<name>` file. No script hardcodes ports, URLs, image names, or credentials. The flow is always:

```
.env.<name>  +  .secrets  →  loadEnv()  →  process.env  →  script logic
```

`loadEnv(targetEnv)` in `scripts/load-env.mjs` is the single entry point. Every script — dev server, Docker build, Supabase manager, tunnel launcher — calls it before doing anything else.

---

## Env Files

### Available environments

| File           | Purpose                                     | Committed |
| -------------- | ------------------------------------------- | --------- |
| `.env.dev`     | Dev apps + dedicated Supabase Cloud project | yes       |
| `.env.staging` | Staging - Docker app + Docker Supabase      | yes       |
| `.env.prod`    | Production - Docker app + Supabase Cloud    | yes       |
| `.secrets`     | Resolved secret values (never committed)    | no        |

### Key groups in every env file

```dotenv
# ─── Topology ─────────────────────────────────────────────────────
APPS_MODE=local|docker          # how apps run
SUPABASE_MODE=local|docker|cloud # how Supabase runs

# ─── Container identity ───────────────────────────────────────────
SITE_PROD_IMAGE_NAME=libra-staging
SITE_PROD_CONTAINER_NAME=libra-staging

# ─── App origins ──────────────────────────────────────────────────
HOST_PORT=3000   # host port for Docker container
APP_INTERNAL_ORIGIN=http://libra-staging:8080  # internal nginx address

# ─── Supabase ─────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=http://localhost:3030   # or https://... for cloud
SUPABASE_PORT=3030                               # base port for Supabase stack

# ─── Cross-app navigation ─────────────────────────────────────────
NEXT_PUBLIC_AUTH_URL=http://localhost:5000
NEXT_PUBLIC_STORE_URL=http://localhost:5001
# ... one per app

# ─── Cloudflare tunnels ───────────────────────────────────────────
CLOUDFLARE_TUNNEL_ID=<uuid>                      # optional, enables config generation
CLOUDFLARE_TUNNEL_APP_ENABLED=true|false
CLOUDFLARE_TUNNEL_APP_TOKEN=$secret:STAGING_CLOUDFLARE_TUNNEL_APP_TOKEN
```

### Secret references

Values that contain sensitive data use the `$secret:KEY` syntax:

```dotenv
NEXT_PUBLIC_SUPABASE_ANON_KEY=$secret:STAGING_SUPABASE_ANON_KEY
```

At runtime, `loadEnv` replaces `$secret:STAGING_SUPABASE_ANON_KEY` with the value of `STAGING_SUPABASE_ANON_KEY` from `.secrets`.

---

## Secret Resolution

`scripts/load-env.mjs` handles all env loading and secret resolution.

### How it works

1. Reads `.env.<name>` and parses all `KEY=VALUE` lines
2. Scans for any value containing `$secret:`
3. **Locally**: reads `.secrets` and substitutes each `$secret:KEY` with the matching value
4. **In CI** (`CI=true`): secrets are already in `process.env` — reads them directly, skips `.secrets`
5. Writes all resolved vars into `process.env` — **existing vars win** (CLI/CI overrides are never overwritten)
6. Sets `TARGET_ENV` so app code knows which environment is active
7. If `ENV_DEBUG=true`: serializes all vars into `NEXT_PUBLIC_ENV_DEBUG` for the admin debug viewer (`/en/env`)

### Sync secrets from GitHub

```bash
pnpm sync-secrets
```

This triggers a GitHub Actions workflow that encrypts all repository secrets and downloads them as `.secrets`. Requires `gh` CLI authenticated.

### Adding a new secret

1. Add the secret to GitHub repository secrets (Settings → Secrets)
2. Add it to the workflow that exports secrets (`.github/workflows/sync-secrets.yml`)
3. Reference it in the env file: `MY_KEY=$secret:MY_SECRET_NAME`
4. Run `pnpm sync-secrets` to pull it locally

---

## Port System

### Dev server ports

In dev mode, each app reads its port from its own `NEXT_PUBLIC_<APP>_URL` env var:

```dotenv
NEXT_PUBLIC_AUTH_URL=http://localhost:5000      → auth runs on 5000
NEXT_PUBLIC_STORE_URL=http://localhost:5001     → store runs on 5001
NEXT_PUBLIC_ADMIN_URL=http://localhost:5002     → admin runs on 5002
NEXT_PUBLIC_LANDING_URL=http://localhost:5004
NEXT_PUBLIC_PAYMENTS_URL=http://localhost:5005
NEXT_PUBLIC_STUDIO_URL=http://localhost:5006
```

`scripts/start.mjs` auto-discovers all apps in `apps/`, extracts the port from the matching env var, and passes `-p <port>` to `next dev`.

### Docker container port

The host port for the Docker container is set explicitly with `HOST_PORT`:

```dotenv
HOST_PORT=3000   -> container binds to host port 3000
```

`scripts/docker-build.mjs` reads `HOST_PORT` from the env file and passes it to `docker compose`.

### Supabase port derivation

`SUPABASE_PORT` is the **base port** for the entire Supabase stack. All other Supabase service ports are derived from it:

| Service         | Port formula        | Example (base=3030) |
| --------------- | ------------------- | ------------------- |
| API (Kong)      | `base`              | 3030                |
| DB (Postgres)   | `base + 1`          | 3031                |
| Shadow DB       | `base - 1`          | 3029                |
| Connection pool | `base + 8`          | 3038                |
| Studio          | `base + 2`          | 3032                |
| Inbucket (mail) | `base + 3`          | 3033                |
| Analytics       | `base + 6`          | 3036                |
| Inspector       | `base + 10000 - 21` | 13009               |

This derivation happens in `scripts/supabase-docker.mjs` → `derivePorts(base)`. The derived ports are written into `process.env` and substituted into `supabase/config.toml` via the template system.

### Choosing base ports per environment

| Environment | `SUPABASE_PORT` | App port (`HOST_PORT`) |
| ----------- | --------------- | ---------------------- |
| dev         | N/A             | 8088                   |
| staging     | 3030            | 3000                   |

Dev uses Supabase Cloud, so SUPABASE_PORT is not used. Staging uses an explicit base port for the Docker Supabase stack.

---

## Dev Server

```bash
pnpm dev              # uses .env.dev
```

`scripts/start.mjs`:

1. Calls `loadEnv(targetEnv)` — resolves all secrets into `process.env`
2. Clears all `.next` caches to prevent stale env var mismatches
3. Auto-discovers all directories under `apps/`
4. For each app, extracts the port from `NEXT_PUBLIC_<APP>_URL`
5. Spawns `next dev -p <port>` for each app in parallel

All apps share the same `process.env` so they all see the same resolved configuration.

---

## Docker Build and Container

```bash
pnpm docker:build --env staging          # build only
pnpm docker:build --env staging --up     # build + start container
pnpm docker:build --env staging --up --tunnel  # build + start + tunnel
```

`scripts/docker-build.mjs`:

1. Calls `loadEnv(targetEnv)`
2. Reads `SITE_PROD_IMAGE_NAME` and `SITE_PROD_CONTAINER_NAME` from env
3. Reads `HOST_PORT` from env
4. Runs `docker build` passing all `NEXT_PUBLIC_*` vars as `--build-arg` flags — these are baked into the Next.js build at compile time
5. If `--up`: removes any existing container with the same name, then runs `docker compose up -d` using `docker/compose.yml`
6. If `--tunnel`: spawns `scripts/cloudflared.mjs` after compose succeeds

### Why build args matter

Next.js bakes `NEXT_PUBLIC_*` vars at build time. The Docker image must be built with the correct URLs for the target environment. This is why `docker-build.mjs` passes them explicitly as `--build-arg` rather than relying on runtime env injection.

### The compose file

`docker/compose.yml` defines the app container. It reads `SITE_PROD_IMAGE_NAME`, `SITE_PROD_CONTAINER_NAME`, and `HOST_PORT` from the environment passed by `docker-build.mjs` — not from an `--env-file`, because that would expose unresolved `$secret:` references.

---

## Supabase Docker Stack

```bash
pnpm supabase:docker start --env staging
pnpm supabase:docker stop --env staging
pnpm supabase:docker restart --env staging
pnpm supabase:docker reset --env staging   # re-runs migrations + seed
pnpm supabase:docker status --env staging
```

`scripts/supabase-docker.mjs`:

1. Calls `loadEnv(targetEnv)`
2. Reads `SUPABASE_PORT` and calls `derivePorts(base)` to compute all service ports
3. Derives OAuth redirect URLs from the `NEXT_PUBLIC_*_URL` vars already in the env
4. Generates `supabase/config.toml` from `supabase/config.toml.template` by substituting all `{{PORT_VAR}}` placeholders
5. On `start` or `restart`: removes any orphaned containers from previous runs before starting
6. Runs `pnpm supabase <command>` with the generated config
7. Cleans up the generated `config.toml` on exit

### Config template

`supabase/config.toml.template` contains placeholders like `{{SUPABASE_API_PORT}}`, `{{SUPABASE_STUDIO_PORT}}`, etc. The script substitutes these with the derived port values. This means the Supabase stack is fully port-configurable from a single `SUPABASE_PORT` value in the env file.

### Redirect URLs

The template uses `env(SUPABASE_AUTH_REDIRECT_URL_*)` references. These are populated automatically by `supabase-docker.mjs` from the app URLs already in the env:

```
NEXT_PUBLIC_AUTH_URL + /auth/callback  →  SUPABASE_AUTH_REDIRECT_URL_AUTH
NEXT_PUBLIC_STORE_URL + /auth/callback →  SUPABASE_AUTH_REDIRECT_URL_STORE
...
```

No separate redirect URL vars need to be set in the env file.

---

## Cloudflare Tunnel

```bash
pnpm tunnel --env staging        # generate config + launch tunnel
pnpm tunnel:stop --env staging   # stop tunnel processes
```

### How `pnpm tunnel` works

`scripts/cloudflared.mjs`:

1. Calls `loadEnv(targetEnv)`
2. If `CLOUDFLARE_TUNNEL_ID` is set in the env:
   - Derives the credentials file path as `~/.cloudflared/<tunnel-id>.json` (no hardcoded paths)
   - Reads `HOST_PORT` for the app port � **fails with an error if missing or invalid**
   - Reads `SUPABASE_PORT` for the Supabase port — **fails with an error if missing or `N/A`**
   - Derives the public hostname from `SUPABASE_AUTH_SITE_URL` — **fails if missing**
   - Generates `~/.cloudflared/config.yml` with all ingress rules pointing to the correct local ports
3. Scans `process.env` for all `CLOUDFLARE_TUNNEL_<NAME>_ENABLED` keys
4. For each enabled tunnel with a non-empty token: spawns `cloudflared tunnel run --token <token>` as a detached background process and calls `.unref()` so the launcher exits immediately
5. Per-tunnel token errors are non-fatal — other tunnels continue

### Config generation

The generated `~/.cloudflared/config.yml` maps all public hostnames to local ports derived from the env:

```yaml
ingress:
  - hostname: store.ffxivbe.org
    service: http://127.0.0.1:3000 # from HOST_PORT
  - hostname: supabase.ffxivbe.org
    service: http://127.0.0.1:3030 # from SUPABASE_PORT
  - hostname: supabase-studio.ffxivbe.org
    service: http://127.0.0.1:3032 # SUPABASE_PORT + 2
  - hostname: mailpit.ffxivbe.org
    service: http://127.0.0.1:3033 # SUPABASE_PORT + 3
```

The hostname is derived from `SUPABASE_AUTH_SITE_URL` — the last two domain segments (e.g. `ffxivbe.org`).

### Named tunnel pattern

Tunnels are declared in the env file using a named pattern:

```dotenv
CLOUDFLARE_TUNNEL_APP_ENABLED=true
CLOUDFLARE_TUNNEL_APP_TOKEN=$secret:STAGING_CLOUDFLARE_TUNNEL_APP_TOKEN

CLOUDFLARE_TUNNEL_SUPABASE_ENABLED=false
CLOUDFLARE_TUNNEL_SUPABASE_TOKEN=
```

Multiple tunnels can coexist. The launcher discovers all `CLOUDFLARE_TUNNEL_<NAME>_ENABLED` keys automatically — no script changes needed to add a new tunnel.

### `CLOUDFLARE_TUNNEL_*` keys are exempt from parity checks

Since different environments have different tunnel configurations (staging has tunnels, dev/prod don't), these keys are excluded from the env parity checker. All other keys must be present in all env files.

---

## Env Parity Checker

```bash
pnpm lint:env
```

`scripts/check-env-parity.mjs` verifies that all `.env.*` files define the same set of keys. This prevents "works on my machine" bugs caused by missing env vars.

- All non-tunnel keys must be present in every env file
- `CLOUDFLARE_TUNNEL_*` keys are exempt (intentionally asymmetric across environments)
- Use `N/A` as the value when a key doesn't apply to a specific environment
- Runs automatically as part of `pnpm precommit`

---

## Environment Reference

### Topology keys

| Key             | Values                           | Purpose                      |
| --------------- | -------------------------------- | ---------------------------- |
| `APPS_MODE`     | `local`, `docker`                | How apps run                 |
| `SUPABASE_MODE` | `local`, `docker`, `cloud`       | How Supabase runs            |
| `TARGET_ENV`    | `dev`, `test`, `staging`, `prod` | Set automatically by loadEnv |

### Container keys

| Key                        | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| `SITE_PROD_IMAGE_NAME`     | Docker image name for `docker build -t`      |
| `SITE_PROD_CONTAINER_NAME` | Docker container name                        |
| `HOST_PORT`                | Explicit host port used for app container    |
| `APP_INTERNAL_ORIGIN`      | Internal nginx address inside Docker network |

### Supabase keys

| Key                             | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `SUPABASE_PORT`                 | Base port — all other ports derived from this  |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase API URL seen by the browser           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (baked into Docker build)      |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-side admin key (never baked into build) |
| `STAGING_JWT_SECRET`            | JWT signing secret for self-hosted Supabase    |
| `STAGING_POSTGRES_PASSWORD`     | Postgres password for self-hosted Supabase     |
| `SUPABASE_AUTH_SITE_URL`        | Auth callback base URL                         |

### Cloudflare tunnel keys

| Key                                | Purpose                                        |
| ---------------------------------- | ---------------------------------------------- |
| `CLOUDFLARE_TUNNEL_ID`             | Tunnel UUID — enables config.yml generation    |
| `CLOUDFLARE_TUNNEL_<NAME>_ENABLED` | `true`/`false` — whether to launch this tunnel |
| `CLOUDFLARE_TUNNEL_<NAME>_TOKEN`   | Token for this tunnel (from `$secret:`)        |

### Build flags

| Key                           | Purpose                                  |
| ----------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_BUILD_HASH`      | Build identifier shown in the UI         |
| `NEXT_PUBLIC_ENABLE_TEST_IDS` | Enables `data-testid` attributes for E2E |
| `ENV_DEBUG`                   | Enables env debug viewer at `/en/env`    |
| `NEXT_PUBLIC_ENV_DEBUG`       | Serialized env snapshot (set by loadEnv) |

## Five GitHub secrets that were deleted

`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`,
`SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_DISCORD_SECRET`
and `DEV_SUPABASE_AUTH_EXTERNAL_REDIRECT_URI` existed as repository secrets,
dated 14 and 19 April 2026. They configured Supabase Auth's own Google and
Discord providers, which Clerk replaced.

Nothing read them: no workflow, no script, no env file. They were not in the
local `.secrets` either, so `pnpm sync-secrets` never pulled them, and they were
not in the `env:` block of `sync-secrets.yml`, so nothing broke by their going
away. The only occurrence of the string left in the repository is a comment in
`scripts/load-root-env.cjs` recounting a past bug about empty
`SUPABASE_AUTH_EXTERNAL_*` values — prose, not a reference.

They were deleted on the owner's instruction after that was re-verified. The
repository went from 61 repository secrets to 56.

**Deleting them removed them from CI. It did not revoke anything.** If the
matching OAuth applications are still live in the Google Cloud and Discord
developer consoles, those client secrets remain valid there and should be
rotated or the applications deleted, which is a change to make in those
consoles rather than here.

To confirm the state at any time:

```bash
gh secret list --repo vaoan/Libra | grep SUPABASE_AUTH_EXTERNAL   # expect no output
```
