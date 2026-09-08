/* eslint-disable playwright/no-conditional-in-test -- Google's hosted
 * sign-in shows different screens depending on session state, and this spec
 * has to walk whichever appears. It is a manual-only harness: the test is
 * unconditionally skipped in CI because the provider blocks automated
 * browsers, so these branches never run there. See
 * docs/standards/quality-gates.md for what that leaves untested. */
import * as path from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-require-imports */
const { loadRootEnv } = require("../../../scripts/load-root-env.cjs");
const { resolveE2EAppUrls } = require("../../../scripts/app-url-resolver.js");
/* eslint-enable @typescript-eslint/no-require-imports */
loadRootEnv({ targetEnv: process.env.TARGET_ENV });

function loadLocalE2EEnv(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadLocalE2EEnv(path.resolve(__dirname, "../../../.env.local.e2e"));
const {
  auth: AUTH_URL,
  store: STORE_URL,
  admin: ADMIN_URL,
  landing: LANDING_URL,
  payments: PAYMENTS_URL,
  studio: STUDIO_URL,
} = resolveE2EAppUrls();

// In staging, OAuth redirects go through the public tunnel URL, not localhost.
// Accept both the local container URL and the public NEXT_PUBLIC_AUTH_URL.
const PUBLIC_AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? AUTH_URL;
const PUBLIC_STORE_URL = process.env.NEXT_PUBLIC_STORE_URL ?? STORE_URL;
const PUBLIC_LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? LANDING_URL;
const PUBLIC_PAYMENTS_URL =
  process.env.NEXT_PUBLIC_PAYMENTS_URL ?? PAYMENTS_URL;
const PUBLIC_ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? ADMIN_URL;
const PUBLIC_STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL ?? STUDIO_URL;

// When OAuth is used, the session cookie is on the public domain (tunnel).
// Use public URLs for cross-app checks so the session carries over.
const isOAuthEnv = PUBLIC_AUTH_URL !== AUTH_URL;

const APP_CHECKS = [
  {
    name: "landing",
    url: `${isOAuthEnv ? PUBLIC_LANDING_URL : LANDING_URL}/en`,
    readyTestIds: ["hero-section"],
  },
  {
    name: "store",
    url: `${isOAuthEnv ? PUBLIC_STORE_URL : STORE_URL}/en`,
    readyTestIds: ["product-catalog-page"],
  },
  {
    name: "payments",
    url: `${isOAuthEnv ? PUBLIC_PAYMENTS_URL : PAYMENTS_URL}/en`,
    readyTestIds: ["payments-page", "access-denied"],
  },
  {
    name: "admin",
    url: `${isOAuthEnv ? PUBLIC_ADMIN_URL : ADMIN_URL}/en`,
    readyTestIds: ["admin-page", "access-denied"],
  },
  {
    name: "studio",
    url: `${isOAuthEnv ? PUBLIC_STUDIO_URL : STUDIO_URL}/en`,
    readyTestIds: ["product-list-page", "access-denied"],
  },
] as const;

async function waitForAnyVisible(
  page: import("@playwright/test").Page,
  selectors: string[],
  timeout = 15000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }

    // The poll interval of a hand-rolled race across Google's own markup,
    // which varies by account state and locale. Playwright's .or() would
    // express it natively, but rewriting a flow that can only be exercised
    // against the live provider is not something a lint sweep should do blind.
    // eslint-disable-next-line playwright/no-wait-for-timeout -- see above
    await page.waitForTimeout(500);
  }

  return null;
}

async function expectAuthenticatedAcrossApps(
  page: import("@playwright/test").Page,
) {
  for (const app of APP_CHECKS) {
    await page.goto(app.url);
    await expect(
      page,
      `${app.name} should not bounce back to login`,
    ).not.toHaveURL(/\/login(\?|$)/);
    await expect(
      page.getByTestId("nav-user-email"),
      `${app.name} should keep the signed-in email visible`,
    ).not.toBeEmpty();

    const readyLocator = await waitForAnyVisible(
      page,
      app.readyTestIds.map((testId) => `[data-testid="${testId}"]`),
      10000,
    );
    expect(
      readyLocator,
      `${app.name} should render one of: ${app.readyTestIds.join(", ")}`,
    ).not.toBeNull();
  }
}

test("Google OAuth login flow", async ({ page }) => {
  // Requires a pre-seeded Chrome profile with an active Google session AND
  // Google's cooperation (they actively block Playwright automation). Run
  // manually only — never in CI or staging.
  test.skip(
    true,
    "Google OAuth requires live credentials and manual execution — not suitable for automated runs",
  );

  const googleEmail = process.env.GOOGLE_TEST_EMAIL;
  const googlePassword = process.env.GOOGLE_TEST_PASSWORD;

  test.skip(
    !googleEmail || !googlePassword,
    "GOOGLE_TEST_EMAIL and GOOGLE_TEST_PASSWORD required",
  );

  test.setTimeout(120_000);

  const oauthStartUrl =
    PUBLIC_AUTH_URL !== AUTH_URL ? PUBLIC_AUTH_URL : AUTH_URL;
  await page.goto(`${oauthStartUrl}/en/login`);
  await expect(page.getByTestId("login-google")).toBeVisible();
  console.log("[e2e] Login page loaded");

  await page.getByTestId("login-google").click();
  console.log("[e2e] Clicked Google");

  await page.waitForURL((url) => url.hostname.includes("google"), {
    timeout: 30000,
  });
  console.log("[e2e] Navigated to:", page.url());

  const emailChoice = page
    .locator(`[data-identifier="${googleEmail!}"]`)
    .first();
  if (await emailChoice.isVisible({ timeout: 5000 }).catch(() => false)) {
    await emailChoice.click();
    console.log("[e2e] Selected existing Google account");
  }

  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await emailInput.fill(googleEmail!);
    const nextBtn = page
      .locator(
        "#identifierNext button, button:has-text('Next'), button:has-text('Siguiente')",
      )
      .first();
    await nextBtn.click();
    console.log("[e2e] Submitted email");
  }

  const passwordInput = page
    .locator('input[name="Passwd"], input[type="password"]')
    .first();
  if (await passwordInput.isVisible({ timeout: 10000 }).catch(() => false)) {
    await passwordInput.fill(googlePassword!);
    const nextBtn = page
      .locator(
        "#passwordNext button, button:has-text('Next'), button:has-text('Siguiente')",
      )
      .first();
    await nextBtn.click();
    console.log("[e2e] Submitted password");
  }

  await page.waitForURL(
    (url) =>
      url.href.startsWith(AUTH_URL) || url.href.startsWith(PUBLIC_AUTH_URL),
    { timeout: 45000 },
  );
  console.log("[e2e] Back on app:", page.url());

  // The account-page check below waits on its own (isVisible has a timeout),
  // so settling here was redundant.
  const isAccountPage = await page
    .getByTestId("account-settings-page")
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  expect(isAccountPage, "Should show account page").toBe(true);
  await expect(page.getByTestId("profile-card")).toBeVisible();
  await expect(page.getByTestId("sign-out")).toBeVisible();
  await expectAuthenticatedAcrossApps(page);
  console.log("[e2e] All passed");
});
