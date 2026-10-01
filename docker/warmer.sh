#!/bin/sh
# Warm-up loop — hits every Next.js app to prevent cold starts on the e2-micro.
# Runs as a supervisord program inside the prod container.
# Fires immediately on startup (after apps are ready), then every 12 minutes.

set -eu

INTERVAL=720  # 12 minutes

# port:path pairs — one representative route per app
APPS="
5000:/auth/en
5001:/store/en
5002:/admin/en
5004:/en
5005:/payments/en
5006:/studio/en
"

log() { printf '[WARMER] %s %s\n' "$(date -u '+%H:%M:%S')" "$*"; }

# Wait until every app's TCP port accepts connections
log "Waiting for all apps to be ready..."
for entry in $APPS; do
  port="${entry%%:*}"
  until nc -z 127.0.0.1 "$port" 2>/dev/null; do sleep 2; done
  log "  port ${port} ready"
done
log "All apps ready — starting warm-up loop (every ${INTERVAL}s)."

warm() {
  for entry in $APPS; do
    port="${entry%%:*}"
    path="${entry#*:}"
    url="http://127.0.0.1:${port}${path}"
    status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo "ERR")
    log "  :${port}${path} → HTTP ${status}"
  done
}

while true; do
  log "--- warm-up start ---"
  warm
  log "--- warm-up done. next in ${INTERVAL}s ---"
  sleep "$INTERVAL"
done
