/**
 * Tests for scripts/lib/warm-routes.mjs — compile every route on the dev
 * servers before Playwright starts, so no test's first navigation races a
 * cold Turbopack build.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildWarmUrls,
  discoverRoutes,
  warmRoutes,
} from "../lib/warm-routes.mjs";

function makeApp(root, app, pages) {
  for (const page of pages) {
    const dir = join(root, app, "src", "app", ...page);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "page.tsx"), "export default function P(){}");
  }
}

let appsDir;
afterEach(() => {
  if (appsDir) rmSync(appsDir, { recursive: true, force: true });
});

describe("discoverRoutes", () => {
  it("maps page.tsx files to URLs, filling dynamic segments and dropping groups", () => {
    appsDir = mkdtempSync(join(tmpdir(), "warm-"));
    makeApp(appsDir, "store", [
      [],
      ["[locale]"],
      ["[locale]", "(shop)", "products", "[id]", "[[...slug]]"],
      ["[locale]", "orders", "[...rest]"],
    ]);

    expect(discoverRoutes(join(appsDir, "store", "src", "app"))).toEqual([
      "/",
      "/en",
      "/en/orders/warm-up",
      "/en/products/warm-up/warm-up",
    ]);
  });

  it("returns nothing for an app without an app directory", () => {
    appsDir = mkdtempSync(join(tmpdir(), "warm-"));
    expect(discoverRoutes(join(appsDir, "missing", "src", "app"))).toEqual([]);
  });
});

describe("buildWarmUrls", () => {
  it("prefixes each app's routes with its registry path on the proxy origin", () => {
    appsDir = mkdtempSync(join(tmpdir(), "warm-"));
    makeApp(appsDir, "landing", [["[locale]"]]);
    makeApp(appsDir, "store", [["[locale]"], ["[locale]", "products", "[id]"]]);
    const registry = {
      landing: { envKey: "NEXT_PUBLIC_LANDING_URL", path: "/", port: 5004 },
      store: { envKey: "NEXT_PUBLIC_STORE_URL", path: "/store", port: 5001 },
    };

    expect(
      buildWarmUrls({ registry, appsDir, origin: "http://localhost:5050" }),
    ).toEqual([
      "http://localhost:5050/en",
      "http://localhost:5050/store/en",
      "http://localhost:5050/store/en/products/warm-up",
    ]);
  });
});

describe("warmRoutes", () => {
  it("fetches every URL, tolerates failures, and reports status and timing", async () => {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      if (url.endsWith("/boom")) throw new Error("ECONNRESET");
      return { status: url.endsWith("/missing") ? 404 : 200 };
    };

    const results = await warmRoutes(
      ["http://x/a", "http://x/missing", "http://x/boom"],
      { fetchFn, concurrency: 2 },
    );

    expect(calls.sort()).toEqual([
      "http://x/a",
      "http://x/boom",
      "http://x/missing",
    ]);
    expect(results.map((r) => [r.url, r.status])).toEqual([
      ["http://x/a", 200],
      ["http://x/missing", 404],
      ["http://x/boom", "ECONNRESET"],
    ]);
    for (const r of results) expect(typeof r.ms).toBe("number");
  });
});
