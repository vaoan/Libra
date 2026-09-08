# Production Incident Playbook

> ## ⛔ No production to have incidents on, as of 2026-08-09
>
> The GCP VM is gone (billing off, permanently) and the LAN fallback box no
> longer exists, so there is nothing serving and nothing to page about. The
> deploy workflows this playbook refers to were deleted.
>
> Kept because the diagnostics and the April 2026 post-mortem are still worth
> having the day something is hosted again. Every host and container name below
> is historical.
>
> Current state and restore path: [production-status.md](./production-status.md).

> **Quick reference for production outages.** This document captures what went wrong in April 2026, how we fixed it, and what to do if it happens again.

---

## Table of Contents

- [Is Production Down?](#is-production-down) — Start here
- [How to Connect to the Server](#how-to-connect-to-the-server)
- [Diagnostic Commands](#diagnostic-commands)
- [Emergency Recovery Steps](#emergency-recovery-steps)
- [April 2026 Incident — Root Cause Analysis](#april-2026-incident--root-cause-analysis)
- [Known Fragile Areas](#known-fragile-areas)
- [CI/CD Pipeline Overview](#cicd-pipeline-overview)

---

## Is Production Down?

**Check in this order:**

```bash
# 1. Is the site reachable?
curl -sf https://store.furrycolombia.com/store/health
curl -sf https://store.furrycolombia.com/health

# 2. Is the container running?
ssh furrycolombia@192.168.2.71
docker ps --filter name=libra-prod

# 3. What does the container say?
docker logs libra-prod --tail 50

# 4. Is Cloudflare tunnel up?
sudo systemctl status cloudflared
```

**What the error means:**

| Symptom                             | Likely cause                                      | Fix                                                                         |
| ----------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| 502 from Cloudflare                 | Container not running or port 9090 not listening  | Restart container or rebuild                                                |
| Container exits immediately         | Startup crash in Next.js or missing env var       | Check `docker logs`, check `~/.env.prod`                                    |
| `Cannot find module 'next'`         | pnpm symlinks stripped by ZIP artifact round-trip | See [pnpm symlink issue](#issue-3-pnpm-symlinks-stripped-by-zip-artifacts)  |
| `docker COPY: not found`            | Missing `.next/static` or `public` dir            | See [empty dir issue](#issue-2-empty-directories-stripped-by-zip-artifacts) |
| Container starts but routes 404/502 | `.dockerignore` excluded build outputs            | See [dockerignore issue](#issue-1-dockerignore-excluded-next-build-output)  |
| Site up but very slow on first hit  | JIT warm-up did not complete                      | Manually warm routes (see [warm-up](#manual-jit-warm-up))                   |

---

## How to Connect to the Server

### Option 1: Direct SSH (LAN only)

Use this when you're on the same local network as the server (fast, no Cloudflare dependency):

```bash
ssh furrycolombia@192.168.2.71
# Password: see .secrets → PROD_SERVER_PASSWORD (or use the ED25519 key)
```

### Option 2: Via Cloudflare Tunnel (anywhere)

Use this from outside the LAN. Requires `cloudflared` installed locally.

```bash
# Install cloudflared if needed (macOS/Linux)
brew install cloudflared
# or: curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared

# SSH through the tunnel
ssh -o ProxyCommand='cloudflared access ssh --hostname %h' \
  -i ~/.ssh/id_ed25519 \
  furrycolombia@ssh.furrycolombia.com
```

Or add this to `~/.ssh/config` so you can just `ssh prod`:

```
Host prod
  HostName ssh.furrycolombia.com
  User furrycolombia
  IdentityFile ~/.ssh/id_ed25519
  ProxyCommand cloudflared access ssh --hostname %h
```

Then: `ssh prod`

### Option 3: GitHub Actions (automated)

CI connects using the `PROD_SERVER_SSH_KEY` secret + cloudflared. This is how `deploy-production.yml` works. No manual action needed.

### Connection Fallback

If `ssh.furrycolombia.com` is unreachable (Cloudflare tunnel down), use the direct LAN IP `192.168.2.71`. If that's also unreachable, the server may be down — check Hestia CP at `https://server.furrycolombia.com:8083`.

---

## Diagnostic Commands

Run these on the server after SSH-ing in:

```bash
# Container status
docker ps -a --filter name=libra

# Live logs
docker logs libra-prod -f

# Last 100 lines of logs
docker logs libra-prod --tail 100

# Is port 9090 actually open?
curl -sf http://localhost:9090/health
curl -sf http://localhost:9090/store/health

# Docker disk usage (build failures can be caused by full disk)
df -h
docker system df

# What's inside the running container?
docker exec libra-prod ls /app/apps/store/.next/standalone/
docker exec libra-prod ls /app/apps/store/.next/standalone/node_modules/next/

# Check if next module is real or broken symlink
docker exec libra-prod ls -la /app/apps/store/.next/standalone/node_modules/ | head -20

# PM2 health watcher
pm2 status
pm2 logs libra-watcher

# Deploy log from last CI deploy
cat /tmp/deploy-libra.log
cat /tmp/deploy-libra.done   # 0 = success, non-0 = failed

# Cloudflare tunnel
sudo systemctl status cloudflared
sudo journalctl -u cloudflared --since "30 min ago"
```

---

## Emergency Recovery Steps

### Fastest recovery: restart the existing container

If the container is stopped but the image is still there:

```bash
ssh furrycolombia@192.168.2.71
docker start libra-prod
sleep 30
curl -sf http://localhost:9090/health
```

### Rebuild container from current server code

If the image is bad or missing but CI artifacts are already rsynced:

```bash
ssh furrycolombia@192.168.2.71
cd ~/libra

# Ensure dirs exist (they might be empty after a bad sync)
for APP in store admin auth landing payments studio; do
  mkdir -p "apps/$APP/.next/static"
  mkdir -p "apps/$APP/public"
done

# Build the image (uses docker/prod/Dockerfile + pre-built .next/ dirs)
docker build -f docker/prod/Dockerfile -t libra-prod:emergency .

# Stop old container and start new one
docker rm -f libra-prod 2>/dev/null || true
docker run -d \
  --name libra-prod \
  --restart unless-stopped \
  -p 9090:80 \
  --env-file ~/.env.prod \
  libra-prod:emergency

sleep 60
curl -sf http://localhost:9090/health && echo "HEALTHY"
```

### Force a fresh deploy from GitHub

If you can't tell what state the server is in, trigger a clean deploy from CI:

```bash
# From your local machine — push an empty commit to main to re-trigger the workflow
git commit --allow-empty -m "chore: trigger emergency redeploy"
git push origin main
```

Or go to GitHub → Actions → "Deploy Production" → "Run workflow" (manual trigger).

### Rollback to previous image

Docker keeps the 2 most recent images:

```bash
ssh furrycolombia@192.168.2.71
docker images | grep libra-prod

# Find the previous image tag (not the current one)
PREV_TAG=$(docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep '^libra-prod:' | sort -r | sed -n '2p')

docker rm -f libra-prod 2>/dev/null || true
docker run -d \
  --name libra-prod \
  --restart unless-stopped \
  -p 9090:80 \
  --env-file ~/.env.prod \
  "$PREV_TAG"
```

### Manual JIT warm-up

If the container restarted cold and you need to pre-warm the routes before real traffic hits:

```bash
ssh furrycolombia@192.168.2.71
BASE="http://localhost:9090"
for URL in / /en /es /store /store/en /store/es /payments /payments/en /auth /auth/en /admin /admin/en /studio /studio/en; do
  curl -sf --max-time 30 "${BASE}${URL}" > /dev/null && echo "✓ ${URL}" || echo "✗ ${URL}"
done
```

---

## April 2026 Incident — Root Cause Analysis

Over a period of several days we deployed a new Docker-based CI/CD pipeline (replacing the old webhook-triggered server-side build). This introduced four separate bugs, each causing production to return 502 errors. All were hotfixed directly to `main`.

### The CI/CD pipeline we built

```
GitHub push to main
  → GitHub Actions: pnpm build (all 7 apps, standalone mode)
  → upload-artifact@v4 (ZIP format) → download-artifact@v4 (unzip)
  → rsync pre-built .next/ dirs to server
  → server runs deploy-production.sh: docker build + docker run
  → Cloudflare Tunnel: store.furrycolombia.com → localhost:9090
```

### Issue 1: `.dockerignore` excluded `.next/` build output

**PR**: #206  
**Symptom**: Container started but all routes returned 502. Apps had no JS to serve.  
**Root cause**: `.dockerignore` contained `**/dist` and `**/build`. Due to gitignore-style pattern matching, `**/build` matched `.next/standalone/**/.../node_modules/.cache/webpack/...build...` paths — but also incorrectly matched the entire `.next/` output in some contexts. More importantly, there was no explicit re-include for `apps/**/.next/standalone/node_modules/`.  
**Fix**: Restructured `.dockerignore` to exclude `**/.next/cache` (CI cache only) instead of `**/.next`. Added explicit re-include for `!apps/**/.next/standalone/node_modules/**`.

**Key insight**: `.dockerignore` applies rules **in order, last match wins** — unlike `.gitignore` which uses first match. Re-include rules (`!path`) must come **after** the exclusion rules they override.

### Issue 2: Empty directories stripped by ZIP artifacts

**PR**: #204, #205  
**Symptom**: `docker build` failed with `COPY failed: apps/store/.next/static: not found`.  
**Root cause**: `actions/upload-artifact@v4` uses ZIP format internally. ZIP does not preserve empty directories. Apps with no static assets (e.g., auth app) had an empty `.next/static/` after build — the ZIP artifact simply omitted it. When rsynced to the server, the directory didn't exist, so `docker COPY` failed.  
**Fix**: Before uploading artifacts, touch a placeholder file in every app's `.next/static/` and `public/` directory:

```yaml
- name: Ensure artifact directories are non-empty
  run: |
    for app in store admin auth landing payments studio; do
      mkdir -p "apps/$app/.next/static"
      touch "apps/$app/.next/static/.artifact-placeholder"
      mkdir -p "apps/$app/public"
      touch "apps/$app/public/.artifact-placeholder"
    done
```

The server-side deploy script also `mkdir -p` these dirs as a belt-and-suspenders measure.

### Issue 3: pnpm symlinks stripped by ZIP artifacts

**PR**: #212 (pending merge at time of writing)  
**Symptom**: `Error: Cannot find module 'next'` inside the Docker container.  
**Root cause**: pnpm's default `node-linker=isolated` creates `node_modules/next` as a **symlink** pointing into the pnpm store (`.pnpm/next@15.x.x/.../node_modules/next`). ZIP format does not preserve symlinks — they are silently dropped. After the ZIP round-trip (upload-artifact → download-artifact), `node_modules/next` no longer exists at all. The Docker image was built from these stripped artifacts.  
**Fix**: Add `.npmrc` to the repo root with:

```
node-linker=hoisted
```

This makes pnpm write **real directories** instead of symlinks in `node_modules/`. Hoisted layout is what npm/yarn use by default — it is fully compatible with Next.js standalone mode and survives ZIP round-trips.

**⚠️ This fix is on PR #212. Until it merges, the pipeline is still fragile for this specific scenario.**

### Issue 4: Windows NTFS `.ignored_*` files block Docker build context

**PR**: #211 (fix), #212 (extended to all `.ignored_*`)  
**Symptom**: `docker build` on Windows (developer machine / pre-push hook) failed with `open apps\admin\node_modules\.ignored_auth: The file cannot be accessed by the system`.  
**Root cause**: pnpm creates marker files like `node_modules/.ignored_api`, `.ignored_auth`, `.ignored_payments`, etc. with restricted NTFS permissions. Docker Desktop's build context sender on Windows must **stat every file** before applying `.dockerignore` exclusion rules. It can't stat these files, so it crashes before it even gets to ignore them.  
**Fix**: In `scripts/docker-health-check.sh`, before `docker build`, delete all `.ignored_*` files:

```bash
find . -name ".ignored_*" -delete 2>/dev/null || true
```

These files are pnpm-internal markers and are recreated on next `pnpm install`. Deleting them is safe.

---

## Known Fragile Areas

### ZIP artifact round-trips lose file system metadata

Any step that goes through `upload-artifact@v4` → `download-artifact@v4` loses:

- **Symlinks** (silently dropped — replaced with nothing)
- **Empty directories** (silently dropped)
- **Execute permissions** (may be reset)

Always test artifact contents with:

```bash
# After download-artifact, verify key files exist
ls -la apps/store/.next/standalone/node_modules/next/
ls apps/store/.next/static/
```

### pnpm isolated vs hoisted linker

| Setting                          | `node_modules/next`   | Survives ZIP?            |
| -------------------------------- | --------------------- | ------------------------ |
| `node-linker=isolated` (default) | Symlink to pnpm store | **No** — symlink dropped |
| `node-linker=hoisted` (.npmrc)   | Real directory        | **Yes**                  |

After PR #212 merges, the `.npmrc` in the repo root sets `node-linker=hoisted` permanently. **Do not remove it.**

### `.dockerignore` rule ordering

Rules in `.dockerignore` are evaluated **last-match-wins** (like nginx, unlike `.gitignore`). If you add a broad exclusion like `**/build` or `**/dist`, check whether it inadvertently matches paths you need, then add `!re-include` rules **after** it.

The current `.dockerignore` structure:

```
# 1. Exclude all node_modules
node_modules
apps/*/node_modules
packages/*/node_modules

# 2. Exclude build caches (NOT .next itself)
**/.next/cache
**/dist
**/build

# 3. Re-include standalone runtime deps (MUST come last)
!apps/**/.next/standalone/node_modules
!apps/**/.next/standalone/node_modules/**
```

### Cloudflare Access WebSocket timeout

The Cloudflare Access SSH proxy drops long-lived connections (~10 min). The deploy script handles this by launching itself detached (`nohup ... &`) and polling the log file via short-lived SSH reconnects. Do not change this pattern — if you replace it with a long-running SSH command you will get `client_loop: send disconnect: Broken pipe` mid-build.

### Pre-push hook Docker build timeout

The local pre-push hook (`scripts/docker-health-check.sh`) runs a full Docker build on every push that touches deploy-related files. On Windows this takes ~10 minutes. The pnpm `.ignored_*` files must be cleaned first or it will fail. This is handled automatically by the script, but if you see permission errors during the build context sender phase, run:

```bash
find . -name ".ignored_*" -delete
```

---

## CI/CD Pipeline Overview

```
                          ┌─────────────────────────┐
push to main              │   GitHub Actions          │
────────────────────────► │   deploy-production.yml   │
                          └────────────┬────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  Job: build (ubuntu-latest, 20 min)   │
                    │                                       │
                    │  1. checkout                          │
                    │  2. pnpm install                      │
                    │  3. pnpm run build (TARGET_ENV=prod)  │
                    │     → 7 Next.js standalone builds     │
                    │  4. touch placeholder files           │
                    │  5. upload-artifact (7 × .next/)      │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  Job: deploy (ubuntu-latest, 25 min)  │
                    │                                       │
                    │  1. install cloudflared               │
                    │  2. setup SSH key                     │
                    │  3. write ephemeral env to server     │
                    │  4. download-artifact (7 × .next/)    │
                    │  5. rsync .next/ dirs to server       │
                    │  6. copy deploy-production.sh         │
                    │  7. SSH: nohup deploy.sh &            │
                    │  8. poll /tmp/deploy-libra.done   │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  Server: deploy-production.sh         │
                    │                                       │
                    │  1. git pull origin main              │
                    │  2. source /tmp/.libra-build.env  │
                    │  3. docker build -f docker/prod/...   │
                    │  4. docker rm + docker run            │
                    │  5. pm2 start libra-watcher       │
                    │  6. health check (curl × 7 apps)      │
                    │  7. JIT warm-up (all routes × 3)      │
                    │  8. echo 0 > /tmp/deploy-libra.done│
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │  Cloudflare Tunnel (libra-prod)   │
                    │  store.furrycolombia.com → :9090      │
                    │  deploy.furrycolombia.com → :9091     │
                    │  ssh.furrycolombia.com → :22          │
                    └─────────────────────────────────────┘
```

### Key files

| File                                      | Purpose                                                              |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `.github/workflows/deploy-production.yml` | Full CI/CD pipeline definition                                       |
| `scripts/deploy-production.sh`            | Server-side deploy script (copied by CI)                             |
| `docker/prod/Dockerfile`                  | Production Docker image (uses pre-built .next/)                      |
| `docker/ci/Dockerfile`                    | CI/local Docker image (builds inside container)                      |
| `scripts/docker-health-check.sh`          | Pre-push hook — builds + health-checks Docker image                  |
| `docker/compose.yml` (`healthcheck`)      | Container liveness — `GET /health`, `restart: unless-stopped`        |
| `.npmrc`                                  | `node-linker=hoisted` — required for pnpm to survive ZIP round-trips |
| `.dockerignore`                           | Must re-include `!apps/**/.next/standalone/node_modules/**`          |

### Where secrets live

| Secret                    | Location                                           | Used by                                        |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Supabase anon key         | GitHub secret + `.env.prod` on server              | Build (baked into NEXT_PUBLIC) + runtime       |
| Supabase service role key | GitHub secret → written to `/tmp/.libra-build.env` | Server runtime only (injected at `docker run`) |
| Telegram bot token        | GitHub secret + `.secrets` locally                 | Deploy script (Telegram notifications)         |
| Prod SSH key              | GitHub secret `PROD_SERVER_SSH_KEY`                | CI → server SSH                                |
| `.env.prod` on server     | `~/.env.prod` (chmod 600, outside repo)            | `docker run --env-file`                        |

---

## Related Docs

- [Infrastructure & Deployment Guide](./infrastructure.md) — Full server setup, Cloudflare tunnel, fresh install runbook
- [Environment System](./environment.md) — How `.env.*` files and secrets work
- `.claude/rules/supabase-wipe.md` — How to wipe and re-migrate Supabase
