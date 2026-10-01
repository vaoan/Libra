import path from "node:path";

import { devices } from "@playwright/test";

import { expect, test } from "./fixtures/autoCleanup";
import {
  adminDelete,
  adminInsert,
  createTestUser,
  SELLER_PERMISSIONS,
  injectSession,
} from "./helpers/session";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../scripts/app-url-resolver.js"),
);

const { store: STORE_URL, payments: PAYMENTS_URL } = resolveE2EAppUrls();

test.use({
  ...devices["iPhone 12"],
  browserName: "chromium",
});

test(
  "mobile layouts stay contained and checkout keeps the sidebar closed",
  { tag: "@ux" },
  async ({ context, page }) => {
    const seller = await createTestUser("mobile-seller", SELLER_PERMISSIONS);
    const buyer = await createTestUser("mobile-buyer", [
      "products.read",
      "orders.create",
      "orders.read",
      "receipts.create",
    ]);

    // Create a product so the store has something to display
    await adminInsert("products", {
      seller_id: seller.userId,
      slug: `mobile-test-${Date.now()}`,
      name_en: "Mobile Test Product",
      name_es: "Producto Mobile Test",
      description_en: "Product for mobile layout test",
      description_es: "Producto para test de layout mobile",
      type: "merch",
      category: "merch",
      price: 5000,
      currency: "COP",
      is_active: true,
      images: [],
      sections: [],
      tags: [],
      sort_order: 0,
      featured: false,
    });

    // Create a payment method so checkout has something to show
    await adminInsert("seller_payment_methods", {
      seller_id: seller.userId,
      name_en: "Mobile Test Method",
      name_es: "Metodo Mobile Test",
      display_blocks: [],
      form_fields: [],
      is_active: true,
      sort_order: 0,
    });

    try {
      await injectSession(context, buyer);

      // Verify session landed (not redirected to login)
      await page.goto(`${STORE_URL}/en`);
      expect(page.url(), "Store should not redirect to login").not.toContain(
        "/login",
      );
      await expect(page.getByTestId("app-navigation")).toBeVisible();
      await expect(page.getByTestId("nav-link-store")).toBeVisible();

      const storeViewportMetrics = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
      }));

      expect(storeViewportMetrics.doc).toBeLessThanOrEqual(
        storeViewportMetrics.viewport + 1,
      );
      expect(storeViewportMetrics.body).toBeLessThanOrEqual(
        storeViewportMetrics.viewport + 1,
      );

      await page.screenshot({
        path: "e2e/screenshots/mobile-store-layout.png",
        fullPage: true,
      });

      await page.getByTestId("product-card-link").first().click();
      await expect(page.getByTestId("product-detail-page")).toBeVisible();
      await expect(page.getByTestId("hero-section")).toBeVisible();

      const detailViewportMetrics = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
      }));

      expect(detailViewportMetrics.doc).toBeLessThanOrEqual(
        detailViewportMetrics.viewport + 1,
      );
      expect(detailViewportMetrics.body).toBeLessThanOrEqual(
        detailViewportMetrics.viewport + 1,
      );

      await page.screenshot({
        path: "e2e/screenshots/mobile-product-detail-layout.png",
        fullPage: true,
      });

      await page.getByTestId("product-detail-mobile-add-to-cart").click();

      // Rendered state first: the bar's in-cart indicator renders once
      // quantityInCart > 0. Unlike the button's "added" state it does not time
      // out after a moment, so it is safe to assert against. It had no test id
      // until now, which is why this was a fixed 500ms sleep.
      await expect(
        page.getByTestId("product-detail-mobile-in-cart"),
      ).toBeVisible();

      // Then persisted state, which is what the navigation below actually
      // needs. The cart writes its cookie from a useEffect, so the write lands
      // a tick after React has already rendered the indicator above -- and it
      // is the cookie, not the DOM, that survives the goto.
      //
      // Kept as a presence check rather than a count. full-purchase-flow tried
      // asserting an exact item count here and CI rejected it, so the count is
      // not what I assumed; presence is the part I can stand behind without
      // running the suite.
      await expect
        .poll(
          async () =>
            (await context.cookies()).some((c) => c.name === "libra-cart"),
          { message: "cart cookie was never written" },
        )
        .toBe(true);

      await page.goto(`${PAYMENTS_URL}/en/checkout`);

      // Verify we landed on checkout, not redirected to login. toHaveURL
      // retries, so it waits and asserts in one step.
      await expect(page).not.toHaveURL(/\/login/);

      await expect(
        page.getByTestId("payments-mobile-sidebar-trigger"),
      ).toBeVisible();
      await expect(page.getByTestId("payments-sidebar")).toBeHidden();

      const checkoutViewportMetrics = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
        body: document.body.scrollWidth,
      }));

      expect(checkoutViewportMetrics.doc).toBeLessThanOrEqual(
        checkoutViewportMetrics.viewport + 1,
      );
      expect(checkoutViewportMetrics.body).toBeLessThanOrEqual(
        checkoutViewportMetrics.viewport + 1,
      );

      await expect(page.getByTestId(/^seller-checkout-/).first()).toBeVisible();

      await page.getByTestId("payments-mobile-sidebar-trigger").click();
      await page.screenshot({
        path: "e2e/screenshots/mobile-payments-layout.png",
        fullPage: true,
      });
    } finally {
      // Cleanup test data
      await adminDelete(
        "seller_payment_methods",
        `seller_id=eq.${seller.userId}`,
      ).catch(() => {});
      await adminDelete("products", `seller_id=eq.${seller.userId}`).catch(
        () => {},
      );
      await adminDelete("user_permissions", `user_id=eq.${buyer.userId}`).catch(
        () => {},
      );
      await adminDelete(
        "user_permissions",
        `user_id=eq.${seller.userId}`,
      ).catch(() => {});
    }
  },
);
