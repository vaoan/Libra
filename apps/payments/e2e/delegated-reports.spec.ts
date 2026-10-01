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
  type TestUser,
} from "../../auth/e2e/helpers/session";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../scripts/app-url-resolver.js"),
);

function getPaymentsBaseUrl(): string {
  const urls = resolveE2EAppUrls() as { payments: string };
  return urls.payments;
}

// ─── Test data ────────────────────────────────────────────────────
//
// A single order contains BOTH a delegated product (P1) and a
// non-delegated product (P2) line item. This proves the report is
// product-scoped: the delegate must see the P1 row and the delegated
// subtotal (P1 only = 50000), never a P2 row or the order's real
// total (80000).

const SCOPED_ORDER = {
  total: 80000,
  currency: "COP",
  payment_status: "approved",
  transfer_number: "E2E-DELEGATED-SCOPED",
  receipt_url: null,
};

const P1_ITEM = { quantity: 2, unit_price: 25000, currency: "COP" };
const P2_ITEM = { quantity: 2, unit_price: 15000, currency: "COP" };

test.describe.serial("Delegated Reports page", () => {
  let sellerUser: TestUser;
  let delegateUser: TestUser;
  let buyerUser: TestUser;
  let delegatedProductId: string;
  let otherProductId: string;
  let orderId: string;
  let delegationId: string;

  test.beforeAll(async () => {
    sellerUser = await createTestUser(
      "delegated-reports-seller",
      SELLER_PERMISSIONS,
    );
    delegateUser = await createTestUser("delegated-reports-delegate", []);
    buyerUser = await createTestUser("delegated-reports-buyer", []);

    const delegatedProduct = await adminInsert("products", {
      slug: `e2e-delegated-report-p1-${Date.now()}`,
      name_en: "Delegated Product",
      name_es: "Producto Delegado",
      description_en: "Delegated",
      description_es: "Delegado",
      type: "merch",
      price: 25000,
      currency: "COP",
      max_quantity: 5,
      seller_id: sellerUser.userId,
    });
    delegatedProductId = delegatedProduct.id as string;

    const otherProduct = await adminInsert("products", {
      slug: `e2e-delegated-report-p2-${Date.now()}`,
      name_en: "Other Product",
      name_es: "Otro Producto",
      description_en: "Not delegated",
      description_es: "No delegado",
      type: "merch",
      price: 15000,
      currency: "COP",
      max_quantity: 5,
      seller_id: sellerUser.userId,
    });
    otherProductId = otherProduct.id as string;

    // ONE order with BOTH P1 and P2 line items.
    const order = await adminInsert("orders", {
      ...SCOPED_ORDER,
      user_id: buyerUser.userId,
      seller_id: sellerUser.userId,
    });
    orderId = order.id as string;

    await adminInsert("order_items", {
      order_id: orderId,
      product_id: delegatedProductId,
      ...P1_ITEM,
    });
    await adminInsert("order_items", {
      order_id: orderId,
      product_id: otherProductId,
      ...P2_ITEM,
    });

    // Delegate ONLY product P1 to the delegate, granting reports.read + reports.export.
    const delegation = await adminInsert("seller_admins", {
      seller_id: sellerUser.userId,
      admin_user_id: delegateUser.userId,
      product_id: delegatedProductId,
      permissions: ["reports.read", "reports.export"],
    });
    delegationId = delegation.id as string;
  });

  test.afterAll(async () => {
    await adminDelete("seller_admins", `id=eq.${delegationId}`).catch(() => {});
    await adminDelete("order_items", `order_id=eq.${orderId}`).catch(() => {});
    await adminDelete("orders", `id=eq.${orderId}`).catch(() => {});
    await adminDelete("products", `id=eq.${delegatedProductId}`).catch(
      () => {},
    );
    await adminDelete("products", `id=eq.${otherProductId}`).catch(() => {});
  });

  // ─── Menu + page ─────────────────────────────────────────────────

  test("delegate sees the Delegated Reports menu and page", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegateUser);
    await page.goto(`${getPaymentsBaseUrl()}/en/delegated-reports`);
    await expect(page.getByTestId("sidebar-delegatedReports")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(page.getByTestId("delegated-reports-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
  });

  // ─── Product-scoped rows ─────────────────────────────────────────

  test("shows a row for the delegated product only, not the other product on the same order", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegateUser);
    await page.goto(
      `${getPaymentsBaseUrl()}/en/delegated-reports?status=approved`,
    );

    await expect(page.getByTestId("delegated-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await expect(
      page.locator(
        `[data-testid="delegated-report-row"][data-product-id="${delegatedProductId}"]`,
      ),
    ).toBeVisible({ timeout: MUTATION_WAIT_MS });

    await expect(
      page.locator(
        `[data-testid="delegated-report-row"][data-product-id="${otherProductId}"]`,
      ),
    ).toHaveCount(0);
  });

  // ─── No receipt / no transfer exposure ──────────────────────────

  test("does not expose the order's transfer number or a receipt link", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegateUser);
    await page.goto(
      `${getPaymentsBaseUrl()}/en/delegated-reports?status=approved`,
    );

    const table = page.getByTestId("delegated-report-table");
    await expect(table).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Translation-agnostic: read the rendered text rather than assert on
    // specific copy, and prove the transfer number never appears anywhere
    // in the table (the API response deliberately omits it).
    const tableText = await table.innerText();
    expect(tableText).not.toContain(SCOPED_ORDER.transfer_number);

    await expect(
      page.locator(`[data-testid^="delegated-report-row-receipt"]`),
    ).toHaveCount(0);
    await expect(table.locator("a[download]")).toHaveCount(0);
  });

  // ─── Export ───────────────────────────────────────────────────────

  test("delegate with reports.export can download the delegated-report XLS", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegateUser);
    await page.goto(
      `${getPaymentsBaseUrl()}/en/delegated-reports?status=approved`,
    );
    await expect(page.getByTestId("delegated-report-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const exportButton = page.getByTestId("delegated-reports-export-button");
    await expect(exportButton).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^delegated-report-.*\.xls$/i);
  });

  // ─── Access control ───────────────────────────────────────────────

  test("delegate without reports.read sees no menu and no report page", async ({
    context,
    page,
  }) => {
    const noReportDelegate = await createTestUser(
      "delegated-reports-noperm",
      [],
    );
    const noReportDelegation = await adminInsert("seller_admins", {
      seller_id: sellerUser.userId,
      admin_user_id: noReportDelegate.userId,
      product_id: delegatedProductId,
      permissions: ["orders.approve"],
    });
    try {
      await injectSession(context, noReportDelegate);
      await page.goto(`${getPaymentsBaseUrl()}/en/delegated-reports`);

      // This user is signed in, so the app shell renders for them -- the
      // sidebar is there, just without the delegated-reports entry. Waiting
      // for the shell is what makes the two absences below mean something:
      // on a page that had not rendered they would both hold trivially.
      await expect(page.getByTestId("sidebar-collapse-toggle")).toBeVisible({
        timeout: ELEMENT_TIMEOUT_MS,
      });

      await expect(page.getByTestId("sidebar-delegatedReports")).toHaveCount(0);
      await expect(page.getByTestId("delegated-reports-page")).toHaveCount(0);
    } finally {
      await adminDelete(
        "seller_admins",
        `id=eq.${noReportDelegation.id}`,
      ).catch(() => {});
    }
  });
});
