import { z } from "zod";

/** Cookie key used by the client and server permission caches */
export const PERM_COOKIE_KEY = "libra-perm";

/** Maximum serialised byte length before we skip writing the perm cookie (browser limit is 4 KB) */
export const PERM_COOKIE_MAX_BYTES = 3500;

/** Cookie marking that a signed-in person was just sent to link their profile */
export const PROFILE_LINK_ATTEMPT_COOKIE_KEY = "libra-profile-link-attempt";

/** How long that marker suppresses another automatic link redirect, in seconds */
export const PROFILE_LINK_ATTEMPT_MAX_AGE = 60;

/** Validates the cookie payload: an array of "resource.action" strings */
export const permCacheSchema = z.array(
  z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/),
);
