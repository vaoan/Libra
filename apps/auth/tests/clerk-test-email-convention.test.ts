import { describe, expect, it, vi } from "vitest";

import { assertNotProductionClerk } from "../e2e/helpers/guardEnv";

describe("assertNotProductionClerk", () => {
  it("throws on a live secret key", () => {
    expect(() => assertNotProductionClerk("sk_live_abc123")).toThrow(
      /production Clerk instance/i,
    );
  });

  it("allows a test secret key", () => {
    expect(() => assertNotProductionClerk("sk_test_abc123")).not.toThrow();
  });
});

// The assertion below must exercise the REAL template in
// apps/auth/e2e/helpers/session.ts's createTestUser, not a copy of it built
// here -- a copy can silently drift from the real implementation and stay
// green while the real template regresses, which is exactly the bug class
// this guard exists to catch. Mirrors the mocking harness proven in
// createTestUserOrdering.test.ts: mock @clerk/backend and
// @supabase/supabase-js, then drive the real createTestUser and inspect
// what it actually produced, instead of asserting against a hand-written
// literal string.
const createUserMock = vi.fn(async (args: { emailAddress: string[] }) => ({
  id: "user_convention_test",
  emailAddresses: args.emailAddress,
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      createUser: createUserMock,
      deleteUser: vi.fn(async () => {}),
    },
    sessions: {
      createSession: vi.fn(async () => ({ id: "sess_convention_test" })),
      getToken: vi.fn(async () => ({ jwt: "unused" })),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: vi.fn(async () => ({
      data: { id: "profile_convention_test" },
      error: null,
    })),
  }),
}));

describe("test email convention", () => {
  it("createTestUser's real template carries +clerk_test", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    process.env.CLERK_SECRET_KEY ??= "test-clerk-secret-key";

    const { createTestUser } = await import("../e2e/helpers/session");

    const user = await createTestUser("convention-check");

    // Confirms the email actually flowed through to Clerk's createUser call,
    // not just into the returned object.
    expect(createUserMock).toHaveBeenCalledTimes(1);
    const [args] = createUserMock.mock.calls[0]!;
    expect(args.emailAddress[0]).toBe(user.email);

    expect(user.email).toMatch(/\+clerk_test@example\.com$/);
  });
});
