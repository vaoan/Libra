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

  it("profilesForRun unions registered ids with profiles whose email carries the run id", async () => {
    const fetchImpl = vi
      .fn()
      // registered profile ids
      .mockResolvedValueOnce(ok([{ row_id: "prof_reg" }]))
      // profiles found by email (one overlaps, one was never registered)
      .mockResolvedValueOnce(ok([{ id: "prof_reg" }, { id: "prof_orphan" }]));
    const profiles = await registry(fetchImpl).profilesForRun(RUN);
    expect(profiles.map((p) => p.id).sort()).toEqual([
      "prof_orphan",
      "prof_reg",
    ]);
    const emailQuery = decodeURIComponent(fetchImpl.mock.calls[1][0]);
    expect(emailQuery).toContain(
      "user_profiles?select=id&email=like.*-" + RUN + "+clerk_test@example.com",
    );
  });

  it("unclaimedProfiles lists e2e profiles whose run id is not a known run", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      ok([
        { id: "p1", email: `e2e-a-${RUN}+clerk_test@example.com` },
        {
          id: "p2",
          email: "e2e-b-e2e-20260927-1800-0000+clerk_test@example.com",
        },
        { id: "p3", email: "e2e-c-1727000000000+clerk_test@example.com" },
      ]),
    );
    const orphans = await registry(fetchImpl).unclaimedProfiles(new Set([RUN]));
    expect(orphans.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("a failed storage listing is a recorded failure, not an empty prefix", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok({ message: "nope" }, 500));
    const result = await registry(fetchImpl).executePlan(
      [{ kind: "storage", ids: ["order_1"] }],
      { dryRun: false },
    );
    expect(result.failures).toEqual(["storage order_1: HTTP 500"]);
    expect(result.deleted.storage).toBe(0);
  });

  it("ordersForProfiles asks for orders placed by OR sold by the profiles", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([]));
    await registry(fetchImpl).ordersForProfiles(["p1", "p2"]);
    const url = decodeURIComponent(fetchImpl.mock.calls[0][0]);
    expect(url).toContain(
      'orders?select=id,user_id,seller_id&or=(user_id.in.("p1","p2"),seller_id.in.("p1","p2"))',
    );
  });

  it("executePlan deletes grants by granted_by", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok([]));
    const result = await registry(fetchImpl).executePlan(
      [{ kind: "grants", ids: ["prof_a"] }],
      { dryRun: false },
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://db.example.com/rest/v1/user_permissions?granted_by=eq.prof_a",
    );
    expect(fetchImpl.mock.calls[0][1].method).toBe("DELETE");
    expect(result.deleted.grants).toBe(1);
  });
});
