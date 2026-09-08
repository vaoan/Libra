import { deleteClerkUserBySub, deleteTestUser, type TestUser } from "./session";

/**
 * A registry entry. `userId` (the Supabase `user_profiles.id`) is optional
 * because an entry is created the instant the Clerk user exists — before the
 * profile RPC, permission grants, or session/token minting in
 * `createTestUser` have run. If any of those later steps throws, the entry
 * stays profile-less and drain falls back to deleting the Clerk user alone.
 */
export interface RegisteredUser {
  clerkUserId: string;
  email: string;
  userId?: string;
}

const registry: RegisteredUser[] = [];

/**
 * Record a freshly created Clerk user the instant it exists — before any
 * later step in `createTestUser` (profile RPC, permission grants, session or
 * token minting) has a chance to throw. Called by `createTestUser` itself
 * immediately after `clerkClient.users.createUser` succeeds, so a failure
 * anywhere after that point still leaves the Clerk user reachable by drain.
 */
export function registerClerkUser(entry: {
  clerkUserId: string;
  email: string;
}): void {
  registry.push({ clerkUserId: entry.clerkUserId, email: entry.email });
}

/**
 * Attach the Supabase profile id to an already-registered entry once
 * `createTestUser`'s profile RPC succeeds, so drain can use the full
 * `deleteTestUser` (profile row + Clerk user) instead of the Clerk-only
 * fallback. No-op if the entry is gone (e.g. already drained).
 */
export function attachProfileId(clerkUserId: string, userId: string): void {
  const entry = registry.find((u) => u.clerkUserId === clerkUserId);
  if (entry) entry.userId = userId;
}

/**
 * Record a fully-formed test user directly, skipping the two-step
 * Clerk-then-profile flow. Used by tests to seed the registry without a real
 * Clerk/Supabase round trip. Specs never call this directly for real users —
 * `createTestUser` uses `registerClerkUser`/`attachProfileId` instead, which
 * is the point: cleanup cannot be forgotten because it is not a caller's job.
 */
export function registerTestUser(user: TestUser): void {
  registry.push({
    clerkUserId: user.clerkUserId,
    email: user.email,
    userId: user.userId,
  });
}

export function listRegisteredTestUsers(): readonly RegisteredUser[] {
  return registry;
}

interface DrainOptions {
  /** Deletes a user that has a profile row (the common case). Defaults to
   * the real `deleteTestUser`, which deletes both halves independently. */
  deleter?: (user: TestUser) => Promise<void>;
  /** Deletes a user that never got a profile row (died mid-setup). Defaults
   * to the real `deleteClerkUserBySub`. */
  clerkDeleter?: (clerkUserId: string) => Promise<void>;
}

/**
 * Delete every registered user and empty the registry. Never throws: one
 * failed deletion must not strand the rest. Returns the number attempted.
 *
 * Branches per entry: an entry with a `userId` goes through the full
 * `deleteTestUser` (profile row + Clerk user); a profile-less entry — one
 * that died between Clerk user creation and profile creation — goes straight
 * to `deleteClerkUserBySub`, since there is no profile row to delete and
 * `deleteTestUser` itself is not modified to handle a missing `userId`.
 */
export async function drainTestUsers(
  options: DrainOptions = {},
): Promise<number> {
  const deleter = options.deleter ?? deleteTestUser;
  const clerkDeleter = options.clerkDeleter ?? deleteClerkUserBySub;
  const pending = registry.splice(0, registry.length);

  for (const entry of pending) {
    try {
      if (entry.userId) {
        await deleter({
          userId: entry.userId,
          email: entry.email,
          clerkUserId: entry.clerkUserId,
          // Unused by deleteTestUser (it only reads userId/clerkUserId) --
          // the registry doesn't carry a real session token, and doesn't
          // need to.
          accessToken: "",
        });
      } else {
        await clerkDeleter(entry.clerkUserId);
      }
    } catch (error) {
      console.warn(`[e2e] drain failed for ${entry.email}:`, error);
    }
  }

  return pending.length;
}
