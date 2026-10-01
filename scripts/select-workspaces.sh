#!/usr/bin/env bash

set -euo pipefail

STORE_CHANGED="${1:-false}"
LANDING_CHANGED="${2:-false}"
PAYMENTS_CHANGED="${3:-false}"
ADMIN_CHANGED="${4:-false}"
AUTH_CHANGED="${5:-false}"
PACKAGES_CHANGED="${6:-false}"
TOOLING_CHANGED="${7:-false}"
STUDIO_CHANGED="${8:-false}"

RUN_ALL="false"
if [ "$PACKAGES_CHANGED" = "true" ] || [ "$TOOLING_CHANGED" = "true" ]; then
  RUN_ALL="true"
fi

APPS=""
LINT_TARGETS=""

append_app() {
  APP="$1"
  SRC_PATH="$2"
  APP_DIR="${3:-apps/${APP}}"

  if [ -d "${APP_DIR}" ]; then
    APPS="${APPS} ${APP}"
  fi

  if [ -d "${SRC_PATH}" ]; then
    LINT_TARGETS="${LINT_TARGETS} ${SRC_PATH}"
  fi
}

if [ "$RUN_ALL" = "true" ]; then
  append_app "store" "apps/store/src"
  append_app "studio" "apps/studio/src"
  append_app "landing" "apps/landing/src"
  append_app "payments" "apps/payments/src"
  append_app "admin" "apps/admin/src"
  append_app "auth-app" "apps/auth/src" "apps/auth"
else
  [ "$STORE_CHANGED" = "true" ] && append_app "store" "apps/store/src"
  [ "$STUDIO_CHANGED" = "true" ] && append_app "studio" "apps/studio/src"
  [ "$LANDING_CHANGED" = "true" ] && append_app "landing" "apps/landing/src"
  [ "$PAYMENTS_CHANGED" = "true" ] && append_app "payments" "apps/payments/src"
  [ "$ADMIN_CHANGED" = "true" ] && append_app "admin" "apps/admin/src"
  [ "$AUTH_CHANGED" = "true" ] && append_app "auth-app" "apps/auth/src" "apps/auth"
fi

APPS="$(echo "$APPS" | xargs)"
LINT_TARGETS="$(echo "$LINT_TARGETS" | xargs)"

echo "RUN_ALL=$RUN_ALL"
echo "APPS=$APPS"
echo "LINT_TARGETS=$LINT_TARGETS"
