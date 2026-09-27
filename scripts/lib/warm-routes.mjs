/**
 * Route warm-up for dev-mode E2E.
 *
 * Turbopack compiles a route the first time it is requested. A client-side
 * navigation whose target is still compiling races the HMR rebuild that the
 * compile triggers, and the router can drop the navigation: the page stays
 * where it was and the test times out. Requesting every route once, before
 * Playwright starts, takes the race off the table. Routes are discovered from
 * each app's `src/app/**\/page.tsx`, so nothing here is a hand-kept list.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PAGE_FILE = "page.tsx";
const LOCALE = "en";
const DYNAMIC_FILLER = "warm-up";
// One at a time: parallel first compiles of routes sharing a next/font/google
// import made Turbopack fail with "next/font/google queries have exactly one
// entry" (seen on landing's legal pages under Playwright's 3 workers).
const DEFAULT_CONCURRENCY = 1;
const REQUEST_TIMEOUT_MS = 90_000;

function pageDirs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pageDirs(join(dir, entry.name), out);
    else if (entry.name === PAGE_FILE) out.push(dir);
  }
  return out;
}

function segmentToUrl(segment) {
  if (segment.startsWith("(") && segment.endsWith(")")) return null; // route group
  if (segment === "[locale]") return LOCALE;
  if (segment.startsWith("[")) return DYNAMIC_FILLER; // [id], [...rest], [[...slug]]
  return segment;
}

/**
 * URL paths (without basePath) for every page under an app's `src/app`.
 *
 * @param {string} appDir - the app's `src/app` directory.
 * @returns {string[]} sorted, unique, root-relative paths.
 */
export function discoverRoutes(appDir) {
  if (!existsSync(appDir)) return [];
  const routes = pageDirs(appDir).map((dir) => {
    const segments = relative(appDir, dir)
      .split(sep)
      .filter(Boolean)
      .map(segmentToUrl)
      .filter((s) => s !== null);
    return `/${segments.join("/")}`;
  });
  return [...new Set(routes)].sort();
}

/**
 * Absolute URLs, through the proxy, for every route of every registered app.
 *
 * @param {{ registry: Record<string, { path: string }>; appsDir: string; origin: string }} input
 * @returns {string[]}
 */
export function buildWarmUrls({ registry, appsDir, origin }) {
  const urls = [];
  for (const [app, { path }] of Object.entries(registry)) {
    const prefix = path === "/" ? "" : path;
    for (const route of discoverRoutes(join(appsDir, app, "src", "app"))) {
      const suffix = route === "/" ? "" : route;
      urls.push(`${origin}${prefix}${suffix}`);
    }
  }
  return urls;
}

/**
 * GETs every URL with bounded concurrency. Status codes are irrelevant (a 404
 * still compiles the route); failures are recorded, not thrown.
 *
 * @param {string[]} urls
 * @param {{ fetchFn?: typeof fetch; concurrency?: number }} [options]
 * @returns {Promise<Array<{ url: string; status: number | string; ms: number }>>} in input order.
 */
export async function warmRoutes(
  urls,
  { fetchFn = fetch, concurrency = DEFAULT_CONCURRENCY } = {},
) {
  const results = new Array(urls.length);
  let next = 0;

  async function worker() {
    while (next < urls.length) {
      const index = next++;
      const url = urls[index];
      const started = Date.now();
      try {
        const res = await fetchFn(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        results[index] = { url, status: res.status, ms: Date.now() - started };
      } catch (err) {
        results[index] = {
          url,
          status: err.code ?? err.message,
          ms: Date.now() - started,
        };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, worker),
  );
  return results;
}
