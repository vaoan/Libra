import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/autoCleanup";
import { APP_URLS, ELEMENT_TIMEOUT_MS } from "./helpers/constants";
import {
  SELLER_PERMISSIONS,
  createTestUser,
  injectSession,
  type TestUser,
} from "./helpers/session";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Page-level accessibility for studio.
 *
 * The fourth and last app with real screens. landing, store, admin and
 * payments are covered; studio was not, and it is where a seller does the most
 * work -- the product editor is a form-dense page built from a dozen inline
 * components.
 *
 * It lives here rather than in apps/studio because studio has no playwright
 * project of its own: every studio e2e test in this repository is driven from
 * the auth app, which owns the session helpers.
 *
 * scripts/check-a11y-patterns.mjs currently lists thirteen unnamed controls in
 * studio's editors. This is what turns that list into a pass or a failure.
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

test.describe.serial("Studio accessibility", () => {
  let seller: TestUser;

  test.beforeAll(async () => {
    seller = await createTestUser("studio-a11y", SELLER_PERMISSIONS);
  });

  test("the product list has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expect(page.getByTestId("product-list-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(summarise(results.violations), "product list accessibility").toEqual(
      [],
    );
  });

  test("the product editor has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    // The densest form in the product: price fields, tag editor, icon picker,
    // section cards and the image toolbar, all inline. This is where the
    // pattern scanner reports most of its unnamed controls.
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en/products/new`);
    await expect(page.getByTestId("product-form-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(
      summarise(results.violations),
      "product editor accessibility",
    ).toEqual([]);
  });

  test("delegate management has no WCAG 2 AA violations", async ({
    context,
    page,
  }) => {
    await injectSession(context, seller);
    await page.goto(`${APP_URLS.STUDIO}/en/delegates`);
    await expect(page.getByTestId("delegate-management-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();

    expect(summarise(results.violations), "delegates accessibility").toEqual(
      [],
    );
  });

  test("dark mode keeps its contrast", async ({ context, page }) => {
    // Contrast is the class a component-level check cannot find, and the one
    // most likely to differ between themes.
    await injectSession(context, seller);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${APP_URLS.STUDIO}/en`);
    await expect(page.getByTestId("product-list-page")).toBeVisible({
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
