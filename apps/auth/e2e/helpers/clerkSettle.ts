import type { Page } from "@playwright/test";

/** Clerk's browser script initializes ~700 ms after an app page loads. */
const CLERK_SETTLE_TIMEOUT_MS = 15_000;

/**
 * Wait until Clerk's browser script has finished initializing on the current
 * page before navigating away from it.
 *
 * Leaving a page between its load and that init made Clerk's first FAPI
 * calls (`/v1/environment`, `/v1/client`) go out **without any cookies**;
 * FAPI then minted a fresh client with no session and answered
 * `__client_uat=0`, the route guard read "signed out" and issued a
 * `location.replace` to login, and that redirect aborted the navigation the
 * test had just started (`net::ERR_ABORTED`, CI production run
 * e2e-20260928-0726-c2f5, where the test left the studio page 660 ms after
 * it loaded; every earlier page in that trace waited longer and had
 * cookies). Nothing to wait for on a blank page; a page that never loads
 * Clerk is left alone after the timeout rather than failing the test here.
 */
export async function waitForClerkToSettle(page: Page): Promise<void> {
  if (!/^https?:/.test(page.url())) return;
  try {
    await page.waitForFunction(
      () => {
        const w = globalThis as unknown as { Clerk?: { loaded?: boolean } };
        return w.Clerk?.loaded === true;
      },
      undefined,
      { timeout: CLERK_SETTLE_TIMEOUT_MS },
    );
  } catch {
    // No Clerk on this page, or it never loaded: there is nothing to settle.
  }
}
