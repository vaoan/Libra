/**
 * The single routing registry: which path prefix and which dev port each app
 * owns. `config/app-links.json` is the source; the dev proxy, `start.mjs`,
 * `e2e.mjs`, `appUrls.ts` and the app-registry CI check all read it, and
 * `docker/prod/nginx.conf` is checked against it.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REGISTRY_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../config/app-links.json",
);

/**
 * Reads the registry.
 *
 * @param {string} [registryPath] - override for tests.
 * @returns {Record<string, { envKey: string; path: string; port: number }>}
 */
export function loadAppRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function entryFor(registry, app) {
  const entry = registry[app];
  if (!entry) {
    throw new Error(`"${app}" is not registered in config/app-links.json`);
  }
  return entry;
}

/**
 * The `next dev` port an app listens on.
 *
 * @param {ReturnType<typeof loadAppRegistry>} registry
 * @param {string} app
 * @returns {number}
 */
export function portForApp(registry, app) {
  return entryFor(registry, app).port;
}

/**
 * The absolute URL an app has behind the dev proxy.
 *
 * @param {ReturnType<typeof loadAppRegistry>} registry
 * @param {string} app
 * @param {number|string} hostPort - the proxy's port (`HOST_PORT`).
 * @returns {string}
 */
export function devUrlForApp(registry, app, hostPort) {
  const { path } = entryFor(registry, app);
  const suffix = path === "/" ? "" : path;
  return `http://localhost:${hostPort}${suffix}`;
}
