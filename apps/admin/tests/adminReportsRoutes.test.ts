import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("api/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

const ADMIN_ID = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13";
const ok = (json: unknown) =>
  ({ ok: true, json: async () => json }) as Response;

const grantRow = (key: string) => ({
  expires_at: null,
  mode: "grant",
  resource_permission_id: `${key}-rp`,
  resource_permissions: { permissions: { key } },
});

async function loadRoutes(signedIn = true) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  vi.resetModules();

  const orders = await import("@/app/api/admin/reports/orders/route");
  const exportRoute = await import("@/app/api/admin/reports/export/route");
  const supabaseModule = await import("api/supabase/server");

  vi.mocked(supabaseModule.createServerSupabaseClient).mockResolvedValue({
    rpc: vi
      .fn()
      .mockResolvedValue({ data: signedIn ? ADMIN_ID : null, error: null }),
  } as unknown as Awaited<
    ReturnType<typeof supabaseModule.createServerSupabaseClient>
  >);

  return { orders: orders.GET, exportReport: exportRoute.GET };
}

const request = (qs = "") =>
  new Request(`http://localhost/api/admin/reports/orders?${qs}`);

function mockCallerPermissions(...keys: string[]) {
  vi.mocked(fetch).mockResolvedValueOnce(ok(keys.map((k) => grantRow(k))));
}

describe("admin report routes", () => {
  // The first import transforms two Next route modules and their dependency
  // graph, which on a cold machine takes longer than the 10 s test budget and
  // failed the first case (and, by leaving the mock registry half-built, the
  // second) in the pre-push run. Pay that cost once here, outside any test's
  // clock; loadRoutes()'s per-test re-imports then hit the transform cache.
  beforeAll(async () => {
    await import("@/app/api/admin/reports/orders/route");
    await import("@/app/api/admin/reports/export/route");
  }, 120_000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  describe("reports/orders", () => {
    it("refuses a caller without admin.reports", async () => {
      const { orders } = await loadRoutes();
      mockCallerPermissions("orders.approve");

      expect((await orders(request())).status).toBe(403);
    });

    it("refuses a caller with no session", async () => {
      const { orders } = await loadRoutes(false);
      expect((await orders(request())).status).toBe(403);
    });

    it("returns an empty result without asking for order lines", async () => {
      const { orders } = await loadRoutes();
      mockCallerPermissions("admin.reports");
      vi.mocked(fetch).mockResolvedValueOnce(ok([]));

      const response = await orders(request());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ orders: [], total: 0 });
      // permissions + orders only: no follow-up for items or profiles.
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("passes validated filters through to the query", async () => {
      const { orders } = await loadRoutes();
      mockCallerPermissions("admin.reports");
      vi.mocked(fetch).mockResolvedValueOnce(ok([]));

      await orders(
        request(
          "dateFrom=2026-01-01&dateTo=2026-01-31&amountMin=10&amountMax=100",
        ),
      );

      const url = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]);
      expect(url).toContain("created_at=gte.2026-01-01");
      expect(url).toContain("total=gte.10");
      // Both ceilings ride in ONE and= group. Emitting a group each -- the bug
      // fixed in #405 -- makes PostgREST keep the first and silently drop the
      // rest, which dropped the amount ceiling.
      expect(url).toContain(
        "and=%28created_at.lt.2026-02-01%2Ctotal.lte.100%29",
      );
    });
  });

  describe("reports/export", () => {
    it("refuses a caller without admin.reports", async () => {
      const { exportReport } = await loadRoutes();
      mockCallerPermissions("orders.approve");

      expect((await exportReport(request())).status).toBe(403);
    });

    it("returns a spreadsheet when there are no orders", async () => {
      const { exportReport } = await loadRoutes();
      mockCallerPermissions("admin.reports");
      vi.mocked(fetch).mockResolvedValueOnce(ok([]));

      const response = await exportReport(request());

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("spreadsheet");
      expect(response.headers.get("Content-Disposition")).toContain(".xlsx");
    });
  });
});
