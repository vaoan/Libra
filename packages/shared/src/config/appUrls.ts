// eslint-disable-next-line boundaries/no-unknown, no-restricted-imports
import appLinks from "../../../../config/app-links.json";

type AppName = keyof typeof appLinks;

/**
 * Every app lives on one origin under its registry path, so a root-relative
 * path is a valid cross-app link in every environment. An explicit
 * `NEXT_PUBLIC_<APP>_URL` still wins so tunnels and E2E can use absolute URLs.
 */
function resolveAppUrl(app: AppName) {
  const definition = appLinks[app];
  const explicit = process.env[definition.envKey]?.trim();
  return explicit || definition.path;
}

export const appUrls = Object.freeze({
  landing: resolveAppUrl("landing"),
  store: resolveAppUrl("store"),
  studio: resolveAppUrl("studio"),
  payments: resolveAppUrl("payments"),
  admin: resolveAppUrl("admin"),
  auth: resolveAppUrl("auth"),
});

/**
 * Join an app URL and an app-relative path without a double slash. The
 * landing app's registry path is `/`, so `${appUrls.landing}/en/legal/terms`
 * produced `//en/legal/terms` — a protocol-relative URL to a host called
 * "en" — on every footer in production (2026-09-28).
 */
export function appHref(appUrl: string, path: string): string {
  let base = appUrl;
  while (base.endsWith("/")) base = base.slice(0, -1);
  const suffix = path.startsWith("/") ? path : "/" + path;
  return base + suffix;
}
