import { describe, expect, it, vi } from "vitest";

import {
  dispatchDeploy,
  restorePreviousImage,
  waitForTestIds,
} from "../lib/e2e-prod-swap.mjs";

// The clean production build still carries one literal
// data-testid="theme-toggle" (a prop default in packages/ui), so "any
// data-testid" is not a signal. tid() output is: app-navigation is emitted
// by every app's nav only when NEXT_PUBLIC_ENABLE_TEST_IDS is on.
const html = (withIds) => ({
  ok: true,
  text: async () =>
    withIds
      ? '<nav data-testid="app-navigation"><button data-testid="theme-toggle">'
      : '<nav><button data-testid="theme-toggle">',
});

describe("waitForTestIds", () => {
  it("resolves once the served page carries data-testid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(html(false))
      .mockResolvedValueOnce(html(true));
    await expect(
      waitForTestIds({
        url: "https://store.example.com/",
        present: true,
        timeoutMs: 1000,
        intervalMs: 1,
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolves once the attribute is gone when present=false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(html(true))
      .mockResolvedValueOnce(html(false));
    await waitForTestIds({
      url: "u",
      present: false,
      timeoutMs: 1000,
      intervalMs: 1,
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects on timeout", async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(html(false));
    await expect(
      waitForTestIds({
        url: "u",
        present: true,
        timeoutMs: 10,
        intervalMs: 5,
        fetchImpl,
        sleep: async () => {
          now += 5;
        },
        clock: () => now,
      }),
    ).rejects.toThrow(/did not start serving test ids within 10ms/);
  });
});

describe("dispatchDeploy", () => {
  it("identifies the new run by id, even when its createdAt predates the caller's clock (no clock comparison)", async () => {
    const runGh = vi
      .fn()
      // gh run list BEFORE dispatch: run 1 is the latest
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 1, createdAt: "2026-09-27T19:50:00Z" }]),
      )
      // gh workflow run
      .mockResolvedValueOnce("")
      // gh run list AFTER: still 1 (not yet visible)
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 1, createdAt: "2026-09-27T19:50:00Z" }]),
      )
      // gh run list AFTER: run 2 appeared, created 3 s BEFORE the caller's clock
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 2, createdAt: "2026-09-27T19:53:16Z" }]),
      );
    const id = await dispatchDeploy({
      testIds: true,
      ref: "develop",
      runGh,
      sleep: async () => undefined,
    });
    expect(id).toBe("2");
  });

  it("dispatches with the test_ids input and returns the new run id", async () => {
    const runGh = vi
      .fn()
      // gh run list before dispatch: run 1 is the latest
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 1, createdAt: "2026-09-27T19:30:00Z" }]),
      )
      // gh workflow run
      .mockResolvedValueOnce("")
      // gh run list after: run 2 is the latest
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 2, createdAt: "2026-09-27T19:31:00Z" }]),
      );
    const id = await dispatchDeploy({
      testIds: true,
      ref: "develop",
      runGh,
      sleep: async () => undefined,
    });
    expect(id).toBe("2");
    expect(runGh.mock.calls[1][0]).toEqual([
      "workflow",
      "run",
      "deploy-production.yml",
      "--ref",
      "develop",
      "-f",
      "test_ids=true",
    ]);
  });
});

describe("restorePreviousImage", () => {
  it("moves env.prod.previous back, brings compose up, and waits for zero test ids on the box", async () => {
    const runSsh = vi
      .fn()
      // restore command
      .mockResolvedValueOnce("restored\n")
      // first loopback count: still test ids
      .mockResolvedValueOnce("23\n")
      // second: clean
      .mockResolvedValueOnce("0\n");
    await restorePreviousImage({
      runSsh,
      sleep: async () => undefined,
      timeoutMs: 1000,
      intervalMs: 1,
    });
    expect(runSsh.mock.calls[0][0]).toContain("env.prod.previous");
    expect(runSsh.mock.calls[0][0]).toContain(
      "docker compose --env-file env.prod.rendered up -d",
    );
    expect(runSsh.mock.calls[1][0]).toContain(
      "grep -c 'data-testid=\"app-navigation\"'",
    );
    expect(runSsh).toHaveBeenCalledTimes(3);
  });

  it("does nothing when the box already serves a clean image", async () => {
    const runSsh = vi
      .fn()
      .mockResolvedValueOnce("clean already: ghcr.io/x/y:abc\n");
    await restorePreviousImage({
      runSsh,
      sleep: async () => undefined,
      timeoutMs: 10,
      intervalMs: 1,
    });
    expect(runSsh).toHaveBeenCalledTimes(1);
  });

  it("refuses when the previous env is itself a test-id image", async () => {
    const runSsh = vi.fn().mockResolvedValueOnce("no clean previous env\n");
    await expect(
      restorePreviousImage({
        runSsh,
        sleep: async () => undefined,
        timeoutMs: 10,
        intervalMs: 1,
      }),
    ).rejects.toThrow(/no clean previous env/);
  });

  it("refuses when there is no previous env to restore", async () => {
    const runSsh = vi.fn().mockResolvedValueOnce("no previous env\n");
    await expect(
      restorePreviousImage({
        runSsh,
        sleep: async () => undefined,
        timeoutMs: 10,
        intervalMs: 1,
      }),
    ).rejects.toThrow(/no previous env/);
  });
});
