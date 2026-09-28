import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PUBLIC = "https://public.supabase.co";
const INTERNAL = "http://kong:8000";

async function load() {
  vi.resetModules();
  return import("@/app/api/admin/_shared/receiptSignedUrls");
}

function signedBody(paths: string[]) {
  return paths.map((path) => ({
    error: null,
    path,
    signedURL: `/object/sign/receipts/${path}?token=t-${path.length}`,
  }));
}

describe("signReceiptPaths", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = PUBLIC;
    process.env["SUPABASE_URL_INTERNAL"] = INTERNAL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The reports route signed every order's receipt with its own request:
  // 143 concurrent calls from the box on production data, and the table
  // waited past its 10 s budget in the CI production run e2e-20260928-0535-a808.
  it("signs every path in one bulk request against the internal host", async () => {
    const paths = ["a/1.jpg", "b/2.png"];
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => signedBody(paths),
    });
    const { signReceiptPaths } = await load();
    const urls = await signReceiptPaths(paths);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(url).toBe(`${INTERNAL}/storage/v1/object/sign/receipts`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer srk");
    expect(JSON.parse(init.body)).toMatchObject({ paths });
    expect(urls.get("a/1.jpg")).toBe(
      `${PUBLIC}/storage/v1/object/sign/receipts/a/1.jpg?token=t-7`,
    );
    expect(urls.get("b/2.png")).toBe(
      `${PUBLIC}/storage/v1/object/sign/receipts/b/2.png?token=t-7`,
    );
  });

  it("maps an unsafe or missing path to null without asking storage for it", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => signedBody(["ok/1.jpg"]),
    });
    const { signReceiptPaths } = await load();
    const urls = await signReceiptPaths(["ok/1.jpg", "../etc/passwd", null]);
    const [, init] = fetchSpy.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).paths).toEqual(["ok/1.jpg"]);
    expect(urls.get("../etc/passwd")).toBeNull();
    expect(urls.get("ok/1.jpg")).toContain("ok/1.jpg?token=");
  });

  it("returns null for a path storage reports an error on, and for all when the call fails", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { error: "Object not found", path: "gone/1.jpg", signedURL: null },
      ],
    });
    const { signReceiptPaths } = await load();
    expect(
      (await signReceiptPaths(["gone/1.jpg"])).get("gone/1.jpg"),
    ).toBeNull();
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect((await signReceiptPaths(["x/1.jpg"])).get("x/1.jpg")).toBeNull();
  });

  it("makes no request when there is nothing to sign", async () => {
    const { signReceiptPaths } = await load();
    expect((await signReceiptPaths([])).size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("splits a large batch into chunks of at most 100 paths", async () => {
    const paths = Array.from({ length: 250 }, (_, i) => `o/${i}.jpg`);
    fetchSpy.mockImplementation(
      async (_url: string, init: { body: string }) => ({
        ok: true,
        json: async () => signedBody(JSON.parse(init.body).paths),
      }),
    );
    const { signReceiptPaths } = await load();
    const urls = await signReceiptPaths(paths);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(urls.size).toBe(250);
    expect(urls.get("o/249.jpg")).toContain("o/249.jpg?token=");
  });
});
