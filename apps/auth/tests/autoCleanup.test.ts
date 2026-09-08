import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  drainTestUsers,
  listRegisteredTestUsers,
  registerClerkUser,
  registerTestUser,
} from "../e2e/helpers/userRegistry";
import type { TestUser } from "../e2e/helpers/session";

// This was originally a Playwright spec (apps/auth/e2e/fixtures/autoCleanup.spec.ts).
// It certified the registry that every other E2E spec relies on for cleanup,
// but Playwright collected it as a normal spec in the same worker process as
// the real E2E suite, sharing the same module-level registry (userRegistry.ts).
// By the time it ran, real specs had already registered live users nothing
// had deleted yet, so `toHaveLength(2)` failed against the real count, and
// this file's own stub-deleter drain call spliced out (and thereby "lost")
// those real entries -- leaking live Clerk users instead of testing anything.
// Moved here so it runs in vitest's isolated module graph, alongside the
// registration-ordering regression test in createTestUserOrdering.test.ts.
const fakeUser = (id: string): TestUser => ({
  userId: id,
  email: `e2e-${id}+clerk_test@example.com`,
  clerkUserId: `user_${id}`,
  accessToken: "not-used",
});

// The registry is a module-level singleton (see userRegistry.ts), shared by
// every test in this file. Drain it defensively before and after each case
// with no-op deleters, so a prior failure -- or the run order itself -- can
// never leak entries from one test into the next.
async function resetRegistry(): Promise<void> {
  await drainTestUsers({
    deleter: async () => {},
    clerkDeleter: async () => {},
  });
}

beforeEach(resetRegistry);
afterEach(resetRegistry);

describe("test user registry", () => {
  it("registry accumulates and drains", async () => {
    registerTestUser(fakeUser("a"));
    registerTestUser(fakeUser("b"));
    expect(listRegisteredTestUsers()).toHaveLength(2);

    const drained = await drainTestUsers({ deleter: async () => {} });

    expect(drained).toBe(2);
    expect(listRegisteredTestUsers()).toHaveLength(0);
  });

  it("drain continues past a failing deletion", async () => {
    registerTestUser(fakeUser("a"));
    registerTestUser(fakeUser("b"));

    const drained = await drainTestUsers({
      deleter: async (u) => {
        if (u.userId === "a") throw new Error("boom");
      },
    });

    expect(drained).toBe(2);
    expect(listRegisteredTestUsers()).toHaveLength(0);
  });

  // Regression test for the finding in fix round 1: registration used to
  // happen only once the full TestUser was assembled, after the profile RPC,
  // permission grants, and session/token minting had all already succeeded.
  // A throw anywhere in that window (the RPC failing, as it did on the local
  // stack with user_permissions_granted_by_fkey, is a real example) left the
  // just-created Clerk user unregistered and therefore un-drainable -- exactly
  // the "throws inside beforeAll" leak this task exists to close. A
  // profile-less entry (created via registerClerkUser, the way createTestUser
  // registers before the profile RPC runs) must still have its Clerk user
  // deleted by drain, via the clerkDeleter fallback, without ever calling the
  // profile deleter.
  it("drains a profile-less entry via the Clerk-only fallback", async () => {
    registerClerkUser({
      clerkUserId: "user_c",
      email: "e2e-c+clerk_test@example.com",
    });
    expect(listRegisteredTestUsers()).toEqual([
      { clerkUserId: "user_c", email: "e2e-c+clerk_test@example.com" },
    ]);

    let profileDeleterCalled = false;
    const deletedClerkIds: string[] = [];

    const drained = await drainTestUsers({
      deleter: async () => {
        profileDeleterCalled = true;
      },
      clerkDeleter: async (clerkUserId) => {
        deletedClerkIds.push(clerkUserId);
      },
    });

    expect(drained).toBe(1);
    expect(deletedClerkIds).toEqual(["user_c"]);
    expect(profileDeleterCalled).toBe(false);
    expect(listRegisteredTestUsers()).toHaveLength(0);
  });
});
