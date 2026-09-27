import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RUN = "e2e-20260927-1930-a3f1";

async function load() {
  vi.resetModules();
  return import("../e2e/helpers/runRegistry");
}

describe("runRegistry", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    delete process.env.E2E_RUN_ID;
    vi.unstubAllGlobals();
  });

  it("is a no-op without E2E_RUN_ID", async () => {
    const { registerRow, currentRunId, runScopedToken } = await load();
    expect(currentRunId()).toBeUndefined();
    await registerRow("products", "p1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runScopedToken()).toMatch(/^\d{13}$/);
  });

  it("posts one e2e_run_rows row per registration with the run id", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({ ok: true, status: 201, text: async () => "" });
    const { registerRow, runScopedToken } = await load();
    await registerRow("products", "p1");
    expect(runScopedToken()).toBe(RUN);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("http://localhost:54321/rest/v1/e2e_run_rows");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("srk");
    expect(init.headers.Prefer).toContain("resolution=ignore-duplicates");
    expect(JSON.parse(init.body)).toEqual({
      run_id: RUN,
      table_name: "products",
      row_id: "p1",
    });
  });

  it("records a failure instead of throwing into the test", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });
    const { registerRow, registrationFailures } = await load();
    await expect(registerRow("orders", "o1")).resolves.toBeUndefined();
    expect(registrationFailures()).toEqual(["orders/o1: HTTP 500 boom"]);
  });

  it("lets a test swap the registrar", async () => {
    process.env.E2E_RUN_ID = RUN;
    const { registerRow, setRowRegistrar } = await load();
    const fake = vi.fn(async () => undefined);
    setRowRegistrar(fake);
    await registerRow("clerk_users", "user_1");
    expect(fake).toHaveBeenCalledWith("clerk_users", "user_1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
