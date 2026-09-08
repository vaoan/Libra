import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "./fixtures/autoCleanup";
import { cleanupTestData } from "./helpers/cleanup";
import {
  APP_URLS,
  ELEMENT_TIMEOUT_MS,
  LONG_OPERATION_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
} from "./helpers/constants";
import {
  adminDelete,
  BUYER_PERMISSIONS,
  createTestUser,
  injectSession,
  SELLER_PERMISSIONS,
  type TestUser,
} from "./helpers/session";
import { createSnapHelper } from "./helpers/snap";

const { snap, resetCounter } = createSnapHelper(
  path.resolve(__dirname, "screenshots-receipt-delegate"),
);

/**
 * Receipt visibility from a delegate's perspective.
 *
 * Verifies that an assignee (delegate with buyer-level base permissions) can
 * see the exact receipt image a buyer uploaded, and that the file is
 * byte-for-byte identical to the original.
 *
 * 1. Seller creates a product in Studio
 * 2. Seller creates a payment method with requires_receipt + requires_transfer_number
 * 3. Buyer checks out and uploads a test receipt
 * 4. Seller delegates user C with the approve permission on the product
 * 5. Delegate navigates to /assigned, sees the receipt viewer, downloads the
 *    receipt, and its SHA-256 hash matches the fixture the buyer uploaded
 * 6. Delegate approves the order
 * 7. Buyer sees the order approved
 */
test.describe.serial("Delegate sees buyer receipt", () => {
  let seller: TestUser;
  let buyer: TestUser;
  let delegate: TestUser;
  let productId: string;

  const runId = Date.now();
  const PRODUCT_NAME = `E2E Delegate Receipt ${runId}`;
  const TRANSFER_NUMBER = `TXN-DELEG-${runId}`;
  const RECEIPT_FIXTURE = path.resolve(__dirname, "fixtures/test-receipt.png");

  test.beforeAll(async () => {
    resetCounter();
    seller = await createTestUser("delgReceiptSeller", SELLER_PERMISSIONS);
    buyer = await createTestUser("delgReceiptBuyer", BUYER_PERMISSIONS);
    // Delegate intentionally has only buyer-level permissions. The ability to
    // approve comes exclusively from being assigned via seller_admins, proving
    // that receipt access doesn't require seller permissions.
    delegate = await createTestUser("delgReceiptUser", BUYER_PERMISSIONS);
  });

  test.afterAll(async () => {
    try {
      if (seller) {
        await adminDelete(
          "seller_admins",
          `seller_id=eq.${seller.userId}`,
        ).catch(() => {});
      }
      if (delegate) {
        await adminDelete(
          "user_permissions",
          `user_id=eq.${delegate.userId}`,
        ).catch(() => {});
      }
    } catch {
      // best-effort
    }
    if (seller) {
      await cleanupTestData(seller.userId, buyer?.userId ?? "").catch(() => {});
    }
  });

  // ─── Phase 1: Seller creates a product ───────────────────────

  test("Phase 1: seller creates a product in studio", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en`);

    await expect(page.getByTestId("new-product-button")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await page.getByTestId("new-product-button").click();

    const nameField = page.getByTestId("inline-text-en-name_en");
    await nameField.click();
    await nameField.fill(PRODUCT_NAME);

    const priceField = page.getByTestId("inline-price");
    await priceField.click();
    await priceField.fill("15000");

    await page.getByTestId("toolbar-save").click();
    await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(page.getByTestId("product-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // Extract the product ID — needed to navigate to the delegates page in Phase 4.
    const productRow = page.getByTestId(/^product-row-/).first();
    await expect(productRow).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const rowTestId = await productRow.getAttribute("data-testid");
    productId = rowTestId?.replace("product-row-", "") ?? "";

    await snap(page, "seller-product-created");
  });

  // ─── Phase 2: Seller creates payment method (receipt required) ───

  test("Phase 2: seller creates a receipt-required payment method", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.PAYMENTS}/en/payment-methods`);

    await page.getByTestId("add-payment-method-button").click();

    const nameInput = page.getByTestId("payment-method-name-en");
    await nameInput.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await nameInput.clear();
    await nameInput.fill("Bank Transfer — Receipt Required");

    await page.getByTestId("add-block-type-text").click();
    const textarea = page
      .getByTestId("display-section-editor")
      .locator("textarea")
      .first();
    await textarea.fill(
      "Send to account 001-000-2222. Upload your receipt after payment.",
    );

    const requiresReceiptCheckbox = page.getByTestId(
      "payment-method-requires-receipt",
    );
    await requiresReceiptCheckbox.waitFor({
      state: "visible",
      timeout: ELEMENT_TIMEOUT_MS,
    });
    // Idempotent setup: the checkbox may already be on from a previous
    // phase in this serial flow. Reaching a known state is not the test
    // branching on behaviour.
    // eslint-disable-next-line playwright/no-conditional-in-test -- see above
    if (!(await requiresReceiptCheckbox.isChecked())) {
      await requiresReceiptCheckbox.click();
    }
    await expect(requiresReceiptCheckbox).toBeChecked();

    const requiresTransferCheckbox = page.getByTestId(
      "payment-method-requires-transfer-number",
    );
    // Idempotent setup: the checkbox may already be on from a previous
    // phase in this serial flow. Reaching a known state is not the test
    // branching on behaviour.
    // eslint-disable-next-line playwright/no-conditional-in-test -- see above
    if (!(await requiresTransferCheckbox.isChecked())) {
      await requiresTransferCheckbox.click();
    }
    await expect(requiresTransferCheckbox).toBeChecked();

    await snap(page, "seller-method-configured");

    await page.getByTestId("payment-method-save").click();

    await expect(page.getByTestId("payment-methods-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "seller-method-saved");
  });

  // ─── Phase 3: Buyer checks out and uploads a receipt ─────────

  test("Phase 3: buyer checks out and uploads a receipt", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.STORE}/en`);

    await expect(page.getByTestId("search-bar-input")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page.getByTestId("search-bar-input").fill(PRODUCT_NAME);

    // Filter by the product just searched for rather than taking whatever is
    // first. The search is debounced, so straight after fill() the grid can
    // still be showing the previous results, and .first() would click a stale
    // card. This bit full-purchase-flow, which added the same product twice
    // and then found one seller group where it expected two.
    const productCard = page
      .getByTestId("product-card-link")
      .filter({ hasText: PRODUCT_NAME })
      .first();
    await expect(productCard).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await productCard.click();

    await page.getByTestId("hero-add-to-cart").click();

    // No `force: true` here. Forcing the click skips Playwright's actionability
    // checks, so this passed even if the trigger were covered or disabled --
    // i.e. even if a real buyer could not open their cart. Assert it is
    // actually clickable, then click it normally.
    const cartTrigger = page.getByTestId("cart-drawer-trigger").first();
    await expect(cartTrigger).toBeVisible();
    await cartTrigger.click();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(
      new RegExp(`${APP_URLS.PAYMENTS.replace("http://", "")}.*checkout`),
      { timeout: NAVIGATION_TIMEOUT_MS },
    );

    await expect(
      page.getByTestId("checkout-items-summary").first(),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const sellerCard = page.getByTestId(/^seller-checkout-[0-9a-f]/).first();
    const methodSelect = sellerCard.getByTestId("payment-method-select");
    await expect
      .poll(
        async () =>
          methodSelect.evaluate((el: HTMLSelectElement) => el.options.length),
        { timeout: LONG_OPERATION_TIMEOUT_MS },
      )
      .toBeGreaterThan(1);
    await methodSelect.selectOption({ index: 1 });

    const transferInput = sellerCard.getByTestId("transfer-number-input");
    await expect(transferInput).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await transferInput.fill(TRANSFER_NUMBER);

    const fileInput = sellerCard.getByTestId("receipt-file-input");
    await fileInput.setInputFiles(RECEIPT_FIXTURE);

    const receiptPreview = sellerCard.getByTestId("receipt-preview");
    await expect(receiptPreview).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-receipt-preview");

    const submitBtn = sellerCard.getByTestId(/^submit-payment-/);
    await expect(submitBtn).toBeEnabled({ timeout: LONG_OPERATION_TIMEOUT_MS });
    await submitBtn.click();

    await expect(page.getByTestId("checkout-all-submitted")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-checkout-submitted");
  });

  // ─── Phase 4: Seller delegates user C ────────────────────────

  test("Phase 4: seller delegates user C with approve permission", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}/delegates`);

    await expect(page.getByTestId("product-delegates-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const searchInput = page.getByTestId("delegate-search-input");
    await searchInput.fill(delegate.email);

    const searchResult = page.locator("ul li button").first();
    await expect(searchResult).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await searchResult.click();

    await page.getByTestId("delegate-permission-orders.approve").check();
    await snap(page, "seller-delegate-configured");

    await page.getByTestId("delegate-add-submit").click();

    // The mutation invalidates the seller-admins query on success, so the new
    // delegate shows up once the refetch lands. That is a real signal the
    // server accepted the write, which is what the fixed sleep was standing in
    // for -- the reload after it would otherwise have raced the commit.
    await expect(
      page.getByTestId(`delegate-item-${delegate.userId}`),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Reload to prove it persisted rather than merely leaving the cache.
    await page.reload();

    await expect(
      page.getByTestId(`delegate-item-${delegate.userId}`),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "seller-delegate-added");
  });

  // ─── Phase 5: Delegate sees receipt, verifies hash, then approves ───

  test("Phase 5: delegate sees receipt matching the buyer upload, then approves", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegate);
    await page.goto(`${APP_URLS.PAYMENTS}/en/assigned`);

    await expect(page.getByTestId("assigned-orders-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const orderElement = page.getByTestId(/^received-order-[0-9a-f]/).first();
    await expect(orderElement).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const orderTestId = await orderElement.getAttribute("data-testid");
    const orderId = orderTestId!.replace("received-order-", "");

    // Receipt viewer must be present — delegate can see the submitted evidence.
    const receiptViewer = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewer).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Transfer number must be shown and non-empty.
    const transferNumberEl = page
      .getByTestId("receipt-transfer-number")
      .first();
    await expect(transferNumberEl).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(transferNumberEl).not.toBeEmpty();

    // A receipt download link must be present — no "no receipt" placeholder.
    const receiptLink = page.getByTestId("receipt-view-link").first();
    await expect(receiptLink).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(page.getByTestId("receipt-none")).toBeHidden();

    await snap(page, "delegate-receipt-visible");

    // Verify the downloaded file is byte-for-byte the image the buyer uploaded.
    // The href is a Supabase signed URL serving the raw stored bytes.
    const receiptHref = await receiptLink.getAttribute("href");
    // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
    expect(receiptHref).toBeTruthy();

    const fixtureHash = createHash("sha256")
      .update(readFileSync(RECEIPT_FIXTURE))
      .digest("hex");

    const downloadedHash = await page.evaluate(async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Receipt fetch failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }, receiptHref!);

    expect(downloadedHash).toBe(fixtureHash);

    await snap(page, "delegate-receipt-hash-verified");

    // Delegate approves the order.
    await page.getByTestId(`order-approve-${orderId}`).click();
    await expect(page.getByTestId("confirm-action-panel")).toBeVisible();
    await page.getByTestId("confirm-checkbox").check();
    await page.getByTestId("confirm-action-submit").click();

    // Wait for the mutation's own refetch before reloading. The mutation
    // invalidates its query on success, so this is the point at which the
    // server is known to have accepted the write; reloading before it races
    // the commit and reads stale data. This replaces a fixed sleep -- removing
    // that sleep without putting this in its place is what broke the
    // two-seller cart assertion in full-purchase-flow.
    await expect(page.getByTestId("assigned-orders-empty")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "delegate-order-approved");

    // After approval the order leaves the assigned list (only pending/evidence
    // orders are shown there).
    await page.reload();

    await expect(page.getByTestId("assigned-orders-empty")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "delegate-no-more-orders");
  });

  // ─── Phase 6: Buyer sees order approved ──────────────────────

  test("Phase 6: buyer sees order approved", async ({ context, page }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    await expect(page.getByTestId("order-status-approved").first()).toBeVisible(
      { timeout: ELEMENT_TIMEOUT_MS },
    );
    await snap(page, "buyer-order-approved");
  });
});
