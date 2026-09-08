// eslint-disable-next-line boundaries/no-unknown, no-restricted-imports
import appLinks from "../../../../config/app-links.json";

type AppName = keyof typeof appLinks;

function resolveAppUrl(app: AppName) {
  const definition = appLinks[app];
  const explicit = process.env[definition.envKey]?.trim();

  if (process.env.NODE_ENV === "production") {
    if (explicit) {
      return explicit;
    }

    return definition.path;
  }

  if (explicit) {
    return explicit;
  }

  return definition.devUrl;
}

export const appUrls = Object.freeze({
  landing: resolveAppUrl("landing"),
  store: resolveAppUrl("store"),
  studio: resolveAppUrl("studio"),
  payments: resolveAppUrl("payments"),
  admin: resolveAppUrl("admin"),
  auth: resolveAppUrl("auth"),
});
