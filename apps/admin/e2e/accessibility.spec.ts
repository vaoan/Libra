import AxeBuilder from "@axe-core/playwright";

import { ELEMENT_TIMEOUT_MS } from "../../auth/e2e/helpers/constants";
import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  ADMIN_PERMISSIONS,
  createTestUser,
  injectSession,
  type TestUser,
} from "../../auth/e2e/helpers/session";

const WCAG_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

function getAdminBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_ADMIN_URL;
  if (!url) throw new Error("NEXT_PUBLIC_ADMIN_URL is required.");
  return url;
}

/**
 * Page-level accessibility for the back office.
 *
 * apps/landing and apps/store cover this for the public and buyer-facing
 * routes. Neither can reach admin: every page here needs a session carrying
 * admin permissions, so the pages staff spend their day in had never been
 * measured at all.
 *
 * Component-level axe (packages/ui, packages/app-components) does not answer
 * this either -- contrast against the real theme, focus order across a whole
 * document and heading hierarchy only exist once a page is composed.
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

const ROUTES = [
  { name: "users", path: "/en/users", anchor: "users-page" },
  { name: "audit log", path: "/en/audit", anchor: "audit-log-page" },
  { name: "reports", path: "/en/reports", anchor: "reports-page" },
];

test.describe.serial("Admin accessibility", () => {
  let adminUser: TestUser;

  test.beforeAll(async () => {
    adminUser = await createTestUser("admin-a11y", [
      ...ADMIN_PERMISSIONS,
      "users.export",
    ]);
  });

  for (const route of ROUTES) {
    test(`${route.name} has no WCAG 2 AA violations`, async ({
      context,
      page,
    }) => {
      await injectSession(context, adminUser);
      await page.goto(`${getAdminBaseUrl()}${route.path}`);
      await expect(page.getByTestId(route.anchor)).toBeVisible({
        timeout: ELEMENT_TIMEOUT_MS,
      });

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_AA)
        .analyze();

      expect(
        summarise(results.violations),
        `${route.name} accessibility`,
      ).toEqual([]);
    });
  }

  test("dark mode keeps its contrast", async ({ context, page }) => {
    // Contrast is the class a component-level check cannot find, and the one
    // most likely to differ between themes.
    await injectSession(context, adminUser);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${getAdminBaseUrl()}/en/users`);
    await expect(page.getByTestId("users-page")).toBeVisible({
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
