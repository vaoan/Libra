import { describe, expect, it, vi } from "vitest";

// Real repro of the fix-round-1 regression: make Clerk user creation succeed
// and the profile RPC reject, then assert the Clerk user was already
// registered (and therefore drainable) by the time createTestUser's promise
// rejects. This is the behavioural counterpart to
// apps/auth/e2e/fixtures/autoCleanup.spec.ts's profile-less drain case: that
// spec proves drainTestUsers branches correctly once a profile-less entry
// exists; this test proves createTestUser actually produces one instead of
// throwing before anything is registered.
const createUserMock = vi.fn(async () => ({ id: "user_ordering_test" }));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      createUser: createUserMock,
      deleteUser: vi.fn(async () => {}),
    },
    sessions: {
      createSession: vi.fn(async () => ({ id: "sess_ordering_test" })),
      getToken: vi.fn(async () => ({ jwt: "unused" })),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: vi.fn(async () => ({
      data: null,
      error: { message: "boom: profile RPC rejected" },
    })),
  }),
}));

describe("createTestUser registration ordering", () => {
  it("registers the Clerk user before the profile RPC can throw", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    process.env.CLERK_SECRET_KEY ??= "test-clerk-secret-key";

    const { createTestUser } = await import("../e2e/helpers/session");
    const { listRegisteredTestUsers } =
      await import("../e2e/helpers/userRegistry");

    await expect(createTestUser("ordering-check")).rejects.toThrow(
      /Failed to create profile/,
    );

    const registered = listRegisteredTestUsers();
    expect(registered).toHaveLength(1);
    const [entry] = registered;
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      clerkUserId: "user_ordering_test",
    });
    // Never got a profile id, because the RPC rejected before attachProfileId
    // could run -- this is the profile-less shape drainTestUsers falls back
    // to deleteClerkUserBySub for.
    expect(entry?.userId).toBeUndefined();
  });
});
