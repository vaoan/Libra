import { describe, expect, it } from "vitest";

import {
  auditVerdict,
  buildPrunePlan,
  hasTestIdMarker,
  probeTestIds,
  runIdFromEmail,
} from "../lib/e2e-prod-plan.mjs";

const RUN = "e2e-20260927-1930-a3f1";
const OTHER = "e2e-20260927-1800-0000";

const base = {
  runId: RUN,
  rows: [
    { table_name: "clerk_users", row_id: "user_a" },
    { table_name: "user_profiles", row_id: "prof_a" },
    { table_name: "products", row_id: "prod_1" },
    { table_name: "storage:receipts", row_id: "order_1" },
    { table_name: "user_permissions", row_id: "perm_1" },
  ],
  profiles: [{ id: "prof_a" }],
  orders: [{ id: "order_1", user_id: "prof_a" }],
  products: [
    { id: "prod_1", seller_id: "prof_a", slug: `e2e-${RUN}-x` },
    { id: "prod_ui", seller_id: "prof_a", slug: "ui-main-1" },
  ],
  clerkUsers: [
    { id: "user_a", email: `e2e-buyer-${RUN}+clerk_test@example.com` },
    { id: "user_other", email: `e2e-buyer-${OTHER}+clerk_test@example.com` },
    { id: "user_real", email: "someone@gmail.com" },
    { id: "user_orphan", email: `e2e-seller-${RUN}+clerk_test@example.com` },
  ],
};

describe("buildPrunePlan", () => {
  it("orders the steps storage → orders → rows → products → grants → profiles → clerk", () => {
    expect(buildPrunePlan(base).map((s) => s.kind)).toEqual([
      "storage",
      "orders",
      "rows",
      "products",
      "grants",
      "profiles",
      "clerk",
    ]);
  });

  it("sweeps permission grants made by the run's users before deleting them", () => {
    // user_permissions.granted_by has no cascade: an E2E admin that granted a
    // permission cannot be deleted while the grant exists (production run
    // e2e-20260928-0118-9dd0 left 8 profiles behind this way).
    const grants = buildPrunePlan(base).find((s) => s.kind === "grants");
    expect(grants.ids).toEqual(["prof_a"]);
  });

  it("includes orders sold by the run's users, not only orders they placed", () => {
    const plan = buildPrunePlan({
      ...base,
      orders: [
        { id: "order_1", user_id: "prof_a", seller_id: "real" },
        { id: "order_sold", user_id: "real_buyer", seller_id: "prof_a" },
        { id: "order_real", user_id: "real_buyer", seller_id: "real" },
      ],
    });
    expect(plan.find((s) => s.kind === "orders").ids.sort()).toEqual([
      "order_1",
      "order_sold",
    ]);
  });

  it("deletes receipts for registered prefixes and for the run's orders, once", () => {
    const storage = buildPrunePlan(base).find((s) => s.kind === "storage");
    expect(storage.ids).toEqual(["order_1"]);
  });

  it("deletes products owned by the run's sellers even when the UI created them", () => {
    const products = buildPrunePlan(base).find((s) => s.kind === "products");
    expect(products.ids.sort()).toEqual(["prod_1", "prod_ui"]);
  });

  it("skips registered rows already covered by cascade or by a later step", () => {
    const rows = buildPrunePlan(base).find((s) => s.kind === "rows");
    // user_permissions cascades from user_profiles; products, profiles and
    // clerk users have their own steps; storage has its own step.
    expect(rows.ids).toEqual([]);
  });

  it("includes a clerk user with no profile when its email carries the run id", () => {
    const clerk = buildPrunePlan(base).find((s) => s.kind === "clerk");
    expect(clerk.ids.sort()).toEqual(["user_a", "user_orphan"]);
  });

  it("never touches another run's user or a real user", () => {
    const clerk = buildPrunePlan(base).find((s) => s.kind === "clerk");
    expect(clerk.ids).not.toContain("user_other");
    expect(clerk.ids).not.toContain("user_real");
  });

  it("refuses a malformed run id", () => {
    expect(() => buildPrunePlan({ ...base, runId: "e2e-%" })).toThrow(
      /not a run id/,
    );
  });
});

describe("runIdFromEmail", () => {
  it("reads the run id and rejects timestamps", () => {
    expect(runIdFromEmail(`e2e-x-${RUN}+clerk_test@example.com`)).toBe(RUN);
    expect(
      runIdFromEmail("e2e-x-1727000000000+clerk_test@example.com"),
    ).toBeNull();
    expect(runIdFromEmail("someone@gmail.com")).toBeNull();
  });
});

describe("auditVerdict", () => {
  const clean = {
    runs: [{ status: "passed", leftover_rows: 0 }],
    unclaimedUsers: 0,
    unclaimedProfiles: 0,
    testIds: false,
  };
  it("is clean only when nothing is off", () => {
    expect(auditVerdict(clean)).toEqual({ dirty: false, reasons: [] });
  });
  it("flags a running run, leftovers, unclaimed users or profiles, live test ids, and an unknown site", () => {
    expect(
      auditVerdict({
        ...clean,
        runs: [{ status: "running", leftover_rows: 0 }],
      }).reasons,
    ).toEqual(["a run is still running"]);
    expect(
      auditVerdict({ ...clean, runs: [{ status: "failed", leftover_rows: 3 }] })
        .reasons,
    ).toEqual(["3 leftover row(s) across runs"]);
    expect(auditVerdict({ ...clean, unclaimedUsers: 1 }).dirty).toBe(true);
    expect(auditVerdict({ ...clean, unclaimedProfiles: 2 }).dirty).toBe(true);
    expect(auditVerdict({ ...clean, testIds: true }).reasons).toEqual([
      "production serves test ids",
    ]);
    expect(auditVerdict({ ...clean, testIds: null }).reasons).toEqual([
      "could not read the public site",
    ]);
  });
});

describe("hasTestIdMarker", () => {
  it("ignores the theme-toggle literal the clean build always carries", () => {
    expect(hasTestIdMarker('<button data-testid="theme-toggle">')).toBe(false);
  });
  it("recognises the tid()-emitted navigation marker", () => {
    expect(hasTestIdMarker('<nav data-testid="app-navigation">')).toBe(true);
  });
});

describe("probeTestIds", () => {
  const ok = (body) => ({ ok: true, text: async () => body });
  const down = { ok: false, text: async () => "" };
  const noSleep = async () => {};

  it("reads a clean site on the first try", async () => {
    const fetchImpl = async () => ok("<nav>clean</nav>");
    await expect(
      probeTestIds({ url: "https://x/", fetchImpl, sleep: noSleep }),
    ).resolves.toBe(false);
  });

  it("reports a test-id build", async () => {
    const fetchImpl = async () => ok('<nav data-testid="app-navigation">');
    await expect(
      probeTestIds({ url: "https://x/", fetchImpl, sleep: noSleep }),
    ).resolves.toBe(true);
  });

  // The audit runs right after the restore swaps the container; the first
  // seconds answer 502 (CI run e2e-20260928-0356-7305 read that as DIRTY).
  it("retries while the site is down and returns the eventual answer", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) throw new Error("connect ECONNREFUSED");
      if (calls === 3) return down;
      return ok("<nav>clean</nav>");
    };
    const slept = [];
    const result = await probeTestIds({
      url: "https://x/",
      fetchImpl,
      attempts: 6,
      delayMs: 5000,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(result).toBe(false);
    expect(calls).toBe(4);
    expect(slept).toEqual([5000, 5000, 5000]);
  });

  it("gives up as null after the last attempt", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return down;
    };
    await expect(
      probeTestIds({
        url: "https://x/",
        fetchImpl,
        attempts: 3,
        sleep: noSleep,
      }),
    ).resolves.toBeNull();
    expect(calls).toBe(3);
  });
});
