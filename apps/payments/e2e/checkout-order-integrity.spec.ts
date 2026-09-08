import type { BrowserContext } from "@playwright/test";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";

import { cleanupTestData } from "../../auth/e2e/helpers/cleanup";
import { APP_URLS, ELEMENT_TIMEOUT_MS } from "../../auth/e2e/helpers/constants";
import {
  BUYER_PERMISSIONS,
  SELLER_PERMISSIONS,
  adminDelete,
  adminInsert,
  adminQuery,
  buildSharedCookieDomain,
  createTestUser,
  injectSession,
  type TestUser,
} from "../../auth/e2e/helpers/session";

const PAYMENTS_URL = APP_URLS.PAYMENTS;

// ─── Seed data shapes ─────────────────────────────────────────────

const PRODUCT_SEED = {
  name_en: "Order Integrity Product",
  name_es: "Producto de Integridad de Órdenes",
  description_en: "E2E product for checkout order integrity tests",
  description_es:
    "Producto E2E para pruebas de integridad de creación de órdenes",
  type: "merch",
  price: 15000,
  currency: "COP",
  max_quantity: 10,
  is_active: true,
  images: [],
};

const PAYMENT_METHOD_SEED = {
  name_en: "E2E Bank Transfer",
  name_es: "Transferencia Bancaria E2E",
  display_blocks: [{ id: "b1", type: "text", content: "Account: E2E-123456" }],
  form_fields: [
    {
      id: "transfer-ref",
      type: "text",
      label: "Transfer Reference",
      required: true,
      placeholder: "",
    },
  ],
  is_active: true,
  requires_receipt: false,
  requires_transfer_number: false,
  sort_order: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────

async function injectCartCookie(
  context: BrowserContext,
  sellerId: string,
  productId: string,
): Promise<void> {
  const sharedDomain = buildSharedCookieDomain(PAYMENTS_URL);
  const isLocalhost =
    sharedDomain === "localhost" || sharedDomain === "127.0.0.1";

  await context.addCookies([
    {
      name: "libra-cart",
      value: JSON.stringify([
        {
          id: productId,
          name_en: PRODUCT_SEED.name_en,
          name_es: PRODUCT_SEED.name_es,
          price: PRODUCT_SEED.price,
          currency: PRODUCT_SEED.currency,
          seller_id: sellerId,
          quantity: 1,
          images: [],
          max_quantity: PRODUCT_SEED.max_quantity,
        },
      ]),
      domain: sharedDomain,
      path: "/",
      httpOnly: false,
      secure: !isLocalhost,
      sameSite: "Lax",
    },
  ]);
}

async function clearBuyerOrders(buyerUserId: string): Promise<void> {
  const orders = await adminQuery("orders", `user_id=eq.${buyerUserId}`);
  for (const order of orders) {
    await adminDelete("order_items", `order_id=eq.${order.id}`).catch(() => {});
  }
  await adminDelete("orders", `user_id=eq.${buyerUserId}`).catch(() => {});
}

// ─── Test suite ───────────────────────────────────────────────────

test.describe.serial("Checkout order creation integrity", () => {
  let seller: TestUser;
  let buyer: TestUser;
  let productId: string;

  test.beforeAll(async () => {
    seller = await createTestUser("order-integrity-seller", SELLER_PERMISSIONS);
    buyer = await createTestUser("order-integrity-buyer", BUYER_PERMISSIONS);

    const product = await adminInsert("products", {
      ...PRODUCT_SEED,
      slug: `order-integrity-${Date.now()}`,
      seller_id: seller.userId,
    });
    productId = product.id as string;

    await adminInsert("seller_payment_methods", {
      ...PAYMENT_METHOD_SEED,
      seller_id: seller.userId,
    });
  });

  test.beforeEach(async () => {
    // Wipe any orders the buyer may have from a previous attempt or retry so
    // each test starts from a clean slate.
    if (buyer) await clearBuyerOrders(buyer.userId);
  });

  test.afterAll(async () => {
    if (seller && buyer) {
      await cleanupTestData(seller.userId, buyer.userId);
    }
  });

  // ─── 1: Page load ─────────────────────────────────────────────

  test("does not create any order when the checkout page loads", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await injectCartCookie(context, seller.userId, productId);

    await page.goto(`${PAYMENTS_URL}/en/checkout`);

    await expect(
      page.getByTestId(`seller-checkout-${seller.userId}`),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const orders = await adminQuery("orders", `user_id=eq.${buyer.userId}`);
    expect(orders).toHaveLength(0);
  });

  // ─── 2: Form interaction ──────────────────────────────────────

  test("does not create any order while the buyer selects a payment method and fills the form", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await injectCartCookie(context, seller.userId, productId);

    await page.goto(`${PAYMENTS_URL}/en/checkout`);

    const sellerCard = page.getByTestId(`seller-checkout-${seller.userId}`);
    await expect(sellerCard).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Select the payment method — index 0 is the placeholder "Select…"
    await sellerCard
      .getByTestId("payment-method-select")
      .selectOption({ index: 1 });

    // Fill the transfer reference field
    await expect(
      sellerCard.getByTestId("dynamic-field-transfer-ref"),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await sellerCard
      .getByTestId("dynamic-field-transfer-ref")
      .locator("input, textarea")
      .fill("TEST-BEFORE-SUBMIT-001");

    // No order must exist in the DB at this point
    const orders = await adminQuery("orders", `user_id=eq.${buyer.userId}`);
    expect(orders).toHaveLength(0);
  });

  // ─── 3: Submission ───────────────────────────────────────────

  test("creates exactly one pending_verification order on submit — no awaiting_payment row is ever written (regression GH-179)", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await injectCartCookie(context, seller.userId, productId);

    await page.goto(`${PAYMENTS_URL}/en/checkout`);

    const sellerCard = page.getByTestId(`seller-checkout-${seller.userId}`);
    await expect(sellerCard).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    // Select payment method
    await sellerCard
      .getByTestId("payment-method-select")
      .selectOption({ index: 1 });

    // Fill the transfer reference field
    await expect(
      sellerCard.getByTestId("dynamic-field-transfer-ref"),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });
    await sellerCard
      .getByTestId("dynamic-field-transfer-ref")
      .locator("input, textarea")
      .fill("TEST-SUBMIT-002");

    // Guard: still no order before hitting submit
    const ordersBefore = await adminQuery(
      "orders",
      `user_id=eq.${buyer.userId}`,
    );
    expect(ordersBefore).toHaveLength(0);

    // Submit payment
    await sellerCard.getByTestId(`submit-payment-${seller.userId}`).click();

    // With a single seller the app transitions directly to the full-page success
    // state (checkout-all-submitted) — the per-seller badge is never rendered
    await expect(page.getByTestId("checkout-all-submitted")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    // Exactly one order must now exist, created only at the moment of payment submission
    const ordersAfter = await adminQuery(
      "orders",
      `user_id=eq.${buyer.userId}`,
    );
    expect(ordersAfter).toHaveLength(1);
    expect(ordersAfter[0]!.payment_status).toBe("pending_verification");
  });
});
