import path from "node:path";

import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures/autoCleanup";

import { cleanupTestData } from "./helpers/cleanup";
import {
  APP_URLS,
  ELEMENT_TIMEOUT_MS,
  LONG_OPERATION_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
} from "./helpers/constants";
import {
  ADMIN_PERMISSIONS,
  adminQuery,
  createTestUser,
  injectSession,
  type TestUser,
} from "./helpers/session";
import { createSnapHelper } from "./helpers/snap";

const { snap, resetCounter } = createSnapHelper(
  path.resolve(__dirname, "screenshots-permissions"),
);

const ALL_APP_PERMISSIONS = [
  "products.create",
  "products.read",
  "products.update",
  "products.delete",
  "product_reviews.create",
  "product_reviews.read",
  "product_reviews.update",
  "product_reviews.delete",
  "orders.create",
  "orders.read",
  "orders.update",
  "receipts.create",
  "receipts.read",
  "receipts.delete",
  "seller_payment_methods.create",
  "seller_payment_methods.read",
  "seller_payment_methods.update",
  "seller_payment_methods.delete",
  "payment_settings.read",
  "payment_settings.update",
  "templates.create",
  "templates.read",
  "templates.update",
  "templates.delete",
  "audit.read",
  "user_permissions.create",
  "user_permissions.read",
  "user_permissions.update",
  "user_permissions.delete",
  "events.create",
  "events.read",
  "events.update",
  "events.delete",
  "check_ins.create",
  "check_ins.read",
  "check_ins.update",
] as const;

async function navigateToUserDetail(
  page: Page,
  targetUserId: string,
): Promise<void> {
  await page.goto(`${APP_URLS.ADMIN}/en/users/${targetUserId}`, {
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId("user-detail-page")).toBeVisible({
    timeout: NAVIGATION_TIMEOUT_MS,
  });
}

async function getGrantedPermissionKeys(userId: string): Promise<string[]> {
  const rows = await adminQuery(
    "user_permissions",
    [
      `user_id=eq.${userId}`,
      "select=resource_permissions!inner(permissions!inner(key))",
    ].join("&"),
  );

  return rows
    .map((row) => {
      const resourcePermissions = row.resource_permissions as
        | { permissions?: { key?: string } }
        | Array<{ permissions?: { key?: string } }>
        | undefined;

      if (Array.isArray(resourcePermissions)) {
        return resourcePermissions[0]?.permissions?.key;
      }

      return resourcePermissions?.permissions?.key;
    })
    .filter((key): key is string => Boolean(key));
}

async function waitForPermissionState(
  userId: string,
  expected: Record<string, boolean>,
): Promise<void> {
  const deadline = Date.now() + LONG_OPERATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const grantedKeys = await getGrantedPermissionKeys(userId);
    const matches = Object.entries(expected).every(
      ([permissionKey, desired]) =>
        desired
          ? grantedKeys.includes(permissionKey)
          : !grantedKeys.includes(permissionKey),
    );

    if (matches) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for permission state: ${JSON.stringify(expected)}`,
  );
}

async function setPermissions(
  page: Page,
  context: BrowserContext,
  admin: TestUser,
  target: TestUser,
  updates: Record<string, boolean>,
): Promise<void> {
  await injectSession(context, admin);
  await navigateToUserDetail(page, target.userId);

  for (const [permissionKey, desired] of Object.entries(updates)) {
    const checkbox = page.getByTestId(`permission-toggle-${permissionKey}`);
    await expect(checkbox).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const current = await checkbox.isChecked();
    if (current !== desired) {
      await checkbox.click();
      await waitForPermissionState(target.userId, { [permissionKey]: desired });
    }

    if (desired) {
      await expect(checkbox).toBeChecked({ timeout: ELEMENT_TIMEOUT_MS });
    } else {
      await expect(checkbox).not.toBeChecked({ timeout: ELEMENT_TIMEOUT_MS });
    }
  }
}

async function expectVisible(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeVisible({
    timeout: ELEMENT_TIMEOUT_MS,
  });
}

async function expectHidden(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toHaveCount(0, {
    timeout: ELEMENT_TIMEOUT_MS,
  });
}

// Retry once on net::ERR_ABORTED — the Cloudflare tunnel occasionally blips
// under load, aborting the first navigation. A single retry distinguishes a
// transient tunnel hiccup from a real failure.
async function gotoWithRetry(
  page: Page,
  url: string,
  options?: Parameters<Page["goto"]>[1],
): Promise<void> {
  try {
    await page.goto(url, options);
  } catch {
    await page.goto(url, options);
  }
}

// Navigate to a payments URL with a fully fresh auth session.
//
// WHY THE EXTRA WAIT EXISTS:
// The payments sidebar hides all nav items while useCurrentUserPermissions is
// loading (isLoading=true). Permission state is resolved client-side via two
// sequential Supabase round-trips after page load:
//   1. useAuth → getUser()           (JWT validation, ~100–500 ms)
//   2. useCurrentUserPermissions     (DB query for granted keys, ~100–500 ms)
//
// Using waitUntil:"domcontentloaded" means the page's JS has not yet started
// those fetches. Under load (e.g. when running the full suite), the combined
// round-trips can exceed ELEMENT_TIMEOUT_MS, causing sidebar assertions to fail
// even though the permission IS granted — the sidebar is simply still loading.
//
// waitUntil:"networkidle" is not viable because the payments app keeps
// persistent connections open (Supabase realtime channel), so networkidle
// never fires and the goto call times out.
//
// FIX: PaymentsSidebar exposes data-loading={isLoading} on its container. We
// wait for data-loading="false" before returning, guaranteeing that all
// permission-gated sidebar items have been rendered and are ready to assert on.
async function navigateWithFreshSession(
  context: BrowserContext,
  page: Page,
  user: TestUser,
  url: string,
): Promise<void> {
  await context.clearCookies();
  await injectSession(context, user);
  await gotoWithRetry(page, `${APP_URLS.AUTH}/en`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("app-navigation")).toBeVisible({
    timeout: ELEMENT_TIMEOUT_MS,
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  /* eslint-disable no-restricted-syntax -- getByTestId can't express compound attribute selectors; we need both data-testid and data-loading in one locator */
  await page
    .locator('[data-testid="payments-sidebar"][data-loading="false"]')
    .waitFor({ state: "visible", timeout: NAVIGATION_TIMEOUT_MS });
  /* eslint-enable no-restricted-syntax */
}

test.describe.serial("Permission management", () => {
  let admin: TestUser;
  let target: TestUser;

  test.beforeAll(async () => {
    resetCounter();
    admin = await createTestUser("permissions-admin", ADMIN_PERMISSIONS);
    target = await createTestUser("permissions-target", ADMIN_PERMISSIONS);
  });

  test.afterAll(async () => {
    if (admin && target) {
      await cleanupTestData(admin.userId, target.userId);
    }
  });

  test("shows the full permission matrix in admin", async ({
    context,
    page,
  }) => {
    await injectSession(context, admin);
    await navigateToUserDetail(page, target.userId);

    for (const permissionKey of ALL_APP_PERMISSIONS) {
      await expect(
        page.getByTestId(`permission-toggle-${permissionKey}`),
      ).toBeVisible({
        timeout: ELEMENT_TIMEOUT_MS,
      });
    }

    await snap(page, "permissions-matrix");
  });

  test("turns studio permissions off and on", async ({ context, page }) => {
    await injectSession(context, target);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectVisible(page, "new-product-button");
    await snap(page, "studio-baseline");

    await setPermissions(page, context, admin, target, {
      "products.create": false,
    });

    await injectSession(context, target);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectHidden(page, "new-product-button");
    await snap(page, "studio-create-hidden");

    // Clear cookies and re-inject session to force a completely fresh auth state,
    // then navigate to the create page to verify access-denied.
    //
    // WHY THE AUTH WARM-UP EXISTS:
    // Navigating directly to a studio URL after clearCookies() + injectSession()
    // causes ProtectedRoute to fire globalThis.location.replace() before the
    // page load event fires — Playwright reports this as net::ERR_ABORTED.
    // Going through AUTH first lets the Supabase client resolve the injected
    // session before we hit the studio route (same technique as navigateWithFreshSession).
    await context.clearCookies();
    await injectSession(context, target);
    await gotoWithRetry(page, `${APP_URLS.AUTH}/en`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("app-navigation")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page.goto(`${APP_URLS.STUDIO}/en/products/new`, {
      waitUntil: "domcontentloaded",
    });
    await expectVisible(page, "access-denied");

    await setPermissions(page, context, admin, target, {
      "products.create": true,
      "products.read": false,
    });

    await injectSession(context, target);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectVisible(page, "access-denied");
    await snap(page, "studio-read-blocked");

    await setPermissions(page, context, admin, target, {
      "products.read": true,
      "products.create": true,
    });

    await injectSession(context, target);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectVisible(page, "new-product-button");
    await snap(page, "studio-restored");
  });

  // Timeout raised to 180 s (from the default 60 s) because this test performs
  // 8 navigateWithFreshSession calls + 4 setPermissions mutations. Each
  // navigation now correctly waits for the sidebar's permission state to settle,
  // which adds a small but necessary delay per step. 60 s was sufficient when
  // running in isolation but regularly exceeded under full-suite load.
  test("turns payments sections off and on", async ({ context, page }) => {
    test.setTimeout(180_000);
    await setPermissions(page, context, admin, target, {
      "orders.create": true,
      "orders.read": true,
      "orders.update": true,
      "receipts.create": true,
      "receipts.read": true,
      "seller_payment_methods.read": true,
    });

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/checkout`,
    );
    await expectVisible(page, "sidebar-checkout");
    await expectVisible(page, "sidebar-myPurchases");
    await expectVisible(page, "sidebar-paymentMethods");
    await expectVisible(page, "sidebar-sales");
    await snap(page, "payments-baseline");

    await setPermissions(page, context, admin, target, {
      "seller_payment_methods.read": false,
    });

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/purchases`,
    );
    await expectVisible(page, "sidebar-myPurchases");
    await expectHidden(page, "sidebar-paymentMethods");
    await snap(page, "payments-methods-hidden");

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/payment-methods`,
    );
    await expectVisible(page, "access-denied");

    await setPermissions(page, context, admin, target, {
      "seller_payment_methods.read": true,
      "orders.create": false,
      "receipts.create": false,
    });

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/purchases`,
    );
    await expectVisible(page, "sidebar-myPurchases");
    await expectHidden(page, "sidebar-checkout");
    await snap(page, "payments-checkout-hidden");

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/checkout`,
    );
    await expectVisible(page, "access-denied");

    await setPermissions(page, context, admin, target, {
      "orders.create": true,
      "receipts.create": true,
      "orders.update": false,
    });

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/purchases`,
    );
    await expectVisible(page, "sidebar-myPurchases");
    await expectHidden(page, "sidebar-sales");
    await snap(page, "payments-sales-hidden");

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/sales`,
    );
    await expectVisible(page, "access-denied");

    await setPermissions(page, context, admin, target, {
      "seller_payment_methods.read": true,
      "orders.create": true,
      "orders.read": true,
      "receipts.create": true,
      "receipts.read": true,
      "orders.update": true,
    });

    await navigateWithFreshSession(
      context,
      page,
      target,
      `${APP_URLS.PAYMENTS}/en/checkout`,
    );
    await expectVisible(page, "sidebar-checkout");
    await expectVisible(page, "sidebar-paymentMethods");
    await expectVisible(page, "sidebar-sales");
    await snap(page, "payments-restored");
  });

  test("turns admin sections off and on", async ({ context, page }) => {
    await injectSession(context, target);
    await page.goto(`${APP_URLS.ADMIN}/en`);
    await expectVisible(page, "sidebar-templates");
    await expectVisible(page, "sidebar-auditLog");
    await expectVisible(page, "sidebar-users");
    await expectVisible(page, "sidebar-settings");
    await snap(page, "admin-baseline");

    await setPermissions(page, context, admin, target, {
      "templates.read": false,
      "audit.read": false,
      "user_permissions.read": false,
      "payment_settings.read": false,
    });

    await injectSession(context, target);
    await page.goto(`${APP_URLS.ADMIN}/en`);
    await expectVisible(page, "access-denied");
    await snap(page, "admin-all-sections-hidden");

    await page.goto(`${APP_URLS.ADMIN}/en/users`);
    await expectVisible(page, "access-denied");

    await page.goto(`${APP_URLS.ADMIN}/en/templates`);
    await expectVisible(page, "access-denied");

    await page.goto(`${APP_URLS.ADMIN}/en/audit`);
    await expectVisible(page, "access-denied");

    await page.goto(`${APP_URLS.ADMIN}/en/settings`);
    await expectVisible(page, "access-denied");

    await setPermissions(page, context, admin, target, {
      "templates.read": true,
      "audit.read": true,
      "user_permissions.read": true,
      "payment_settings.read": true,
    });

    await injectSession(context, target);
    await page.goto(`${APP_URLS.ADMIN}/en`);
    await expectVisible(page, "sidebar-templates");
    await expectVisible(page, "sidebar-auditLog");
    await expectVisible(page, "sidebar-users");
    await expectVisible(page, "sidebar-settings");
    await snap(page, "admin-restored");
  });

  test("applies none and admin templates cleanly", async ({
    context,
    page,
  }) => {
    await injectSession(context, admin);
    await navigateToUserDetail(page, target.userId);
    await page.getByTestId("template-btn-none").click();

    await expect(
      page.getByTestId("permission-toggle-products.read"),
    ).not.toBeChecked();
    await expect(
      page.getByTestId("permission-toggle-user_permissions.read"),
    ).not.toBeChecked();
    await snap(page, "template-none-applied");

    await injectSession(context, target);
    await page.goto(`${APP_URLS.ADMIN}/en`);
    await expectVisible(page, "access-denied");
    await expectHidden(page, "nav-link-admin");
    await expectHidden(page, "nav-link-payments");
    await expectHidden(page, "nav-link-studio");
    await expectVisible(page, "nav-link-landing");
    await expectVisible(page, "nav-link-store");
    await expectVisible(page, "nav-link-auth");

    await page.goto(`${APP_URLS.PAYMENTS}/en/checkout`);
    await expectVisible(page, "access-denied");

    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectVisible(page, "access-denied");
    await snap(page, "all-apps-blocked");

    await injectSession(context, admin);
    await navigateToUserDetail(page, target.userId);
    await page.getByTestId("template-btn-admin").click();

    await expect(
      page.getByTestId("permission-toggle-products.read"),
    ).toBeChecked({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(
      page.getByTestId("permission-toggle-user_permissions.read"),
    ).toBeChecked({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "template-admin-restored");

    await injectSession(context, target);
    await page.goto(`${APP_URLS.ADMIN}/en`);
    await expectVisible(page, "sidebar-users");
    await expectVisible(page, "nav-link-admin");
    await expectVisible(page, "nav-link-payments");
    await expectVisible(page, "nav-link-studio");

    await page.goto(`${APP_URLS.PAYMENTS}/en/checkout`);
    await expectVisible(page, "sidebar-checkout");

    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expectVisible(page, "new-product-button");
    await snap(page, "all-apps-restored");
  });
});
