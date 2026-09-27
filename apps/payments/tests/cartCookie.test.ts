import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("cookies-next", () => ({
  getCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

import { getCookie, deleteCookie } from "cookies-next";

import {
  clearCartCookie,
  readCartFromCookie,
  subscribeToCartCookie,
} from "@/features/checkout/infrastructure/cartCookie";

const mockGetCookie = getCookie as unknown as ReturnType<typeof vi.fn>;
const mockDeleteCookie = deleteCookie as unknown as ReturnType<typeof vi.fn>;

describe("readCartFromCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when cookie is not set", () => {
    mockGetCookie.mockReturnValue(null);
    expect(readCartFromCookie()).toEqual([]);
  });

  it("returns empty array when cookie is empty string", () => {
    mockGetCookie.mockReturnValue("");
    expect(readCartFromCookie()).toEqual([]);
  });

  it("returns empty array when cookie contains invalid JSON", () => {
    mockGetCookie.mockReturnValue("not-json");
    expect(readCartFromCookie()).toEqual([]);
  });

  it("returns empty array when cookie contains a non-array JSON", () => {
    mockGetCookie.mockReturnValue(JSON.stringify({ id: "1" }));
    expect(readCartFromCookie()).toEqual([]);
  });

  it("returns empty when cookie payload is a mixed-validity array", () => {
    const items = [
      {
        id: "p1",
        quantity: 2,
      },
      { invalid: true }, // missing required fields
      null,
    ];
    mockGetCookie.mockReturnValue(JSON.stringify(items));
    const result = readCartFromCookie();
    expect(result).toEqual([]);
  });

  it("returns valid cart items from cookie", () => {
    const items = [
      {
        id: "p1",
        quantity: 3,
      },
    ];
    mockGetCookie.mockReturnValue(JSON.stringify(items));
    const result = readCartFromCookie();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "p1",
      quantity: 3,
    });
  });

  it("returns the memoized snapshot when the raw cookie value has not changed", () => {
    const items = [{ id: "p-cached", quantity: 7 }];
    const rawJson = JSON.stringify(items);

    // First call parses and caches
    mockGetCookie.mockReturnValue(rawJson);
    const first = readCartFromCookie();

    // Second call with same raw value — should return the identical reference
    const second = readCartFromCookie();
    expect(second).toBe(first);
  });
});

describe("clearCartCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes the cart cookie with path /", () => {
    clearCartCookie();
    expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
      path: "/",
    });
  });

  it("notifies listeners after clearing the cart cookie", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToCartCookie(listener);

    clearCartCookie();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("never sets a domain attribute, even on a multi-segment hostname", () => {
    vi.stubGlobal("location", { hostname: "payments.example.com" });

    clearCartCookie();

    expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
      path: "/",
    });
  });

  it("still clears the cookie when window is undefined", () => {
    vi.stubGlobal("window", void 0);

    // Should not throw and deleteCookie is still called
    clearCartCookie();

    expect(mockDeleteCookie).toHaveBeenCalledWith("libra-cart", {
      path: "/",
    });
  });
});

describe("subscribeToCartCookie", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a callable no-op when window is not available", () => {
    vi.stubGlobal("window", void 0);

    const unsubscribe = subscribeToCartCookie(vi.fn());
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  it("does not call onStoreChange when visibilityState is not visible", () => {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });

    const listener = vi.fn();
    const unsubscribe = subscribeToCartCookie(listener);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();

    // Restore
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });
});
