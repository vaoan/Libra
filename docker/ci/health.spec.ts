import { test, expect } from "@playwright/test";

/**
 * Docker health tests — run against a built CI container via docker-health-check.sh.
 * CONTAINER_URL env var points at the running nginx proxy.
 * Just verifies each app responds with a browser-usable status (2xx or redirect).
 */

const baseUrl = process.env.CONTAINER_URL ?? "http://localhost:8088";

const routes = [
  { name: "health", path: "/health" },
  { name: "landing", path: "/" },
  { name: "store", path: "/store" },
  { name: "auth", path: "/auth" },
  { name: "admin", path: "/admin" },
  { name: "payments", path: "/payments" },
  { name: "studio", path: "/studio" },
];

for (const { name, path } of routes) {
  test(`${name} responds with usable status`, async ({ request }) => {
    const res = await request.get(`${baseUrl}${path}`, {
      maxRedirects: 0,
    });
    // Accept 2xx or 3xx — anything a browser can work with
    expect(res.status()).toBeLessThan(400);
  });
}
