/**
 * Property-based tests for appUrls.ts
 * Feature: app-navigation-origins
 *
 * Uses fast-check to verify URL derivation properties hold across all valid inputs.
 * Each property runs a minimum of 100 iterations.
 */
import * as fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

// All app names and their expected path segments (from app-links.json)
const APP_PATHS: Record<string, string> = {
  landing: "/",
  store: "/store",
  studio: "/studio",
  payments: "/payments",
  admin: "/admin",
  auth: "/auth",
};

/** Clear all app-URL env vars so the module falls back to defaults. */
function clearAppUrlEnvVars() {
  vi.stubEnv("NEXT_PUBLIC_LANDING_URL", "");
  vi.stubEnv("NEXT_PUBLIC_STORE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_STUDIO_URL", "");
  vi.stubEnv("NEXT_PUBLIC_PAYMENTS_URL", "");
  vi.stubEnv("NEXT_PUBLIC_ADMIN_URL", "");
  vi.stubEnv("NEXT_PUBLIC_AUTH_URL", "");
}

async function importFreshAppUrls() {
  vi.resetModules();
  const mod = await import("@shared/config/appUrls");
  return mod.appUrls;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Arbitrary that generates valid HTTP/HTTPS origins:
 * scheme + host (+ optional port), no trailing slash.
 * Pattern: http(s)://[a-z][a-z0-9-]*(.[a-z][a-z0-9-]*)*(:[0-9]{1,5})?
 */
const hostnameLabel = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

const validOriginArb = fc
  .tuple(
    fc.constantFrom("http", "https"),
    // hostname: one or more dot-separated labels
    fc
      .array(hostnameLabel, { minLength: 1, maxLength: 3 })
      .map((labels) => labels.join(".")),
    // optional port
    fc.option(fc.integer({ min: 1, max: 65_535 }), { nil: null }),
  )
  .map(([scheme, host, port]) =>
    port === null ? `${scheme}://${host}` : `${scheme}://${host}:${port}`,
  );

describe("Feature: app-navigation-origins, Property 1: explicit NEXT_PUBLIC app URLs are passed through in production", () => {
  it("for any valid origin in production, landing and store return the explicit env values", async () => {
    await fc.assert(
      fc.asyncProperty(validOriginArb, async (origin) => {
        vi.stubEnv("NODE_ENV", "production");
        clearAppUrlEnvVars();
        vi.stubEnv("NEXT_PUBLIC_LANDING_URL", origin);
        vi.stubEnv("NEXT_PUBLIC_STORE_URL", `${origin}/store`);

        const appUrls = await importFreshAppUrls();
        expect(appUrls.landing).toBe(origin);
        expect(appUrls.store).toBe(`${origin}/store`);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: app-navigation-origins, Property 2: relative production defaults are stable", () => {
  it("with no explicit app URLs in production, every app resolves to its relative path", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        vi.stubEnv("NODE_ENV", "production");
        clearAppUrlEnvVars();

        const appUrls = await importFreshAppUrls();

        for (const [app, path] of Object.entries(APP_PATHS)) {
          expect(appUrls[app as keyof typeof appUrls]).toBe(path);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Feature: app-navigation-origins, Property 3: deprecated APP_PUBLIC_ORIGIN is ignored", () => {
  it("for any APP_PUBLIC_ORIGIN value in production, output equals output with APP_PUBLIC_ORIGIN unset", async () => {
    await fc.assert(
      fc.asyncProperty(validOriginArb, async (origin) => {
        clearAppUrlEnvVars();
        vi.stubEnv("NODE_ENV", "production");

        vi.stubEnv("APP_PUBLIC_ORIGIN", origin);
        const urlsWithOrigin = await importFreshAppUrls();

        vi.stubEnv("APP_PUBLIC_ORIGIN", "");
        const urlsWithoutOrigin = await importFreshAppUrls();

        expect(urlsWithOrigin).toEqual(urlsWithoutOrigin);
      }),
      { numRuns: 100 },
    );
  });
});
