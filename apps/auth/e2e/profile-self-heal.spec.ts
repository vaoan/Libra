import { expect, test } from "./fixtures/autoCleanup";
import { APP_URLS, NAVIGATION_TIMEOUT_MS } from "./helpers/constants";
import {
  adminQuery,
  adminUpdate,
  createTestUser,
  injectSession,
  type TestUser,
} from "./helpers/session";

/**
 * A returning customer's first Clerk sign-in can finish without ever
 * reaching the auth callback, the only place a Clerk identity is linked to
 * its `user_profiles` row. Production hit exactly this on 2026-09-30: a
 * Google sign-in left a verified Clerk user next to an unclaimed profile with
 * the same email, and every visit to the store sent them back to login.
 *
 * `injectSession` signs in through Clerk directly, never touching the
 * callback, so clearing `identity_sub` afterwards reproduces that state. The
 * store must link the profile and let them in on its own.
 */
test.describe.serial("Profile self-healing", () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser("profile-self-heal");
    // The state a migrated customer arrives in: profile present, unclaimed.
    await adminUpdate("user_profiles", `id=eq.${user.userId}`, {
      identity_sub: null,
    });
  });

  test("a signed-in person with an unclaimed profile gets into the store", async ({
    context,
    page,
  }) => {
    await injectSession(context, user);

    await page.goto(`${APP_URLS.STORE}/en`);

    // The store sends them through the callback, which claims the profile
    // and returns them. toHaveURL retries, so it waits out both redirects.
    await expect(page).toHaveURL(
      (url) => url.href.startsWith(`${APP_URLS.STORE}/en`),
      { timeout: NAVIGATION_TIMEOUT_MS },
    );
    // Rendered inside ProtectedRoute, unlike the navigation, so it is absent
    // on both the login redirect and the error state.
    await expect(
      page.getByTestId("product-catalog-page").first(),
    ).toBeVisible();

    const [profile] = await adminQuery(
      "user_profiles",
      `id=eq.${user.userId}&select=identity_sub`,
    );
    expect(profile?.identity_sub).toBe(user.clerkUserId);
  });

  test("a later visit goes straight in without another detour", async ({
    context,
    page,
  }) => {
    await injectSession(context, user);

    const visited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) visited.push(frame.url());
    });

    await page.goto(`${APP_URLS.STORE}/en`);
    await expect(page.getByTestId("product-catalog-page").first()).toBeVisible({
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    expect(
      visited.filter((url) => /\/(login|callback)(\?|$)/.test(url)),
    ).toEqual([]);
  });
});
