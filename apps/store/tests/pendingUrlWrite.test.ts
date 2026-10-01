import { describe, expect, it } from "vitest";

import {
  getPendingUrlWrite,
  trackPendingUrlWrite,
} from "@/features/products/application/pendingUrlWrite";

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("pendingUrlWrite", () => {
  it("reports nothing pending by default", () => {
    expect(getPendingUrlWrite()).toBeNull();
  });

  it("reports a tracked write until it settles", async () => {
    const write = deferred();
    trackPendingUrlWrite(write.promise);

    const pending = getPendingUrlWrite();
    expect(pending).not.toBeNull();

    write.resolve();
    await pending;
    expect(getPendingUrlWrite()).toBeNull();
  });

  it("settles without rejecting when the write fails, and clears it", async () => {
    const write = deferred();
    trackPendingUrlWrite(write.promise);
    const pending = getPendingUrlWrite();

    write.reject(new Error("history blocked"));

    await expect(pending).resolves.toBeUndefined();
    expect(getPendingUrlWrite()).toBeNull();
  });

  it("keeps the newer write pending when an older one settles", async () => {
    const older = deferred();
    const newer = deferred();
    trackPendingUrlWrite(older.promise);
    trackPendingUrlWrite(newer.promise);

    older.resolve();
    await older.promise;
    await Promise.resolve();
    expect(getPendingUrlWrite()).not.toBeNull();

    newer.resolve();
    await getPendingUrlWrite();
    expect(getPendingUrlWrite()).toBeNull();
  });
});
