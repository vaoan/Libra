/**
 * Single source of truth for the `NEXT_PUBLIC_*` build-arg keys baked into
 * the Docker image at build time (see `docker/ci/Dockerfile` ARG/ENV
 * declarations, which must declare the same keys).
 *
 * The array holds exactly the apps this monorepo currently ships plus their
 * shared build flags — one `NEXT_PUBLIC_<APP>_URL` per live app. It does not
 * carry an entry for playground: that app was deleted, so
 * `NEXT_PUBLIC_PLAYGROUND_URL` was removed from this list, from
 * `docker/ci/Dockerfile`'s ARG declarations, and from `ci.yml`'s build-args
 * block together — the three stay in lockstep by the same mechanism as any
 * other change here (see the sync test below), not by a rule that used to
 * mention playground and still does.
 *
 * Consumed by:
 * - scripts/docker-build.mjs — builds `--build-arg KEY=value` flags for
 *   `docker build`.
 * - scripts/docker-health-check.sh — imports this module from an inline
 *   Node script (bash cannot `import` an ES module directly) to build the
 *   same flags for its own local health-check image.
 * - scripts/__tests__/docker-build.test.mjs — regression coverage.
 *
 * `.github/workflows/ci.yml` (build-args block) and `docker/ci/Dockerfile`
 * (ARG declarations) cannot import this file — YAML and Dockerfiles have no
 * module system — so their copies of this list are compared against this
 * one by scripts/__tests__/build-arg-keys-sync.test.mjs. Any drift there
 * fails that test instead of silently shipping an image missing a key.
 *
 * If you add or remove a `NEXT_PUBLIC_*` build-time variable, do it here
 * first, then mirror it into `docker/ci/Dockerfile` (ARG + ENV) and
 * `.github/workflows/ci.yml` (build-args block) — the sync test will tell
 * you if you miss one.
 */
export const BUILD_ARG_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_AUTH_URL",
  "NEXT_PUBLIC_AUTH_HOST_URL",
  "NEXT_PUBLIC_STORE_URL",
  "NEXT_PUBLIC_ADMIN_URL",
  "NEXT_PUBLIC_LANDING_URL",
  "NEXT_PUBLIC_PAYMENTS_URL",
  "NEXT_PUBLIC_STUDIO_URL",
  "NEXT_PUBLIC_BUILD_HASH",
  "NEXT_PUBLIC_ENABLE_TEST_IDS",
  "NEXT_PUBLIC_ENV_DEBUG",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_DOMAIN",
];
