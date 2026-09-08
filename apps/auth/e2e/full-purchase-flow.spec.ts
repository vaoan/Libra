import path from "node:path";

import { expect, test } from "./fixtures/autoCleanup";

import { cleanupTestData } from "./helpers/cleanup";
import { dragAndDrop } from "./helpers/drag";
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
 * Full purchase flow E2E — two sellers, one buyer.
 *
 * Exercises the complete multi-seller lifecycle:
 * 1a. Seller A creates a product in Studio
 * 1b. Seller B creates a product in Studio
 * 2a. Seller A configures a payment method in Payments
 * 2b. Seller B configures a payment method in Payments
 * 3.  Buyer adds both products to cart and checks out
 *     → sees two separate seller checkout cards
 *     → fills each seller's form independently (transfer number + receipt upload)
 *     → submits both payments
 * 4.  Buyer verifies both orders are "Pending Verification"
 * 5a. Seller A sees receipt and approves their order
 * 5b. Seller B sees receipt and approves their order
 * 6.  Buyer sees both orders "Approved"
 *
 * Requires: supabase start + pnpm dev (all apps)
 */
test.describe.serial("Full purchase flow: two sellers, one buyer", () => {
  let sellerA: TestUser;
  let sellerB: TestUser;
  let buyer: TestUser;

  // Unique suffix per test run to avoid slug collisions from leftover data
  const runId = Date.now();
  const PRODUCT_ALPHA = `E2E Product Alpha ${runId}`;
  const PRODUCT_BETA = `E2E Product Beta ${runId}`;
  const RECEIPT_FIXTURE = path.resolve(__dirname, "fixtures/test-receipt.png");

  test.beforeAll(async () => {
    resetCounter();
    sellerA = await createTestUser("sellerA", SELLER_PERMISSIONS);
    sellerB = await createTestUser("sellerB", SELLER_PERMISSIONS);
    buyer = await createTestUser("buyer", BUYER_PERMISSIONS);
  });

  test.afterAll(async () => {
    if (sellerA) await cleanupTestData(sellerA.userId, buyer?.userId ?? "");
    if (sellerB)
      await cleanupTestData(sellerB.userId, buyer?.userId ?? "").catch(
        () => {},
      );
  });

  // ─── Helper: create a product in Studio ──────────────────────

  async function createProduct(
    page: import("@playwright/test").Page,
    context: import("@playwright/test").BrowserContext,
    seller: TestUser,
    productName: string,
    price: string,
    snapPrefix: string,
  ) {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en`);
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
  }

  // ─── Helper: create a payment method in Payments ─────────────

  async function createPaymentMethod(
    page: import("@playwright/test").Page,
    context: import("@playwright/test").BrowserContext,
    seller: TestUser,
    methodName: string,
    instructions: string,
    fieldLabel: string,
    snapPrefix: string,
  ) {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.PAYMENTS}/en/payment-methods`);

    // New builder UX: "Add Method" instantly creates and expands inline
    await page.getByTestId("add-payment-method-button").click();

    // The editor is now expanded inline — fill the name
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

    // Add a required form field (click the Text type button directly)
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

  // ─── Phase 1a: Seller A creates a product ────────────────────

  test("Phase 1a: seller A creates a product in studio", async ({
    context,
    page,
  }) => {
    await createProduct(
      page,
      context,
      sellerA,
      PRODUCT_ALPHA,
      "15000",
      "sellerA",
    );
  });

  // ─── Phase 1b: Seller B creates a product ────────────────────

  test("Phase 1b: seller B creates a product in studio", async ({
    context,
    page,
  }) => {
    await createProduct(
      page,
      context,
      sellerB,
      PRODUCT_BETA,
      "20000",
      "sellerB",
    );
  });

  // ─── Phase 2a: Seller A configures payment method ────────────

  test("Phase 2a: seller A adds a payment method", async ({
    context,
    page,
  }) => {
    await createPaymentMethod(
      page,
      context,
      sellerA,
      "Seller A — Nequi",
      "Send to Nequi: 300-111-2222 (Seller Alpha)",
      "Nequi Transfer Reference",
      "sellerA",
    );
  });

  // ─── Phase 2b: Seller B configures payment method ────────────

  test("Phase 2b: seller B adds a payment method", async ({
    context,
    page,
  }) => {
    await createPaymentMethod(
      page,
      context,
      sellerB,
      "Seller B — Bancolombia",
      "Transfer to Bancolombia: 123-456789-00 (Seller Beta)",
      "Bank Transfer Reference",
      "sellerB",
    );
  });

  // ─── Phase 2c: Seller A tests drag-and-drop reorder ────────

  test(
    "Phase 2c: seller A verifies drag-and-drop handles on builder",
    { tag: "@ux" },
    async ({ context, page }) => {
      await injectSession(context, sellerA);
      await page.goto(`${APP_URLS.PAYMENTS}/en/payment-methods`);

      // Expand the first payment method
      await page.getByTestId("payment-method-name").first().click();
      await expect(page.getByTestId("display-section-editor")).toBeVisible({
        timeout: ELEMENT_TIMEOUT_MS,
      });

      // Should already have 1 text block from Phase 2a
      const blocksBefore = page.getByTestId(/^display-block-[0-9a-f]/);
      await expect(blocksBefore).toHaveCount(1, {
        timeout: ELEMENT_TIMEOUT_MS,
      });

      // Add a second display block (image) so we have two items to reorder
      await page.getByTestId("add-block-type-image").click();

      // Verify we now have 2 display blocks
      const blocks = page.getByTestId(/^display-block-[0-9a-f]/);
      await expect(blocks).toHaveCount(2, { timeout: ELEMENT_TIMEOUT_MS });

      // Record block order before drag
      const firstBlockTid = await blocks.nth(0).getAttribute("data-testid");
      const secondBlockTid = await blocks.nth(1).getAttribute("data-testid");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(firstBlockTid).not.toBe(secondBlockTid);

      // Verify drag handles are present and have cursor-grab
      const firstHandle = blocks.nth(0).locator("[aria-label]").first();
      const secondHandle = blocks.nth(1).locator("[aria-label]").first();
      await expect(firstHandle).toBeVisible();
      await expect(secondHandle).toBeVisible();

      // Perform actual drag-and-drop: drag second block above first
      await dragAndDrop(page, secondHandle, "up");

      // Verify the order swapped
      const blocksAfter = page.getByTestId(/^display-block-[0-9a-f]/);
      const firstAfter = await blocksAfter.nth(0).getAttribute("data-testid");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(firstAfter).toBe(secondBlockTid);
      await snap(page, "sellerA-blocks-reordered");

      // Now test form field drag-and-drop: add a second field
      await page.getByTestId("add-field-type-email").click();

      const fields = page.getByTestId(/^form-field-[0-9a-f]/);
      await expect(fields).toHaveCount(2, { timeout: ELEMENT_TIMEOUT_MS });

      // Record field order before drag
      const firstFieldTid = await fields.nth(0).getAttribute("data-testid");
      const secondFieldTid = await fields.nth(1).getAttribute("data-testid");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(firstFieldTid).not.toBe(secondFieldTid);

      // Drag second field above first
      const secondFieldHandle = fields.nth(1).locator("[aria-label]").first();
      await dragAndDrop(page, secondFieldHandle, "up");

      // Verify field order swapped
      const fieldsAfter = page.getByTestId(/^form-field-[0-9a-f]/);
      const firstFieldAfter = await fieldsAfter
        .nth(0)
        .getAttribute("data-testid");
      // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
      expect(firstFieldAfter).toBe(secondFieldTid);
      await snap(page, "sellerA-fields-reordered");

      // Clean up: remove the extra blocks/fields we added (not saved — server state
      // stays from Phase 2a; this just restores local UI before leaving the page)
      // Remove the image block (now first after reorder)
      await page
        .getByTestId(/^display-block-remove-/)
        .first()
        .click();
      await expect(page.getByTestId(/^display-block-[0-9a-f]/)).toHaveCount(1, {
        timeout: ELEMENT_TIMEOUT_MS,
      });
      // Remove the email field (now first after reorder)
      await page
        .getByTestId(/^form-field-remove-/)
        .first()
        .click();
      await expect(page.getByTestId(/^form-field-[0-9a-f]/)).toHaveCount(1, {
        timeout: ELEMENT_TIMEOUT_MS,
      });
    },
  );

  // ─── Phase 3: Buyer adds both products and checks out ────────

  test("Phase 3: buyer adds both products to cart and checks out", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);

    await page.goto(`${APP_URLS.STORE}/en`);
    await snap(page, "store-catalog");

    // ── Add Seller A's product ──────────────────────────────────
    await expect(page.getByTestId("search-bar-input")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page.getByTestId("search-bar-input").fill(PRODUCT_ALPHA);
    await snap(page, "store-search-alpha");

    // Match the product being searched for rather than "whatever is first".
    // The search is debounced, so straight after fill() the grid still shows
    // the previous results -- .first() then clicks a stale card, and picking
    // the same card twice is exactly how this test came to find one seller
    // group where it expected two. Filtering makes the locator wait for the
    // debounced result *and* click the right thing; the sleep it replaces did
    // the first and never checked the second.
    const cardA = page
      .getByTestId("product-card-link")
      .filter({ hasText: PRODUCT_ALPHA })
      .first();
    await expect(cardA).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await cardA.click();
    await snap(page, "store-product-alpha");

    await page.getByTestId("hero-add-to-cart").click();

    // The in-cart indicator only renders once the cart holds this product, so
    // it is a real signal the add landed before we navigate away.
    await expect(page.getByTestId("hero-in-cart")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "store-added-alpha");

    // ── Add Seller B's product ──────────────────────────────────
    await page.goto(`${APP_URLS.STORE}/en`);

    await expect(page.getByTestId("search-bar-input")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await page.getByTestId("search-bar-input").fill(PRODUCT_BETA);
    await snap(page, "store-search-beta");

    // Match the product being searched for rather than "whatever is first".
    // The search is debounced, so straight after fill() the grid still shows
    // the previous results -- .first() then clicks a stale card, and picking
    // the same card twice is exactly how this test came to find one seller
    // group where it expected two. Filtering makes the locator wait for the
    // debounced result *and* click the right thing; the sleep it replaces did
    // the first and never checked the second.
    const cardB = page
      .getByTestId("product-card-link")
      .filter({ hasText: PRODUCT_BETA })
      .first();
    await expect(cardB).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await cardB.click();
    await snap(page, "store-product-beta");

    await page.getByTestId("hero-add-to-cart").click();

    // The in-cart indicator only renders once the cart holds this product, so
    // it is a real signal the add landed before we navigate away.
    await expect(page.getByTestId("hero-in-cart")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "store-added-beta");

    // ── Open cart and verify both items ────────────────────────
    // No `force: true` here. Forcing the click skips Playwright's actionability
    // checks, so this passed even if the trigger were covered or disabled --
    // i.e. even if a real buyer could not open their cart. Assert it is
    // actually clickable, then click it normally.
    const cartTrigger = page.getByTestId("cart-drawer-trigger").first();
    await expect(cartTrigger).toBeVisible();
    await cartTrigger.click();
    await expect(page.getByTestId("cart-drawer-items")).toBeVisible();

    // Should see two seller groups
    const sellerGroups = page.getByTestId("cart-seller-group");
    await expect(sellerGroups).toHaveCount(2, { timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "store-cart-two-sellers");

    // ── Checkout ────────────────────────────────────────────────
    await page.getByTestId("cart-checkout").click();
    await page.waitForURL(
      new RegExp(`${APP_URLS.PAYMENTS.replace("http://", "")}.*checkout`),
      { timeout: NAVIGATION_TIMEOUT_MS },
    );

    // Should see two seller checkout cards
    await expect(
      page.getByTestId("checkout-items-summary").first(),
    ).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "checkout-two-sellers-loaded");

    // Count only the outer card containers (UUID-prefixed, excludes toggle- and submitted-)
    const sellerCards = page.getByTestId(/^seller-checkout-[0-9a-f]/);
    await expect(sellerCards).toHaveCount(2, { timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "checkout-two-cards");

    // ── Fill and submit first seller's payment ─────────────────
    // Scope all selectors to the first card to avoid cross-card pollution
    const firstCard = sellerCards.nth(0);
    const cardASelect = firstCard.getByTestId("payment-method-select");
    await expect
      .poll(
        async () =>
          cardASelect.evaluate((el: HTMLSelectElement) => el.options.length),
        { timeout: LONG_OPERATION_TIMEOUT_MS },
      )
      .toBeGreaterThan(1);
    await cardASelect.selectOption({ index: 1 });
    await snap(page, "checkout-sellerA-method-selected");

    await expect(firstCard.getByTestId(/^display-block-/).first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(firstCard.getByTestId(/^dynamic-field-/).first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    await firstCard
      .getByTestId(/^dynamic-field-/)
      .first()
      .locator("input, textarea")
      .first()
      .fill("NEQUI-A-001");
    await snap(page, "checkout-sellerA-field-filled");

    const transferInputA = firstCard.getByTestId("transfer-number-input");
    await expect(transferInputA).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await transferInputA.fill("NEQUI-TXN-A-001");

    const fileInputA = firstCard.getByTestId("receipt-file-input");
    await fileInputA.setInputFiles(RECEIPT_FIXTURE);

    const receiptPreviewA = firstCard.getByTestId("receipt-preview");
    await expect(receiptPreviewA).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "checkout-sellerA-receipt-uploaded");

    const submitBtnA = firstCard.getByTestId(/^submit-payment-/);
    await expect(submitBtnA).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });
    await submitBtnA.click();
    await snap(page, "checkout-sellerA-submitted");

    // ── Fill and submit second seller's payment ─────────────────
    const secondCard = sellerCards.nth(1);
    const cardBSelect = secondCard.getByTestId("payment-method-select");
    await expect
      .poll(
        async () =>
          cardBSelect.evaluate((el: HTMLSelectElement) => el.options.length),
        { timeout: LONG_OPERATION_TIMEOUT_MS },
      )
      .toBeGreaterThan(1);
    await cardBSelect.selectOption({ index: 1 });
    await snap(page, "checkout-sellerB-method-selected");

    await expect(secondCard.getByTestId(/^dynamic-field-/).first()).toBeVisible(
      { timeout: ELEMENT_TIMEOUT_MS },
    );

    await secondCard
      .getByTestId(/^dynamic-field-/)
      .first()
      .locator("input, textarea")
      .first()
      .fill("BANCO-B-002");
    await snap(page, "checkout-sellerB-field-filled");

    const transferInputB = secondCard.getByTestId("transfer-number-input");
    await expect(transferInputB).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await transferInputB.fill("BANCO-TXN-B-002");

    const fileInputB = secondCard.getByTestId("receipt-file-input");
    await fileInputB.setInputFiles(RECEIPT_FIXTURE);

    const receiptPreviewB = secondCard.getByTestId("receipt-preview");
    await expect(receiptPreviewB).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "checkout-sellerB-receipt-uploaded");

    const submitBtnB = secondCard.getByTestId(/^submit-payment-/);
    await expect(submitBtnB).toBeEnabled({ timeout: ELEMENT_TIMEOUT_MS });
    await submitBtnB.click();
    await snap(page, "checkout-sellerB-submitted");

    // ── Both submitted ──────────────────────────────────────────
    await expect(page.getByTestId("checkout-all-submitted")).toBeVisible({
      timeout: LONG_OPERATION_TIMEOUT_MS,
    });
    await snap(page, "checkout-all-submitted");
  });

  // ─── Phase 4: Buyer sees both orders pending ──────────────────

  test("Phase 4: buyer sees both orders pending verification", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    const pendingBadges = page.getByTestId("order-status-pending_verification");
    await expect(pendingBadges.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(pendingBadges).toHaveCount(2, { timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "buyer-both-orders-pending");
  });

  // ─── Phase 5a: Seller A approves their order ──────────────────

  test("Phase 5a: seller A approves their order", async ({ context, page }) => {
    await injectSession(context, sellerA);
    await page.goto(`${APP_URLS.PAYMENTS}/en/sales`);

    const approveBtn = page.getByTestId(/^order-approve-/).first();
    await expect(approveBtn).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "sellerA-order-received");

    // Verify buyer's receipt data is visible to seller A
    const receiptViewerA = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewerA).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const receiptTransferA = page
      .getByTestId("receipt-transfer-number")
      .first();
    await expect(receiptTransferA).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(receiptTransferA).not.toBeEmpty();

    const receiptLinkA = page.getByTestId("receipt-view-link").first();
    await expect(receiptLinkA).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(page.getByTestId("receipt-none").first()).toBeHidden();
    await snap(page, "sellerA-receipt-visible");

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
    await snap(page, "sellerA-order-approved");
  });

  // ─── Phase 5b: Seller B approves their order ──────────────────

  test("Phase 5b: seller B approves their order", async ({ context, page }) => {
    await injectSession(context, sellerB);
    await page.goto(`${APP_URLS.PAYMENTS}/en/sales`);

    const approveBtn = page.getByTestId(/^order-approve-/).first();
    await expect(approveBtn).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await snap(page, "sellerB-order-received");

    // Verify buyer's receipt data is visible to seller B
    const receiptViewerB = page.getByTestId("receipt-viewer").first();
    await expect(receiptViewerB).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const receiptTransferB = page
      .getByTestId("receipt-transfer-number")
      .first();
    await expect(receiptTransferB).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(receiptTransferB).not.toBeEmpty();

    const receiptLinkB = page.getByTestId("receipt-view-link").first();
    await expect(receiptLinkB).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await expect(page.getByTestId("receipt-none").first()).toBeHidden();
    await snap(page, "sellerB-receipt-visible");

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
    await snap(page, "sellerB-order-approved");
  });

  // ─── Phase 6: Buyer sees both orders approved ─────────────────

  test("Phase 6: buyer sees both orders approved", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${APP_URLS.PAYMENTS}/en/purchases`);

    const approvedBadges = page.getByTestId("order-status-approved");
    await expect(approvedBadges.first()).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await expect(approvedBadges).toHaveCount(2, {
      timeout: ELEMENT_TIMEOUT_MS,
    });
    await snap(page, "buyer-both-orders-approved");
  });
});
