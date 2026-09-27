import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSetCookie = vi.hoisted(() => vi.fn());
const mockDeleteCookie = vi.hoisted(() => vi.fn());

vi.mock("cookies-next", () => ({
  setCookie: mockSetCookie,
  deleteCookie: mockDeleteCookie,
}));

vi.mock("shared/constants/cart", () => ({
  CART_COOKIE_KEY: "libra-cart",
}));

vi.mock("shared/constants/time", () => ({
  HOURS_PER_DAY: 24,
  MINUTES_PER_HOUR: 60,
  SECONDS_PER_MINUTE: 60,
}));

vi.mock("shared/types", () => ({}));

import {
  getCartCookieOptions,
  persistCartCookie,
  removeCartCookie,
  COOKIE_MAX_AGE_S,
} from "@/shared/application/cart/cartCookiePersistence";

function setLocation(protocol: string, hostname: string) {
  Object.defineProperty(globalThis, "location", {
    value: { protocol, hostname },
    writable: true,
    configurable: true,
  });
}

describe("COOKIE_MAX_AGE_S", () => {
  it("equals 30 days in seconds", () => {
    expect(COOKIE_MAX_AGE_S).toBe(30 * 24 * 60 * 60);
  });
});

describe("getCartCookieOptions — server-side (no window)", () => {
  let originalWindow: Window & typeof globalThis;

  beforeEach(() => {
    originalWindow = globalThis.window;
    // @ts-expect-error -- simulate SSR: no window
    delete globalThis.window;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("returns secure: false and no domain when window is undefined", () => {
    const options = getCartCookieOptions();
    expect(options.secure).toBe(false);
    expect(options).not.toHaveProperty("domain");
    expect(options.path).toBe("/");
    expect(options.sameSite).toBe("lax");
  });
});

describe("getCartCookieOptions — browser (with window)", () => {
  it("returns secure: true on https", () => {
    setLocation("https:", "store.example.com");

    const options = getCartCookieOptions();
    expect(options.secure).toBe(true);
  });

  it("returns secure: false on http", () => {
    setLocation("http:", "localhost");

    const options = getCartCookieOptions();
    expect(options.secure).toBe(false);
  });

  it("never sets a domain, even on a multi-segment hostname", () => {
    setLocation("https:", "store.example.com");

    expect(getCartCookieOptions()).not.toHaveProperty("domain");
  });
});

describe("persistCartCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocation("http:", "localhost");
  });

  it("calls setCookie with serialized cart items", () => {
    const items = [
      { id: "p1", quantity: 2, seller_id: "s1" },
      { id: "p2", quantity: 1, seller_id: "s2" },
    ] as unknown as Parameters<typeof persistCartCookie>[0];

    persistCartCookie(items);

    expect(mockSetCookie).toHaveBeenCalledOnce();
    const [key, value] = mockSetCookie.mock.calls[0]! as [
      string,
      string,
      unknown,
    ];
    expect(key).toBe("libra-cart");
    const parsed = JSON.parse(value) as { id: string; quantity: number }[];
    expect(parsed).toEqual([
      { id: "p1", quantity: 2 },
      { id: "p2", quantity: 1 },
    ]);
  });

  it("never deletes before setting, on any hostname", () => {
    setLocation("https:", "store.example.com");

    persistCartCookie([]);

    expect(mockDeleteCookie).not.toHaveBeenCalled();
    expect(mockSetCookie).toHaveBeenCalledOnce();
    const options = mockSetCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(options).not.toHaveProperty("domain");
  });

  it("includes maxAge in setCookie options", () => {
    persistCartCookie([]);
    const options = mockSetCookie.mock.calls[0]![2] as Record<string, unknown>;
    expect(options.maxAge).toBe(COOKIE_MAX_AGE_S);
  });
});

describe("removeCartCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocation("http:", "localhost");
  });

  it("calls deleteCookie with cookie options", () => {
    removeCartCookie();
    expect(mockDeleteCookie).toHaveBeenCalledOnce();
  });

  it("deletes exactly once with host-only options, on any hostname", () => {
    setLocation("https:", "store.example.com");

    removeCartCookie();

    expect(mockDeleteCookie).toHaveBeenCalledTimes(1);
    expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });
});
