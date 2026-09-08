import fs from "node:fs";
import path from "node:path";

import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

import { assertNotProductionClerk } from "../../auth/e2e/helpers/guardEnv";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../scripts/app-url-resolver.js"),
);

// resolveProfile() runs on a page load, so this only has to outlast one
// server round-trip plus the write.
const PROFILE_TIMEOUT_MS = 15_000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not set. Ensure the correct .env.* file is loaded.",
  );
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_ROLE_KEY)
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. Ensure the correct .env.* file is loaded.",
  );
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
if (!CLERK_SECRET_KEY)
  throw new Error(
    "CLERK_SECRET_KEY is not set. Ensure the correct .env.* file is loaded.",
  );
assertNotProductionClerk(CLERK_SECRET_KEY);

const AUTH_FILE = "e2e/.auth/session.json";
const USER_FILE = path.join(path.dirname(AUTH_FILE), "user.json");
const PRODUCT_FILE = path.join(path.dirname(AUTH_FILE), "product.json");
const { store: STORE_URL, auth: AUTH_URL } = resolveE2EAppUrls();

setup("authenticate", async ({ page }) => {
  // Fetches a Clerk Testing Token so the sign-in below bypasses Clerk's bot
  // detection — required for any automated (non-human) sign-in.
  await clerkSetup();

  // A Clerk dev-instance test email (`+clerk_test` subaddress): no real inbox,
  // no verification email actually sent, unique per run.
  const email = `e2e-${Date.now()}+clerk_test@example.com`;

  const { createClerkClient } = await import("@clerk/backend");
  const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });
  // Backend-API-created users are verified by default (Clerk's own default —
  // see docs/reference/backend/user/create-user), which is required for
  // resolveProfile()'s emailVerified gate below.
  const clerkUser = await clerkClient.users.createUser({
    emailAddress: [email],
    skipPasswordRequirement: true,
  });

  // Any unprotected page that loads Clerk's client JS.
  await page.goto(`${AUTH_URL}/en/login`);

  // Real, unmocked Clerk sign-in: @clerk/testing's `emailAddress` mode looks
  // the user up via the Backend API, mints a genuine Sign-in Token, and
  // consumes it client-side via the `ticket` strategy — this is a real
  // session with a real Clerk-issued JWT, not a mock. It is the documented
  // way to drive sign-in for an app (like this one) whose UI only exposes
  // OAuth buttons, which cannot be automated without a real Google/Discord
  // account.
  await clerk.signIn({ page, emailAddress: email });

  // Runs the app's own `resolveProfile()` against the now-active Clerk
  // session — this is what creates the linked `user_profiles` row and grants
  // default buyer permissions (the `created` arm; see
  // packages/auth/src/server/resolveProfile.ts). Without this, every
  // permission-gated page and ProtectedRoute check in the suite would fail:
  // there is no DB trigger provisioning profiles anymore (Task 8 removed the
  // `auth.users`-keyed one).
  await page.goto(`${AUTH_URL}/en/callback`);

  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Wait for the row itself, not for the network to go quiet. This step has no
  // DOM assertion -- the thing it cares about is a server-side write -- so a
  // networkidle wait was standing in for "the write probably landed by now".
  // Polling the row makes the wait the actual condition: it ends the moment
  // resolveProfile() has committed, and fails loudly if it never does.
  await expect
    .poll(
      async () => {
        const { data } = await supabaseAdmin
          .from("user_profiles")
          .select("id")
          .eq("identity_sub", clerkUser.id)
          .maybeSingle();
        return data?.id ?? null;
      },
      {
        timeout: PROFILE_TIMEOUT_MS,
        message: `resolveProfile() never created a profile for ${clerkUser.id}`,
      },
    )
    .not.toBeNull();

  // Read it back plainly now that the poll has established it exists. Keeping
  // the row out of the poll's closure avoids narrowing a closure-assigned
  // variable, which TypeScript cannot follow.
  const { data: profile, error } = await supabaseAdmin
    .from("user_profiles")
    .select("id")
    .eq("identity_sub", clerkUser.id)
    .single();
  if (error || !profile)
    throw new Error(
      `Failed to find the profile resolveProfile() should have created for ${clerkUser.id}: ${error?.message}`,
    );

  // Clerk's session cookie is set without an explicit cookie domain, so it is
  // shared across every app on `localhost` regardless of port — no manual
  // cookie plumbing needed here, unlike the old Supabase-cookie approach.
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.goto(`${STORE_URL}/en`);
  await page.context().storageState({ path: AUTH_FILE });

  // Write the user's profile ID so permission-granting tests can look it up.
  const USER_FILE_DIR = path.dirname(USER_FILE);
  fs.mkdirSync(USER_FILE_DIR, { recursive: true });
  fs.writeFileSync(
    USER_FILE,
    JSON.stringify({ id: profile.id, email, clerkUserId: clerkUser.id }),
  );

  // ── A product for the specs that need one ──────────────────────────────
  //
  // Two specs were skipping for want of one: product-detail-seller-card and
  // the product-detail case in accessibility.spec.ts. An annotated skip is
  // honest, but it is still coverage that reports itself as absent every run
  // and that nobody acts on, so quality-gates.md recorded seeding as the
  // durable fix. This is it.
  //
  // Owned by the throwaway user, so it is this run's product and not shared
  // state another spec can change underneath. Removed in auth.teardown.ts --
  // the local Docker stack is ephemeral, but CI reuses one database across
  // the apps' projects, so leaving rows behind would accumulate.
  // slug is unique, so this uses the whole Clerk id rather than a suffix:
  // a teardown that failed once would otherwise leave a row that collides
  // with the next run's insert and fails setup for an unrelated reason.
  const productSlug = `e2e-product-${clerkUser.id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
  const { data: seededProduct, error: productError } = await supabaseAdmin
    .from("products")
    .insert({
      slug: productSlug,
      name_en: "E2E Test Product",
      name_es: "Producto de Prueba E2E",
      type: "merch",
      price: 10000,
      currency: "COP",
      seller_id: profile.id,
      is_active: true,
    })
    .select("id, slug")
    .single();
  if (productError || !seededProduct)
    throw new Error(`Failed to seed the E2E product: ${productError?.message}`);

  fs.writeFileSync(PRODUCT_FILE, JSON.stringify(seededProduct));

  // NOTE: Do NOT delete the Clerk user or the profile HERE, in this file.
  // Clerk's client validates the session against its own API on every page
  // load — deleting the user out from under an active session would break
  // every authenticated test that runs afterward.
  //
  // The Supabase profile is fine to leave: it lives in the Docker stack,
  // which is genuinely ephemeral (gone on the next `pnpm supabase:reset`, or
  // never persisted at all in CI). The Clerk user is NOT — the dev instance
  // is a shared external service, so it outlives every local reset and every
  // CI job. Deletion happens in `auth.teardown.ts`, wired as this project's
  // `teardown` in playwright.config.ts, which Playwright runs after every
  // dependent test finishes (pass or fail) rather than immediately after
  // this file, so it never touches a session still in use.
});
