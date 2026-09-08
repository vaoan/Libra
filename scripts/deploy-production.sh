#!/bin/bash
set -euo pipefail
set +x  # Never echo commands — prevents secrets leaking into CI log streams

# =============================================================================
# Production Deployment Script for hestia.local
# Runs ON the server via SSH from GitHub Actions.
#
# CI builds all 6 apps, rsyncs .next/ dirs to this server, then runs this
# script. This script rebuilds the Docker image from those pre-built artifacts
# and hot-swaps the running container.
# =============================================================================

# ─── Cloudflare Access SSH disconnect guard ───────────────────────────────────
# Rebuilding the Docker image takes 1-2 minutes. The Cloudflare Access WebSocket
# proxy drops idle TCP connections before it finishes, causing
# "client_loop: send disconnect: Broken pipe" in CI.
#
# Fix: on first invocation, re-launch ourselves detached from the SSH session
# via nohup, then tail the log back through the same connection so CI output
# keeps flowing. Even if SSH drops after this, the build continues on-server.
# ─────────────────────────────────────────────────────────────────────────────
if [ -z "${DEPLOY_DETACHED:-}" ]; then
  DEPLOY_LOG=/tmp/deploy-libra.log
  DEPLOY_DONE=/tmp/deploy-libra.done
  DEPLOY_PIDFILE=/tmp/deploy-libra.pid

  # Kill any previous deploy still running on this server.
  # GHA job timeouts leave detached nohup processes running; on the e2-micro
  # that starves every CPU cycle, making the new deploy hang immediately.
  if [ -f "$DEPLOY_PIDFILE" ]; then
    PREV_PID=$(cat "$DEPLOY_PIDFILE" 2>/dev/null || true)
    if [ -n "$PREV_PID" ] && kill -0 "$PREV_PID" 2>/dev/null; then
      echo "[DEPLOY] Stopping previous deploy (PID $PREV_PID) to free CPU..."
      pkill -KILL -P "$PREV_PID" 2>/dev/null || true
      kill -KILL "$PREV_PID" 2>/dev/null || true
      sleep 2
    fi
    rm -f "$DEPLOY_PIDFILE"
  fi

  rm -f "$DEPLOY_LOG" "$DEPLOY_DONE"

  DEPLOY_DETACHED=1 nohup bash "$0" "$@" >"$DEPLOY_LOG" 2>&1 &
  BG_PID=$!
  echo "$BG_PID" > "$DEPLOY_PIDFILE"

  # Stream log back — keeps the SSH/WebSocket alive AND surfaces build output.
  # GNU tail exits automatically when the watched PID exits (Linux coreutils).
  if tail -f "$DEPLOY_LOG" --pid="$BG_PID" 2>/dev/null; then
    :
  else
    # Fallback for non-GNU tail: background-tail + manual wait
    tail -f "$DEPLOY_LOG" &
    TAIL_PID=$!
    while kill -0 "$BG_PID" 2>/dev/null; do sleep 5; done
    sleep 2
    kill "$TAIL_PID" 2>/dev/null || true
  fi

  DEPLOY_EXIT=$(cat "$DEPLOY_DONE" 2>/dev/null || echo 1)
  exit "$DEPLOY_EXIT"
fi

# ─── Kill any lingering deploy from a previous timed-out CI job ──────────────
# CI passes DEPLOY_DETACHED=1 directly, bypassing the wrapper block above.
# GHA job timeouts leave nohup'd deploy processes running on the e2-micro;
# those zombies consume all CPU and make the new deploy hang from the start.
_DEPLOY_PIDFILE=/tmp/deploy-libra.pid
if [ -f "$_DEPLOY_PIDFILE" ]; then
  _PREV_PID=$(cat "$_DEPLOY_PIDFILE" 2>/dev/null || true)
  if [ -n "$_PREV_PID" ] && [ "$_PREV_PID" != "$$" ] && kill -0 "$_PREV_PID" 2>/dev/null; then
    echo "[DEPLOY] Killing previous deploy (PID $_PREV_PID) — freeing CPU on e2-micro..."
    pkill -KILL -P "$_PREV_PID" 2>/dev/null || true
    kill -KILL "$_PREV_PID" 2>/dev/null || true
    sleep 2
  fi
fi
echo "$$" > "$_DEPLOY_PIDFILE"
# ─────────────────────────────────────────────────────────────────────────────

# ─── Telegram deploy notifications ───────────────────────────────────────────
# Extract Telegram vars early from the env file so we can notify before the full
# env is sourced (which happens later, just before the build step).
_tg_env="${ENV_FILE:-/tmp/.libra-build.env}"
if [ -f "$_tg_env" ]; then
  TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-$(grep '^TELEGRAM_BOT_TOKEN=' "$_tg_env" | cut -d= -f2- 2>/dev/null || true)}"
  TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-$(grep '^TELEGRAM_CHAT_ID=' "$_tg_env" | cut -d= -f2- 2>/dev/null || true)}"
  TELEGRAM_THREAD_ID="${TELEGRAM_THREAD_ID:-$(grep '^TELEGRAM_THREAD_ID=' "$_tg_env" | cut -d= -f2- 2>/dev/null || true)}"
fi
# Sanitize hostname once: only RFC-1123-valid chars so it can't break the Python
# string literal or inject HTML into Telegram messages.
_safe_hostname=$(printf '%s' "$HOSTNAME" | tr -dc '[:alnum:]._-')
TELEGRAM_SOURCE="${_safe_hostname}"

_telegram_send() {
  local thread_id="$1" text="$2"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || return 0
  [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  local payload
  payload=$(python3 -c "
import json, sys
d = {'chat_id': sys.argv[1], 'text': sys.argv[2] + '\n\n\U0001F4CD ' + sys.argv[4], 'parse_mode': 'HTML'}
if sys.argv[3]:
    d['message_thread_id'] = int(sys.argv[3])
print(json.dumps(d))" "$TELEGRAM_CHAT_ID" "$text" "$thread_id" "$TELEGRAM_SOURCE") || return 0
  curl -sf --max-time 10 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H 'Content-Type: application/json' \
    -d "$payload" >/dev/null 2>&1 || true
}

# Regular channel — deploy steps, recoveries, info
notify_telegram() {
  _telegram_send "${TELEGRAM_THREAD_ID:-}" "$1"
}

# Critical channel — DOWN alerts, resource warnings, failures
notify_telegram_critical() {
  _telegram_send "${TELEGRAM_CRITICAL_THREAD_ID:-${TELEGRAM_THREAD_ID:-}}" "$1"
}

# Escapes &, <, > for Telegram HTML parse_mode
_html_escape() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g'
}

# Returns human-readable duration from a start timestamp: "2m 14s" or "38s"
_dur() {
  local secs=$(( $(date +%s) - $1 ))
  if [ "$secs" -ge 60 ]; then
    printf '%dm %ds' $(( secs / 60 )) $(( secs % 60 ))
  else
    printf '%ds' "$secs"
  fi
}

# Write exit code + send deploy result notification
DEPLOY_START=$(date +%s)
_on_exit() {
  local code=$?
  echo $code >/tmp/deploy-libra.done
  rm -f /tmp/deploy-libra.pid 2>/dev/null || true
  # Ensure all ephemeral secrets files are removed on any exit path (early
  # failure, success, or signal) — don't rely solely on the CI cleanup step.
  rm -f "${ENV_FILE:-/tmp/.libra-build.env}" 2>/dev/null || true
  rm -f "${_CONTAINER_ENV:-}" 2>/dev/null || true
  local dur
  dur="$(_dur $DEPLOY_START)"
  local commit="${DEPLOY_COMMIT:-unknown}"
  local commit_html
  commit_html=$(_html_escape "$commit")
  if [ "$code" -eq 0 ]; then
    notify_telegram "$(printf '✅ <b>Deploy complete</b>  •  <code>%s</code>\nBranch: <code>%s</code>\nCommit: <code>%s</code>\nTotal: %s' \
      "$_safe_hostname" "$BRANCH" "$commit_html" "$dur")"
  else
    notify_telegram_critical "$(printf '❌ <b>Deploy FAILED</b> (exit %s)  •  <code>%s</code>\nBranch: <code>%s</code>\nCommit: <code>%s</code>\nTotal: %s' \
      "$code" "$_safe_hostname" "$BRANCH" "$commit_html" "$dur")"
  fi
}
trap _on_exit EXIT
# ─────────────────────────────────────────────────────────────────────────────

DEPLOY_DIR="${DEPLOY_DIR:-/home/furrycolombia/libra}"
REPO_URL="${REPO_URL:-}"
BRANCH="${BRANCH:-main}"
CONTAINER_NAME="${SITE_PROD_CONTAINER_NAME:-libra-prod}"
HOST_PORT="${HOST_PORT:-9090}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Activate Node 22 via direct PATH — avoids sourcing the full 3000-line nvm.sh
# which takes 5+ minutes on the e2-micro due to CPU/RAM constraints.
echo "[DEPLOY] Script started at $(date)"
export NVM_DIR="$HOME/.nvm"
echo "[DEPLOY] Activating Node 22 (direct path)..."
NODE_22_BIN=$(ls -d "$NVM_DIR/versions/node"/v22.*/bin 2>/dev/null | sort -V | tail -1)
if [ -z "$NODE_22_BIN" ] || [ ! -f "$NODE_22_BIN/node" ]; then
  err "Node 22 not found in $NVM_DIR/versions/node — run: nvm install 22"
fi
export PATH="$NODE_22_BIN:$PATH"

log "Node $(node --version)"
notify_telegram "$(printf '🚀 <b>Deploy started</b>  •  <code>%s</code>\nBranch: <code>%s</code>' "$_safe_hostname" "$BRANCH")"

# =============================================================================
# Sync repository (works whether DEPLOY_DIR is absent, non-empty, or already a repo)
# =============================================================================
_STEP_START=$(date +%s)
log "Syncing repository..."
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"
if [ ! -d ".git" ]; then
  git init -q
  git remote add origin "$REPO_URL"
else
  git remote set-url origin "$REPO_URL" 2>/dev/null || true
fi
timeout 120 git fetch origin "$BRANCH" --depth 1 || err "git fetch timed out or failed after 120s"
git checkout -B "$BRANCH" FETCH_HEAD
git clean -fd

cd "$DEPLOY_DIR"
DEPLOY_COMMIT=$(git log --format="%h %s" -1 2>/dev/null || true)
DEPLOY_COMMIT_HTML=$(_html_escape "$DEPLOY_COMMIT")
log "Checked out $DEPLOY_COMMIT"
notify_telegram "$(printf '📥 <b>Code pulled</b> (%s)\nCommit: <code>%s</code>' "$(_dur $_STEP_START)" "$DEPLOY_COMMIT_HTML")"

# Remove .secrets — builds happen in CI, not on this server.
rm -f "$DEPLOY_DIR/.secrets"

# =============================================================================
# Load runtime env vars (written by CI, deleted after deploy)
# Build artifacts are pre-built in CI and rsync'd here before this script runs.
# We source the env file so the container and watcher inherit runtime-only
# secrets (SUPABASE_SERVICE_ROLE_KEY, Telegram tokens, etc.).
# =============================================================================
ENV_FILE="${ENV_FILE:-/tmp/.libra-build.env}"
if [ -f "$ENV_FILE" ]; then
  log "Loading runtime env from $ENV_FILE"
  while IFS= read -r _line || [ -n "$_line" ]; do
    [[ -z "$_line" || "$_line" == \#* ]] && continue
    _key="${_line%%=*}"
    _val="${_line#*=}"
    [[ "$_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "$_key=$_val"
  done < "$ENV_FILE"
else
  warn "No env file found at $ENV_FILE — container may lack runtime secrets"
fi

# =============================================================================
# Obtain the Docker image.
# GCP: CI builds in GitHub Actions (7 GB RAM) and pushes to GHCR; we pull.
# Local/fallback: build from the CI-rsynced pre-built artifacts on this server.
# =============================================================================
_STEP_START=$(date +%s)
if [ -n "${DOCKER_IMAGE:-}" ]; then
  log "Pulling pre-built Docker image: $DOCKER_IMAGE"
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USERNAME:-github}" --password-stdin \
      || warn "GHCR login failed — attempting pull unauthenticated"
  fi
  if [ -n "${DOCKER_IMAGE_LATEST:-}" ]; then
    log "Pre-pulling :latest to warm layer cache..."
    docker pull "$DOCKER_IMAGE_LATEST" 2>/dev/null || true
  fi
  docker pull "$DOCKER_IMAGE" || err "Docker image pull failed"
  IMAGE_TAG="$DOCKER_IMAGE"
  # Keep local :latest in sync so the next deploy's cache-warming pre-pull
  # finds these layers already present and skips re-downloading them.
  if [ -n "${DOCKER_IMAGE_LATEST:-}" ]; then
    docker tag "$DOCKER_IMAGE" "$DOCKER_IMAGE_LATEST" 2>/dev/null || true
  fi
  docker logout ghcr.io 2>/dev/null || true
  # Scrub registry credentials from this process's environment; they must not
  # be inherited by PM2-managed watcher/boot-notifier child processes.
  unset GHCR_TOKEN GHCR_USERNAME
  log "Image pulled: $IMAGE_TAG (took $(_dur $_STEP_START))"
  notify_telegram "$(printf '🐳 <b>Image pulled</b> (%s)\n<code>%s</code>' "$(_dur $_STEP_START)" "$IMAGE_TAG")"
else
  log "Building Docker image from pre-built artifacts..."
  IMAGE_TAG="libra-prod:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

  # Ensure every path the Dockerfile COPYs exists (artifacts may omit empty dirs).
  for APP in store auth admin landing payments studio; do
    mkdir -p "$DEPLOY_DIR/apps/$APP/.next/static"
    mkdir -p "$DEPLOY_DIR/apps/$APP/public"
  done

  docker build \
    -f "$DEPLOY_DIR/docker/prod/Dockerfile" \
    -t "$IMAGE_TAG" \
    "$DEPLOY_DIR" \
    || err "Docker image build failed"

  log "Image built: $IMAGE_TAG (took $(_dur $_STEP_START))"
  notify_telegram "$(printf '🐳 <b>Image built</b> (%s)\n<code>%s</code>' "$(_dur $_STEP_START)" "$IMAGE_TAG")"
fi

# =============================================================================
# Hot-swap the container (traffic resumes within seconds of docker run)
# =============================================================================
log "Restarting container '$CONTAINER_NAME'..."
_STEP_START=$(date +%s)

# Create boot progress message; container edits it live via TELEGRAM_BOOT_MSG_ID
_BOOT_MSG_ID=""
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  _boot_now=$(python3 -c "from datetime import datetime,timezone; print(datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC'))" 2>/dev/null || true)
  _BOOT_RESP=$(python3 -c "
import json, os, sys, urllib.request
hostname  = sys.argv[1]
boot_now  = sys.argv[2]
chat_id   = os.environ.get('TELEGRAM_CHAT_ID', '')
thread    = os.environ.get('TELEGRAM_THREAD_ID', '')
bot_token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
if not (chat_id and bot_token):
    raise SystemExit(0)
text = (
  '\U0001f504 <b>Container Boot</b>  •  <code>' + hostname + '</code>  •  ' + boot_now + '\n\n'
  'Progress: 0/6  ░░░░░░░░░░░░░░░░  0%\n\n'
  '  ⏳ auth         ...\n'
  '  ⏳ store        ...\n'
  '  ⏳ admin        ...\n'
  '  ⏳ landing      ...\n'
  '  ⏳ payments     ...\n'
  '  ⏳ studio       ...\n'
  '  ⏳ nginx        waiting for all apps...\n\n'
  'Elapsed: 0s'
)
payload = {'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}
if thread:
    payload['message_thread_id'] = int(thread)
data = json.dumps(payload).encode()
req = urllib.request.Request(
    'https://api.telegram.org/bot' + bot_token + '/sendMessage',
    data=data, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        resp = json.loads(r.read())
        if resp.get('ok'):
            print(resp['result']['message_id'])
except Exception:
    pass
" "$_safe_hostname" "${_boot_now:-}" 2>/dev/null || true)
  _BOOT_MSG_ID="${_BOOT_RESP:-}"
fi

# Write runtime env to a temp file so secrets don't appear in /proc/PID/cmdline
_CONTAINER_ENV=$(mktemp /tmp/.libra-run.XXXXXX)
chmod 600 "$_CONTAINER_ENV"
{
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n'    "${SUPABASE_SERVICE_ROLE_KEY:-}"
  printf 'TELEGRAM_BOT_TOKEN=%s\n'           "${TELEGRAM_BOT_TOKEN:-}"
  printf 'TELEGRAM_CHAT_ID=%s\n'             "${TELEGRAM_CHAT_ID:-}"
  printf 'TELEGRAM_THREAD_ID=%s\n'           "${TELEGRAM_THREAD_ID:-}"
  printf 'TELEGRAM_CRITICAL_THREAD_ID=%s\n' "${TELEGRAM_CRITICAL_THREAD_ID:-}"
  printf 'TELEGRAM_BOOT_MSG_ID=%s\n'         "${_BOOT_MSG_ID:-}"
  printf 'SERVER_HOSTNAME=%s\n'              "$_safe_hostname"
} > "$_CONTAINER_ENV"

docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${HOST_PORT}:8080" \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit=1024 \
  --oom-score-adj=800 \
  --env-file "$_CONTAINER_ENV" \
  "$IMAGE_TAG" \
  || { rm -f "$_CONTAINER_ENV"; err "Docker container start failed"; }
rm -f "$_CONTAINER_ENV"

log "Container started (took $(_dur $_STEP_START))"

# Keep only the 2 most recent libra-prod images by creation time and
# prune everything older. Then sweep dangling layers + stopped containers.
#
# Bug fixed 2026-05-18: `.CreatedAt` renders as "YYYY-MM-DD HH:MM:SS ZZZ TZ"
# — multi-word — so awk's default whitespace splitter put a time string in
# $2 instead of the image tag. `docker rmi 17:30:00` silently failed under
# `|| true`, so NO images ever got pruned and the VM disk slowly filled.
# Setting -F'\t' splits on the tab we emit in the format string, so $2 is
# now the Repository:Tag we actually want to remove.
docker images --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' \
  | grep 'libra-prod' \
  | sort -rk1 \
  | awk -F'\t' 'NR>2{print $2}' \
  | xargs -r docker rmi 2>/dev/null || true

# Sweep dangling layers freed by the rmi above, plus any stopped containers
# left behind by past `docker rm -f`. Both are no-ops when there's nothing
# to clean.
docker image prune -f >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true

# Clean up env file — secrets must not persist on disk
rm -f "$ENV_FILE"

# =============================================================================
# STALE as of the watcher removal [GH-000]: docker/watcher.mjs was deleted
# (it duplicated the container healthcheck and cost 50 MB inside the image).
# This block still references that file and will fail `pm2 start` on any
# deploy run before Task C6 lands. C6 replaces this whole script and deploy
# pipeline; that rewrite is expected to remove this block rather than
# restore the file.
# =============================================================================
# Start host-side health watcher
# WATCHER_NGINX_PORT makes it check apps via Docker nginx (the real traffic path:
#   Cloudflare → Hestia nginx → Docker nginx → apps)
# rather than internal ports, so alerts reflect what users actually experience.
# =============================================================================
log "Starting health watcher..."
pm2 delete libra-watcher 2>/dev/null || true
WATCHER_NGINX_PORT=$HOST_PORT SERVER_HOSTNAME=$_safe_hostname pm2 start "$DEPLOY_DIR/docker/watcher.mjs" \
  --name libra-watcher

pm2 delete libra-boot-notifier 2>/dev/null || true
WATCHER_NGINX_PORT=$HOST_PORT SERVER_HOSTNAME=$_safe_hostname pm2 start "$DEPLOY_DIR/scripts/server/boot-notifier.mjs" \
  --name libra-boot-notifier || warn "boot-notifier failed to start (non-critical)"

# Persist both processes across reboots
pm2 save

# =============================================================================
# Health check via Docker nginx
# After PM2 starts, V8 is cold — the first real user request would pay a
# compilation penalty on every route. We hit each app's key localized pages
# 3 times so V8 JIT-compiles the hot paths before real traffic arrives.
# =============================================================================
APPS=(
  "store:/store/health"
  "auth:/auth/health"
  "admin:/admin/health"
  "landing:/en"
  "payments:/payments/health"
  "studio:/studio/health"
)

log "Waiting for container health endpoints..."
_POLL_START=$(date +%s)
while [ $(( $(date +%s) - _POLL_START )) -lt 120 ]; do
  _HEALTHY_COUNT=0
  for APP_ENTRY in "${APPS[@]}"; do
    APP_HEALTH="${APP_ENTRY#*:}"
    curl -sf --max-time 5 "http://localhost:${HOST_PORT}${APP_HEALTH}" >/dev/null 2>&1 && \
      _HEALTHY_COUNT=$(( _HEALTHY_COUNT + 1 ))
  done
  [ "$_HEALTHY_COUNT" -eq "${#APPS[@]}" ] && break
  sleep 5
done

# --- phase 1: liveness check ---
FAILED=0
HEALTHY=0
for APP_ENTRY in "${APPS[@]}"; do
  APP_NAME="${APP_ENTRY%%:*}"
  APP_HEALTH_PATH="${APP_ENTRY#*:}"

  if curl -sf --max-time 15 "http://localhost:${HOST_PORT}${APP_HEALTH_PATH}" > /dev/null 2>&1; then
    log "  ✓ $APP_NAME — healthy"
    HEALTHY=$(( HEALTHY + 1 ))
  else
    warn "  ✗ $APP_NAME — not responding"
    FAILED=$((FAILED + 1))
  fi
done

if [ "$FAILED" -gt 0 ]; then
  notify_telegram_critical "$(printf '⚠️ <b>Health check: %d/%d apps not responding</b>  •  <code>%s</code>\nDeploy complete with warnings.\n<i>Check: docker logs %s</i>' "$FAILED" "${#APPS[@]}" "$_safe_hostname" "$CONTAINER_NAME")"
  warn "$FAILED app(s) not responding. Skipping warm-up."
  log "Deployment complete (with warnings)."
  exit 0
fi

notify_telegram "$(printf '🏥 <b>All %d apps healthy</b>' "${#APPS[@]}")"

# Signal CI now — all correctness checks passed. Warm-up is a best-effort
# post-deploy optimisation and must not block the CI wait loop.
log "Deployment complete — signalling CI..."
echo 0 > /tmp/deploy-libra.done
docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true

# --- phase 2: JIT warm-up ---
# Sequential per-app: avoids a thundering herd on the single-vCPU VM.
# Health checks already confirmed all apps are up; one hit per route is
# enough for V8 to JIT-compile the hot paths before real traffic arrives.
log "Warming up V8 JIT (1 pass × key routes, sequential)..."
_STEP_START=$(date +%s)
_WARM_FAIL_LOG=$(mktemp)
BASE="http://localhost:${HOST_PORT}"

warm_route() {
  if ! curl -sf --max-time 10 "${BASE}$1" > /dev/null 2>&1; then
    echo "$1" >> "$_WARM_FAIL_LOG"
  fi
}

for _r in / /en /es \
          /store /store/en /store/es \
          /payments /payments/en /payments/es \
          /auth /auth/en \
          /admin /admin/en \
          /studio /studio/en; do
  warm_route "$_r"
done

_warm_dur=$(_dur $_STEP_START)
_failed_urls=$(cat "$_WARM_FAIL_LOG" 2>/dev/null || true)
rm -f "$_WARM_FAIL_LOG"

if [ -n "$_failed_urls" ]; then
  _fail_count=$(echo "$_failed_urls" | wc -l | tr -d ' ')
  _fail_list=$(echo "$_failed_urls" | tr '\n' ' ' | sed 's/ $//')
  notify_telegram "$(printf '⚠️ <b>JIT warm-up incomplete</b> (%s)\n%s route(s) slow/unreachable:\n<code>%s</code>' "$_warm_dur" "$_fail_count" "$_fail_list")"
  warn "Warm-up incomplete — $_fail_count route(s) unreachable: $_fail_list"
else
  log "Warm-up complete in $_warm_dur — all routes pre-compiled."
  notify_telegram "$(printf '🔥 <b>JIT warm-up complete</b> (%s)\nAll routes pre-compiled.' "$_warm_dur")"
fi
