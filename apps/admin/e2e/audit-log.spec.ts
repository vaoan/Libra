import { ELEMENT_TIMEOUT_MS } from "../../auth/e2e/helpers/constants";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  ADMIN_PERMISSIONS,
  createTestUser,
  injectSession,
  type TestUser,
} from "../../auth/e2e/helpers/session";

// ─── Helpers ─────────────────────────────────────────────────────

function getAdminBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (!url) throw new Error("NEXT_PUBLIC_ADMIN_URL is required.");
  return url;
}

// ─── Test suite ───────────────────────────────────────────────────

test.describe.serial("Audit Log page", () => {
  let adminUser: TestUser;

  test.beforeAll(async () => {
    adminUser = await createTestUser("audit-log-e2e", ADMIN_PERMISSIONS);
  });

  // ─── Page structure ──────────────────────────────────────────────

  test("loads audit log page without errors", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`, {});

    await expect(page.getByTestId("audit-log-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("audit-title")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });

  test("shows filters bar", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`, {});

    await expect(page.getByTestId("audit-filters")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("audit-filter-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("audit-filter-all")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });

  test("renders audit table or empty state — no error state", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`);

    // Anchor on a positive, retrying assertion first: the page has loaded once
    // it shows either rows or the empty state. That replaces both the
    // networkidle wait and the fixed sleep, and it is a stronger claim -- it
    // proves the page rendered rather than assuming a time window sufficed.
    // It also replaces a pair of one-shot isVisible() reads, which do not
    // retry and so raced the render they were meant to observe.
    await expect(
      page.getByTestId("audit-table").or(page.getByTestId("audit-empty")),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Only now does the negative assertion mean anything: the page is up, so
    // the error state being absent is a fact rather than a race.
    await expect(page.getByTestId("audit-error")).toBeHidden();
  });

  test("action type filters update the view without errors", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`, {});

    await expect(page.getByTestId("audit-filters")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // Click INSERT filter
    await page.getByTestId("audit-filter-insert").click();

    // The pill reports its own state through aria-pressed, so the test can
    // wait for the filter to actually apply instead of sleeping and hoping.
    // That attribute was added for this: the active pill used to be
    // distinguishable only by a CSS class, which is exactly what the
    // e2e-selectors rule forbids asserting on.
    await expect(page.getByTestId("audit-filter-insert")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Error state must not appear after filtering
    await expect(page.getByTestId("audit-error")).toBeHidden();

    // Reset to all
    await page.getByTestId("audit-filter-all").click();
    await expect(page.getByTestId("audit-filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect(page.getByTestId("audit-error")).toBeHidden();
  });

  test("table filter dropdown is populated with table names", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`, {});

    const tableSelect = page.getByTestId("audit-filter-table");
    await expect(tableSelect).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // The select should have at least the default "all tables" option
    const optionCount = await tableSelect.locator("option").count();
    expect(optionCount).toBeGreaterThanOrEqual(1);
  });

  // ─── Access control ───────────────────────────────────────────────

  test("user without audit.read permission sees access denied", async ({
    context,
    page,
  }) => {
    const limitedUser = await createTestUser("audit-limited-e2e", [
      ...ADMIN_PERMISSIONS.filter((p) => p !== "audit.read"),
    ]);

    await injectSession(context, limitedUser);
    await page.goto(`${getAdminBaseUrl()}/en/audit`);

    // A user without audit.read gets the access-denied state, so there is a
    // positive thing to wait for. Asserting that it appears is also a
    // stronger claim than the absence below: absence alone is satisfied by a
    // page that never rendered, which is why this used to need a
    // networkidle wait to mean anything.
    await expect(page.getByTestId("access-denied")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // And the audit content itself must not be there.
    await expect(page.getByTestId("audit-log-page")).toBeHidden();
  });
});
