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
  path.resolve(__dirname, "screenshots-delegated"),
);
/**
 * Delegated admin purchase flow E2E — seller, buyer, delegate.
 *
 * Exercises the full delegation lifecycle:
 * 1. Seller creates a product in Studio
 * 2. Seller configures a payment method in Payments
 * 3. Buyer purchases the product
 * 4. Seller delegates user C with approve + request_proof permissions
 * 5. Delegate (user C) requests more proof on the pending order
 * 6. Buyer resubmits evidence
 * 7. Delegate approves the order
 * 8. Buyer sees order approved
 *
 * Requires: supabase start + pnpm dev (all apps)
 */

test.describe.serial("Delegated admin purchase flow", () => {
  let seller: TestUser;
  let buyer: TestUser;
  let delegate: TestUser;
  let productId: string;

  const RECEIPT_FIXTURE = path.resolve(__dirname, "fixtures/test-receipt.png");

  test.beforeAll(async () => {
    resetCounter();
    seller = await createTestUser("delegSeller", SELLER_PERMISSIONS);
    buyer = await createTestUser("delegBuyer", BUYER_PERMISSIONS);
    // Delegate has ONLY buyer permissions — no seller permissions whatsoever.
    // The ability to approve / request proof comes exclusively from the
    // seller_admins assignment in Phase 4, proving buyers can manage assigned
    // items without ever receiving seller-level access.
    delegate = await createTestUser("delegUser", BUYER_PERMISSIONS);
  });

  test.afterAll(async () => {
    try {
      // Clean up seller_admins rows first (before users are deleted)
      if (seller) {
        await adminDelete(
          "seller_admins",
          `seller_id=eq.${seller.userId}`,
        ).catch(() => {});
      }
      // Clean up delegate permissions
      if (delegate) {
        await adminDelete(
          "user_permissions",
          `user_id=eq.${delegate.userId}`,
        ).catch(() => {});
      }
    } catch {
      // best-effort
    }
    // Standard cleanup: seller data + buyer data
    if (seller) {
      await cleanupTestData(seller.userId, buyer?.userId ?? "").catch(() => {});
    }
  });

  // ─── Helper: create a product in Studio ──────────────────────

  async function createProduct(
    page: import("@playwright/test").Page,
    context: import("@playwright/test").BrowserContext,
    user: TestUser,
    productName: string,
    price: string,
    snapPrefix: string,
  ): Promise<string> {
    await injectSession(context, user);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    // Wait for permissions to load — page renders null while isLoading=true
    await expect(page.getByTestId("new-product-button")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, `${snapPrefix}-product-list`);

    await page.getByTestId("new-product-button").click();

    const nameField = page.getByTestId("inline-text-en-name_en");
    await nameField.click();
    await nameField.fill(productName);

    const priceField = page.getByTestId("inline-price");
    await priceField.click();
    await priceField.fill(price);
    await snap(page, `${snapPrefix}-product-filled`);

    await page.getByTestId("toolbar-save").click();
    await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(page.getByTestId("product-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, `${snapPrefix}-product-created`);

    // Extract product ID from the first product row test ID (product-row-{uuid})
    const productRow = page.getByTestId(/^product-row-/).first();
    await expect(productRow).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const rowTestId = await productRow.getAttribute("data-testid");
    return rowTestId?.replace("product-row-", "") ?? "";
  }

  // ─── Helper: create a payment method in Payments ─────────────

  async function createPaymentMethod(
    page: import("@playwright/test").Page,
    context: import("@playwright/test").BrowserContext,
    user: TestUser,
    methodName: string,
    instructions: string,
    fieldLabel: string,
    snapPrefix: string,
  ) {
    await injectSession(context, user);
    await page.goto(`${APP_URLS.PAYMENTS}/en/payment-methods`);

    await page.getByTestId("add-payment-method-button").click();

    const nameInput = page.getByTestId("payment-method-name-en");
    await nameInput.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await nameInput.clear();
    await nameInput.fill(methodName);

    // Add text display block with payment instructions
    await page.getByTestId("add-block-type-text").click();
    const textarea = page
      .getByTestId("display-section-editor")
      .locator("textarea")
      .first();
    await textarea.fill(instructions);

    // Add a required form field
    await page.getByTestId("add-field-type-text").click();
    const labelInput = page
      .getByTestId("form-section-editor")
      .locator("input[placeholder]")
      .first();
    await labelInput.fill(fieldLabel);

    // Require receipt upload and transfer number on all payment methods
    const requiresReceiptCheckbox = page.getByTestId(
      "payment-method-requires-receipt",
    );
    await requiresReceiptCheckbox.waitFor({
      state: "visible",
      timeout: ELEMENT_TIMEOUT_MS,
    });
    if (!(await requiresReceiptCheckbox.isChecked())) {
      await requiresReceiptCheckbox.click();
    }
    await expect(requiresReceiptCheckbox).toBeChecked();

    const requiresTransferCheckbox = page.getByTestId(
      "payment-method-requires-transfer-number",
    );
    if (!(await requiresTransferCheckbox.isChecked())) {
      await requiresTransferCheckbox.click();
    }
    await expect(requiresTransferCheckbox).toBeChecked();

    await snap(page, `${snapPrefix}-method-configured`);

    // Save the payment method and wait for the mutation to complete
    await page.getByTestId("payment-method-save").click();

    await expect(page.getByTestId("payment-methods-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, `${snapPrefix}-method-saved`);
  }

  // ─── Phase 1: Seller creates a product ───────────────────────

  test("Phase 1: seller creates a product in studio", async ({
    context,
    page,
  }) => {
    productId = await createProduct(
      page,
      context,
      seller,
      "E2E Delegated Product",
      "25000",
      "seller",
    );
  });

  // ─── Phase 2: Seller configures a payment method ─────────────

  test("Phase 2: seller adds a payment method", async ({ context, page }) => {
    await createPaymentMethod(
      page,
      context,
      seller,
      "Seller Nequi",
      "Send to Nequi: 300-555-1234 (Delegated Seller)",
      "Nequi Transfer Reference",
      "seller",
    );
  });

  // ─── Phase 3: Buyer purchases the product ────────────────────

  test("Phase 3: buyer purchases the product", async ({ context, page }) => {
    await injectSession(context, buyer);

    await page.goto(`${APP_URLS.STORE}/en`);

    // Search for the product
    await expect(page.getByTestId("search-bar-input")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page.getByTestId("search-bar-input").fill("E2E Delegated Product");
    await snap(page, "buyer-search-product");

    // Filter by the product just searched for rather than taking whatever is
    // first. The search is debounced, so straight after fill() the grid can
    // still be showing the previous results, and .first() would click a stale
    // card. This bit full-purchase-flow, which added the same product twice
    // and then found one seller group where it expected two.
    const card = page
      .getByTestId("product-card-link")
      .filter({ hasText: "E2E Delegated Product" })
      .first();
    await expect(card).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await card.click();

    await page.getByTestId("hero-add-to-cart").click();
    await snap(page, "buyer-added-to-cart");

    // Open cart and checkout
    // No `force: true` here. Forcing the click skips Playwright's actionability
    // checks, so this passed even if the trigger were covered or disabled --
    // i.e. even if a real buyer could not open their cart. Assert it is
    // actually clickable, then click it normally.
    const cartTrigger = page.getByTestId("cart-drawer-trigger").first();
    await expect(cartTrigger).toBeVisible();
    await cartTrigger.click();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();
    await snap(page, "buyer-cart-open");

    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(
      new RegExp(`${APP_URLS.PAYMENTS.replace("http://", "")}.*checkout`),
      { timeout: NAVIGATION_TIMEOUT_MS },
    );

    // Select payment method
    const methodSelect = page.getByTestId("payment-method-select").first();
    await expect
      .poll(
        async () =>
          methodSelect.evaluate((el: HTMLSelectElement) => el.options.length),
        { timeout: LONG_OPERATION_TIMEOUT_MS },
      )
      .toBeGreaterThan(1);
    await methodSelect.selectOption({ index: 1 });
    await snap(page, "buyer-method-selected");

    // Fill form field
    await expect(page.getByTestId(/^dynamic-field-/).first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page
      .getByTestId(/^dynamic-field-/)
      .first()
      .locator("input, textarea")
      .first()
      .fill("NEQUI-DELEG-001");
    await snap(page, "buyer-field-filled");

    // Fill transfer number and upload receipt
    const transferInput = page.getByTestId("transfer-number-input");
    await expect(transferInput).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await transferInput.fill("NEQUI-TXN-DELEG-001");

    const fileInput = page.getByTestId("receipt-file-input");
    await fileInput.setInputFiles(RECEIPT_FIXTURE);

    const receiptPreview = page.getByTestId("receipt-preview");
    await expect(receiptPreview).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-receipt-uploaded");

    // Submit payment
    const submitBtn = page.getByTestId(/^submit-payment-/).first();
    await expect(submitBtn).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });
    await submitBtn.click();

    await expect(page.getByTestId("checkout-all-submitted")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-payment-submitted");

    // Verify order is pending on purchases page
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    const pendingBadge = page.getByTestId("order-status-pending_verification");
    await expect(pendingBadge.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-order-pending");
  });

  // ─── Phase 4: Seller delegates user C ────────────────────────

  test("Phase 4: seller delegates user C with approve + request_proof", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en/products/${productId}/delegates`);

    await expect(page.getByTestId("product-delegates-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "seller-delegate-page");

    // Search for delegate by email
    const searchInput = page.getByTestId("delegate-search-input");
    await searchInput.fill(delegate.email);
    await snap(page, "seller-delegate-search");

    // Select the delegate from search results
    const searchResult = page.locator("ul li button").first();
    await expect(searchResult).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await searchResult.click();
    await snap(page, "seller-delegate-selected");

    // Check both permission checkboxes
    await page.getByTestId("delegate-permission-orders.approve").check();
    await page.getByTestId("delegate-permission-orders.request_proof").check();
    await snap(page, "seller-delegate-permissions");

    // Submit
    await page.getByTestId("delegate-add-submit").click();

    // Wait for the mutation's own refetch before reloading. The mutation
    // invalidates its query on success, so this is the point at which the
    // server is known to have accepted the write; reloading before it races
    // the commit and reads stale data. This replaces a fixed sleep -- removing
    // that sleep without putting this in its place is what broke the
    // two-seller cart assertion in full-purchase-flow.
    const delegateItem = page.getByTestId(`delegate-item-${delegate.userId}`);
    await expect(delegateItem).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "seller-delegate-added");

    // Reload to prove it persisted rather than merely leaving the cache.
    await page.reload();

    await expect(delegateItem).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "seller-delegate-in-list");
  });

  // ─── Phase 5: Delegate requests more proof ───────────────────

  test("Phase 5: delegate requests more proof on the pending order", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegate);
    await page.goto(`${APP_URLS.PAYMENTS}/en/assigned`);

    await expect(page.getByTestId("assigned-orders-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "delegate-orders-page");

    // Verify orders are visible in the list
    const ordersList = page.getByTestId("assigned-orders-list");
    await expect(ordersList).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Find the order — match received-order-{uuid}
    const orderElement = page.getByTestId(/^received-order-[0-9a-f]/).first();
    await expect(orderElement).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const orderTestId = await orderElement.getAttribute("data-testid");
    const orderId = orderTestId!.replace("received-order-", "");
    await snap(page, "delegate-order-found");

    // Verify buyer's receipt data is visible to the delegate
    const receiptViewer = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewer).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const receiptTransfer = page.getByTestId("receipt-transfer-number").first();
    await expect(receiptTransfer).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(receiptTransfer).not.toBeEmpty();

    const receiptLink = page.getByTestId("receipt-view-link").first();
    await expect(receiptLink).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(page.getByTestId("receipt-none").first()).toBeHidden();
    await snap(page, "delegate-receipt-visible");

    // Click request evidence button
    await page.getByTestId(`order-evidence-${orderId}`).click();

    // Fill seller note in the SellerNoteInput component
    const noteTextarea = page.getByTestId("seller-note-textarea");
    await expect(noteTextarea).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await noteTextarea.fill("Please upload a clearer receipt photo");
    await snap(page, "delegate-note-filled");

    // Submit the note
    await page.getByTestId("seller-note-submit").click();

    // Wait for the mutation's own refetch before reloading. The mutation
    // invalidates its query on success, so this is the point at which the
    // server is known to have accepted the write; reloading before it races
    // the commit and reads stale data. This replaces a fixed sleep -- removing
    // that sleep without putting this in its place is what broke the
    // two-seller cart assertion in full-purchase-flow.
    await expect(page.getByTestId("assigned-orders-list")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "delegate-proof-requested");

    // Reload and verify the order is still visible (evidence_requested is actionable)
    await page.reload();

    await expect(page.getByTestId("assigned-orders-list")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(
      page.getByTestId(/^received-order-[0-9a-f]/).first(),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "delegate-order-evidence-requested");
  });

  // ─── Phase 6: Buyer resubmits evidence ───────────────────────

  test("Phase 6: buyer resubmits evidence after proof request", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    // Verify order shows evidence_requested status
    const evidenceBadge = page.getByTestId("order-status-evidence_requested");
    await expect(evidenceBadge.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-evidence-requested");

    // The order card auto-expands when status is evidence_requested.
    // Find the resubmit form — get orderId from the form test ID
    const resubmitForm = page.getByTestId(/^resubmit-form-/).first();
    await expect(resubmitForm).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const formTestId = await resubmitForm.getAttribute("data-testid");
    const orderId = formTestId!.replace("resubmit-form-", "");

    // Fill new transfer number
    const resubmitTransferInput = page.getByTestId(
      `resubmit-transfer-${orderId}`,
    );
    await resubmitTransferInput.fill("NEQUI-RESUBMIT-001");

    // Upload a new receipt
    const resubmitFileInput = resubmitForm.locator('input[type="file"]');
    await resubmitFileInput.setInputFiles(RECEIPT_FIXTURE);
    await snap(page, "buyer-resubmit-filled");

    // Submit resubmission
    await page.getByTestId(`resubmit-submit-${orderId}`).click();

    // Wait for the mutation's own refetch before reloading -- the status badge
    // flipping is the point at which the server is known to have accepted the
    // resubmission. Reloading first races the commit.
    const pendingBadge = page.getByTestId("order-status-pending_verification");
    await expect(pendingBadge.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-resubmit-submitted");

    // Reload to prove it persisted rather than merely leaving the cache.
    await page.reload();

    await expect(pendingBadge.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-order-pending-again");
  });

  // ─── Phase 7: Delegate approves the order ────────────────────

  test("Phase 7: delegate approves the resubmitted order", async ({
    context,
    page,
  }) => {
    await injectSession(context, delegate);
    await page.goto(`${APP_URLS.PAYMENTS}/en/assigned`);

    await expect(page.getByTestId("assigned-orders-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // Find the order
    const orderElement = page.getByTestId(/^received-order-[0-9a-f]/).first();
    await expect(orderElement).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    const orderTestId = await orderElement.getAttribute("data-testid");
    const orderId = orderTestId!.replace("received-order-", "");
    await snap(page, "delegate-order-resubmitted");

    // Verify buyer's resubmitted receipt is visible to the delegate
    const receiptViewer7 = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewer7).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const receiptTransfer7 = page
      .getByTestId("receipt-transfer-number")
      .first();
    await expect(receiptTransfer7).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(receiptTransfer7).not.toBeEmpty();

    const receiptLink7 = page.getByTestId("receipt-view-link").first();
    await expect(receiptLink7).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(page.getByTestId("receipt-none").first()).toBeHidden();
    await snap(page, "delegate-resubmitted-receipt-visible");

    // Click approve
    await page.getByTestId(`order-approve-${orderId}`).click();
    await snap(page, "delegate-approve-clicked");

    // Confirm via the confirmation panel
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

    // Reload and verify order is no longer in the assigned list
    // (assigned only shows pending_verification / evidence_requested)
    await page.reload();

    await expect(page.getByTestId("assigned-orders-empty")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "delegate-no-more-orders");
  });

  // ─── Phase 8: Buyer sees order approved ──────────────────────

  test("Phase 8: buyer sees order approved", async ({ context, page }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    const approvedBadge = page.getByTestId("order-status-approved");
    await expect(approvedBadge.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-order-approved");
  });
});
