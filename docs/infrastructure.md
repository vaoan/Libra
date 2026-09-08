# Infrastructure & Deployment Guide

> ## ⛔ Decommissioned as of 2026-08-09 — nothing described below is running
>
> **There is no production host.** GCP billing is switched off deliberately and
> permanently (paying anything is a hard stop), so the VM at `35.238.125.109`
> is gone and `store.furrycolombia.com` returns Cloudflare 530. The LAN box at
> `192.168.2.71` that the fallback path used no longer exists either.
>
> The three deploy workflows — `deploy-gcp.yml`, `deploy-local.yml` and
> `deploy-production.yml` — were deleted, because each pointed at one of those
> two dead hosts and `deploy-gcp.yml` fired on every push to `main`, which would
> have produced a failing deploy at the next release.
>
> **This document is kept as a blueprint, not a description of reality.** It
> still records how the thing was built, which is what you would want when
> standing something up again. Read every hostname, IP and container name here
> as "what it was", not "what it is". The server-side files in
> `scripts/server/` and `scripts/deploy-production.sh` are kept for the same
> reason and are inert — nothing invokes them.
>
> Deleted workflows are recoverable from git history.
>
> **For the current state and how to bring production back, see
> [production-status.md](./production-status.md)** — it records why it went
> down, which domain is which, and the one credential still missing.

> Everything needed to reproduce the production environment from scratch — whether migrating servers, recovering from failure, or moving to cloud.

> **Production is down right now?** → [Production Incident Playbook](./production-incident-playbook.md)

## Architecture Overview

### Primary (GCP)

```
GitHub push → main
  │
  └─ GitHub Actions (deploy-gcp.yml)
        │
        ├─ 1. Build   — pnpm build (7 Next.js apps, standalone)
        │
        ├─ 2. Docker  — docker build + push → GHCR
        │               (ghcr.io/vaoan/libra-prod:sha + :latest)
        │
        ├─ 3. Deploy  — SSH → GCP VM (libra-prod, us-central1-a)
        │                   └─ deploy-production.sh (nohup, survives SSH drop)
        │                         ├─ Pre-pull :latest  (warm layer cache)
        │                         ├─ Pull :sha-xxxxx   (instant — layers cached)
        │                         ├─ Stop old container
        │                         ├─ Start new container (hardened, --cap-drop=ALL)
        │                         ├─ Health check + JIT warm-up (all routes × 3)
        │                         └─ Telegram notifications throughout
        │
        ├─ 4. Purge   — Cloudflare cache (purge_everything: true)
        │
        └─ 5. Release — GitHub Release auto-created on release/* merges
                        (Telegram notification on success or failure)

GCP VM (libra-prod, us-central1-a, 35.238.125.109)
  └─ libra-prod container (port 9090:80)
        ├─ Nginx :80 (inside container)
        │   ├─ /          → landing    :5004
        │   ├─ /store     → store      :5001
        │   ├─ /admin     → admin      :5002
        │   ├─ /auth      → auth       :5000
        │   ├─ /payments  → payments   :5005
        │   └─ /studio    → studio     :5006
        └─ supervisord (6 Next.js standalone servers)
              │
              ▼
        Cloudflare Tunnel → store.furrycolombia.com (SSL)
```

### Fallback (Local server — manual only)

The original local-server deploy (`deploy-local.yml`) still exists as an emergency fallback via `workflow_dispatch`. It deploys to `192.168.2.71` via the old webhook receiver. See the [Local Server](#local-server-legacy-fallback) section below.

---

## GCP Deploy Workflow

### Trigger

Automatically on any push to `main` (including PR merges). Also runnable manually from the Actions tab.

### Workflow Files

| File                    | Status       | Trigger                         | Purpose                                 |
| ----------------------- | ------------ | ------------------------------- | --------------------------------------- |
| `deploy-gcp.yml`        | **Primary**  | push to main, workflow_dispatch | Full GCP deploy pipeline                |
| `deploy-production.yml` | **Archived** | none (triggers removed)         | Legacy orchestrator — kept as reference |
| `deploy-local.yml`      | Fallback     | workflow_dispatch only          | Emergency fallback to local server      |

> **`deploy-production.yml` has no `on:` block** — it will not trigger. GitHub may surface it as a "workflow file issue" in Actions; this is expected and harmless.

### Job Pipeline

```
build (20 min timeout)
  └─ docker-build-push (depends on build)
        └─ deploy (45 min timeout, depends on docker-build-push)
              ├─ purge-cloudflare-cache (depends on deploy)
              └─ notify-failure (runs on any failure)
```

#### `build` job

- Checks out code, installs pnpm deps
- Restores Next.js `.next/cache` from Actions cache (keyed by `pnpm-lock.yaml` + source hash)
- Runs `pnpm build` with all `PROD_*` secrets baked in for server-side code
- Uploads 7 app artifacts (`build-store`, `build-auth`, …) with 1-day retention

#### `docker-build-push` job

- Downloads the 7 build artifacts
- Logs in to GHCR with `GITHUB_TOKEN`
- Pre-pulls `:latest` for layer cache (`--cache-from`)
- Builds the Docker image (`docker/prod/Dockerfile`)
- Pushes both `ghcr.io/…/libra-prod:sha-XXXXXXX` and `…:latest`

#### `deploy` job (45 min timeout)

1. **Sets up SSH** — writes private key and nginx-style SSH config targeting `ssh.furrycolombia.com` → GCP VM
2. **Creates ControlMaster** — persistent connection so all SSH calls share one TCP session
3. **Copies deploy script** — `scp scripts/deploy-production.sh` fresh from repo on every run (guarantees script changes take effect immediately)
4. **Writes env file** — 24 secrets piped over SSH to `/tmp/.libra-build.env` (umask 077)
5. **Launches deploy** — `nohup bash /tmp/deploy-production.sh` relaunches itself detached from the SSH session so a connection drop doesn't abort it
6. **Polls for completion** — checks `/tmp/deploy-libra.done` every 15s for up to 80 polls (20 min window); tails `/tmp/deploy-libra.log` to CI output

#### `purge-cloudflare-cache` job

- Calls `https://api.cloudflare.com/client/v4/zones/{PROD_CF_ZONE_ID}/purge_cache` with `purge_everything: true`
- Only runs after a successful deploy job
- Uses `PROD_CF_API_TOKEN` and `PROD_CF_ZONE_ID` secrets

### Docker Image (`docker/prod/Dockerfile`)

Single-stage image based on `node:22-alpine`. Layer order is optimized for cache efficiency:

```
1. RUN apk add (nginx, supervisor, netcat)    — stable, rarely changes
2. COPY nginx.conf, supervisord.conf,          — stable config files
        boot-reporter.mjs, warmer.sh           (placed BEFORE app layers)
3. COPY apps/*/standalone, static, public      — volatile (changes every deploy)
4. RUN rm stub node_modules + chown           — always runs
```

Stable config layers are placed before volatile app layers so their hashes stay identical between deploys. CI's `--cache-from :latest` and the VM's local layer store can reuse them.

**Security hardening in `docker run`:**

- `--user nextjs:nodejs` (UID 1001, non-root)
- `--cap-drop=ALL`
- `--security-opt=no-new-privileges`
- `--pids-limit=1024`
- `--restart=unless-stopped`
- Secrets injected via `--env-file` (temp file, chmod 600, deleted after `docker run`)

### `scripts/deploy-production.sh` Key Behaviors

| Feature       | Detail                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| Detached mode | Relaunches itself via `nohup` so SSH drop doesn't abort it                      |
| Pre-pull      | Pulls `:latest` before the SHA-tagged image to warm layer cache                 |
| Re-tag        | After successful pull, tags image as `:latest` locally for next deploy          |
| Hot-swap      | Old container stopped AFTER new image is fully pulled                           |
| Health check  | Polls `/health` on all 7 apps for up to 120s                                    |
| JIT warm-up   | Hits all routes 3× in parallel after health check passes                        |
| Telegram      | Progress notifications throughout: start, image pulled, container healthy, done |
| Cleanup       | On exit (success or fail), removes temp env and done files                      |

## Development Environments

Three environments with clear separation: dev (local), e2e (Docker + isolated Supabase), staging (full Docker stack + Cloudflare), and prod (remote server).

| Environment      | Command                                       | Description                                             |
| ---------------- | --------------------------------------------- | ------------------------------------------------------- |
| Dev              | `pnpm dev`                                    | Vite dev servers on ports 5000–5006 + local Supabase    |
| Dev + Supabase   | `pnpm dev:up`                                 | Dev servers + local Supabase start                      |
| Dev + Tunnel     | `pnpm dev:up:tunnel`                          | Dev + Supabase + Cloudflare tunnel to ffxivbe.org       |
| E2E              | `pnpm test:e2e`                               | Docker app (port 8089) + isolated Supabase (port 64321) |
| Staging          | `pnpm staging`                                | Docker app + full Supabase stack (port 8088)            |
| Staging + Tunnel | `pnpm staging:tunnel`                         | Staging + Cloudflare sidecar (public URLs)              |
| Staging E2E      | `pnpm test:e2e -- --env staging --cloudflare` | E2E tests against staging via Cloudflare tunnel         |
| Staging (fresh)  | `pnpm staging:fresh`                          | Rebuild Docker from scratch (no cache)                  |
| Staging Stop     | `pnpm staging:stop`                           | Stop staging Docker container                           |
| Prod Deploy      | `pnpm prod:deploy`                            | SSH deploy to production server via deploy.sh           |
| Prod Logs        | `pnpm prod:logs`                              | Tail production Docker logs (libra-prod)                |
| Prod Status      | `pnpm prod:status`                            | Check production container status                       |

### Environment summary

| Env     | Apps                    | Supabase             | Port | Auth redirects                             |
| ------- | ----------------------- | -------------------- | ---- | ------------------------------------------ |
| dev     | Vite local (5000–5006)  | Local CLI (54321)    | —    | localhost:5000–5006                        |
| e2e     | Docker container        | Isolated CLI (64321) | 8089 | localhost:8089                             |
| staging | Docker container        | Docker Compose       | 8088 | https://store.ffxivbe.org (via Cloudflare) |
| prod    | Docker on remote server | Supabase Cloud       | 9090 | https://store.furrycolombia.com            |

Environment files:

- `.env.example` — committed defaults for local dev
- `.env` — local overrides (gitignored), secrets and OAuth keys
- `.env.staging` — committed staging overrides (container name, public URLs)
- `.env.e2e` — committed E2E test overrides (isolated Supabase, port 8089)
- `.env.prod` — committed prod E2E overrides (points at live site + Supabase Cloud)

## Server

| Property      | Value                               |
| ------------- | ----------------------------------- |
| Hostname      | hestia.local                        |
| LAN IP        | 192.168.2.71                        |
| Public IP     | 186.29.35.212 (dynamic, behind NAT) |
| OS            | Ubuntu 24.04 (Linux 6.8)            |
| RAM           | 8 GB                                |
| Disk          | 915 GB                              |
| Control Panel | Hestia CP (port 8083)               |
| SSH user      | furrycolombia                       |
| SSH auth      | ED25519 key (`libra-deploy`)        |
| SSH password  | Same as sudo password               |

## Software on Server

| Tool           | Version  | Install method       |
| -------------- | -------- | -------------------- |
| Node.js        | 22.x     | nvm (`~/.nvm`)       |
| pnpm           | 10.x     | npm global (via nvm) |
| PM2            | 6.x      | npm global (via nvm) |
| Docker         | 29.x     | `get.docker.com`     |
| Docker Compose | 5.x      | Bundled with Docker  |
| Nginx          | 1.29.x   | System (Hestia)      |
| cloudflared    | 2026.3.x | Cloudflare apt repo  |
| Git            | 2.43     | System               |

## Domain & Networking

| Domain                   | Routes to                 | Purpose                         |
| ------------------------ | ------------------------- | ------------------------------- |
| store.furrycolombia.com  | Cloudflare tunnel → :9090 | Production app                  |
| deploy.furrycolombia.com | Cloudflare tunnel → :9091 | Webhook deploy receiver         |
| ssh.furrycolombia.com    | Cloudflare tunnel → :22   | SSH access (for GitHub Actions) |

**⚠️ Only these 3 subdomains belong to this project. `furrycolombia.com` and `moonfest.furrycolombia.com` are separate sites. Never modify their DNS records.**

## Cloudflare Tunnel

| Property    | Value                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| Tunnel name | libra-prod                                                                     |
| Tunnel ID   | af85209b-fcfb-477a-9b95-81180f6901f2                                           |
| Service     | systemd (`cloudflared.service`), auto-starts on boot                           |
| Config      | `/etc/cloudflared/config.yml`                                                  |
| Credentials | `/etc/cloudflared/af85209b-fcfb-477a-9b95-81180f6901f2.json`                   |
| Cert        | `/home/furrycolombia/.cloudflared/cert.pem` (authorized for furrycolombia.com) |

Current ingress rules:

```yaml
ingress:
  - hostname: deploy.furrycolombia.com
    service: http://127.0.0.1:9091
  - hostname: ssh.furrycolombia.com
    service: ssh://localhost:22
  - hostname: store.furrycolombia.com
    service: http://127.0.0.1:9090
  - service: http_status:404
```

## Docker Production Container

| Property       | Value                                                     |
| -------------- | --------------------------------------------------------- |
| Container name | libra-prod                                                |
| Image          | libra-prod:latest                                         |
| Port mapping   | 9090:80                                                   |
| Compose file   | `docker/compose.yml`                                      |
| Env file       | `/home/furrycolombia/.env.prod` (outside repo, chmod 600) |
| Restart policy | unless-stopped                                            |

The container runs Nginx + supervisord with 7 standalone Next.js servers inside. This is the same image used for local Docker E2E tests.

### Production env file (`/home/furrycolombia/.env.prod`)

```env
SITE_PROD_CONTAINER_NAME=libra-prod
SITE_PROD_IMAGE_NAME=libra-prod
HOST_PORT=9090
APP_INTERNAL_ORIGIN=http://libra-prod:8080
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
AUTH_PROVIDER_MODE=supabase
NEXT_PUBLIC_STORE_URL=https://store.furrycolombia.com/store
NEXT_PUBLIC_ADMIN_URL=https://store.furrycolombia.com/admin
NEXT_PUBLIC_AUTH_HOST_URL=https://store.furrycolombia.com/auth
NEXT_PUBLIC_AUTH_URL=https://store.furrycolombia.com/auth
NEXT_PUBLIC_LANDING_URL=https://store.furrycolombia.com
NEXT_PUBLIC_PAYMENTS_URL=https://store.furrycolombia.com/payments
NEXT_PUBLIC_STUDIO_URL=https://store.furrycolombia.com/studio
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_ENABLE_MOCKS=false
```

A template is committed at `scripts/server/docker-prod.env.example`.

## Webhook Deploy Receiver

| Property      | Value                                       |
| ------------- | ------------------------------------------- |
| URL           | `https://deploy.furrycolombia.com/deploy`   |
| Health        | `https://deploy.furrycolombia.com/health`   |
| Port          | 9091                                        |
| PM2 name      | libra-webhook                               |
| Script        | `/home/furrycolombia/webhook-deploy.mjs`    |
| Deploy script | `/home/furrycolombia/deploy.sh`             |
| Secret        | Stored in GitHub webhook settings + PM2 env |
| Trigger       | Push to `main` branch                       |

When you push to `main`, GitHub sends a POST to the webhook. The receiver verifies the HMAC signature, pulls latest code, rebuilds the Docker container with `--no-cache`, and restarts it.

## Supabase (Cloud)

| Property  | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Provider  | Supabase Cloud (free tier)                                    |
| Project   | libra-prod                                                    |
| Ref       | olafyajipvsltohagiah                                          |
| Region    | South America (São Paulo)                                     |
| URL       | `https://olafyajipvsltohagiah.supabase.co`                    |
| Dashboard | `https://supabase.com/dashboard/project/olafyajipvsltohagiah` |
| RLS       | Enabled (automatic)                                           |
| Site URL  | `https://store.furrycolombia.com`                             |

### Auth redirect URLs (configured in Supabase dashboard)

- `https://store.furrycolombia.com/auth/callback`
- `https://store.furrycolombia.com/store/auth/callback`

### OAuth providers (configured in Supabase dashboard, not via code)

| Provider | Status         | Redirect URI                                                |
| -------- | -------------- | ----------------------------------------------------------- |
| Google   | Enabled        | `https://olafyajipvsltohagiah.supabase.co/auth/v1/callback` |
| Discord  | Not configured | —                                                           |

Google credentials are also registered in Google Cloud Console with the Supabase callback as an authorized redirect URI.

## GitHub Secrets

| Secret                          | Value                                      |
| ------------------------------- | ------------------------------------------ |
| `PROD_SERVER_HOST`              | `ssh.furrycolombia.com`                    |
| `PROD_SERVER_USER`              | `furrycolombia`                            |
| `PROD_SERVER_SSH_KEY`           | ED25519 private key (full PEM)             |
| `WEBHOOK_SECRET`                | HMAC secret shared with GitHub webhook     |
| `NEXT_PUBLIC_STORE_URL`         | `https://store.furrycolombia.com/store`    |
| `NEXT_PUBLIC_ADMIN_URL`         | `https://store.furrycolombia.com/admin`    |
| `NEXT_PUBLIC_AUTH_HOST_URL`     | `https://store.furrycolombia.com/auth`     |
| `NEXT_PUBLIC_AUTH_URL`          | `https://store.furrycolombia.com/auth`     |
| `NEXT_PUBLIC_LANDING_URL`       | `https://store.furrycolombia.com`          |
| `NEXT_PUBLIC_PAYMENTS_URL`      | `https://store.furrycolombia.com/payments` |
| `NEXT_PUBLIC_STUDIO_URL`        | `https://store.furrycolombia.com/studio`   |
| `NEXT_PUBLIC_API_PREFIX`        | `/api`                                     |
| `NEXT_PUBLIC_ENABLE_MOCKS`      | `false`                                    |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://olafyajipvsltohagiah.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key                          |

## GitHub Webhook

| Property         | Value                                     |
| ---------------- | ----------------------------------------- |
| Payload URL      | `https://deploy.furrycolombia.com/deploy` |
| Content type     | application/json                          |
| Secret           | Same as `WEBHOOK_SECRET`                  |
| SSL verification | Enabled                                   |
| Events           | Just the push event                       |
| Active           | Yes                                       |

## Hestia CP

| Property   | Value                                                   |
| ---------- | ------------------------------------------------------- |
| Admin URL  | `https://server.furrycolombia.com:8083`                 |
| Admin user | useradmin                                               |
| Domain     | store.furrycolombia.com (custom `libra` nginx template) |
| Template   | Proxies to `127.0.0.1:9090` (Docker container)          |

## File Locations on Server

| Path                                     | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `/home/furrycolombia/libra/`             | Git repo clone                                       |
| `/home/furrycolombia/.env.prod`          | Docker env file (secrets, chmod 600)                 |
| `/home/furrycolombia/deploy.sh`          | Deploy script (called by webhook)                    |
| `/home/furrycolombia/webhook-deploy.mjs` | Webhook receiver                                     |
| `/home/furrycolombia/libra-nginx.conf`   | Standalone nginx config (unused, Docker has its own) |
| `/home/furrycolombia/libra-proxy.inc`    | Nginx proxy headers (unused, Docker has its own)     |
| `/etc/cloudflared/config.yml`            | Cloudflare tunnel config                             |
| `/etc/cloudflared/af85209b-*.json`       | Tunnel credentials                                   |

## PM2 Processes

| Name          | Script                                   | Purpose                 |
| ------------- | ---------------------------------------- | ----------------------- |
| libra-webhook | `/home/furrycolombia/webhook-deploy.mjs` | GitHub webhook receiver |

The 7 Next.js apps run inside the Docker container (managed by supervisord), not PM2.

---

## Fresh Server Setup (Migration Runbook)

### 1. OS & user

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl
sudo adduser furrycolombia
sudo usermod -aG sudo furrycolombia
```

### 2. SSH key auth

From your local machine:

```bash
ssh-keygen -t ed25519 -C "libra-deploy"
type %USERPROFILE%\.ssh\id_ed25519.pub | ssh furrycolombia@<SERVER_IP> "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh"
```

### 3. Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker furrycolombia
# Log out and back in for group to take effect
```

### 4. Node.js + nvm + PM2

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
npm install -g pnpm pm2
pm2 startup  # Run the sudo command it outputs
```

### 5. Cloudflare tunnel

```bash
# Install cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /tmp/cloudflare-main.gpg
sudo cp /tmp/cloudflare-main.gpg /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# Login (opens browser — select furrycolombia.com)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create libra-prod

# Route DNS (ONLY these 3 subdomains)
cloudflared tunnel route dns libra-prod store.furrycolombia.com
cloudflared tunnel route dns libra-prod deploy.furrycolombia.com
cloudflared tunnel route dns libra-prod ssh.furrycolombia.com

# Write config (replace <TUNNEL_ID>)
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml << EOF
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
protocol: http2

ingress:
  - hostname: deploy.furrycolombia.com
    service: http://127.0.0.1:9091
  - hostname: ssh.furrycolombia.com
    service: ssh://localhost:22
  - hostname: store.furrycolombia.com
    service: http://127.0.0.1:9090
  - service: http_status:404
EOF

sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/
sudo cloudflared service install
```

**⚠️ Only `store`, `deploy`, and `ssh` subdomains. Never touch `furrycolombia.com` or `moonfest.furrycolombia.com`.**

### 6. Clone repo and create env file

```bash
git clone --branch main --depth 1 https://github.com/vaoan/libra.git ~/libra

# Create env file OUTSIDE the repo (won't be wiped by git clean)
cat > ~/.env.prod << 'EOF'
SITE_PROD_CONTAINER_NAME=libra-prod
SITE_PROD_IMAGE_NAME=libra-prod
HOST_PORT=9090
APP_INTERNAL_ORIGIN=http://libra-prod:8080
NEXT_PUBLIC_SUPABASE_URL=<supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
AUTH_PROVIDER_MODE=supabase
NEXT_PUBLIC_STORE_URL=https://store.furrycolombia.com/store
NEXT_PUBLIC_ADMIN_URL=https://store.furrycolombia.com/admin
NEXT_PUBLIC_AUTH_HOST_URL=https://store.furrycolombia.com/auth
NEXT_PUBLIC_AUTH_URL=https://store.furrycolombia.com/auth
NEXT_PUBLIC_LANDING_URL=https://store.furrycolombia.com
NEXT_PUBLIC_PAYMENTS_URL=https://store.furrycolombia.com/payments
NEXT_PUBLIC_STUDIO_URL=https://store.furrycolombia.com/studio
NEXT_PUBLIC_API_PREFIX=/api
NEXT_PUBLIC_ENABLE_MOCKS=false
EOF
chmod 600 ~/.env.prod
```

### 7. Build and start the container

```bash
cd ~/libra
docker compose -f docker/compose.yml --env-file ~/.env.prod build --no-cache
docker compose -f docker/compose.yml --env-file ~/.env.prod up -d
```

### 8. Deploy webhook receiver

```bash
# Upload webhook-deploy.mjs and deploy.sh to ~/
# Then start with PM2:
WEBHOOK_SECRET=<secret> DEPLOY_SCRIPT=/home/furrycolombia/deploy.sh \
  pm2 start ~/webhook-deploy.mjs --name libra-webhook
pm2 save
```

### 9. GitHub webhook

In repo Settings → Webhooks → Add webhook:

- Payload URL: `https://deploy.furrycolombia.com/deploy`
- Content type: `application/json`
- Secret: same as `WEBHOOK_SECRET`
- Events: Just the push event
- SSL verification: enabled

### 10. GitHub secrets

```bash
gh secret set PROD_SERVER_HOST --body "ssh.furrycolombia.com"
gh secret set PROD_SERVER_USER --body "furrycolombia"
gh secret set PROD_SERVER_SSH_KEY < ~/.ssh/id_ed25519
# ... all NEXT_PUBLIC_* secrets (see table above)
```

---

## Operational Commands

### Docker

```bash
# View running container
docker ps

# View logs
docker logs libra-prod -f

# Restart
docker compose -f ~/libra/docker/compose.yml --env-file ~/.env.prod restart

# Rebuild and restart (no cache)
docker compose -f ~/libra/docker/compose.yml --env-file ~/.env.prod up -d --build --no-cache

# Stop
docker compose -f ~/libra/docker/compose.yml --env-file ~/.env.prod down
```

### Webhook

```bash
pm2 logs libra-webhook
pm2 restart libra-webhook
curl https://deploy.furrycolombia.com/health
```

### Cloudflare tunnel

```bash
sudo systemctl status cloudflared
sudo systemctl restart cloudflared
sudo journalctl -u cloudflared -f
```

### Manual deploy

```bash
ssh furrycolombia@192.168.2.71
bash ~/deploy.sh
```

---

## E2E Against Production

To run E2E tests against the live site (with test IDs enabled):

1. Rebuild with test IDs:

```bash
# Add to .env.prod temporarily
echo "NEXT_PUBLIC_ENABLE_TEST_IDS=true" >> ~/.env.prod
docker compose -f ~/libra/docker/compose.yml --env-file ~/.env.prod up -d --build
```

2. Run tests locally:

```bash
TARGET_ENV=prod \
pnpm --filter store exec playwright test --reporter=list
```

3. Remove test IDs after:

```bash
sed -i '/ENABLE_TEST_IDS/d' ~/.env.prod
docker compose -f ~/libra/docker/compose.yml --env-file ~/.env.prod up -d --build --no-cache
```

Production deploys via webhook never include test IDs.

---

## Troubleshooting

| Symptom                                   | Check                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Site down                                 | `docker ps` — is the container running?                                                                 |
| 502 from Cloudflare                       | `curl localhost:9090/health` on the server                                                              |
| Container crash loop                      | `docker logs libra-prod --tail 50`                                                                      |
| `Cannot find module 'next'`               | pnpm symlinks stripped by ZIP artifact — check `.npmrc` has `node-linker=hoisted`                       |
| `docker COPY: not found` (static/public)  | Empty dirs dropped by ZIP — CI must touch placeholder files in `.next/static` and `public/`             |
| Routes 404 but container is running       | `.dockerignore` may have excluded `.next/` — see [incident playbook](./production-incident-playbook.md) |
| Tunnel down                               | `sudo systemctl status cloudflared`                                                                     |
| Can't SSH from outside LAN                | Check cloudflared is running + `ssh.furrycolombia.com` DNS; fallback: `ssh furrycolombia@192.168.2.71`  |
| Build fails with `open .ignored_auth`     | Windows NTFS pnpm markers — run `find . -name ".ignored_*" -delete` then retry                          |
| Deploy hangs / `Broken pipe` during build | Cloudflare Access timeout — deploy script handles this via `nohup + poll`; do not change                |
| Auth redirect to localhost                | Check Supabase Site URL setting in dashboard                                                            |
| OAuth provider error                      | Check provider is enabled in Supabase dashboard                                                         |
| Webhook not triggering                    | `pm2 logs libra-webhook`                                                                                |
| Build fails (disk)                        | `df -h` and `docker system prune` on server                                                             |

---

## Related

- [Production Incident Playbook](./production-incident-playbook.md) — Emergency procedures, root cause analysis of April 2026 outage
