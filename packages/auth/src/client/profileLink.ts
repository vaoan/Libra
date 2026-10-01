import { deleteCookie, getCookie, setCookie } from "cookies-next";

import {
  PROFILE_LINK_ATTEMPT_COOKIE_KEY,
  PROFILE_LINK_ATTEMPT_MAX_AGE,
} from "../constants";

/**
 * The auth app's callback route is the only place a Clerk identity is linked
 * to a `user_profiles` row (matched, claimed, or created). A person can hold a
 * Clerk session without ever reaching it — a returning customer's first
 * sign-in through Clerk was the case that hit production — and every protected
 * page then treated them as signed out. Sending them through the callback
 * links the profile and returns them to `returnTo`.
 */
export function buildProfileLinkUrl(
  authUrl: string,
  locale: string,
  returnTo: string | null,
): string {
  const callbackUrl = `${authUrl}/${locale}/callback`;
  return returnTo
    ? `${callbackUrl}?next=${encodeURIComponent(returnTo)}`
    : callbackUrl;
}

/**
 * Host-only, same as the permission cache cookie: every app shares one
 * origin, so the marker set by the store is visible to the auth app.
 */
function getAttemptCookieOptions() {
  const isSecure =
    globalThis.window !== undefined &&
    globalThis.location.protocol === "https:";

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

/**
 * True when a link redirect happened within the last minute. If the callback
 * linked the profile and the lookup still finds none, redirecting again would
 * loop forever; callers show an error state instead.
 */
export function hasRecentProfileLinkAttempt(): boolean {
  try {
    return getCookie(PROFILE_LINK_ATTEMPT_COOKIE_KEY) !== undefined;
  } catch {
    return false;
  }
}

export function markProfileLinkAttempt(): void {
  setCookie(PROFILE_LINK_ATTEMPT_COOKIE_KEY, "1", {
    ...getAttemptCookieOptions(),
    maxAge: PROFILE_LINK_ATTEMPT_MAX_AGE,
  });
}

export function clearProfileLinkAttempt(): void {
  deleteCookie(PROFILE_LINK_ATTEMPT_COOKIE_KEY, getAttemptCookieOptions());
}
