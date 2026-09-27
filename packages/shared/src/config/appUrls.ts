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
