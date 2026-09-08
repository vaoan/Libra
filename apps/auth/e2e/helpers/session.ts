import path from "node:path";

import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import type { BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { assertNotProductionClerk } from "./guardEnv";
import { attachProfileId, registerClerkUser } from "./userRegistry";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- shared Node helper
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../../scripts/app-url-resolver.js"),
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not set. Ensure the correct .env.* file is loaded.",
  );
const SUPABASE_URL_VALUE: string = SUPABASE_URL;

const SUPABASE_ANON_KEY_ENV = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY_ENV)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Ensure the correct .env.* file is loaded.",
  );
/**
 * The project's anon key — the `apikey` header for requests that carry a
 * user's own bearer token. Matches how `createServerSupabaseClient`
 * (packages/api/src/supabase/server.ts) authenticates real requests under
 * Third-Party Auth: `apikey` stays the anon key, `Authorization` carries the
 * caller's own (Clerk) JWT. A Clerk JWT is not a valid `apikey` value on its
 * own — it is signed by Clerk, not this project — so callers issuing raw
 * PostgREST requests as a specific user (see delegated-reports-rls.spec.ts)
 * must use this, not the user's token, for `apikey`.
 */
export const SUPABASE_ANON_KEY: string = SUPABASE_ANON_KEY_ENV;

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY)
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Ensure the correct .env.* file is loaded.",
  );
const SERVICE_ROLE_KEY_VALUE: string = SERVICE_ROLE_KEY;

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY)
  throw new Error(
    "CLERK_SECRET_KEY is not set. Ensure the correct .env.* file is loaded.",
  );
const CLERK_SECRET_KEY_VALUE: string = CLERK_SECRET_KEY;
assertNotProductionClerk(CLERK_SECRET_KEY_VALUE);

const AUTH_URL: string = resolveE2EAppUrls().auth;

const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY_VALUE });

/**
 * Derive the shared cookie domain from an app URL.
 * For localhost/127.0.0.1, returns the hostname as-is.
 * For production domains, returns the root domain with a leading dot.
 *
 * Unrelated to authentication — this is a plain hostname utility some specs
 * use for their own app-level cookies (e.g. `libra-cart`), not for Clerk's
 * session cookie, which is not something this file constructs anymore.
 */
export function buildSharedCookieDomain(url: string): string {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return host;
  const parts = host.split(".");
  return `.${parts.slice(-2).join(".")}`;
}

/** Reusable headers for admin REST API calls. */
function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY_VALUE,
    Authorization: `Bearer ${SERVICE_ROLE_KEY_VALUE}`,
    ...extra,
  };
}

export const supabaseAdmin = createClient(
  SUPABASE_URL_VALUE,
  SERVICE_ROLE_KEY_VALUE,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

/**
 * Direct REST helper for data operations that need to bypass RLS.
 * The JS client with sb_secret_ keys doesn't bypass RLS for PostgREST,
 * but raw REST API calls with the same key do.
 */
export async function adminInsert(
  table: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${SUPABASE_URL_VALUE}/rest/v1/${table}`, {
    method: "POST",
    headers: adminHeaders({
      "Content-Type": "application/json",
      Prefer: "return=representation",
    }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Admin insert into ${table} failed: ${err.message}`);
  }
  const rows = await res.json();
  return rows[0];
}

/**
 * Direct REST helper for querying data as admin.
 */
export async function adminQuery(
  table: string,
  params: string,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${SUPABASE_URL_VALUE}/rest/v1/${table}?${params}`, {
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Admin query on ${table} failed: ${err.message}`);
  }
  return res.json();
}

/**
 * Direct REST helper for deleting data as admin.
 */
export async function adminDelete(
  table: string,
  params: string,
): Promise<void> {
  const res = await fetch(`${SUPABASE_URL_VALUE}/rest/v1/${table}?${params}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`Admin delete on ${table} failed: ${err.message}`);
  }
}

// ─── Permission Templates ────────────────────────────────────────

export const BUYER_PERMISSIONS = [
  "products.read",
  "product_reviews.create",
  "product_reviews.read",
  "product_reviews.update",
  "product_reviews.delete",
  "orders.create",
  "orders.read",
  "receipts.create",
  "receipts.delete",
];

export const SELLER_PERMISSIONS = [
  "products.read",
  "product_reviews.read",
  "orders.read",
  "orders.update",
  "orders.approve",
  "orders.request_proof",
  "receipts.read",
  "products.create",
  "products.update",
  "products.delete",
  "seller_payment_methods.create",
  "seller_payment_methods.read",
  "seller_payment_methods.update",
  "seller_payment_methods.delete",
  "seller_admins.create",
  "seller_admins.read",
  "seller_admins.update",
  "seller_admins.delete",
];

export const ADMIN_PERMISSIONS = [
  ...new Set([
    ...BUYER_PERMISSIONS,
    ...SELLER_PERMISSIONS,
    "payment_settings.read",
    "payment_settings.update",
    "templates.create",
    "templates.read",
    "templates.update",
    "templates.delete",
    "audit.read",
    "user_permissions.create",
    "user_permissions.read",
    "user_permissions.update",
    "user_permissions.delete",
    "users.export",
    "events.create",
    "events.read",
    "events.update",
    "events.delete",
    "check_ins.create",
    "check_ins.read",
    "check_ins.update",
    "orders.approve",
    "orders.request_proof",
  ]),
];

/**
 * Grant a list of permission keys to a user via admin REST API.
 * `userId` is a `user_profiles.id` — every `user_permissions.user_id` FK now
 * targets that table (see
 * supabase/migrations/20260829120000_repoint_user_fks.sql).
 */
export async function grantPermissions(
  userId: string,
  permissionKeys: string[],
): Promise<void> {
  const allRps = await adminQuery(
    "resource_permissions",
    "resource_type=eq.global&select=id,permissions!inner(key)",
  );

  for (const key of permissionKeys) {
    const rp = allRps.find(
      (r: Record<string, unknown>) =>
        (r.permissions as Record<string, unknown>).key === key,
    );
    if (!rp) continue;

    try {
      await adminInsert("user_permissions", {
        user_id: userId,
        resource_permission_id: rp.id,
        mode: "grant",
        granted_by: userId,
        reason: "E2E test setup",
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          "user_permissions_user_id_resource_permission_id_key",
        )
      ) {
        continue;
      }

      throw error;
    }
  }
}

// ─── Types ───────────────────────────────────────────────────────

export interface TestUser {
  /**
   * `user_profiles.id` — the id every relevant FK (orders.user_id,
   * products.seller_id, user_permissions.user_id, ...) targets under the
   * repointed schema. NOT the Clerk user id.
   */
  userId: string;
  email: string;
  /** The Clerk user id (`user_xxxx`). Needed for sign-in and cleanup. */
  clerkUserId: string;
  /**
   * A real Clerk session JWT for this user, minted server-side via the Clerk
   * Backend API (no browser involved). Supabase's Third-Party Auth
   * integration verifies it exactly like a browser-obtained one — see
   * supabase/migrations/20260829110000_current_user_id.sql, which resolves
   * the caller from `auth.jwt() ->> 'sub'` regardless of how that JWT was
   * minted. Used by specs that drive PostgREST directly to assert RLS
   * behavior without a browser (delegated-reports-rls.spec.ts).
   */
  accessToken: string;
}

let clerkSetupPromise: Promise<void> | null = null;
/** Fetches the Clerk Testing Token once per worker process; safe to call
 * repeatedly. Required before any `clerk.signIn`/`clerk.signOut` call — see
 * @clerk/testing's internal use of `process.env.CLERK_FAPI` /
 * `CLERK_TESTING_TOKEN`, both of which only `clerkSetup()` populates. */
function ensureClerkSetup(): Promise<void> {
  clerkSetupPromise ??= clerkSetup();
  return clerkSetupPromise;
}

/**
 * Delete a Clerk user by id. Best-effort: swallows and logs rather than
 * throwing, since callers use this for cleanup where a failure must never
 * prevent the rest of a teardown from running.
 */
export async function deleteClerkUserBySub(clerkUserId: string): Promise<void> {
  try {
    await clerkClient.users.deleteUser(clerkUserId);
  } catch (error) {
    console.warn(`[e2e] failed to delete Clerk user ${clerkUserId}:`, error);
  }
}

/**
 * Create a fully-provisioned test user: a real Clerk user, a linked
 * `user_profiles` row, default buyer permissions, and any additional
 * `permissions` requested.
 *
 * As a side effect, registers the Clerk user into the module-level cleanup
 * registry (`userRegistry.ts`) the instant it is created — before the
 * profile RPC, `grantPermissions`, or session/token minting below get a
 * chance to throw. This ordering is the correctness argument for the whole
 * auto-cleanup mechanism: if any later step throws, the Clerk user is
 * already registered and `drainTestUsers` can still delete it, instead of
 * orphaning it against the Clerk dev instance's 100-user cap. Once the
 * profile row exists, the registry entry is enriched with the profile id
 * (`attachProfileId`) so a later failure still lets drain use the full
 * `deleteTestUser` (profile row + Clerk user) rather than the Clerk-only
 * fallback.
 *
 * Profile creation calls the exact RPC `resolveProfile()`'s "created" branch
 * uses in production (`create_profile_with_default_permissions` — see
 * supabase/migrations/20260829170000_profile_create_with_permissions.sql)
 * directly with the service-role client, instead of driving a browser
 * through `/en/callback`. That RPC inserts the `user_profiles` row AND
 * grants default buyer permissions atomically, replacing the
 * `on_auth_user_default_permissions` trigger that used to fire on every
 * `auth.users` insert (auth.users is now permanently empty). Without a
 * resolvable profile, `current_user_id()` returns NULL and every RLS policy
 * denies — see that migration's header for the full rationale.
 *
 * No browser page is involved, so this is safe to call from
 * `test.beforeAll`, before any `context`/`page` fixture exists — exactly how
 * every consumer of this function already calls it.
 */
export async function createTestUser(
  label: string,
  permissions: string[] = [],
): Promise<TestUser> {
  // A Clerk dev-instance test email (`+clerk_test` subaddress): no real
  // inbox, no verification email actually sent, unique per run.
  const email = `e2e-${label}-${Date.now()}+clerk_test@example.com`;

  const clerkUser = await clerkClient.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });
  // Register the instant the Clerk user exists -- before the profile RPC,
  // permission grants, or session/token minting below get a chance to throw
  // and orphan it against the Clerk dev instance's 100-user cap. This is the
  // exact "throws inside beforeAll" gap the old afterAll convention leaked
  // on; see userRegistry.ts's RegisteredUser doc comment.
  registerClerkUser({ clerkUserId: clerkUser.id, email });

  const { data: profile, error } = await supabaseAdmin.rpc(
    "create_profile_with_default_permissions",
    {
      p_email: email.toLowerCase(),
      p_identity_sub: clerkUser.id,
      p_display_name: null,
      p_avatar_url: null,
    },
  );
  if (error || !profile) {
    throw new Error(
      `Failed to create profile for ${label} user (Clerk id ${clerkUser.id}): ${error?.message}`,
    );
  }
  const profileId = (profile as { id: string }).id;
  // Enrich the registry entry as soon as the profile exists, so a later
  // failure (grantPermissions, session/token minting) still lets drain use
  // the full deleteTestUser (profile row + Clerk user) instead of the
  // Clerk-only fallback.
  attachProfileId(clerkUser.id, profileId);

  if (permissions.length > 0) {
    await grantPermissions(profileId, permissions);
  }

  // A real backend session — see the `accessToken` doc comment on TestUser.
  const session = await clerkClient.sessions.createSession({
    userId: clerkUser.id,
  });
  const token = await clerkClient.sessions.getToken(session.id);

  return {
    userId: profileId,
    email,
    clerkUserId: clerkUser.id,
    accessToken: token.jwt,
  };
}

/**
 * Switch the browser context to a different signed-in Clerk user.
 *
 * Signs out whoever is currently active in `context` (if anyone) and drives
 * a real, unmocked sign-in for `user` via @clerk/testing's ticket strategy —
 * the same mechanism apps/store/e2e/auth.setup.ts uses. A forged/injected
 * session cookie is not viable for Clerk: its client SDK validates the
 * session against Clerk's own API on load, so nothing short of a real
 * sign-in produces state `window.Clerk` (and therefore every
 * `useAuth()`/`currentUser()` call downstream) recognizes.
 *
 * Reuses the context's existing page — Playwright's default `page` fixture —
 * rather than opening a new one, so the caller's own `page` reference is the
 * one left carrying the new session. Cookies are shared across the whole
 * `context` regardless of which page set them, so any other page the caller
 * later navigates also sees the new session.
 */
export async function injectSession(
  context: BrowserContext,
  user: TestUser,
): Promise<void> {
  await ensureClerkSetup();
  const page = context.pages()[0] ?? (await context.newPage());

  // An unprotected page that loads Clerk's client JS — required before
  // clerk.signOut/signIn, both of which operate on `window.Clerk`.
  await page.goto(`${AUTH_URL}/en/login`);

  await clerk.signOut({ page }).catch(() => {
    // Nobody was signed in yet in this context — fine, nothing to sign out.
  });

  await clerk.signIn({ page, emailAddress: user.email });
}

/**
 * Delete a test user's Clerk account and `user_profiles` row. The profile
 * delete cascades to their permissions, orders, product reviews, and seller
 * payment methods via the FKs repointed in
 * 20260829120000_repoint_user_fks.sql (products.seller_id is SET NULL, not
 * cascaded — callers that created products for a seller must still delete
 * those explicitly before calling this, same as before).
 *
 * Best-effort: both halves are attempted independently so a failure on one
 * side never skips the other — the Clerk dev instance is a shared external
 * service that otherwise accumulates throwaway users forever.
 */
export async function deleteTestUser(user: TestUser): Promise<void> {
  await adminDelete("user_profiles", `id=eq.${user.userId}`).catch((error) => {
    console.warn(
      `[e2e] failed to delete user_profiles row ${user.userId}:`,
      error,
    );
  });
  await deleteClerkUserBySub(user.clerkUserId);
}
