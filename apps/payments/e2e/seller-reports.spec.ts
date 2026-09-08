import path from "node:path";

import {
  ELEMENT_TIMEOUT_MS,
  MUTATION_WAIT_MS,
} from "../../auth/e2e/helpers/constants";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  SELLER_PERMISSIONS,
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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../scripts/app-url-resolver.js"),
);

function getPaymentsBaseUrl(): string {
  const urls = resolveE2EAppUrls() as { payments: string };
  return urls.payments;
}

// ─── Test data ────────────────────────────────────────────────────

const TEST_ORDER = {
  total: 75000,
  currency: "COP",
  payment_status: "approved",
  transfer_number: "E2E-SELLER-REPORT-001",
  receipt_url: null,
};

const TEST_ORDER_ITEM = {
  quantity: 3,
  unit_price: 25000,
  currency: "COP",
};

// ─── Test suite ───────────────────────────────────────────────────

test.describe.serial("Seller Reports page", () => {
  let sellerUser: TestUser;
  let buyerUser: TestUser;
  let orderId: string;
  let productId: string;
  let receiptStoragePath: string;

  test.beforeAll(async () => {
    sellerUser = await createTestUser("seller-reports", SELLER_PERMISSIONS);
    buyerUser = await createTestUser("buyer-reports-payments", []);

    const product = await adminInsert("products", {
      slug: `e2e-seller-report-${Date.now()}`,
      name_en: "E2E Seller Report Product",
      name_es: "Producto de Reporte E2E",
      description_en: "Created for seller reports E2E test",
      description_es: "Creado para prueba E2E de reportes",
      type: "merch",
      price: 25000,
      currency: "COP",
      max_quantity: 5,
      seller_id: sellerUser.userId,
    });
    productId = product.id as string;

    const order = await adminInsert("orders", {
      ...TEST_ORDER,
      user_id: buyerUser.userId,
      seller_id: sellerUser.userId,
    });
    orderId = order.id as string;

    // Upload a receipt image and attach its storage path to the order so
    // the report can verify the API converts the path to a signed URL.
    receiptStoragePath = `${orderId}/${RECEIPT_FILENAME}`;
    await uploadTestReceipt(receiptStoragePath);
    await patchOrderReceiptUrl(orderId, receiptStoragePath);

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

  // ─── Page structure ──────────────────────────────────────────────

  test("displays page with filters bar, table and export button", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("seller-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });

  // ─── Filter interactions ─────────────────────────────────────────

  test("status filter updates URL query param", async ({ context, page }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page
      .getByTestId("seller-reports-filter-status")
      .selectOption("approved");
    // Poll the URL instead of sleeping for the debounce and reading it once.
    // The old shape asserted against a single snapshot taken after a fixed
    // delay: too short and it fails, too long and every run pays for it.
    // expect.poll retries until the debounced update lands.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("status"))
      .toBe("approved");
  });

  test("date range filters update URL query params", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page
      .getByTestId("seller-reports-filter-date-from")
      .fill("2024-01-01");
    await page.getByTestId("seller-reports-filter-date-to").fill("2099-12-31");
    // Poll the URL instead of sleeping for the debounce and reading it once.
    // The old shape asserted against a single snapshot taken after a fixed
    // delay: too short and it fails, too long and every run pays for it.
    // expect.poll retries until the debounced update lands.
    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams;
        return { from: params.get("dateFrom"), to: params.get("dateTo") };
      })
      .toEqual({ from: "2024-01-01", to: "2099-12-31" });
  });

  test("amount min/max filters update URL query params", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page.getByTestId("seller-reports-filter-amount-min").fill("1000");
    await page.getByTestId("seller-reports-filter-amount-max").fill("999999");
    // Poll the URL instead of sleeping for the debounce and reading it once.
    // The old shape asserted against a single snapshot taken after a fixed
    // delay: too short and it fails, too long and every run pays for it.
    // expect.poll retries until the debounced update lands.
    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams;
        return { min: params.get("amountMin"), max: params.get("amountMax") };
      })
      .toEqual({ min: "1000", max: "999999" });
  });

  test("clear button removes all active filters", async ({ context, page }) => {
    await injectSession(context, sellerUser);
    await page.goto(
      `${getPaymentsBaseUrl()}/en/reports?status=approved&amountMin=100`,
    );

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("seller-reports-filter-clear")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await page.getByTestId("seller-reports-filter-clear").click();
    // Poll the URL instead of sleeping for the debounce and reading it once.
    // The old shape asserted against a single snapshot taken after a fixed
    // delay: too short and it fails, too long and every run pays for it.
    // expect.poll retries until the debounced update lands.
    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams;
        return { status: params.get("status"), min: params.get("amountMin") };
      })
      .toEqual({ status: null, min: null });
  });

  test("URL filter params are respected on page load", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("seller-reports-filters-bar")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await expect(page.getByTestId("seller-reports-filter-status")).toHaveValue(
      "approved",
    );
  });

  // ─── Test data visibility ────────────────────────────────────────

  test("shows the seeded order in the table", async ({ context, page }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("seller-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await expect(
      page
        .locator(`[data-testid^="seller-report-row-transfer-"]`)
        .filter({ hasText: TEST_ORDER.transfer_number }),
    ).toBeVisible({ timeout: MUTATION_WAIT_MS });
  });

  test("receipt cell exposes a working signed URL for the picture", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("seller-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await verifyReceiptLinkResolves(page, {
      testIdPrefix: "seller-report-row-receipt",
      orderId,
    });
  });

  test("status=pending filter hides the approved seeded order", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports?status=pending`);

    // The table renders either rows or an empty state, so waiting for one of
    // them proves the filtered page finished rendering. The assertion below is
    // an absence, and an absence is also satisfied by a page that never
    // rendered -- that is what the sleep was covering for.
    await expect(
      page
        .getByTestId("seller-report-table")
        .or(page.getByTestId("seller-report-empty")),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    await expect(
      page
        .locator(`[data-testid^="seller-report-row-transfer-"]`)
        .filter({ hasText: TEST_ORDER.transfer_number }),
    ).toBeHidden();
  });

  test("seller only sees their own orders (not other sellers)", async ({
    context,
    page,
  }) => {
    const otherSeller = await createTestUser(
      "other-seller-reports",
      SELLER_PERMISSIONS,
    );
    await injectSession(context, otherSeller);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    // The table renders either rows or an empty state, so waiting for one of
    // them proves the filtered page finished rendering. The assertion below is
    // an absence, and an absence is also satisfied by a page that never
    // rendered -- that is what the sleep was covering for.
    await expect(
      page
        .getByTestId("seller-report-table")
        .or(page.getByTestId("seller-report-empty")),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // The seeded order belongs to sellerUser, not otherSeller — must not be visible
    await expect(
      page
        .locator(`[data-testid^="seller-report-row-transfer-"]`)
        .filter({ hasText: TEST_ORDER.transfer_number }),
    ).toBeHidden();
  });

  // ─── Export ───────────────────────────────────────────────────────

  test("export button is disabled when no orders are loaded", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(
      `${getPaymentsBaseUrl()}/en/reports?status=pending&amountMin=9999999`,
    );

    const exportButton = page.getByTestId("seller-reports-export-button");
    await expect(exportButton).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(exportButton).toBeDisabled();
  });

  test("export button downloads an XLS file when orders are present", async ({
    context,
    page,
  }) => {
    await injectSession(context, sellerUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports?status=approved`);

    await expect(page.getByTestId("seller-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const exportButton = page.getByTestId("seller-reports-export-button");
    await expect(exportButton).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^my-sales-report.*\.xls$/i);
  });

  // ─── Access control ───────────────────────────────────────────────

  test("unauthenticated user cannot access the reports page", async ({
    page,
  }) => {
    // No session injection
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);

    // The app may redirect to login or serve the page and fail the API with
    // 401. Either is fine; an unauthenticated visitor must not see report data
    // in either case, so assert that invariant directly instead of branching
    // on which enforcement path ran.
    //
    // But an absence proves nothing against a page that has not rendered, so
    // wait for the app to have visibly done one of the two things first --
    // navigated away, or drawn the page shell. Phrased as "either", so it
    // holds whichever path enforcement takes and does not encode a guess
    // about the login screen's markup.
    await expect
      .poll(
        async () => {
          const stillOnReports = new URL(page.url()).pathname.endsWith(
            "/reports",
          );
          if (!stillOnReports) return true;
          return page.getByTestId("seller-reports-filters-bar").isVisible();
        },
        { timeout: ELEMENT_TIMEOUT_MS },
      )
      .toBe(true);
    await expect(page.getByTestId("seller-report-table")).toBeHidden({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });
});
