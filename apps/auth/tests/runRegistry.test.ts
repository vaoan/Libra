import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    delete process.env.E2E_RUN_FAILURES_FILE;
    vi.unstubAllGlobals();
  });

  it("is a no-op without E2E_RUN_ID", async () => {
    const { registerRow, currentRunId, runScopedToken, runScopedEmail } =
      await load();
    expect(currentRunId()).toBeUndefined();
    await registerRow("products", "p1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runScopedToken()).toMatch(/^\d{13}$/);
    expect(runScopedEmail("buyer")).toMatch(
      /^e2e-buyer-\d{13}\+clerk_test@example\.com$/,
    );
  });

  it("posts one e2e_run_rows row per registration with the run id", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({ ok: true, status: 201, text: async () => "" });
    const { registerRow, runScopedToken } = await load();
    await registerRow("products", "p1");
    // Unique per call inside a run (base36 ms, 8 chars), and still ending in
    // the run id so the email pattern (`-<run_id>+clerk_test@`) keeps matching.
    expect(runScopedToken()).toMatch(new RegExp(`^[0-9a-z]{8}-${RUN}$`));
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

  it("appends each failure to E2E_RUN_FAILURES_FILE so the runner can read it", async () => {
    process.env.E2E_RUN_ID = RUN;
    const dir = mkdtempSync(join(tmpdir(), "e2e-fail-"));
    process.env.E2E_RUN_FAILURES_FILE = join(dir, "failures.log");
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });
    const { registerRow } = await load();
    await registerRow("orders", "o1");
    await registerRow("products", "p1");
    expect(
      readFileSync(process.env.E2E_RUN_FAILURES_FILE, "utf8")
        .trim()
        .split("\n"),
    ).toEqual(["orders/o1: HTTP 500 boom", "products/p1: HTTP 500 boom"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("ensureRunRegistered throws when e2e_runs has no row for the run id", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "[]",
      json: async () => [],
    });
    const { ensureRunRegistered } = await load();
    await expect(ensureRunRegistered()).rejects.toThrow(/no e2e_runs row/);
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe(
      `http://localhost:54321/rest/v1/e2e_runs?select=run_id&run_id=eq.${RUN}`,
    );
  });

  it("ensureRunRegistered passes once, then caches", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ run_id: RUN }]),
      json: async () => [{ run_id: RUN }],
    });
    const { ensureRunRegistered } = await load();
    await ensureRunRegistered();
    await ensureRunRegistered();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("ensureRunRegistered is a no-op without a run id", async () => {
    const { ensureRunRegistered } = await load();
    await expect(ensureRunRegistered()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Clerk rejects an address whose local part exceeds 64 characters with a
  // bare 422. With `<Date.now()>-<run_id>` in the token, any label of 13+
  // characters did exactly that in production (permission-management and
  // receipt-delegate-flow, CI run e2e-20260928-0356-7305).
  it("runScopedEmail keeps the local part within 64 characters inside a run, run id last", async () => {
    process.env.E2E_RUN_ID = RUN;
    const { runScopedEmail } = await load();
    const email = runScopedEmail("delegated-reports-delegate");
    const [local = "", domain] = email.split("@");
    expect(domain).toBe("example.com");
    expect(local.length).toBeLessThanOrEqual(64);
    expect(local).toMatch(
      new RegExp(`^e2e-delegated-reports-[0-9a-z]{8}-${RUN}[+]clerk_test$`),
    );
  });

  it("runScopedEmail without a label still carries the run id", async () => {
    process.env.E2E_RUN_ID = RUN;
    const { runScopedEmail } = await load();
    expect(runScopedEmail()).toMatch(
      new RegExp(`^e2e-[0-9a-z]{8}-${RUN}[+]clerk_test@example[.]com$`),
    );
  });
});
