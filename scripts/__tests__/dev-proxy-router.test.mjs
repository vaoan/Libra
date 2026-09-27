/**
 * Tests for scripts/lib/dev-proxy-router.mjs — longest-prefix routing that
 * mirrors docker/prod/nginx.conf.
 */
import { describe, expect, it } from "vitest";

import { buildRoutes, matchRoute } from "../lib/dev-proxy-router.mjs";

const registry = {
  landing: { envKey: "NEXT_PUBLIC_LANDING_URL", path: "/", port: 5004 },
  store: { envKey: "NEXT_PUBLIC_STORE_URL", path: "/store", port: 5001 },
  auth: { envKey: "NEXT_PUBLIC_AUTH_URL", path: "/auth", port: 5000 },
};
const routes = buildRoutes(registry);

describe("buildRoutes", () => {
  it("puts the root route last so prefixes win", () => {
    expect(routes.at(-1)).toMatchObject({ app: "landing", path: "/" });
  });

  it("carries app, path and port", () => {
    expect(routes.find((r) => r.app === "store")).toEqual({
      app: "store",
      path: "/store",
      port: 5001,
    });
  });
});

describe("matchRoute", () => {
  it("routes the bare prefix", () => {
    expect(matchRoute(routes, "/store").app).toBe("store");
  });

  it("routes a nested path under the prefix", () => {
    expect(matchRoute(routes, "/store/en/products/1").app).toBe("store");
  });

  it("routes the HMR websocket path under the prefix", () => {
    expect(matchRoute(routes, "/store/_next/webpack-hmr").app).toBe("store");
  });

  it("ignores the query string", () => {
    expect(matchRoute(routes, "/auth/en/login?returnTo=/store/en").app).toBe(
      "auth",
    );
  });

  it("sends a path that only shares letters with a prefix to landing", () => {
    expect(matchRoute(routes, "/storefront").app).toBe("landing");
    expect(matchRoute(routes, "/authors/1").app).toBe("landing");
  });

  it("sends the root and unknown paths to landing", () => {
    expect(matchRoute(routes, "/").app).toBe("landing");
    expect(matchRoute(routes, "/en/legal").app).toBe("landing");
  });
});
