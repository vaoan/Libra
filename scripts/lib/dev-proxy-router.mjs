/**
 * Longest-prefix routing for the dev proxy, the same rule nginx applies with
 * its `location /store`, `location /auth`, ... `location /` blocks.
 */

/**
 * Routes sorted longest path first, so `/store` is tried before `/`.
 *
 * @param {Record<string, { path: string; port: number }>} registry
 * @returns {Array<{ app: string; path: string; port: number }>}
 */
export function buildRoutes(registry) {
  return Object.entries(registry)
    .map(([app, { path, port }]) => ({ app, path, port }))
    .sort((a, b) => b.path.length - a.path.length);
}

/**
 * The route that owns a request URL. A prefix matches only at a segment
 * boundary (`/store` and `/store/x`, never `/storefront`); the `/` route
 * catches everything else.
 *
 * @param {ReturnType<typeof buildRoutes>} routes
 * @param {string} url - request URL, query string allowed.
 * @returns {{ app: string; path: string; port: number }}
 */
export function matchRoute(routes, url) {
  const pathname = url.split("?")[0];
  return routes.find(
    ({ path }) =>
      path === "/" || pathname === path || pathname.startsWith(`${path}/`),
  );
}
