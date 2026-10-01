import { describe, expect, it, vi } from "vitest";

import { waitForClerkToSettle } from "../e2e/helpers/clerkSettle";

function fakePage(url: string, waitForFunction = vi.fn(async () => undefined)) {
  return {
    page: { url: () => url, waitForFunction } as unknown as Parameters<
      typeof waitForClerkToSettle
    >[0],
    waitForFunction,
  };
}

// Leaving an app page between its load and Clerk's browser init (~700 ms)
// makes Clerk's first FAPI calls go out without cookies; FAPI answers with a
// fresh client and __client_uat=0, the route guard redirects to login, and
// that redirect aborts the navigation the test just started
// (net::ERR_ABORTED, CI production run e2e-20260928-0726-c2f5).
describe("waitForClerkToSettle", () => {
  it("waits for window.Clerk.loaded on an app page", async () => {
    const { page, waitForFunction } = fakePage(
      "https://store.furrycolombia.com/studio/en",
    );
    await waitForClerkToSettle(page);
    expect(waitForFunction).toHaveBeenCalledTimes(1);
    const [predicate, , options] = waitForFunction.mock.calls[0] as unknown as [
      () => boolean,
      unknown,
      { timeout: number },
    ];
    expect(options.timeout).toBeGreaterThan(0);
    // The predicate is what runs in the browser: true only once Clerk loaded.
    const w = globalThis as unknown as { Clerk?: { loaded?: boolean } };
    w.Clerk = undefined;
    expect(predicate()).toBe(false);
    w.Clerk = { loaded: false };
    expect(predicate()).toBe(false);
    w.Clerk = { loaded: true };
    expect(predicate()).toBe(true);
    delete w.Clerk;
  });

  it("does nothing on a blank page", async () => {
    const { page, waitForFunction } = fakePage("about:blank");
    await waitForClerkToSettle(page);
    expect(waitForFunction).not.toHaveBeenCalled();
  });

  it("never throws when Clerk does not load in time", async () => {
    const { page } = fakePage(
      "https://store.furrycolombia.com/studio/en",
      vi.fn(async () => {
        throw new Error("Timeout 15000ms exceeded");
      }),
    );
    await expect(waitForClerkToSettle(page)).resolves.toBeUndefined();
  });
});
