import { deleteCookie, getCookie, setCookie } from "cookies-next";

import {
  permCacheSchema,
  PERM_COOKIE_KEY,
  PERM_COOKIE_MAX_BYTES,
} from "../constants";

const PERM_MAX_AGE = 3600;

/**
 * Host-only cookie options. Every app shares one origin, so the cookie needs
 * no `domain` attribute — and must not have one, or it would be readable by
 * unrelated sites on sibling subdomains.
 */
function getPermCookieOptions() {
  const isSecure =
    globalThis.window !== undefined &&
    globalThis.location.protocol === "https:";

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

export function readPermCache(): string[] | null {
  try {
    const raw = getCookie(PERM_COOKIE_KEY);
    if (raw === undefined || raw === null) return null;
    const result = permCacheSchema.safeParse(JSON.parse(String(raw)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writePermCache(keys: string[]): void {
  const serialised = JSON.stringify(keys);
  if (serialised.length > PERM_COOKIE_MAX_BYTES) {
    // Exceeding the limit would silently truncate or be rejected by the browser;
    // skip the write so we fall back to a fresh DB fetch on next navigation.
    return;
  }
  setCookie(PERM_COOKIE_KEY, serialised, {
    ...getPermCookieOptions(),
    maxAge: PERM_MAX_AGE,
  });
}

export function clearPermCache(): void {
  deleteCookie(PERM_COOKIE_KEY, getPermCookieOptions());
}
