import path from "node:path";

import AxeBuilder from "@axe-core/playwright";

import { ELEMENT_TIMEOUT_MS } from "../../auth/e2e/helpers/constants";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  BUYER_PERMISSIONS,
  SELLER_PERMISSIONS,
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

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Page-level accessibility for the payments app.
 *
 * apps/landing, apps/store and apps/admin cover the public, buyer-facing and
 * back-office routes. This is the third audience: a seller looking at money
 * coming in, and a buyer looking at what they bought. Both need a session with
 * the right permissions, so no other suite can reach these pages.
 *
 * Seller and buyer are separate users on purpose. The pages differ by
 * permission, and a single over-permissioned account would render a page no
 * real user sees -- passing for a layout nobody is served.
 */

/** Names the rule AND the offending element: a rule id and a node count says
 *  a check failed without saying where, which is not actionable from a CI log,
 *  and a CI log is the only place this runs. */
function summarise(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact}) at ${n.target.join(" ")} -- ${n.failureSummary?.replace(/\s+/g, " ").trim()}`,
    ),
  );
}

test.describe.serial("Payments accessibility", () => {
  let seller: TestUser;
  let buyer: TestUser;

  test.beforeAll(async () => {
    seller = await createTestUser("payments-a11y-seller", SELLER_PERMISSIONS);
    buyer = await createTestUser("payments-a11y-buyer", BUYER_PERMISSIONS);
  });

  test("seller reports has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);
    await expect(page.getByTestId("seller-reports-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(
      summarise(results.violations),
      "seller reports accessibility",
    ).toEqual([]);
  });

  test("received orders has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    // /en/sales, not /en/received-orders: the feature directory and the test
    // id are named for the domain concept, the route is named for what a
    // seller calls it. I guessed from the test id and CI corrected me.
    await page.goto(`${getPaymentsBaseUrl()}/en/sales`);
    await expect(page.getByTestId("received-orders-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(
      summarise(results.violations),
      "received orders accessibility",
    ).toEqual([]);
  });

  test("a buyer's orders page has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    await injectSession(context, buyer);
    await page.goto(`${getPaymentsBaseUrl()}/en/purchases`);

    // Either state. `orders-page` only renders once the buyer has orders, and
    // this user is created fresh for the run, so what actually renders is the
    // empty state -- which is a page a real buyer sees on their first visit
    // and worth scanning on its own account.
    await expect(
      page.getByTestId("orders-page").or(page.getByTestId("orders-empty")),
    ).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(summarise(results.violations), "orders accessibility").toEqual([]);
  });

  test("dark mode keeps its contrast", async ({ context, page }) => {
    // Contrast is the class a component-level check cannot find, and the one
    // most likely to differ between themes.
    await injectSession(context, seller);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${getPaymentsBaseUrl()}/en/reports`);
    await expect(page.getByTestId("seller-reports-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2aa"])
      .include("body")
      .analyze();

    const contrast = results.violations.filter(
      (v) => v.id === "color-contrast",
    );

    expect(summarise(contrast), "dark mode contrast").toEqual([]);
  });
});
