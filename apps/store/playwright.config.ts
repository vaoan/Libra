import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// Load env vars (resolves $secret: refs and sets TARGET_ENV-specific config)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadRootEnv } = require(
  path.resolve(__dirname, "../../scripts/load-root-env.cjs"),
);
loadRootEnv({ targetEnv: process.env.TARGET_ENV });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../scripts/app-url-resolver.js"),
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getE2EExtraHTTPHeaders } = require(
  path.resolve(__dirname, "../../scripts/app-url-resolver.js"),
);
const appUrls = resolveE2EAppUrls();
const extraHTTPHeaders = getE2EExtraHTTPHeaders();

// Production runs (TARGET_ENV=prod) have zero tolerance for flakiness: no
// retries, and a trace kept for every failed attempt, so a flake fails the run
// and leaves evidence instead of a "flaky" badge and a screenshot.
const isProductionTarget = process.env.TARGET_ENV === "prod";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: isProductionTarget ? 0 : process.env.CI ? 2 : 0,
  maxFailures: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 60_000,
  use: {
    baseURL: appUrls.store,
    extraHTTPHeaders,
    trace: isProductionTarget ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
    navigationTimeout: 45_000,
  },
  projects: [
    // Setup: create authenticated session before tests
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      teardown: "cleanup",
    },
    // Cleanup: runs after every dependent project finishes (pass or fail) —
    // deletes the throwaway Clerk user auth.setup.ts created. Clerk's dev
    // instance is a shared external service, not ephemeral per-run
    // infrastructure like the Docker Supabase stack, so without this every
    // CI run leaks a user permanently.
    {
      name: "cleanup",
      testMatch: /auth\.teardown\.ts/,
    },
    // Tests: run with authenticated session
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/session.json",
      },
      dependencies: ["setup"],
    },
  ],
  // Full-stack E2E only: app servers are managed externally.
  webServer: undefined,
});
