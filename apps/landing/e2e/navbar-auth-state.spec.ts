import { expect, test } from "@playwright/test";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveE2EAppUrls } = require(
  path.resolve(__dirname, "../../../scripts/app-url-resolver.js"),
);

const LANDING_URL = `${resolveE2EAppUrls().landing}/en`;

test.describe("Landing navbar auth state", () => {
  test("shows public app links while signed out and hides protected ones", async ({
    page,
  }) => {
    await page.goto(LANDING_URL);
    await expect(page.getByTestId("app-navigation")).toBeVisible();
    await expect(page.getByTestId("nav-link-landing")).toBeVisible();
    await expect(page.getByTestId("nav-link-store")).toBeVisible();
    await expect(page.getByTestId("nav-link-auth")).toBeVisible();
    await expect(page.getByTestId("nav-link-admin")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-studio")).toHaveCount(0);
    await expect(page.getByTestId("nav-link-payments")).toHaveCount(0);
  });
});
