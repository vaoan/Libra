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
  it("dispatches with the test_ids input and returns the new run id", async () => {
    const runGh = vi
      .fn()
      // gh workflow run
      .mockResolvedValueOnce("")
      // gh run list (before dispatch there was run 1; now 2 is newest)
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 2, createdAt: "2026-09-27T19:31:00Z" }]),
      );
    const id = await dispatchDeploy({
      testIds: true,
      ref: "develop",
      runGh,
      since: new Date("2026-09-27T19:30:00Z"),
      sleep: async () => undefined,
    });
    expect(id).toBe("2");
    expect(runGh.mock.calls[0][0]).toEqual([
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
