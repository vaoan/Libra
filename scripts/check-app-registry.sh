#!/usr/bin/env bash
# ---------------------------------------------------------
# CI Guard: Fail on Unregistered Apps
#
# Scans apps/* for directories with a package.json and
# verifies each one is registered in every required config
# file. Exits 1 if any app is missing from any config.
# ---------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Config files to check (relative to repo root)
SELECT_WORKSPACES="scripts/select-workspaces.sh"
CI_WORKFLOW=".github/workflows/ci.yml"
ROOT_PACKAGE_JSON="package.json"
DOCKERFILE="docker/ci/Dockerfile"
NGINX_CONF="docker/prod/nginx.conf"
APP_LINKS="config/app-links.json"

# Node reads the registry so this works in Git Bash on Windows too (no jq).
registry_field() {
  # $1 = app name, $2 = field
  node -e '
    const [app, field] = process.argv.slice(1);
    const registry = require(require("path").resolve("config/app-links.json"));
    const entry = registry[app];
    if (!entry) process.exit(1);
    process.stdout.write(String(entry[field]));
  ' "$1" "$2" 2>/dev/null
}

errors=()
cd "$REPO_ROOT"

for app_dir in "$REPO_ROOT"/apps/*/; do
  # Skip dirs without package.json (leftover/empty dirs)
  [ -f "$app_dir/package.json" ] || continue

  app_name="$(basename "$app_dir")"

  # --- 1. scripts/select-workspaces.sh ---
  if ! grep -q "apps/${app_name}" "$REPO_ROOT/$SELECT_WORKSPACES" 2>/dev/null; then
    errors+=("$app_name  missing from  $SELECT_WORKSPACES")
  fi

  # --- 2. .github/workflows/ci.yml (change-detection filters) ---
  if ! grep -q "apps/${app_name}/" "$REPO_ROOT/$CI_WORKFLOW" 2>/dev/null; then
    errors+=("$app_name  missing from  $CI_WORKFLOW")
  fi

  # --- 3. package.json root lint target ---
  if ! grep -q "apps/${app_name}/src" "$REPO_ROOT/$ROOT_PACKAGE_JSON" 2>/dev/null; then
    errors+=("$app_name  missing from  $ROOT_PACKAGE_JSON (lint target)")
  fi

  # --- 4. Dockerfile ---
  if ! grep -q "apps/${app_name}" "$REPO_ROOT/$DOCKERFILE" 2>/dev/null; then
    errors+=("$app_name  missing from  $DOCKERFILE")
  fi

  # --- 5. docker/prod/nginx.conf (upstream or location block) ---
  if ! grep -q "${app_name}" "$REPO_ROOT/$NGINX_CONF" 2>/dev/null; then
    errors+=("$app_name  missing from  $NGINX_CONF")
  fi

  # --- 6. config/app-links.json (the routing registry) ---
  app_path="$(registry_field "$app_name" path || true)"
  app_port="$(registry_field "$app_name" port || true)"
  if [ -z "$app_path" ]; then
    errors+=("$app_name  missing from  $APP_LINKS")
  else
    # --- 7. nginx.conf routes the registered path to the registered port ---
    if ! grep -qE "location ${app_path} \{" "$NGINX_CONF"; then
      errors+=("$app_name  missing from  $NGINX_CONF (no 'location ${app_path} {' for the registry path)")
    fi
    if ! grep -qE "server 127\.0\.0\.1:${app_port};" "$NGINX_CONF"; then
      errors+=("$app_name  missing from  $NGINX_CONF (no upstream on :${app_port}, the registry port)")
    fi
  fi
done

# --- Report ---
if [ ${#errors[@]} -eq 0 ]; then
  echo "All apps in apps/* are fully registered."
  exit 0
fi

echo ""
echo "Unregistered app(s) detected!"
echo ""
printf "  %-20s  %-10s  %s\n" "APP" "" "MISSING FROM"
printf "  %-20s  %-10s  %s\n" "---" "" "------------"
for err in "${errors[@]}"; do
  app_part="${err%%  missing from  *}"
  file_part="${err##*  missing from  }"
  printf "  %-20s  %-10s  %s\n" "$app_part" "" "$file_part"
done
echo ""
echo "Every app in apps/ must be registered in ALL of these files:"
echo "  1. $SELECT_WORKSPACES"
echo "  2. $CI_WORKFLOW"
echo "  3. $ROOT_PACKAGE_JSON (lint target)"
echo "  4. $DOCKERFILE"
echo "  5. $NGINX_CONF"
echo "  6. $APP_LINKS (path + port)"
echo "  7. $NGINX_CONF must route that path to that port"
echo ""
echo "Either register the app or remove its directory."
exit 1
