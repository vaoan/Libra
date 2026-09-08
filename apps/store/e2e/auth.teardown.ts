import fs from "node:fs";
import path from "node:path";

import { test as teardown } from "@playwright/test";

import { assertNotProductionClerk } from "../../auth/e2e/helpers/guardEnv";

const AUTH_FILE = "e2e/.auth/session.json";
const USER_FILE = path.join(path.dirname(AUTH_FILE), "user.json");
const PRODUCT_FILE = path.join(path.dirname(AUTH_FILE), "product.json");

teardown("delete the throwaway Clerk user", async () => {
  // Nothing to clean up if setup never got far enough to write this file
  // (e.g. it failed before creating the Clerk user).
  if (!fs.existsSync(USER_FILE)) return;

  const { clerkUserId } = JSON.parse(fs.readFileSync(USER_FILE, "utf-8")) as {
    clerkUserId?: string;
  };
  if (!clerkUserId) return;

  const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
  if (!CLERK_SECRET_KEY)
    throw new Error(
      "CLERK_SECRET_KEY is not set. Ensure the correct .env.* file is loaded.",
    );
  assertNotProductionClerk(CLERK_SECRET_KEY);

  const { createClerkClient } = await import("@clerk/backend");
  const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

  // Clerk's dev instance is a shared external service, not per-run
  // infrastructure — without this, every E2E run (locally or in CI) leaks a
  // user permanently. Deleting here rather than in auth.setup.ts matters:
  // this project runs only after every dependent test has finished (pass or
  // fail), so the session those tests used is never invalidated mid-run.
  await clerkClient.users.deleteUser(clerkUserId);
});

teardown("delete the seeded product", async () => {
  if (!fs.existsSync(PRODUCT_FILE)) return;

  const { id } = JSON.parse(fs.readFileSync(PRODUCT_FILE, "utf-8")) as {
    id?: string;
  };
  if (!id) return;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;

  // The local Docker stack is ephemeral, but CI reuses one database across
  // every app's project, so a row left behind here outlives the run that made
  // it. Own cleanup for own fixtures.
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await supabase.from("products").delete().eq("id", id);

  fs.rmSync(PRODUCT_FILE, { force: true });
});
