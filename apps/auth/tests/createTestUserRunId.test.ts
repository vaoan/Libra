import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      createUser: vi.fn(async () => ({ id: "user_1" })),
      deleteUser: vi.fn(async () => {}),
    },
    sessions: {
      createSession: vi.fn(async () => ({ id: "sess_1" })),
      getToken: vi.fn(async () => ({ jwt: "dev.jwt" })),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: vi.fn(async () => ({ data: { id: "profile_1" }, error: null })),
  }),
}));

const RUN = "e2e-20260927-1930-a3f1";

describe("createTestUser inside a production run", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    process.env.CLERK_SECRET_KEY ??= "sk_test_stub";
    process.env.E2E_RUN_ID = RUN;
    process.env.E2E_PRODUCTION_ACK = RUN;
    // ensureRunRegistered() looks the run up in e2e_runs; registerRow is
    // swapped for a fake below, so this is the only fetch the helper makes.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [{ run_id: RUN }],
        text: async () => JSON.stringify([{ run_id: RUN }]),
      })),
    );
  });
  afterEach(() => {
    delete process.env.E2E_RUN_ID;
    delete process.env.E2E_PRODUCTION_ACK;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stamps the run id into the email and registers both halves of the user", async () => {
    const { setRowRegistrar } = await import("../e2e/helpers/runRegistry");
    const registered: string[] = [];
    setRowRegistrar(async (t, id) => {
      registered.push(`${t}:${id}`);
    });
    const { createTestUser } = await import("../e2e/helpers/session");

    const user = await createTestUser("buyer");

    expect(user.email).toMatch(
      new RegExp(`^e2e-buyer-[0-9a-z]{8}-${RUN}\\+clerk_test@example\\.com$`),
    );
    expect(user.accessToken).toBe("dev.jwt");
    expect(registered).toEqual([
      "clerk_users:user_1",
      "user_profiles:profile_1",
    ]);
  });
});
