#!/usr/bin/env bash

set -euo pipefail

BASE_REF="${1:-origin/develop}"
HEAD_REF="${2:-HEAD}"

if ! git rev-parse --verify "$BASE_REF" > /dev/null 2>&1; then
  BASE_REF="@{upstream}"
fi

BASE_SHA="$(git merge-base "$HEAD_REF" "$BASE_REF" 2>/dev/null || true)"

if [ -n "$BASE_SHA" ]; then
  CHANGED_FILES="$(git diff --name-only "${BASE_SHA}..${HEAD_REF}" || true)"
else
  CHANGED_FILES="$(git diff --name-only "${BASE_REF}..${HEAD_REF}" 2>/dev/null || true)"
fi

is_changed() {
  local pattern="$1"
  echo "$CHANGED_FILES" | grep -Eq "$pattern"
}

DEPLOY_CHANGED=false
STORE_CHANGED=false
STUDIO_CHANGED=false
LANDING_CHANGED=false
PAYMENTS_CHANGED=false
ADMIN_CHANGED=false
AUTH_CHANGED=false
PACKAGES_CHANGED=false
TOOLING_CHANGED=false
CODE_CHANGED=false

is_changed '^(Dockerfile|docker/|\.dockerignore)' && DEPLOY_CHANGED=true
is_changed '^apps/store/' && STORE_CHANGED=true
is_changed '^apps/studio/' && STUDIO_CHANGED=true
is_changed '^apps/landing/' && LANDING_CHANGED=true
is_changed '^apps/payments/' && PAYMENTS_CHANGED=true
is_changed '^apps/admin/' && ADMIN_CHANGED=true
is_changed '^apps/auth/' && AUTH_CHANGED=true
is_changed '^packages/' && PACKAGES_CHANGED=true
is_changed '^(package\.json|pnpm-lock\.yaml|tsconfig.*\.json|eslint\.config\..*|prettier\.config\..*)' && TOOLING_CHANGED=true
is_changed '\.(ts|tsx|js|jsx)$' && CODE_CHANGED=true

DOCS_ONLY=true
if [ "$DEPLOY_CHANGED" = true ] || [ "$STORE_CHANGED" = true ] || [ "$STUDIO_CHANGED" = true ] || \
   [ "$LANDING_CHANGED" = true ] || \
   [ "$PAYMENTS_CHANGED" = true ] || [ "$ADMIN_CHANGED" = true ] || \
   [ "$AUTH_CHANGED" = true ] || \
   [ "$PACKAGES_CHANGED" = true ] || [ "$TOOLING_CHANGED" = true ]; then
  DOCS_ONLY=false
fi

echo "DEPLOY_CHANGED=$DEPLOY_CHANGED"
echo "STORE_CHANGED=$STORE_CHANGED"
echo "STUDIO_CHANGED=$STUDIO_CHANGED"
echo "LANDING_CHANGED=$LANDING_CHANGED"
echo "PAYMENTS_CHANGED=$PAYMENTS_CHANGED"
echo "ADMIN_CHANGED=$ADMIN_CHANGED"
echo "AUTH_CHANGED=$AUTH_CHANGED"
echo "PACKAGES_CHANGED=$PACKAGES_CHANGED"
echo "TOOLING_CHANGED=$TOOLING_CHANGED"
echo "CODE_CHANGED=$CODE_CHANGED"
echo "DOCS_ONLY=$DOCS_ONLY"
