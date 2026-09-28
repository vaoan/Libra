import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { downloadReceipt, sha256Hex } from "../e2e/helpers/receiptDownload";

const URL =
  "https://x.supabase.co/storage/v1/object/sign/receipts/o/1.png?token=secret";
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
const ok = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ "content-type": "image/png" }),
  arrayBuffer: async () => png.buffer.slice(0),
});
const status = (code: number) => ({
  ok: false,
  status: code,
  headers: new Headers({ "content-type": "text/plain" }),
  arrayBuffer: async () => new ArrayBuffer(0),
});
const noSleep = async () => {};

// Supabase Storage (behind its own Cloudflare) answered 502 after 28 s for a
// freshly signed receipt during a Supabase incident (CI production run
// e2e-20260928-0848-27f4); the next fetch of the same bucket was 200 in
// 500 ms. A provider blip is bounded-retried and named; a 4xx is our bug and
// fails at once.
describe("downloadReceipt", () => {
  it("returns the bytes and content type on the first try", async () => {
    const fetchImpl = vi.fn(async () => ok());
    const result = await downloadReceipt(URL, { fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.contentType).toBe("image/png");
    expect(Array.from(result.bytes)).toEqual(Array.from(png));
  });

  it("retries a 5xx with a pause and returns the eventual answer", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(502))
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockResolvedValueOnce(ok());
    const slept: number[] = [];
    const result = await downloadReceipt(URL, {
      fetchImpl,
      attempts: 3,
      delayMs: 2000,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(result.contentType).toBe("image/png");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([2000, 2000]);
  });

  it("does not retry a 4xx: that is our bug, not the provider's", async () => {
    const fetchImpl = vi.fn(async () => status(404));
    await expect(
      downloadReceipt(URL, { fetchImpl, attempts: 3, sleep: noSleep }),
    ).rejects.toThrow(/Receipt fetch failed: 404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after the last attempt, naming the provider and hiding the token", async () => {
    const fetchImpl = vi.fn(async () => status(502));
    await expect(
      downloadReceipt(URL, { fetchImpl, attempts: 3, sleep: noSleep }),
    ).rejects.toThrow(
      /Supabase Storage answered 502 on 3 attempts .*receipts\/o\/1\.png(?!.*secret)/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("sha256Hex matches node's digest", () => {
    expect(sha256Hex(png)).toBe(
      createHash("sha256").update(Buffer.from(png)).digest("hex"),
    );
  });
});
