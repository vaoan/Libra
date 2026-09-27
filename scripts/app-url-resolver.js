/**
 * Resolves app URLs for E2E tests and Playwright configs.
 *
 * Reads explicit NEXT_PUBLIC_* app URLs from the active env file
 * (loaded by load-root-env.cjs). Falls back to the dev proxy origin plus the
 * registry path.
 *
 * No E2E mode detection. No isE2EMode flag. The env file IS the configuration.
 * To run E2E against prod, load .env.prod — no code changes needed.
 */

// @ts-check
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadRootEnv } = require(path.resolve(__dirname, "./load-root-env.cjs"));
loadRootEnv({ targetEnv: process.env.TARGET_ENV });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appLinks = require("../config/app-links.json");

/**
 * Resolves all app URLs for the active environment.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_<APP>_URL                         (explicit, from the env file)
 *   2. http://localhost:<HOST_PORT><registry path>   (the dev proxy)
 *
 * @returns {Record<string, string>}
 */
function resolveE2EAppUrls() {
  const hostPort = process.env.HOST_PORT ?? "5050";
  /** @type {Record<string, string>} */
  const result = {};

  for (const [name, app] of Object.entries(appLinks)) {
    const suffix = app.path === "/" ? "" : app.path;
    result[name] =
      process.env[app.envKey] ?? `http://localhost:${hostPort}${suffix}`;
  }

  return result;
}

/**
 * Returns extra HTTP headers for Playwright requests.
 * No E2E-specific headers needed — returns an empty object.
 *
 * @returns {Record<string, string>}
 */
function getE2EExtraHTTPHeaders() {
  return {};
}

module.exports = { resolveE2EAppUrls, getE2EExtraHTTPHeaders };
