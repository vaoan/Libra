import {
  ELEMENT_TIMEOUT_MS,
  MUTATION_WAIT_MS,
} from "../../auth/e2e/helpers/constants";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  ADMIN_PERMISSIONS,
  adminDelete,
  adminInsert,
  createTestUser,
  injectSession,
  supabaseAdmin,
  type TestUser,
} from "../../auth/e2e/helpers/session";
import {
  RECEIPT_FILENAME,
  patchOrderReceiptUrl,
  uploadTestReceipt,
  verifyReceiptLinkResolves,
} from "../../auth/e2e/helpers/receiptFixtures";

// ─── Test data ────────────────────────────────────────────────────

const TEST_ORDER = {
  total: 50000,
  currency: "COP",
  payment_status: "approved",
  transfer_number: "E2E-REPORT-001",
  receipt_url: null,
};

const TEST_ORDER_ITEM = {
  quantity: 2,
  unit_price: 25000,
  currency: "COP",
};

// ─── Helpers ─────────────────────────────────────────────────────

function getAdminBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (!url) throw new Error("NEXT_PUBLIC_ADMIN_URL is required.");
  return url;
}

// ─── Test suite ───────────────────────────────────────────────────

test.describe.serial("Reports page", () => {
  let adminUser: TestUser;
  let buyerUser: TestUser;
  let orderId: string;
  let productId: string;
  let receiptStoragePath: string;

  test.beforeAll(async () => {
    adminUser = await createTestUser("admin-reports", [
      ...ADMIN_PERMISSIONS,
      "admin.reports",
    ]);

    buyerUser = await createTestUser("buyer-reports", []);

    // Create a minimal product so order_items FK resolves
    const product = await adminInsert("products", {
      seller_id: adminUser.userId,
      slug: `e2e-report-product-${Date.now()}`,
      name_en: "E2E Report Product",
      name_es: "Producto E2E Reporte",
      description_en: "Created for reports E2E test",
      description_es: "Creado para prueba E2E de reportes",
      type: "merch",
      category: "merch",
      price: 25000,
      currency: "COP",
      max_quantity: 5,
      is_active: true,
      images: [],
      sections: [],
      tags: [],
      sort_order: 0,
      featured: false,
    });
    productId = product.id as string;

    // Create an order for the buyer
    const order = await adminInsert("orders", {
      ...TEST_ORDER,
      user_id: buyerUser.userId,
      seller_id: adminUser.userId,
    });
    orderId = order.id as string;

    // Upload a receipt image and attach its storage path to the order so
    // the reports table can verify the API converts paths into signed URLs.
    receiptStoragePath = `${orderId}/${RECEIPT_FILENAME}`;
    await uploadTestReceipt(receiptStoragePath);
    await patchOrderReceiptUrl(orderId, receiptStoragePath);

    // Create an order item
    await adminInsert("order_items", {
      order_id: orderId,
      product_id: productId,
      ...TEST_ORDER_ITEM,
    });
  });

  test.afterAll(async () => {
    await adminDelete("order_items", `order_id=eq.${orderId}`).catch(() => {});
    await adminDelete("orders", `id=eq.${orderId}`).catch(() => {});
    await adminDelete("products", `id=eq.${productId}`).catch(() => {});
    if (receiptStoragePath) {
      await supabaseAdmin.storage
        .from("receipts")
        .remove([receiptStoragePath])
        .catch(() => {});
    }
  });

  // ─── Page structure ─────────────────────────────────────────────

  test("displays page with filters, table and export button", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    await expect(page.getByTestId("reports-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("reports-export-button")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });

  test("shows the orders table once data loads", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    await expect(page.getByTestId("report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await expect(page.getByTestId("reports-total-count")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("reports-total-count")).not.toBeEmpty();
  });

  // ─── Filter interactions ─────────────────────────────────────────

  test("status filter updates URL query param and re-fetches", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const statusSelect = page.getByTestId("reports-filter-status");
    await statusSelect.selectOption("approved");

    // toHaveURL retries; reading page.url() once does not. The filter is
    // debounced, so a one-shot read raced the update as soon as the sleep that
    // used to precede it was removed.
    await expect(page).toHaveURL(/[?&]status=approved(&|$)/);
  });

  test("date range filters update URL query params", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page.getByTestId("reports-filter-date-from").fill("2024-01-01");
    await page.getByTestId("reports-filter-date-to").fill("2099-12-31");

    await expect(page).toHaveURL(/[?&]dateFrom=2024-01-01(&|$)/);
    await expect(page).toHaveURL(/[?&]dateTo=2099-12-31(&|$)/);
  });

  test("amount min/max filters update URL query params", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page.getByTestId("reports-filter-amount-min").fill("1000");
    await page.getByTestId("reports-filter-amount-max").fill("999999");

    await expect(page).toHaveURL(/[?&]amountMin=1000(&|$)/);
    await expect(page).toHaveURL(/[?&]amountMax=999999(&|$)/);
  });

  test("clear button removes all active filters", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(
      `${getAdminBaseUrl()}/en/reports?status=approved&amountMin=100`,
    );

    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await expect(page.getByTestId("reports-filter-clear")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page.getByTestId("reports-filter-clear").click();

    // Both params must be gone. toHaveURL retries, so this waits for the
    // clear to land rather than sampling the URL once.
    await expect(page).not.toHaveURL(/[?&]status=/);
    await expect(page).not.toHaveURL(/[?&]amountMin=/);
  });

  test("URL filter params are respected on page load", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const statusSelect = page.getByTestId("reports-filter-status");
    await expect(statusSelect).toHaveValue("approved");
  });

  // ─── Test data visibility ────────────────────────────────────────

  test("shows the seeded order in the table", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // The transfer number is unique to this test run — find its cell by test id
    await expect(
      page.locator(`[data-testid^="report-row-transfer-"]`).filter({
        hasText: TEST_ORDER.transfer_number,
      }),
    ).toBeVisible({ timeout: MUTATION_WAIT_MS });
  });

  test("receipt cell exposes a working signed URL for the picture", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await verifyReceiptLinkResolves(page, {
      testIdPrefix: "report-row-receipt",
      orderId,
    });
  });

  test("status=pending filter hides the approved order", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports?status=pending`);

    // Transfer number should not be visible under pending filter
    await expect(
      page.locator(`[data-testid^="report-row-transfer-"]`).filter({
        hasText: TEST_ORDER.transfer_number,
      }),
    ).toBeHidden();
  });

  // ─── Export ───────────────────────────────────────────────────────

  test("export button is disabled when no orders are loaded", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);
    // Use a filter that will return no results
    await page.goto(
      `${getAdminBaseUrl()}/en/reports?status=pending&amountMin=9999999`,
    );

    const exportButton = page.getByTestId("reports-export-button");
    await expect(exportButton).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(exportButton).toBeDisabled();
  });

  test("export button downloads an XLS file", async ({ context, page }) => {
    await injectSession(context, adminUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const exportButton = page.getByTestId("reports-export-button");
    await expect(exportButton).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/sales-report-.*\.xlsx$/i);
  });

  // ─── Access control ───────────────────────────────────────────────

  test("user without admin.reports permission gets redirected or sees error", async ({
    context,
    page,
  }) => {
    const limitedUser = await createTestUser("limited-reports", [
      ...ADMIN_PERMISSIONS,
      // no admin.reports permission
    ]);

    await injectSession(context, limitedUser);
    await page.goto(`${getAdminBaseUrl()}/en/reports`);

    // Anchor on something positive before asserting an absence. The page
    // shell renders for any signed-in user and the data layer is what
    // refuses, so `reports-page` is the normal outcome; `access-denied`
    // covers a guard that short-circuits instead. Waiting for either means
    // the absence below is measured against a rendered page rather than
    // against a page that had not started.
    await expect(
      page.getByTestId("reports-page").or(page.getByTestId("access-denied")),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // The app may enforce this by redirecting or by returning 403 and
    // rendering an error state. Either is fine; the invariant is the same
    // and holds in both cases, so assert it directly rather than branching.
    // Branching meant that if isOnReportsPage were ever computed wrongly the
    // test would assert something unrelated and still pass -- on an access
    // control check.
    await expect(page.getByTestId("report-table")).toBeHidden({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });
});
