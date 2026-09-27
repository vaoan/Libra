/**
 * Tests for scripts/lib/tunnel-ingress.mjs — one app hostname, three infra
 * hostnames, nothing per app.
 */
import { describe, expect, it } from "vitest";

import {
  appHostFromLandingUrl,
  buildIngressConfig,
  zoneOf,
} from "../lib/tunnel-ingress.mjs";

describe("appHostFromLandingUrl", () => {
  it("returns the hostname of the landing URL", () => {
    expect(appHostFromLandingUrl("https://store.ffxivbe.org")).toBe(
      "store.ffxivbe.org",
    );
  });

  it("throws on a non-URL", () => {
    expect(() => appHostFromLandingUrl("not a url")).toThrow();
  });
});

describe("zoneOf", () => {
  it("keeps the last two labels", () => {
    expect(zoneOf("store.ffxivbe.org")).toBe("ffxivbe.org");
    expect(zoneOf("ffxivbe.org")).toBe("ffxivbe.org");
  });
});

describe("buildIngressConfig", () => {
  const config = buildIngressConfig({
    tunnelId: "tunnel-1234",
    credentialsFile: "/home/u/.cloudflared/tunnel-1234.json",
    appHost: "store.ffxivbe.org",
    appPort: 7542,
    supabasePort: 64_321,
  });
  const hostnames = [...config.matchAll(/hostname: (\S+)/g)].map((m) => m[1]);

  it("routes exactly one app hostname, to HOST_PORT", () => {
    expect(config).toContain(
      "- hostname: store.ffxivbe.org\n    service: http://127.0.0.1:7542",
    );
    expect(hostnames.filter((h) => h.startsWith("store."))).toHaveLength(1);
  });

  it("carries no per-app hostnames", () => {
    for (const prefix of [
      "auth.",
      "admin.",
      "payments.",
      "studio.",
      "landing.",
      "www.",
    ]) {
      expect(
        hostnames.some((h) => h.startsWith(prefix)),
        prefix,
      ).toBe(false);
    }
    expect(hostnames).not.toContain("ffxivbe.org");
  });

  it("keeps the three infra hostnames on the Supabase ports", () => {
    expect(config).toContain(
      "- hostname: supabase.ffxivbe.org\n    service: http://127.0.0.1:64321",
    );
    expect(config).toContain(
      "- hostname: supabase-studio.ffxivbe.org\n    service: http://127.0.0.1:64323",
    );
    expect(config).toContain(
      "- hostname: mailpit.ffxivbe.org\n    service: http://127.0.0.1:64324",
    );
  });

  it("ends with the 404 catch-all and names the tunnel and credentials", () => {
    expect(config.trimEnd().endsWith("- service: http_status:404")).toBe(true);
    expect(config).toContain("tunnel: tunnel-1234");
    expect(config).toContain(
      "credentials-file: /home/u/.cloudflared/tunnel-1234.json",
    );
  });
});
