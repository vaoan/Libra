/**
 * Tests for scripts/lib/app-registry.mjs — the single routing registry.
 */
import { describe, expect, it } from "vitest";

import {
  devUrlForApp,
  loadAppRegistry,
  portForApp,
} from "../lib/app-registry.mjs";

const fixture = {
  landing: { envKey: "NEXT_PUBLIC_LANDING_URL", path: "/", port: 5004 },
  store: { envKey: "NEXT_PUBLIC_STORE_URL", path: "/store", port: 5001 },
};

describe("loadAppRegistry (real config/app-links.json)", () => {
  const registry = loadAppRegistry();
  const entries = Object.entries(registry);

  it("registers the six apps", () => {
    expect(Object.keys(registry).sort()).toEqual([
      "admin",
      "auth",
      "landing",
      "payments",
      "store",
      "studio",
    ]);
  });

  it("gives every app an envKey, a root-relative path and a valid port", () => {
    for (const [app, entry] of entries) {
      expect(entry.envKey, app).toMatch(/^NEXT_PUBLIC_[A-Z_]+_URL$/);
      expect(entry.path, app).toMatch(/^\/[a-z-]*$/);
      expect(Number.isInteger(entry.port), app).toBe(true);
      expect(entry.port, app).toBeGreaterThan(0);
      expect(entry.port, app).toBeLessThanOrEqual(65_535);
    }
  });

  it("has no duplicate paths or ports", () => {
    const paths = entries.map(([, e]) => e.path);
    const ports = entries.map(([, e]) => e.port);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("has exactly one root app", () => {
    expect(entries.filter(([, e]) => e.path === "/")).toHaveLength(1);
  });

  it("no longer carries devUrl", () => {
    for (const [app, entry] of entries) {
      expect(entry, app).not.toHaveProperty("devUrl");
    }
  });
});

describe("portForApp", () => {
  it("returns the registered port", () => {
    expect(portForApp(fixture, "store")).toBe(5001);
  });

  it("throws naming the app when it is not registered", () => {
    expect(() => portForApp(fixture, "billing")).toThrow(
      /"billing" is not registered in config\/app-links\.json/,
    );
  });
});

describe("devUrlForApp", () => {
  it("returns the bare origin for the root app", () => {
    expect(devUrlForApp(fixture, "landing", 5050)).toBe(
      "http://localhost:5050",
    );
  });

  it("appends the path for a prefixed app", () => {
    expect(devUrlForApp(fixture, "store", 5050)).toBe(
      "http://localhost:5050/store",
    );
  });

  it("throws naming the app when it is not registered", () => {
    expect(() => devUrlForApp(fixture, "billing", 5050)).toThrow(/billing/);
  });
});
