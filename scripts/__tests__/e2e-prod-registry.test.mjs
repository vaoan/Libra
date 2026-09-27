import { describe, expect, it, vi } from "vitest";

import { createRegistry } from "../lib/e2e-prod-registry.mjs";

const RUN = "e2e-20260927-1930-a3f1";

function ok(body = [], status = 200) {
  return {
    ok: status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function registry(fetchImpl) {
  return createRegistry({
    supabaseUrl: "https://db.example.com",
    serviceRoleKey: "srk",
    clerkSecretKey: "sk_live_x",
    fetchImpl,
  });
}

describe("e2e-prod-registry", () => {
  it("creates a run row with status running", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ run_id: RUN }], 201));
    await registry(fetchImpl).createRun({
      runId: RUN,
      operator: "me@example.com",
      gitSha: "abc1234",
      imageTag: "ghcr.io/x/y:abc1234-testids",
      baseUrl: "https://store.furrycolombia.com",
      apps: ["auth"],
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://db.example.com/rest/v1/e2e_runs");
    expect(JSON.parse(init.body)).toMatchObject({
      run_id: RUN,
      status: "running",
    });
    expect(init.headers.apikey).toBe("srk");
  });

  it("finishRun patches status, finished_at and notes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([], 204));
    await registry(fetchImpl).finishRun(RUN, "failed", "2 leftovers");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://db.example.com/rest/v1/e2e_runs?run_id=eq.${RUN}`,
    );
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.status).toBe("failed");
    expect(body.notes).toBe("2 leftovers");
    expect(typeof body.finished_at).toBe("string");
  });

  it("lists clerk users across pages", async () => {
    const page = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: `user_${i}`,
        email_addresses: [
          { id: "e", email_address: `e2e-x-${RUN}+clerk_test@example.com` },
        ],
        primary_email_address_id: "e",
        created_at: 1,
      }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok(page(100)))
      .mockResolvedValueOnce(ok(page(3)));
    const users = await registry(fetchImpl).listClerkUsers();
    expect(users).toHaveLength(103);
    expect(users[0].email).toBe(`e2e-x-${RUN}+clerk_test@example.com`);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.clerk.com/v1/users?limit=100&offset=0",
    );
  });

  it("executePlan in dry-run issues no request and counts what it would delete", async () => {
    const fetchImpl = vi.fn();
    const result = await registry(fetchImpl).executePlan(
      [
        { kind: "storage", ids: ["order_1"] },
        { kind: "orders", ids: ["order_1"] },
        { kind: "rows", ids: ["user_permissions:perm_1"] },
        { kind: "products", ids: ["prod_1"] },
        { kind: "profiles", ids: ["prof_1"] },
        { kind: "clerk", ids: ["user_1"] },
      ],
      { dryRun: true },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.deleted).toEqual({
      storage: 1,
      orders: 1,
      rows: 1,
      products: 1,
      profiles: 1,
      clerk: 1,
    });
  });

  it("executePlan tolerates a row already gone and reports real failures", async () => {
    const fetchImpl = vi
      .fn()
      // storage list (empty prefix → nothing to delete)
      .mockResolvedValueOnce(ok([]))
      // orders delete → 200 (PostgREST returns 200 with an empty array when nothing matched)
      .mockResolvedValueOnce(ok([]))
      // products delete → 500
      .mockResolvedValueOnce(ok({ message: "boom" }, 500))
      // profiles delete → 200
      .mockResolvedValueOnce(ok([]))
      // clerk delete → 404 (already deleted)
      .mockResolvedValueOnce(ok({}, 404));
    const result = await registry(fetchImpl).executePlan(
      [
        { kind: "storage", ids: ["order_1"] },
        { kind: "orders", ids: ["order_1"] },
        { kind: "rows", ids: [] },
        { kind: "products", ids: ["prod_1"] },
        { kind: "profiles", ids: ["prof_1"] },
        { kind: "clerk", ids: ["user_1"] },
      ],
      { dryRun: false },
    );
    expect(result.failures).toEqual(["products prod_1: HTTP 500"]);
    expect(result.deleted.clerk).toBe(1);
  });
});
