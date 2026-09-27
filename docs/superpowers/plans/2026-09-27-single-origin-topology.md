# Single-Origin Topology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all six apps from one origin in every environment, dev included, and remove every per-app hostname leftover.

**Architecture:** `config/app-links.json` becomes the single routing registry (path and dev port per app). A small Node proxy built on `http-proxy` fronts the six `next dev` servers on `HOST_PORT` in dev, routing by longest path prefix exactly as the production nginx does. Every app sets `basePath` unconditionally, cookies become host-only, and tunnel tooling emits one app hostname.

**Tech Stack:** Node 22 ESM scripts, `http-proxy`, Vitest (`vitest.config.scripts.js` for scripts, per-workspace configs for apps and packages), Next.js 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-single-origin-topology-design.md`

## Global Constraints

- **Never commit without the user's explicit instruction.** `.claude/rules/commit-policy.md` and `git-safety.md` override this plan's commit steps: run a commit step only when the user has said to commit; otherwise leave the work staged and report the files changed.
- Work on a branch off `develop` named `feat/GH-000_Single-Origin-Topology`. Creating it is a Tier 2 git action: ask before creating it (`.claude/rules/git-safety.md`).
- Every new script file uses kebab-case and the `.mjs` extension; tests for scripts live in `scripts/__tests__/*.test.mjs` and run with `pnpm test:workflows`.
- Unit tests for apps and packages live in `<workspace>/tests/`, flat, and import the subject by alias (`@/`, `@shared/`, `@auth/`), never relatively.
- Test names that disappear must be listed in `tests/retired-cases.txt` with a reason, and `tests/INVENTORY.md` regenerated with `pnpm test:inventory`, or the inventory gate fails.
- Prettier formats every touched file: run `pnpm exec prettier --write <files>` before each verify step.
- Cross-app URLs in env files keep the exact shape of `.env.ci`: `http://localhost:5050/<path>`, landing at `http://localhost:5050`.
- `docker/prod/nginx.conf`, `supervisord.conf` and `warmer.sh` are not modified.
- Everything must pass at the end: `pnpm format:check`, `pnpm lint`, `pnpm lint:env`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm test:workflows`, `pnpm build`, `bash scripts/check-app-registry.sh`, `pnpm e2e:dev`, `pnpm e2e:ci`.

## Review Focus

1. **A request path that shares a prefix with an app name but is not that app** (`/storefront`, `/authors`) must go to landing, not to store or auth. Pinned in Task 3's router tests.
2. **A WebSocket upgrade under an app prefix** (`/store/_next/webpack-hmr`) must reach the store dev server, or HMR silently dies for that app. Pinned in Task 3's router test and exercised by the manual dev check in Task 11.
3. **An upstream that is down** must produce a readable 502 naming the app, never a hung request. Pinned in Task 3's server test.
4. **A cookie written on a multi-label hostname** (`store.example.com`) must carry no `domain` attribute. Pinned in Task 7's tests for all three cookie writers.
5. **An app directory added without a registry entry, or a registry entry nginx does not route** must fail CI, not surface as a 404 in production. Pinned in Task 9 by running the check against a temporary bogus app directory.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Confirm a clean tree on `develop`**

Run: `git status --short && git branch --show-current`
Expected: no output from status, branch `develop`.

- [ ] **Step 2: Ask the user for permission to create the branch**

Say: "I need a branch for this work: `feat/GH-000_Single-Origin-Topology` off `develop`. Create it?" Wait for a yes.

- [ ] **Step 3: Create it**

Run: `git checkout -b feat/GH-000_Single-Origin-Topology`
Expected: `Switched to a new branch 'feat/GH-000_Single-Origin-Topology'`.

---

### Task 1: Registry with ports, and a loader for scripts

**Files:**

- Modify: `config/app-links.json`
- Create: `scripts/lib/app-registry.mjs`
- Test: `scripts/__tests__/app-registry.test.mjs`

**Interfaces:**

- Produces: `loadAppRegistry(registryPath?) => Record<string, { envKey: string; path: string; port: number }>`, `portForApp(registry, app) => number` (throws on unknown app), `devUrlForApp(registry, app, hostPort) => string`.
- Later tasks: Task 2 (`appUrls.ts`, `app-url-resolver.js`), Task 3 (proxy), Task 4 (`start.mjs`, `e2e.mjs`), Task 5 (`next.config.ts`), Task 9 (registry check) all read this JSON shape.

- [ ] **Step 1: Write the failing tests**

Create `scripts/__tests__/app-registry.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/app-registry.test.mjs`
Expected: FAIL, `Cannot find module '../lib/app-registry.mjs'`.

- [ ] **Step 3: Update the registry**

Replace the contents of `config/app-links.json` with:

```json
{
  "landing": {
    "envKey": "NEXT_PUBLIC_LANDING_URL",
    "path": "/",
    "port": 5004
  },
  "store": {
    "envKey": "NEXT_PUBLIC_STORE_URL",
    "path": "/store",
    "port": 5001
  },
  "admin": {
    "envKey": "NEXT_PUBLIC_ADMIN_URL",
    "path": "/admin",
    "port": 5002
  },
  "payments": {
    "envKey": "NEXT_PUBLIC_PAYMENTS_URL",
    "path": "/payments",
    "port": 5005
  },
  "studio": {
    "envKey": "NEXT_PUBLIC_STUDIO_URL",
    "path": "/studio",
    "port": 5006
  },
  "auth": {
    "envKey": "NEXT_PUBLIC_AUTH_URL",
    "path": "/auth",
    "port": 5000
  }
}
```

- [ ] **Step 4: Write the loader**

Create `scripts/lib/app-registry.mjs`:

```js
/**
 * The single routing registry: which path prefix and which dev port each app
 * owns. `config/app-links.json` is the source; the dev proxy, `start.mjs`,
 * `e2e.mjs`, `appUrls.ts` and the app-registry CI check all read it, and
 * `docker/prod/nginx.conf` is checked against it.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REGISTRY_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../config/app-links.json",
);

/**
 * Reads the registry.
 *
 * @param {string} [registryPath] - override for tests.
 * @returns {Record<string, { envKey: string; path: string; port: number }>}
 */
export function loadAppRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

function entryFor(registry, app) {
  const entry = registry[app];
  if (!entry) {
    throw new Error(`"${app}" is not registered in config/app-links.json`);
  }
  return entry;
}

/**
 * The `next dev` port an app listens on.
 *
 * @param {ReturnType<typeof loadAppRegistry>} registry
 * @param {string} app
 * @returns {number}
 */
export function portForApp(registry, app) {
  return entryFor(registry, app).port;
}

/**
 * The absolute URL an app has behind the dev proxy.
 *
 * @param {ReturnType<typeof loadAppRegistry>} registry
 * @param {string} app
 * @param {number|string} hostPort - the proxy's port (`HOST_PORT`).
 * @returns {string}
 */
export function devUrlForApp(registry, app, hostPort) {
  const { path } = entryFor(registry, app);
  const suffix = path === "/" ? "" : path;
  return `http://localhost:${hostPort}${suffix}`;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/app-registry.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 6: Format and commit**

Run: `pnpm exec prettier --write config/app-links.json scripts/lib/app-registry.mjs scripts/__tests__/app-registry.test.mjs`

Only if the user has authorized commits:

```bash
git add config/app-links.json scripts/lib/app-registry.mjs scripts/__tests__/app-registry.test.mjs
git commit -m "feat(scripts): app registry carries dev ports, loses devUrl [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: URL resolution reads the registry path in every environment

**Files:**

- Modify: `packages/shared/src/config/appUrls.ts`
- Modify: `packages/shared/tests/appUrls.test.ts`
- Modify: `scripts/app-url-resolver.js`
- Modify: `tests/retired-cases.txt`

**Interfaces:**

- Consumes: the registry shape from Task 1 (`envKey`, `path`).
- Produces: `appUrls.<app>` is the explicit `NEXT_PUBLIC_<APP>_URL` or the registry path, regardless of `NODE_ENV`. `resolveE2EAppUrls()` returns absolute URLs, falling back to `http://localhost:<HOST_PORT><path>`.

- [ ] **Step 1: Change the failing test**

In `packages/shared/tests/appUrls.test.ts`, delete the `EXPECTED_DEV_URLS` constant and replace the first test (`uses local app URLs by default in development`) with:

```ts
it("falls back to relative same-origin paths in development too", async () => {
  vi.stubEnv("NODE_ENV", "development");
  clearAppUrlEnvVars();

  const { appUrls } = await importFreshAppUrls();
  expect(appUrls).toEqual(EXPECTED_PROD_PATHS);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter shared exec vitest run tests/appUrls.test.ts`
Expected: FAIL on the new test, received `http://localhost:5004` style values.

- [ ] **Step 3: Simplify the resolver**

Replace the body of `packages/shared/src/config/appUrls.ts` with:

```ts
// eslint-disable-next-line boundaries/no-unknown, no-restricted-imports
import appLinks from "../../../../config/app-links.json";

type AppName = keyof typeof appLinks;

/**
 * Every app lives on one origin under its registry path, so a root-relative
 * path is a valid cross-app link in every environment. An explicit
 * `NEXT_PUBLIC_<APP>_URL` still wins so tunnels and E2E can use absolute URLs.
 */
function resolveAppUrl(app: AppName) {
  const definition = appLinks[app];
  const explicit = process.env[definition.envKey]?.trim();
  return explicit || definition.path;
}

export const appUrls = Object.freeze({
  landing: resolveAppUrl("landing"),
  store: resolveAppUrl("store"),
  studio: resolveAppUrl("studio"),
  payments: resolveAppUrl("payments"),
  admin: resolveAppUrl("admin"),
  auth: resolveAppUrl("auth"),
});
```

- [ ] **Step 4: Run the shared tests to verify they pass**

Run: `pnpm --filter shared exec vitest run tests/appUrls.test.ts tests/appUrls.property.test.ts tests/environment.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the E2E resolver fallback**

In `scripts/app-url-resolver.js`, replace the `resolveE2EAppUrls` function and its doc comment with:

```js
/**
 * Resolves all app URLs for the active environment.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_<APP>_URL                         (explicit, from the env file)
 *   2. http://localhost:<HOST_PORT><registry path>   (the dev proxy)
 *
 * @returns {Record<string, string>}
 */
function resolveE2EAppUrls() {
  const hostPort = process.env.HOST_PORT ?? "5050";
  /** @type {Record<string, string>} */
  const result = {};

  for (const [name, app] of Object.entries(appLinks)) {
    const suffix = app.path === "/" ? "" : app.path;
    result[name] =
      process.env[app.envKey] ?? `http://localhost:${hostPort}${suffix}`;
  }

  return result;
}
```

Also change the file's header comment line `Falls back to app-links.json devUrl values.` to `Falls back to the dev proxy origin plus the registry path.`

- [ ] **Step 6: Retire the renamed test case**

Append to `tests/retired-cases.txt`:

```
uses local app URLs by default in development  # dev now shares one origin, so the fallback is the registry path; replaced by "falls back to relative same-origin paths in development too"
```

- [ ] **Step 7: Typecheck the package, format, commit**

Run: `pnpm --filter shared typecheck && pnpm exec prettier --write packages/shared/src/config/appUrls.ts packages/shared/tests/appUrls.test.ts scripts/app-url-resolver.js tests/retired-cases.txt`
Expected: typecheck exits 0.

Only if the user has authorized commits:

```bash
git add packages/shared/src/config/appUrls.ts packages/shared/tests/appUrls.test.ts scripts/app-url-resolver.js tests/retired-cases.txt
git commit -m "refactor(shared): app URLs fall back to the registry path in every env [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Dev proxy

**Files:**

- Create: `scripts/lib/dev-proxy-router.mjs`
- Create: `scripts/lib/dev-proxy-server.mjs`
- Create: `scripts/dev-proxy.mjs`
- Modify: `package.json` (root devDependency)
- Test: `scripts/__tests__/dev-proxy-router.test.mjs`
- Test: `scripts/__tests__/dev-proxy-server.test.mjs`

**Interfaces:**

- Consumes: `loadAppRegistry()` from Task 1.
- Produces: `buildRoutes(registry) => Array<{ app, path, port }>` sorted longest path first; `matchRoute(routes, url) => { app, path, port }`; `createDevProxyServer(registry) => http.Server` (not yet listening). `scripts/dev-proxy.mjs` is the executable Task 4 spawns; it reads `HOST_PORT` and exits 1 when it is invalid or the port is taken.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add -D -w http-proxy@^1.18.1`
Expected: `package.json` root `devDependencies` gains `"http-proxy": "^1.18.1"`, lockfile updated.

- [ ] **Step 2: Write the failing router tests**

Create `scripts/__tests__/dev-proxy-router.test.mjs`:

```js
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/dev-proxy-router.test.mjs`
Expected: FAIL, `Cannot find module '../lib/dev-proxy-router.mjs'`.

- [ ] **Step 4: Write the router**

Create `scripts/lib/dev-proxy-router.mjs`:

```js
/**
 * Longest-prefix routing for the dev proxy, the same rule nginx applies with
 * its `location /store`, `location /auth`, ... `location /` blocks.
 */

/**
 * Routes sorted longest path first, so `/store` is tried before `/`.
 *
 * @param {Record<string, { path: string; port: number }>} registry
 * @returns {Array<{ app: string; path: string; port: number }>}
 */
export function buildRoutes(registry) {
  return Object.entries(registry)
    .map(([app, { path, port }]) => ({ app, path, port }))
    .sort((a, b) => b.path.length - a.path.length);
}

/**
 * The route that owns a request URL. A prefix matches only at a segment
 * boundary (`/store` and `/store/x`, never `/storefront`); the `/` route
 * catches everything else.
 *
 * @param {ReturnType<typeof buildRoutes>} routes
 * @param {string} url - request URL, query string allowed.
 * @returns {{ app: string; path: string; port: number }}
 */
export function matchRoute(routes, url) {
  const pathname = url.split("?")[0];
  return routes.find(
    ({ path }) =>
      path === "/" || pathname === path || pathname.startsWith(`${path}/`),
  );
}
```

- [ ] **Step 5: Run the router tests to verify they pass**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/dev-proxy-router.test.mjs`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing server tests**

Create `scripts/__tests__/dev-proxy-server.test.mjs`:

```js
/**
 * Integration tests for scripts/lib/dev-proxy-server.mjs: real sockets, fake
 * upstreams on ephemeral ports.
 */
import http from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDevProxyServer } from "../lib/dev-proxy-server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** An upstream that echoes the path and headers it saw. */
function makeUpstream(name) {
  return http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name,
        url: req.url,
        forwardedHost: req.headers["x-forwarded-host"],
      }),
    );
  });
}

describe("createDevProxyServer", () => {
  const landing = makeUpstream("landing");
  const store = makeUpstream("store");
  let proxy;
  let proxyPort;
  let storePort;

  beforeAll(async () => {
    const landingPort = await listen(landing);
    storePort = await listen(store);
    proxy = createDevProxyServer({
      landing: {
        envKey: "NEXT_PUBLIC_LANDING_URL",
        path: "/",
        port: landingPort,
      },
      store: {
        envKey: "NEXT_PUBLIC_STORE_URL",
        path: "/store",
        port: storePort,
      },
    });
    proxyPort = await listen(proxy);
  });

  afterAll(async () => {
    await close(proxy);
    await close(landing);
    if (store.listening) await close(store);
  });

  it("forwards a prefixed path to the owning app, path intact", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store/en?x=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "store",
      url: "/store/en?x=1",
    });
  });

  it("forwards everything else to landing", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/en/legal`);
    expect(await res.json()).toMatchObject({
      name: "landing",
      url: "/en/legal",
    });
  });

  it("sets X-Forwarded-Host to the host the browser used", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store`);
    expect((await res.json()).forwardedHost).toBe(`127.0.0.1:${proxyPort}`);
  });

  it("answers 502 naming the app and port when the upstream is down", async () => {
    await close(store);
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store/en`);
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain("store");
    expect(body).toContain(String(storePort));
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/dev-proxy-server.test.mjs`
Expected: FAIL, `Cannot find module '../lib/dev-proxy-server.mjs'`.

- [ ] **Step 8: Write the server factory**

Create `scripts/lib/dev-proxy-server.mjs`:

```js
/**
 * One origin for every app in dev. Routes by longest path prefix to the
 * `next dev` servers, forwards WebSocket upgrades so HMR works, preserves the
 * browser's Host header and sets the same X-Forwarded-* headers the
 * production nginx sets, so server-action origin checks behave identically.
 */
import http from "node:http";

import httpProxy from "http-proxy";

import { buildRoutes, matchRoute } from "./dev-proxy-router.mjs";

const UPSTREAM_HOST = "127.0.0.1";

/**
 * Builds the proxy server. The caller decides where it listens.
 *
 * @param {Record<string, { path: string; port: number }>} registry
 * @returns {http.Server}
 */
export function createDevProxyServer(registry) {
  const routes = buildRoutes(registry);
  const proxy = httpProxy.createProxyServer({
    changeOrigin: false,
    xfwd: true,
  });

  const forwardHost = (proxyReq, req) => {
    proxyReq.setHeader("X-Forwarded-Host", req.headers.host ?? "");
  };
  proxy.on("proxyReq", forwardHost);
  proxy.on("proxyReqWs", forwardHost);

  proxy.on("error", (err, req, resOrSocket) => {
    const route = matchRoute(routes, req.url ?? "/");
    const body = `dev-proxy: ${route.app} is not listening on :${route.port} (${err.code ?? err.message})\n`;
    if (typeof resOrSocket.writeHead === "function") {
      if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { "Content-Type": "text/plain" });
      }
      resOrSocket.end(body);
    } else {
      resOrSocket.destroy();
    }
  });

  const targetFor = (req) =>
    `http://${UPSTREAM_HOST}:${matchRoute(routes, req.url ?? "/").port}`;

  const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: targetFor(req) });
  });
  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head, { target: targetFor(req) });
  });
  server.on("close", () => proxy.close());

  return server;
}
```

- [ ] **Step 9: Run the server tests to verify they pass**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/dev-proxy-server.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 10: Write the executable**

Create `scripts/dev-proxy.mjs`:

```js
#!/usr/bin/env node
/**
 * Dev proxy: serves every app from http://localhost:<HOST_PORT> by path prefix,
 * the way nginx does in the production container.
 *
 * Usage:
 *   node scripts/dev-proxy.mjs [--env <name>]
 *
 * `scripts/start.mjs` spawns this with the env already loaded; run standalone
 * it loads `.env.<name>` itself (default dev).
 */
import { loadAppRegistry } from "./lib/app-registry.mjs";
import { createDevProxyServer } from "./lib/dev-proxy-server.mjs";
import { loadEnv } from "./load-env.mjs";

if (!process.env.TARGET_ENV) {
  const envFlag = process.argv.indexOf("--env");
  loadEnv(envFlag !== -1 ? process.argv[envFlag + 1] : "dev");
}

const hostPort = Number.parseInt(process.env.HOST_PORT ?? "", 10);
if (!Number.isInteger(hostPort) || hostPort <= 0 || hostPort > 65_535) {
  console.error(
    "dev-proxy: HOST_PORT must be set to a valid port in the active env file",
  );
  process.exit(1);
}

const server = createDevProxyServer(loadAppRegistry());

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`dev-proxy: port ${hostPort} is already in use`);
    process.exit(1);
  }
  throw err;
});

server.listen(hostPort, () => {
  console.log(`dev-proxy: http://localhost:${hostPort} → apps by path prefix`);
});
```

- [ ] **Step 11: Smoke the executable's error paths**

Run: `HOST_PORT=abc TARGET_ENV=dev node scripts/dev-proxy.mjs; echo "exit=$?"`
Expected: message `dev-proxy: HOST_PORT must be set to a valid port...`, `exit=1`.

Run (in Git Bash): `HOST_PORT=5051 TARGET_ENV=dev node scripts/dev-proxy.mjs & sleep 2; HOST_PORT=5051 TARGET_ENV=dev node scripts/dev-proxy.mjs; echo "exit=$?"; kill %1`
Expected: second run prints `dev-proxy: port 5051 is already in use`, `exit=1`.

- [ ] **Step 12: Lint, format, knip, commit**

Run: `pnpm exec prettier --write scripts/dev-proxy.mjs scripts/lib/dev-proxy-router.mjs scripts/lib/dev-proxy-server.mjs scripts/__tests__/dev-proxy-router.test.mjs scripts/__tests__/dev-proxy-server.test.mjs package.json && pnpm exec eslint scripts/dev-proxy.mjs scripts/lib/dev-proxy-router.mjs scripts/lib/dev-proxy-server.mjs scripts/__tests__/dev-proxy-router.test.mjs scripts/__tests__/dev-proxy-server.test.mjs --max-warnings=0 && pnpm knip`
Expected: no lint errors; knip reports `http-proxy` as used (it is imported from `scripts/lib/dev-proxy-server.mjs`, which is under knip's root `project` globs).

Only if the user has authorized commits:

```bash
git add scripts/dev-proxy.mjs scripts/lib/dev-proxy-router.mjs scripts/lib/dev-proxy-server.mjs scripts/__tests__/dev-proxy-router.test.mjs scripts/__tests__/dev-proxy-server.test.mjs package.json pnpm-lock.yaml
git commit -m "feat(scripts): dev proxy serves every app from one origin [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `start.mjs` and `e2e.mjs` use the registry and the proxy

**Files:**

- Modify: `scripts/start.mjs`
- Modify: `scripts/e2e.mjs:176-193` and `scripts/e2e.mjs:256-266`

**Interfaces:**

- Consumes: `loadAppRegistry`, `portForApp` (Task 1); `scripts/dev-proxy.mjs` (Task 3).
- Produces: `pnpm dev` starts six `next dev` servers plus the proxy; `pnpm e2e:dev` waits for both the target app port and `HOST_PORT`.

- [ ] **Step 1: Rewrite `start.mjs`**

Replace the whole file with:

```js
#!/usr/bin/env node
// Starts all apps in dev mode plus the dev proxy that fronts them on HOST_PORT.
// Loads .env.dev (with $secret: resolution) before starting.
// Each app's port comes from config/app-links.json.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAppRegistry, portForApp } from "./lib/app-registry.mjs";
import { loadEnv } from "./load-env.mjs";

const envFlag = process.argv.indexOf("--env");
const targetEnv = envFlag !== -1 ? process.argv[envFlag + 1] : "dev";
loadEnv(targetEnv);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const registry = loadAppRegistry();

const appsDir = resolve(rootDir, "apps");
const appNames = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Clear .next cache for all apps to avoid stale env var mismatches
for (const app of appNames) {
  const cache = resolve(appsDir, app, ".next");
  if (existsSync(cache)) {
    rmSync(cache, { recursive: true, force: true });
  }
}

// pnpm hoists binaries to the workspace root — not to each app's node_modules/.bin/
const nextBin = resolve(
  rootDir,
  "node_modules",
  ".bin",
  isWindows ? "next.CMD" : "next",
);

const children = appNames.map((app) => {
  const appDir = resolve(rootDir, "apps", app); // nosemgrep: AIK_ts_generic_path_traversal
  // portForApp throws for an app directory missing from the registry, which
  // is the right outcome: an unregistered app is also unroutable in prod.
  const args = ["dev", "-p", String(portForApp(registry, app))];

  // On Windows, .CMD files cannot be spawned directly without shell:true.
  // Invoke cmd.exe explicitly with a fixed argument list to avoid shell injection.
  return isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", nextBin, ...args], {
        cwd: appDir,
        stdio: "inherit",
        env: process.env,
      })
    : spawn(nextBin, args, { cwd: appDir, stdio: "inherit", env: process.env });
});

// The proxy is the origin developers actually use: http://localhost:HOST_PORT
children.push(
  spawn(process.execPath, [resolve(__dirname, "dev-proxy.mjs")], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  }),
);

children.forEach((child) => {
  child.on("exit", (code) => {
    if (code !== null && code !== 0) process.exit(code);
  });
});

process.on("exit", () => {
  for (const child of children) child.kill();
});
```

- [ ] **Step 2: Update `e2e.mjs`**

Add after the existing `import { loadEnv } from "./load-env.mjs";` line:

```js
import {
  loadAppRegistry,
  portForApp as registryPort,
} from "./lib/app-registry.mjs";
```

Replace the `portForApp` helper (the function that parses `NEXT_PUBLIC_<APP>_URL` and falls back to a literal port map) with:

```js
function portForApp(app) {
  return registryPort(loadAppRegistry(), app);
}
```

Replace the `// local mode — start dev servers if not already up` block with:

```js
// local mode — start dev servers (and the dev proxy) if not already up
const port = portForApp(targetApp);
const proxyPort = Number.parseInt(process.env.HOST_PORT ?? "", 10);
if (!Number.isInteger(proxyPort)) {
  console.error("ERROR: HOST_PORT is not set — the dev proxy needs it");
  process.exit(1);
}
const alreadyUp = (await checkPort(port)) && (await checkPort(proxyPort));

if (alreadyUp) {
  console.log(
    `✓ Dev servers already running (${targetApp} on :${port}, proxy on :${proxyPort})\n`,
  );
} else {
  console.log(`\n▶ pnpm dev`);
  devProc = pnpmSpawn(["dev"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  console.log(`   Waiting for ${targetApp} on :${port}...`);
  await waitForPort(port, 120_000);
  console.log(`   Waiting for dev proxy on :${proxyPort}...`);
  await waitForPort(proxyPort, 120_000);
  console.log(`✓ ${targetApp} ready behind the proxy\n`);
}
```

- [ ] **Step 3: Verify `pnpm dev` boots all seven processes**

Run in a terminal: `pnpm dev` and wait for six `Ready` lines and `dev-proxy: http://localhost:5050 → apps by path prefix`.

Then in a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/store/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/en
```

Expected: `200` for the first (the store app on its basePath is Task 5; until then expect `404` from the store dev server, which still proves routing reached it), `200` or `307` for the second. Stop `pnpm dev` with Ctrl+C and confirm no `node` process is left listening on 5000-5006 or 5050 (`netstat -ano | findstr :5050` in PowerShell shows nothing).

- [ ] **Step 4: Lint, format, commit**

Run: `pnpm exec prettier --write scripts/start.mjs scripts/e2e.mjs && pnpm exec eslint scripts/start.mjs scripts/e2e.mjs --max-warnings=0`

Only if the user has authorized commits:

```bash
git add scripts/start.mjs scripts/e2e.mjs
git commit -m "feat(scripts): pnpm dev starts the proxy; ports come from the registry [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `basePath` always on, dead config keys removed

**Files:**

- Modify: `apps/store/next.config.ts`, `apps/admin/next.config.ts`, `apps/auth/next.config.ts`, `apps/payments/next.config.ts`, `apps/studio/next.config.ts`, `apps/landing/next.config.ts`
- Modify: `turbo.json`

**Interfaces:**

- Consumes: `config/app-links.json` paths (Task 1).
- Produces: every prefixed app serves at its path in `next dev` and `next build`; landing serves at `/`. Nothing reads `BASE_PATH_PREFIX` or `allowedDevOrigins` any more.

- [ ] **Step 1: Store**

In `apps/store/next.config.ts`:

Add after the existing `import createNextIntlPlugin from "next-intl/plugin";`:

```ts
import appLinks from "../../config/app-links.json";
```

Delete these two lines:

```ts
const basePathPrefix = process.env.BASE_PATH_PREFIX || "";
const allowedDevOrigins = ["store.ffxivbe.org"];
```

Replace the start of `nextConfig` up to and including the standalone spread with:

```ts
const nextConfig: NextConfig = {
  // One origin, routed by path prefix, in every environment (nginx in prod,
  // scripts/dev-proxy.mjs in dev). The registry is the single source.
  basePath: appLinks.store.path,
  // lucide-react v1.x ESM dist uses .ts imports — Turbopack needs explicit extensions
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  ...(isStandalone && {
    output: "standalone" as const,
    outputFileTracingRoot: path.join(__dirname, "../.."),
  }),
```

(`allowedDevOrigins,` is gone from the object; `basePath` moved out of the conditional.)

- [ ] **Step 2: Admin, auth, payments, studio**

Apply the same three edits to each. The only per-file differences:

| File                           | Delete `allowedDevOrigins = [...]` line containing | `basePath` value         |
| ------------------------------ | -------------------------------------------------- | ------------------------ |
| `apps/admin/next.config.ts`    | `"admin.ffxivbe.org"`                              | `appLinks.admin.path`    |
| `apps/auth/next.config.ts`     | `"auth.ffxivbe.org"`                               | `appLinks.auth.path`     |
| `apps/payments/next.config.ts` | `"payments.ffxivbe.org"`                           | `appLinks.payments.path` |
| `apps/studio/next.config.ts`   | `"studio.ffxivbe.org"`                             | `appLinks.studio.path`   |

In each: add the `appLinks` import, delete the `basePathPrefix` and `allowedDevOrigins` const lines, remove `allowedDevOrigins,` from the config object, add `basePath: appLinks.<app>.path,` as the first property with the same two-line comment as store, and remove `basePath: \`${basePathPrefix}/<app>\`,`from inside the`isStandalone`spread. Payments keeps its`serverActions.allowedOrigins`spread untouched. Studio's`isStandalone`spread sits before`turbopack`; leave that order, only remove the `basePath` line from it.

- [ ] **Step 3: Landing**

In `apps/landing/next.config.ts` delete:

```ts
const basePathPrefix = process.env.BASE_PATH_PREFIX || "";
const allowedDevOrigins = [
  "landing.ffxivbe.org",
  "ffxivbe.org",
  "www.ffxivbe.org",
];
```

and replace the start of `nextConfig` through the standalone spread with:

```ts
const nextConfig: NextConfig = {
  // Landing is the one app at the root — no basePath, in any environment.
  // lucide-react v1.x ESM dist uses .ts imports — Turbopack needs explicit extensions
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  ...(process.env.STANDALONE === "true" && {
    output: "standalone" as const,
    outputFileTracingRoot: path.join(__dirname, "../.."),
  }),
```

- [ ] **Step 4: `turbo.json`**

Remove the line `"BASE_PATH_PREFIX",` from `globalEnv`.

- [ ] **Step 5: Confirm nothing references the removed keys**

Run: `grep -rn "BASE_PATH_PREFIX\|allowedDevOrigins\|basePathPrefix" apps/*/next.config.ts turbo.json scripts docker .github docs README.md`
Expected: no output.

- [ ] **Step 6: Typecheck and a dev smoke**

Run: `pnpm typecheck`
Expected: exit 0 (the JSON import is typed via `resolveJsonModule` in `tsconfig.base.json`).

Run `pnpm dev`, then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/store/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/auth/en/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/admin/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/payments/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/studio/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5050/en
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5001/
```

Expected: `200` (or `307` for auth-protected admin/studio/payments redirecting to login) for the first six; `404` for the last, because store now lives under `/store` on its own port too. Stop `pnpm dev`.

- [ ] **Step 7: Format, commit**

Run: `pnpm exec prettier --write apps/*/next.config.ts turbo.json`

Only if the user has authorized commits:

```bash
git add apps/store/next.config.ts apps/admin/next.config.ts apps/auth/next.config.ts apps/payments/next.config.ts apps/studio/next.config.ts apps/landing/next.config.ts turbo.json
git commit -m "feat(apps): basePath from the registry in every environment [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Dev env file and the ports documentation

**Files:**

- Modify: `.env.dev`
- Modify: `docs/environment.md:118-131`

**Interfaces:**

- Consumes: the proxy on `HOST_PORT=5050` (Task 3), `basePath` (Task 5).
- Produces: `.env.dev` cross-app URLs in the `.env.ci` shape.

- [ ] **Step 1: Change the URLs**

In `.env.dev` replace the `# --- Cross-app navigation` block and the `SUPABASE_AUTH_SITE_URL` line so they read:

```dotenv
# --- Cross-app navigation ------------------------------------------------------
# One origin: scripts/dev-proxy.mjs on HOST_PORT fronts the six dev servers
# by path prefix, the way nginx does in the container. Per-app dev ports live
# in config/app-links.json.
NEXT_PUBLIC_AUTH_URL=http://localhost:5050/auth
NEXT_PUBLIC_AUTH_HOST_URL=http://localhost:5050/auth
NEXT_PUBLIC_STORE_URL=http://localhost:5050/store
NEXT_PUBLIC_ADMIN_URL=http://localhost:5050/admin
NEXT_PUBLIC_LANDING_URL=http://localhost:5050
NEXT_PUBLIC_PAYMENTS_URL=http://localhost:5050/payments
NEXT_PUBLIC_STUDIO_URL=http://localhost:5050/studio

# --- OAuth providers -----------------------------------------------------------
SUPABASE_AUTH_SITE_URL=http://localhost:5050/auth/callback
```

- [ ] **Step 2: Verify key parity still holds**

Run: `pnpm lint:env`
Expected: passes (no key added or removed).

- [ ] **Step 3: Rewrite the Port System section of `docs/environment.md`**

Replace the `### Dev server ports` subsection (from its heading through the sentence starting `\`scripts/start.mjs\` auto-discovers`) with:

````markdown
### Dev server ports

Every app's `next dev` port is declared once, in `config/app-links.json`:

```json
"store": { "envKey": "NEXT_PUBLIC_STORE_URL", "path": "/store", "port": 5001 }
```
````

`scripts/start.mjs` auto-discovers the apps in `apps/`, looks each one up in the
registry, and passes `-p <port>` to `next dev`. An app directory with no
registry entry is an error, because it would also be unroutable in production.

Developers do not use those ports directly. `start.mjs` also launches
`scripts/dev-proxy.mjs` on `HOST_PORT` (5050 in dev), which routes by path
prefix to the six servers exactly as `docker/prod/nginx.conf` does, so the
`NEXT_PUBLIC_<APP>_URL` values in `.env.dev` all point at one origin:

```dotenv
HOST_PORT=5050
NEXT_PUBLIC_LANDING_URL=http://localhost:5050
NEXT_PUBLIC_STORE_URL=http://localhost:5050/store
NEXT_PUBLIC_AUTH_URL=http://localhost:5050/auth
```

Each app sets `basePath` from the same registry entry, so
`http://localhost:5001/` is a 404 and `http://localhost:5001/store/en` works;
the proxy URL `http://localhost:5050/store/en` is the one to use.

````

- [ ] **Step 4: Format, commit**

Run: `pnpm exec prettier --write docs/environment.md`

Only if the user has authorized commits:

```bash
git add .env.dev docs/environment.md
git commit -m "chore(env): dev cross-app URLs share one origin behind the proxy [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
````

---

### Task 7: Host-only cookies

**Files:**

- Delete: `packages/shared/src/utils/cookieDomain.ts`, `packages/shared/tests/cookieDomain.test.ts`
- Modify: `packages/shared/src/utils/index.ts`
- Modify: `apps/store/src/shared/application/cart/cartCookiePersistence.ts`, `apps/store/tests/cartCookiePersistence.test.ts`
- Modify: `apps/payments/src/features/checkout/infrastructure/cartCookie.ts`, `apps/payments/tests/cartCookie.test.ts`
- Modify: `packages/auth/src/client/permCachePersistence.ts`, `packages/auth/tests/client/permCachePersistence.test.ts`
- Modify: `tests/retired-cases.txt`

**Interfaces:**

- Produces: `getCartCookieOptions()` (store) returns `{ path: "/", sameSite: "lax", secure: boolean }` with no `domain`; `persistCartCookie` calls `setCookie` once and never `deleteCookie`; `removeCartCookie` calls `deleteCookie` once. Payments `clearCartCookie` deletes with `{ path: "/" }` only. Auth `writePermCache` never pre-deletes; `clearPermCache` deletes once.

- [ ] **Step 1: Store — change the tests first**

In `apps/store/tests/cartCookiePersistence.test.ts`:

Delete the `mockGetSharedCookieDomain` hoisted mock and the `vi.mock("shared", ...)` block. Delete every `mockGetSharedCookieDomain.mockReset()` and `mockGetSharedCookieDomain.mockReturnValue(...)` line.

Replace the whole `describe("getCartCookieOptions — browser (with window)")` block with:

```ts
describe("getCartCookieOptions — browser (with window)", () => {
  it("returns secure: true on https", () => {
    Object.defineProperty(globalThis, "location", {
      value: { protocol: "https:", hostname: "store.example.com" },
      writable: true,
      configurable: true,
    });

    const options = getCartCookieOptions();
    expect(options.secure).toBe(true);
  });

  it("returns secure: false on http", () => {
    Object.defineProperty(globalThis, "location", {
      value: { protocol: "http:", hostname: "localhost" },
      writable: true,
      configurable: true,
    });

    const options = getCartCookieOptions();
    expect(options.secure).toBe(false);
  });

  it("never sets a domain, even on a multi-segment hostname", () => {
    Object.defineProperty(globalThis, "location", {
      value: { protocol: "https:", hostname: "store.example.com" },
      writable: true,
      configurable: true,
    });

    expect(getCartCookieOptions()).not.toHaveProperty("domain");
  });
});
```

In `describe("persistCartCookie")`, delete the tests `calls deleteCookie first when domain is set (to clear root-path cookie)` and `does not call deleteCookie when domain is not set`, and add:

```ts
it("never deletes before setting, on any hostname", () => {
  Object.defineProperty(globalThis, "location", {
    value: { protocol: "https:", hostname: "store.example.com" },
    writable: true,
    configurable: true,
  });

  persistCartCookie([]);

  expect(mockDeleteCookie).not.toHaveBeenCalled();
  expect(mockSetCookie).toHaveBeenCalledOnce();
  const options = mockSetCookie.mock.calls[0]![2] as Record<string, unknown>;
  expect(options).not.toHaveProperty("domain");
});
```

In `describe("removeCartCookie")`, delete `calls deleteCookie twice when domain is set (once with domain, once root path)` and `calls deleteCookie only once when no domain`, and add:

```ts
it("deletes exactly once with host-only options, on any hostname", () => {
  Object.defineProperty(globalThis, "location", {
    value: { protocol: "https:", hostname: "store.example.com" },
    writable: true,
    configurable: true,
  });

  removeCartCookie();

  expect(mockDeleteCookie).toHaveBeenCalledTimes(1);
  expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
    path: "/",
    sameSite: "lax",
    secure: true,
  });
});
```

- [ ] **Step 2: Run to verify the new store tests fail**

Run: `pnpm --filter store exec vitest run tests/cartCookiePersistence.test.ts`
Expected: FAIL — `never sets a domain` and the two new tests fail because the module still computes a domain (and the `shared` import of `getSharedCookieDomain` is now unmocked).

- [ ] **Step 3: Store — implementation**

Replace `apps/store/src/shared/application/cart/cartCookiePersistence.ts` with:

```ts
import { deleteCookie, setCookie } from "cookies-next";
import { CART_COOKIE_KEY } from "shared/constants/cart";
import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "shared/constants/time";
import type { CartCookieItem } from "shared/types";

import type { CartItem } from "@/shared/domain/cart";

const DAYS = 30;
/** Cookie lives for 30 days */
export const COOKIE_MAX_AGE_S =
  DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/**
 * Host-only cookie options. Every app shares one origin, so the cookie needs
 * no `domain` attribute — and must not have one, or it would be readable by
 * unrelated sites on sibling subdomains.
 */
export function getCartCookieOptions() {
  const isSecure =
    globalThis.window !== undefined &&
    globalThis.location.protocol === "https:";

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

export function persistCartCookie(items: CartItem[]) {
  const cookieItems: CartCookieItem[] = items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
  }));

  setCookie(CART_COOKIE_KEY, JSON.stringify(cookieItems), {
    ...getCartCookieOptions(),
    maxAge: COOKIE_MAX_AGE_S,
  });
}

export function removeCartCookie() {
  deleteCookie(CART_COOKIE_KEY, getCartCookieOptions());
}
export { CART_COOKIE_KEY as COOKIE_KEY } from "shared/constants/cart";
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `pnpm --filter store exec vitest run tests/cartCookiePersistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Payments — tests first**

In `apps/payments/tests/cartCookie.test.ts`, inside `describe("clearCartCookie")`, delete the tests `includes shared domain when hostname has multiple parts` and `omits domain when hostname has fewer than two parts`, rename `skips domain computation and does not dispatch event when window is undefined` to `still clears the cookie when window is undefined`, and add:

```ts
it("never sets a domain attribute, even on a multi-segment hostname", () => {
  vi.stubGlobal("location", { hostname: "payments.example.com" });

  clearCartCookie();

  expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
    path: "/",
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter payments exec vitest run tests/cartCookie.test.ts`
Expected: FAIL on `never sets a domain attribute` (received `{ path: "/", domain: ".example.com" }`).

- [ ] **Step 7: Payments — implementation**

In `apps/payments/src/features/checkout/infrastructure/cartCookie.ts` delete the constants `MINIMUM_DOMAIN_SEGMENTS` and `DOMAIN_SUFFIX_SEGMENT_OFFSET`, delete the `getSharedCookieDomain` function, and replace `clearCartCookie` with:

```ts
/** Clear the cart cookie by expiring it. Host-only: every app shares one origin. */
export function clearCartCookie(): void {
  deleteCookie(CART_COOKIE_KEY, { path: "/" });
  notifyCartCookieChanged();
}
```

- [ ] **Step 8: Run the payments tests to verify they pass**

Run: `pnpm --filter payments exec vitest run tests/cartCookie.test.ts tests/useCartFromCookie.test.tsx`
Expected: PASS.

- [ ] **Step 9: Auth — tests first**

In `packages/auth/tests/client/permCachePersistence.test.ts`:

In `describe("writePermCache")` delete `does NOT pre-delete when domain is undefined (localhost dev)` and `pre-deletes the no-domain cookie before setting when domain is present`, and add:

```ts
it("never pre-deletes and never sets a domain, on any hostname", () => {
  setHostname("store.example.com", "https:");
  writePermCache(["products.create"]);

  expect(mockDeleteCookie).not.toHaveBeenCalled();
  expect(mockSetCookie).toHaveBeenCalledWith("libra-perm", expect.any(String), {
    path: "/",
    sameSite: "lax",
    secure: true,
    maxAge: 3600,
  });
});
```

In `describe("clearPermCache")` delete `calls deleteCookie once with base options when domain is undefined` and `calls deleteCookie twice when domain is present (double-delete pattern)`, and add:

```ts
it("deletes exactly once with host-only options, on any hostname", () => {
  setHostname("store.example.com");
  clearPermCache();

  expect(mockDeleteCookie).toHaveBeenCalledTimes(1);
  expect(mockDeleteCookie).toHaveBeenCalledWith("libra-perm", {
    path: "/",
    sameSite: "lax",
    secure: false,
  });
});
```

- [ ] **Step 10: Run to verify it fails**

Run: `pnpm --filter auth exec vitest run tests/client/permCachePersistence.test.ts`
Expected: FAIL on both new tests (a `domain` is set and a pre-delete happens).

- [ ] **Step 11: Auth — implementation**

In `packages/auth/src/client/permCachePersistence.ts` delete `MINIMUM_DOMAIN_SEGMENTS`, `DOMAIN_SUFFIX_SEGMENT_OFFSET` and the `getSharedCookieDomain` function; replace `getPermCookieOptions`, `writePermCache` and `clearPermCache` with:

```ts
/**
 * Host-only cookie options. Every app shares one origin, so the cookie needs
 * no `domain` attribute — and must not have one, or it would be readable by
 * unrelated sites on sibling subdomains.
 */
function getPermCookieOptions() {
  const isSecure =
    globalThis.window !== undefined &&
    globalThis.location.protocol === "https:";

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

export function readPermCache(): string[] | null {
  try {
    const raw = getCookie(PERM_COOKIE_KEY);
    if (raw === undefined || raw === null) return null;
    const result = permCacheSchema.safeParse(JSON.parse(String(raw)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function writePermCache(keys: string[]): void {
  const serialised = JSON.stringify(keys);
  if (serialised.length > PERM_COOKIE_MAX_BYTES) {
    // Exceeding the limit would silently truncate or be rejected by the browser;
    // skip the write so we fall back to a fresh DB fetch on next navigation.
    return;
  }
  setCookie(PERM_COOKIE_KEY, serialised, {
    ...getPermCookieOptions(),
    maxAge: PERM_MAX_AGE,
  });
}

export function clearPermCache(): void {
  deleteCookie(PERM_COOKIE_KEY, getPermCookieOptions());
}
```

(`readPermCache` is unchanged and shown only so the file's export order is unambiguous.)

- [ ] **Step 12: Run the auth tests to verify they pass**

Run: `pnpm --filter auth exec vitest run tests/client/permCachePersistence.test.ts tests/client/permissions.test.tsx`
Expected: PASS.

- [ ] **Step 13: Remove the shared helper**

Delete `packages/shared/src/utils/cookieDomain.ts` and `packages/shared/tests/cookieDomain.test.ts`. In `packages/shared/src/utils/index.ts` delete the line `export { getSharedCookieDomain } from "./cookieDomain";`.

Run: `grep -rn "getSharedCookieDomain\|cookieDomain" apps packages scripts --include=*.ts --include=*.tsx --include=*.mjs -l | grep -v node_modules | grep -v "\.next/"`
Expected: no output.

- [ ] **Step 14: Retire the dropped case names**

Append to `tests/retired-cases.txt`:

```
returns undefined for 'localhost'  # getSharedCookieDomain deleted: cookies are host-only on the single origin
returns undefined for '127.0.0.1'  # getSharedCookieDomain deleted: cookies are host-only on the single origin
returns undefined for a single-segment hostname  # getSharedCookieDomain deleted: cookies are host-only on the single origin
returns '.example.com' for 'app.example.com'  # getSharedCookieDomain deleted: cookies are host-only on the single origin
returns '.example.com' for 'sub1.sub2.example.com'  # getSharedCookieDomain deleted: cookies are host-only on the single origin
returns secure: true on https and includes domain when resolveSharedCookieDomain returns one  # no domain any more; replaced by "returns secure: true on https" and "never sets a domain, even on a multi-segment hostname"
omits domain when getSharedCookieDomain returns undefined  # helper deleted; replaced by "never sets a domain, even on a multi-segment hostname"
calls deleteCookie first when domain is set (to clear root-path cookie)  # asserted the cross-subdomain double-write; replaced by "never deletes before setting, on any hostname"
does not call deleteCookie when domain is not set  # replaced by "never deletes before setting, on any hostname"
calls deleteCookie twice when domain is set (once with domain, once root path)  # asserted the cross-subdomain double-delete; replaced by "deletes exactly once with host-only options, on any hostname"
calls deleteCookie only once when no domain  # replaced by "deletes exactly once with host-only options, on any hostname"
includes shared domain when hostname has multiple parts  # asserted the domain attribute; replaced by "never sets a domain attribute, even on a multi-segment hostname"
omits domain when hostname has fewer than two parts  # no domain logic remains; replaced by "never sets a domain attribute, even on a multi-segment hostname"
skips domain computation and does not dispatch event when window is undefined  # renamed to "still clears the cookie when window is undefined"
does NOT pre-delete when domain is undefined (localhost dev)  # replaced by "never pre-deletes and never sets a domain, on any hostname"
pre-deletes the no-domain cookie before setting when domain is present  # asserted the cross-subdomain double-write; replaced by "never pre-deletes and never sets a domain, on any hostname"
calls deleteCookie once with base options when domain is undefined  # replaced by "deletes exactly once with host-only options, on any hostname"
calls deleteCookie twice when domain is present (double-delete pattern)  # asserted the cross-subdomain double-delete; replaced by "deletes exactly once with host-only options, on any hostname"
```

- [ ] **Step 15: Run the three workspaces' suites, typecheck, format, commit**

Run: `pnpm --filter shared test && pnpm --filter store test && pnpm --filter payments test && pnpm --filter auth test && pnpm typecheck && pnpm exec prettier --write apps/store/src/shared/application/cart/cartCookiePersistence.ts apps/store/tests/cartCookiePersistence.test.ts apps/payments/src/features/checkout/infrastructure/cartCookie.ts apps/payments/tests/cartCookie.test.ts packages/auth/src/client/permCachePersistence.ts packages/auth/tests/client/permCachePersistence.test.ts packages/shared/src/utils/index.ts tests/retired-cases.txt`
Expected: all PASS, typecheck exit 0.

Only if the user has authorized commits:

```bash
git add -A apps/store/src/shared/application/cart/cartCookiePersistence.ts apps/store/tests/cartCookiePersistence.test.ts apps/payments/src/features/checkout/infrastructure/cartCookie.ts apps/payments/tests/cartCookie.test.ts packages/auth/src/client/permCachePersistence.ts packages/auth/tests/client/permCachePersistence.test.ts packages/shared/src/utils/index.ts packages/shared/src/utils/cookieDomain.ts packages/shared/tests/cookieDomain.test.ts tests/retired-cases.txt
git commit -m "fix(auth,store,payments): cookies are host-only on the single origin [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: One app hostname in tunnel tooling

**Files:**

- Create: `scripts/lib/tunnel-ingress.mjs`
- Modify: `scripts/cloudflared.mjs:60-137` and the readiness poll at `:225-226`
- Modify: `scripts/tunnel-switch.mjs:36-45`
- Modify: `docs/environment.md` ("How `pnpm tunnel` works" and "Config generation")
- Test: `scripts/__tests__/tunnel-ingress.test.mjs`

**Interfaces:**

- Produces: `appHostFromLandingUrl(landingUrl) => string`, `zoneOf(hostname) => string`, `buildIngressConfig({ tunnelId, credentialsFile, appHost, appPort, supabasePort }) => string` (YAML text).

- [ ] **Step 1: Write the failing tests**

Create `scripts/__tests__/tunnel-ingress.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/tunnel-ingress.test.mjs`
Expected: FAIL, `Cannot find module '../lib/tunnel-ingress.mjs'`.

- [ ] **Step 3: Write the library**

Create `scripts/lib/tunnel-ingress.mjs`:

```js
/**
 * Cloudflare tunnel ingress for one environment: the single hostname the
 * apps live on (routed to the container's HOST_PORT, which fronts every app
 * by path) plus the self-hosted Supabase services on the same zone.
 */

const SUPABASE_STUDIO_PORT_OFFSET = 2;
const MAILPIT_PORT_OFFSET = 3;

/**
 * The hostname the apps are served on, from `NEXT_PUBLIC_LANDING_URL`.
 *
 * @param {string} landingUrl
 * @returns {string}
 */
export function appHostFromLandingUrl(landingUrl) {
  return new URL(landingUrl).hostname;
}

/**
 * The two-label zone a hostname belongs to (`store.ffxivbe.org` → `ffxivbe.org`).
 *
 * @param {string} hostname
 * @returns {string}
 */
export function zoneOf(hostname) {
  return hostname.split(".").slice(-2).join(".");
}

/**
 * The `~/.cloudflared/<env>-config.yml` text.
 *
 * @param {{ tunnelId: string; credentialsFile: string; appHost: string; appPort: number; supabasePort: number }} input
 * @returns {string}
 */
export function buildIngressConfig({
  tunnelId,
  credentialsFile,
  appHost,
  appPort,
  supabasePort,
}) {
  const zone = zoneOf(appHost);
  return `tunnel: ${tunnelId}
credentials-file: ${credentialsFile}
protocol: http2

ingress:
  - hostname: ${appHost}
    service: http://127.0.0.1:${appPort}
  - hostname: supabase.${zone}
    service: http://127.0.0.1:${supabasePort}
  - hostname: supabase-studio.${zone}
    service: http://127.0.0.1:${supabasePort + SUPABASE_STUDIO_PORT_OFFSET}
  - hostname: mailpit.${zone}
    service: http://127.0.0.1:${supabasePort + MAILPIT_PORT_OFFSET}
  - service: http_status:404
`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/tunnel-ingress.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Wire `cloudflared.mjs` to it**

Add to the imports of `scripts/cloudflared.mjs`:

```js
import {
  appHostFromLandingUrl,
  buildIngressConfig,
  zoneOf,
} from "./lib/tunnel-ingress.mjs";
```

Replace `let baseHost = null; // set below when tunnelId is present; used for readiness poll` with:

```js
let zone = null; // set below when tunnelId is present; used for readiness poll
```

Replace the block from `const siteUrl = process.env.SUPABASE_AUTH_SITE_URL;` through the closing backtick-and-semicolon of `const config = \`...\`;` with:

```js
const landingUrl = process.env.NEXT_PUBLIC_LANDING_URL;
if (!landingUrl) {
  console.error(
    "ERROR: NEXT_PUBLIC_LANDING_URL is not set — cannot derive the app hostname",
  );
  process.exit(1);
}
const appHost = appHostFromLandingUrl(landingUrl);
zone = zoneOf(appHost);

const configPath = resolve(
  homedir(),
  ".cloudflared",
  `${targetEnv}-config.yml`,
);
const config = buildIngressConfig({
  tunnelId,
  credentialsFile,
  appHost,
  appPort,
  supabasePort,
});
```

In the readiness poll, replace `if (launchedCount > 0 && baseHost) {` with `if (launchedCount > 0 && zone) {` and `const checkUrl = \`https://supabase.${baseHost}/auth/v1/health\`;` with `const checkUrl = \`https://supabase.${zone}/auth/v1/health\`;`.

Run: `grep -n "baseHost\|SUPABASE_AUTH_SITE_URL" scripts/cloudflared.mjs`
Expected: no output.

- [ ] **Step 6: Collapse the hostname list in `tunnel-switch.mjs`**

Replace the `CLOUDFLARE_HOSTNAMES` array with:

```js
// One hostname: the container's nginx routes every app by path prefix.
// The apex and www are separate sites and are not this project's to route.
const CLOUDFLARE_HOSTNAMES = ["store.furrycolombia.com"];
```

- [ ] **Step 7: Run the tunnel test suites and a config dry run**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/cloudflared.test.mjs scripts/__tests__/cloudflared-stop.test.mjs scripts/__tests__/tunnel-ingress.test.mjs`
Expected: PASS.

Run: `CLOUDFLARE_TUNNEL_APP_ENABLED=false node scripts/cloudflared.mjs --env staging && cat ~/.cloudflared/staging-config.yml`
Expected: the script prints `✓ Generated ~/.cloudflared/staging-config.yml (app: 7542, supabase: 64321)`, exits without launching, and the file lists `store.ffxivbe.org`, the three `*.ffxivbe.org` infra hostnames and the 404 rule, nothing else. (Requires `.secrets` for `$secret:` resolution in `.env.staging`; if `loadEnv` throws for a missing secret, skip this dry run and rely on the unit tests.)

- [ ] **Step 8: Update the tunnel docs**

In `docs/environment.md`, under "How `pnpm tunnel` works", replace the bullet `Derives the public hostname from \`SUPABASE_AUTH_SITE_URL\` — **fails if missing**` with:

```markdown
- Derives the app hostname from `NEXT_PUBLIC_LANDING_URL` — **fails if missing** — and the zone (`ffxivbe.org`) from its last two labels
```

Replace the "Config generation" subsection body (the YAML block and the sentence after it) with:

````markdown
The generated `~/.cloudflared/<env>-config.yml` has one app hostname — the
container's nginx routes every app by path behind it — plus the self-hosted
Supabase services:

```yaml
ingress:
  - hostname: store.ffxivbe.org
    service: http://127.0.0.1:7542 # HOST_PORT — all six apps, by path
  - hostname: supabase.ffxivbe.org
    service: http://127.0.0.1:64321 # SUPABASE_PORT
  - hostname: supabase-studio.ffxivbe.org
    service: http://127.0.0.1:64323 # SUPABASE_PORT + 2
  - hostname: mailpit.ffxivbe.org
    service: http://127.0.0.1:64324 # SUPABASE_PORT + 3
  - service: http_status:404
```
````

The app hostname is `NEXT_PUBLIC_LANDING_URL`'s host; the infra hostnames
share its zone. There are no per-app hostnames: `auth.`, `admin.`,
`payments.`, `studio.` and `landing.` are gone, and `scripts/lib/tunnel-ingress.mjs`
is the one place the list lives.

````

- [ ] **Step 9: Lint, format, commit**

Run: `pnpm exec prettier --write scripts/cloudflared.mjs scripts/tunnel-switch.mjs scripts/lib/tunnel-ingress.mjs scripts/__tests__/tunnel-ingress.test.mjs docs/environment.md && pnpm exec eslint scripts/cloudflared.mjs scripts/tunnel-switch.mjs scripts/lib/tunnel-ingress.mjs scripts/__tests__/tunnel-ingress.test.mjs --max-warnings=0`

Only if the user has authorized commits:

```bash
git add scripts/cloudflared.mjs scripts/tunnel-switch.mjs scripts/lib/tunnel-ingress.mjs scripts/__tests__/tunnel-ingress.test.mjs docs/environment.md
git commit -m "refactor(scripts): tunnel ingress routes one app hostname [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
````

---

### Task 9: Registry check cross-checks nginx

**Files:**

- Modify: `scripts/check-app-registry.sh`

**Interfaces:**

- Consumes: `config/app-links.json` (Task 1), `docker/prod/nginx.conf` (unchanged).
- Produces: the script fails when an app directory is missing from the registry, or when nginx lacks `location <path> {` or `server 127.0.0.1:<port>;` for a registered app.

- [ ] **Step 1: Prove the current script misses the gap**

Run (Git Bash):

```bash
mkdir -p apps/bogus && echo '{"name":"bogus"}' > apps/bogus/package.json
bash scripts/check-app-registry.sh; echo "exit=$?"
```

Expected: exit 1 listing `bogus` missing from the five existing files, but **no** line mentioning `config/app-links.json`. Leave the bogus directory in place for Step 3.

- [ ] **Step 2: Extend the script**

After `NGINX_CONF="docker/prod/nginx.conf"` add:

```bash
APP_LINKS="config/app-links.json"

# Node reads the registry so this works in Git Bash on Windows too (no jq).
registry_field() {
  # $1 = app name, $2 = field
  node -e '
    const [app, field] = process.argv.slice(1);
    const registry = require(require("path").resolve("config/app-links.json"));
    const entry = registry[app];
    if (!entry) process.exit(1);
    process.stdout.write(String(entry[field]));
  ' "$1" "$2" 2>/dev/null
}
```

Add `cd "$REPO_ROOT"` right after the `errors=()` line.

Inside the `for app_dir` loop, after the nginx check (`# --- 5.`), add:

```bash
  # --- 6. config/app-links.json (the routing registry) ---
  app_path="$(registry_field "$app_name" path || true)"
  app_port="$(registry_field "$app_name" port || true)"
  if [ -z "$app_path" ]; then
    errors+=("$app_name  missing from  $APP_LINKS")
  else
    # --- 7. nginx.conf routes the registered path to the registered port ---
    if ! grep -qE "location ${app_path} \{" "$NGINX_CONF"; then
      errors+=("$app_name  missing from  $NGINX_CONF (no 'location ${app_path} {' for the registry path)")
    fi
    if ! grep -qE "server 127\.0\.0\.1:${app_port};" "$NGINX_CONF"; then
      errors+=("$app_name  missing from  $NGINX_CONF (no upstream on :${app_port}, the registry port)")
    fi
  fi
```

In the final `echo` list, add two lines after `echo "  5. $NGINX_CONF"`:

```bash
echo "  6. $APP_LINKS (path + port)"
echo "  7. $NGINX_CONF must route that path to that port"
```

- [ ] **Step 3: Verify it now catches the gap, then remove the bogus app**

Run: `bash scripts/check-app-registry.sh; echo "exit=$?"`
Expected: exit 1 and a line `bogus  missing from  config/app-links.json`.

Run: `rm -rf apps/bogus && bash scripts/check-app-registry.sh; echo "exit=$?"`
Expected: `All apps in apps/* are fully registered.` and `exit=0`.

- [ ] **Step 4: Verify the nginx cross-check bites**

Run:

```bash
cp docker/prod/nginx.conf /tmp/nginx.bak
sed -i 's/server 127.0.0.1:5006;/server 127.0.0.1:5999;/' docker/prod/nginx.conf
bash scripts/check-app-registry.sh; echo "exit=$?"
cp /tmp/nginx.bak docker/prod/nginx.conf
git diff --quiet docker/prod/nginx.conf && echo restored
```

Expected: exit 1 with `studio  missing from  docker/prod/nginx.conf (no upstream on :5006, the registry port)`, then `restored`.

- [ ] **Step 5: Format, commit**

Run: `pnpm exec prettier --check scripts/check-app-registry.sh || true` (Prettier does not format shell; this confirms it is ignored.)

Only if the user has authorized commits:

```bash
git add scripts/check-app-registry.sh
git commit -m "chore(ci): app registry check verifies nginx routes each registry entry [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Documentation and the Clerk runbook

**Files:**

- Modify: `README.md:103-108` (ports table), `README.md:383-396` (dev URL table)
- Modify: `docs/production-status.md` (Restore runbook)
- Modify: `docs/infrastructure.md:245`
- Modify: `.claude/skills/e2e-eval/SKILL.md:100-111`

- [ ] **Step 1: README dev URLs**

Replace the table under `pnpm dev` (the one starting `| App        | URL`) with:

```markdown
`pnpm dev` also starts `scripts/dev-proxy.mjs` on `HOST_PORT` (5050), which
fronts the six dev servers by path prefix exactly as nginx does in the
container. Use these URLs; the per-app ports in `config/app-links.json` are
an implementation detail.

| App      | URL                              |
| -------- | -------------------------------- |
| Landing  | `http://localhost:5050`          |
| Store    | `http://localhost:5050/store`    |
| Admin    | `http://localhost:5050/admin`    |
| Payments | `http://localhost:5050/payments` |
| Studio   | `http://localhost:5050/studio`   |
| Auth     | `http://localhost:5050/auth`     |
```

Change the comment on the `pnpm dev` line in the code block above it from `# all 7 apps, .env.dev, Supabase Cloud dev project` to `# six apps + dev proxy, .env.dev, local Docker Supabase`.

Change `**Env debug viewer** — \`http://localhost:5002/en/env\``to`**Env debug viewer** — \`http://localhost:5050/admin/en/env\``.

- [ ] **Step 2: README app table**

In the `| App | Port | Route | Audience | Owns |` table, add one sentence directly under the table, before `\`apps/store\` is the **reference implementation**`:

```markdown
Ports are the per-app `next dev` ports from `config/app-links.json`; every
environment, dev included, serves all six from one origin by route.
```

- [ ] **Step 3: production-status Clerk and Supabase runbook**

In `docs/production-status.md`, after step 5 of `## Restore runbook` (`**Verify** the hostname returns \`200\`, not \`530\`.`) and before `### Decide these before starting`, insert:

```markdown
### Clerk production instance and the Supabase side effect

The apps assume one Clerk instance on one domain. Nothing in code changes for
production; these are dashboard steps, done once, before the first
authenticated request.

1. In Clerk, create the production instance with primary domain
   `store.furrycolombia.com`. Clerk lists the DNS records it needs — a
   frontend-API CNAME (`clerk.store.furrycolombia.com`), plus account-portal
   and email records if those features are used. Create them in the
   `furrycolombia.com` Cloudflare zone as **DNS-only** records.
2. Copy the production publishable key, secret key and frontend-API domain into
   the repository secrets `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and
   `CLERK_DOMAIN`. `.env.prod` already references all three.
3. In Clerk, set the sign-in, sign-up and after-sign-in paths under
   `/auth/<locale>/...`, matching the auth app's `basePath`.
4. **Change `SUPABASE_CLERK_DOMAIN` in `.env.prod`** from the development
   `regular-puma-47.clerk.accounts.dev` host to the production frontend-API
   domain, and set the same value on the production Supabase project's
   third-party-auth provider. Supabase trusts Clerk tokens by issuer domain: if
   this step is skipped, every authenticated Supabase call falls back to the
   anon key and returns nothing, with no error.
5. Restrict Clerk's allowed redirect origins to
   `https://store.furrycolombia.com`.

Dev and staging keep the development instance, which already works on
`localhost` and on the staging tunnel hostname. No satellite domains are
needed anywhere: every app shares the one origin.
```

- [ ] **Step 4: infrastructure.md**

Replace the paragraph at line 245 (`**⚠️ Only these 3 subdomains belong to this project...`) with:

```markdown
**⚠️ `store.furrycolombia.com` is the only app hostname this project routes;
all six apps live behind it by path.** `furrycolombia.com` and
`moonfest.furrycolombia.com` are separate sites. Never modify their DNS records.
```

- [ ] **Step 5: e2e-eval skill**

In `.claude/skills/e2e-eval/SKILL.md`, under `**dev:**`, replace `- Apps: \`pnpm dev\` (starts all apps on their ports)`with`- Apps: \`pnpm dev\` (six dev servers plus the dev proxy on \`HOST_PORT\`, 5050; tests hit \`http://localhost:5050/<app>\`)`. Under `**staging:**`, replace `- All URLs go through the tunnel (e.g. \`https://store.ffxivbe.org\`)` with `- All URLs go through the tunnel on the one hostname, by path (e.g. \`https://store.ffxivbe.org/auth\`)`.

- [ ] **Step 6: Doc gates, format, commit**

Run: `pnpm exec prettier --write README.md docs/production-status.md docs/infrastructure.md .claude/skills/e2e-eval/SKILL.md && node scripts/check-doc-references.mjs && pnpm exec cspell "README.md" "docs/production-status.md" "docs/infrastructure.md"`
Expected: `Instruction files cite only things that exist`, cspell 0 issues.

Only if the user has authorized commits:

```bash
git add README.md docs/production-status.md docs/infrastructure.md .claude/skills/e2e-eval/SKILL.md
git commit -m "docs: single-origin dev URLs and the Clerk production runbook [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

**Files:**

- Modify: `tests/INVENTORY.md`, `tests/inventory.json` (regenerated)

- [ ] **Step 1: Regenerate the test inventory and check for lost cases**

Run: `pnpm test:inventory && bash scripts/test-inventory-diff.sh develop`
Expected: `OK: no cases lost.` The ADDED list names the new proxy, registry, ingress and cookie tests. If a LOST line appears, its exact name goes into `tests/retired-cases.txt` with a reason, and this step is rerun.

- [ ] **Step 2: Quality gates, in CI order**

Run each, expect exit 0:

```bash
pnpm format:check
pnpm lint
pnpm lint:env
pnpm check:style
pnpm check:tools
bash scripts/check-app-registry.sh
pnpm typecheck
pnpm test:coverage
pnpm test:workflows
pnpm build
```

If `pnpm check:tools` reports `http-proxy` as unused, knip is not seeing `scripts/lib/dev-proxy-server.mjs`; confirm the import line is present and that the file path matches `scripts/**/*.mjs`.

- [ ] **Step 3: E2E through the dev proxy**

Run: `pnpm e2e:dev`
Expected: Supabase starts, `pnpm dev` starts, the script waits for the target app port and for `:5050`, and every Playwright project passes. Failing specs are diagnosed before anything else proceeds; the tests are the acceptance criteria, not an obstacle.

- [ ] **Step 4: E2E through nginx in the CI container**

Run: `pnpm e2e:ci`
Expected: the CI image builds with `STANDALONE=true`, the container serves on `:5050`, and all projects pass. Then run the Docker health spec: `sh scripts/docker-health-check.sh` and expect the seven routes to respond below 400.

- [ ] **Step 5: Manual single-origin check**

With `pnpm dev` running, in a browser:

1. Open `http://localhost:5050/store/en`. Confirm HMR works: edit any text in a store component, see it update without reload. Do the same on `http://localhost:5050/en` (landing).
2. Click sign in. The URL becomes `http://localhost:5050/auth/en/login?returnTo=...`. Sign in with the test account from `.env.dev`.
3. You land back on `http://localhost:5050/store/en` signed in. In DevTools → Application → Cookies, every `localhost` cookie has an empty Domain column (host-only).
4. Add a product to the cart, open `http://localhost:5050/payments/en`, and see the item.
5. Open `http://localhost:5050/storefront`. Landing's 404 page renders, not store's.

Expected: all five hold.

- [ ] **Step 6: Report**

List every changed file, the gate results with their exact final lines, and the three E2E outcomes. Do not claim anything green that was not run. Do not commit or push unless the user has said to; if they have, this is the point to run `/submit-pr`.

---

## Self-review notes

- **Spec coverage:** 3.1 → Task 1 and 9; 3.2 → Task 3 and 4; 3.3 → Task 5; 3.4 → Tasks 2, 6 and 8 (`cloudflared` hostname source); 3.5 → Task 8 and 10; 3.6 → Task 7; 3.7 → Task 9; 3.8 → Task 10; section 4 error table → Task 3 Steps 6, 10, 11 and Task 9; section 5 → Tasks 1, 3, 7, 8, 11.
- **Deviation from the spec, stated:** section 5 asks for a unit test of `scripts/app-url-resolver.js`'s fallback. That file is CommonJS and loads the env on require, so a unit test would need a `.secrets`-free env fixture. The fallback is two lines mirroring `devUrlForApp`, which is tested in Task 1, and every env file sets the explicit URLs so the fallback is exercised by `pnpm e2e:dev` only when a key is missing. If the reviewer wants it pinned, the cheapest honest test is a `node -e` spawn with `TARGET_ENV=ci`, added to `scripts/__tests__/app-registry.test.mjs`.
- **Type consistency:** `loadAppRegistry`, `portForApp`, `devUrlForApp` (Task 1) are the names used in Tasks 3 and 4; `buildRoutes`, `matchRoute` (Task 3) are used by `createDevProxyServer`; `appHostFromLandingUrl`, `zoneOf`, `buildIngressConfig` (Task 8) are the names wired into `cloudflared.mjs`.
- **Review Focus:** items 1 and 2 → Task 3 Step 2; item 3 → Task 3 Step 6; item 4 → Task 7 Steps 1, 5, 9; item 5 → Task 9 Steps 3 and 4.
