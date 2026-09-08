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
  BUYER_PERMISSIONS,
  createTestUser,
  injectSession,
  SELLER_PERMISSIONS,
  type TestUser,
} from "./helpers/session";
import { createSnapHelper } from "./helpers/snap";

const { snap, resetCounter } = createSnapHelper(
  path.resolve(__dirname, "screenshots"),
);

/**
 * Receipt + reference number payment flow.
 *
 * Verifies the full lifecycle when a payment method requires both:
 * - A receipt image upload
 * - A bank reference / transfer number
 *
 * 1. Seller creates a product in Studio
 * 2. Seller creates a payment method with requires_receipt + requires_transfer_number enabled
 * 3. Buyer adds the product to cart, checks out, uploads a receipt and enters the reference number,
 *    then verifies the receipt preview is visible before submitting
 * 4. Buyer sees order pending verification
 * 5. Seller navigates to sales, sees the receipt link and reference number on the order,
 *    then approves
 * 6. Buyer sees order approved
 */
test.describe.serial("Receipt + reference number payment flow", () => {
  let seller: TestUser;
  let buyer: TestUser;

  const runId = Date.now();
  const PRODUCT_NAME = `E2E Receipt Product ${runId}`;
  const TRANSFER_NUMBER = `TXN-${runId}`;
  const RECEIPT_FIXTURE = path.resolve(__dirname, "fixtures/test-receipt.png");

  test.beforeAll(async () => {
    resetCounter();
    seller = await createTestUser("seller", SELLER_PERMISSIONS);
    buyer = await createTestUser("buyer", BUYER_PERMISSIONS);
  });

  test.afterAll(async () => {
    if (seller) await cleanupTestData(seller.userId, buyer?.userId ?? "");
  });

  // ─── Phase 1: Seller creates a product ───────────────────────

  test("Phase 1: seller creates a product in studio", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en`);

    await page.getByTestId("new-product-button").click();

    const nameField = page.getByTestId("inline-text-en-name_en");
    await nameField.click();
    await nameField.fill(PRODUCT_NAME);

    const priceField = page.getByTestId("inline-price");
    await priceField.click();
    await priceField.fill("10000");

    await page.getByTestId("toolbar-save").click();
    await page.waitForURL(`${APP_URLS.STUDIO}/en`, {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(page.getByTestId("product-table")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "seller-product-created");
  });

  // ─── Phase 2: Seller creates payment method (receipt + reference required) ───

  test("Phase 2: seller creates payment method requiring receipt and reference number", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.PAYMENTS}/en/payment-methods`);

    await page.getByTestId("add-payment-method-button").click();

    const nameInput = page.getByTestId("payment-method-name-en");
    await nameInput.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await nameInput.clear();
    await nameInput.fill("Nequi — Receipt Required");

    // Add payment instructions display block
    await page.getByTestId("add-block-type-text").click();
    const textarea = page
      .getByTestId("display-section-editor")
      .locator("textarea")
      .first();
    await textarea.fill(
      "Transfer to Nequi: 300-000-1111. Upload your receipt after payment.",
    );

    // Enable "requires receipt" toggle
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

    // Enable "requires transfer number" toggle
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

  // ─── Phase 3: Buyer checks out with receipt + reference number ───────────────

  test("Phase 3: buyer checks out providing receipt image and reference number", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);

    // Find and add product to cart
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
    await snap(page, "buyer-product-added");

    // Open cart and proceed to checkout
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
    await snap(page, "buyer-checkout-loaded");

    // Select the payment method
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
    await snap(page, "buyer-method-selected");

    // Enter the bank reference / transfer number
    const transferInput = sellerCard.getByTestId("transfer-number-input");
    await expect(transferInput).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await transferInput.fill(TRANSFER_NUMBER);
    await snap(page, "buyer-transfer-number-filled");

    // Upload the receipt image via the hidden file input
    const fileInput = sellerCard.getByTestId("receipt-file-input");
    await fileInput.setInputFiles(RECEIPT_FIXTURE);

    // Verify receipt preview is visible — confirms the image was selected
    const receiptPreview = sellerCard.getByTestId("receipt-preview");
    await expect(receiptPreview).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-receipt-preview-visible");

    // Submit payment — button must be enabled (all required fields satisfied)
    const submitBtn = sellerCard.getByTestId(/^submit-payment-/);
    await expect(submitBtn).toBeEnabled({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await submitBtn.click();

    await expect(page.getByTestId("checkout-all-submitted")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "buyer-checkout-submitted");
  });

  // ─── Phase 4: Buyer sees order pending verification ──────────

  test("Phase 4: buyer sees order pending verification", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    await expect(
      page.getByTestId("order-status-pending_verification").first(),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "buyer-order-pending");
  });

  // ─── Phase 5: Seller sees receipt + reference, then approves ─

  test("Phase 5: seller sees uploaded receipt and reference number before approving", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.PAYMENTS}/en/sales`);

    // Receipt viewer container must be present on the order card
    const receiptViewer = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewer).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Transfer number element must be visible and have content
    const transferNumberEl = page
      .getByTestId("receipt-transfer-number")
      .first();
    await expect(transferNumberEl).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(transferNumberEl).not.toBeEmpty();

    // A receipt link must be present — confirms the image was uploaded successfully
    const receiptLink = page.getByTestId("receipt-view-link").first();
    await expect(receiptLink).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // The "no receipt" placeholder must not be shown
    await expect(page.getByTestId("receipt-none")).toBeHidden();

    // Verify the receipt image is byte-for-byte the same file the buyer uploaded.
    // The href is a Supabase signed URL that serves the raw stored bytes.
    const receiptHref = await receiptLink.getAttribute("href");
    // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
    expect(receiptHref).toBeTruthy();

    const fixtureHash = createHash("sha256")
      .update(readFileSync(RECEIPT_FIXTURE))
      .digest("hex");

    // Fetch the image inside the Playwright browser context and hash it with
    // the Web Crypto API so no extra Node.js network call is needed.
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

    await snap(page, "seller-sees-receipt-and-reference");

    // Approve the order
    const approveBtn = page.getByTestId(/^order-approve-/).first();
    await expect(approveBtn).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await approveBtn.click();

    await expect(page.getByTestId("confirm-action-panel")).toBeVisible();
    await page.getByTestId("confirm-checkbox").check();
    await page.getByTestId("confirm-action-submit").click();

    // The approve mutation invalidates the received-orders query on success,
    // so the row's approve button disappears once the refetch lands. Waiting
    // for that is a real signal the server accepted the write; the fixed sleep
    // it replaces was guessing how long the write takes.
    await expect(page.getByTestId(/^order-approve-/).first()).toBeHidden({
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // Reload anyway, to prove it persisted rather than merely leaving the
    // client cache -- and wait for the list to come back before asserting an
    // absence against it, since an absence also holds on a page that has not
    // rendered. Either the list or its empty state means the page is up.
    await page.reload();
    await expect(
      page
        .getByTestId("received-orders-list")
        .or(page.getByTestId("received-orders-empty")),
    ).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });

    await expect(page.getByTestId(/^order-approve-/).first()).toBeHidden({
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await snap(page, "seller-order-approved");
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
