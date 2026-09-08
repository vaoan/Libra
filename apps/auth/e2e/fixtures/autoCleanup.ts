import { test as base } from "@playwright/test";

import { drainTestUsers } from "../helpers/userRegistry";

/**
 * Worker-scoped, `auto: true`: Playwright runs the teardown half when the
 * worker shuts down — including after a failed test, a timeout, or a throw
 * inside `beforeAll`, which is exactly where the old afterAll pattern leaked.
 */
export const test = base.extend<object, { cleanupUsers: void }>({
  cleanupUsers: [
    async ({}, use) => {
      await use();
      const drained = await drainTestUsers();
      if (drained > 0) {
        console.log(`[e2e] drained ${drained} Clerk test user(s)`);
      }
    },
    { scope: "worker", auto: true },
  ],
});

export { expect } from "@playwright/test";
