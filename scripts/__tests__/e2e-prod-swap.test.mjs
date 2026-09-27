import { describe, expect, it, vi } from "vitest";

import { dispatchDeploy, waitForTestIds } from "../lib/e2e-prod-swap.mjs";

const html = (withIds) => ({
  ok: true,
  text: async () => (withIds ? '<div data-testid="x">' : "<div>"),
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
