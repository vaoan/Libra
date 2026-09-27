import { deleteCookie, getCookie } from "cookies-next";
import { isCartCookieItems } from "shared/types";
import type { CartCookieItem } from "shared/types";

import {
  CART_COOKIE_CHANGED_EVENT,
  CART_COOKIE_KEY,
} from "@/shared/domain/constants";

const EMPTY_CART: CartCookieItem[] = [];

let lastRawCartCookie: string | null = null;
let lastCartSnapshot: CartCookieItem[] = EMPTY_CART;

/** Read and validate the cart cookie set by the store app. */
export function readCartFromCookie(): CartCookieItem[] {
  const raw = getCookie(CART_COOKIE_KEY);
  if (raw) {
    const serialized = String(raw);
    if (serialized === lastRawCartCookie) {
      return lastCartSnapshot;
    }

    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isCartCookieItems(parsed)) {
        lastRawCartCookie = serialized;
        lastCartSnapshot = EMPTY_CART;
        return EMPTY_CART;
      }

      lastRawCartCookie = serialized;
      lastCartSnapshot = parsed;
      return lastCartSnapshot;
    } catch {
      lastRawCartCookie = serialized;
      lastCartSnapshot = EMPTY_CART;
      return EMPTY_CART;
    }
  } else {
    lastRawCartCookie = null;
    lastCartSnapshot = EMPTY_CART;
    return EMPTY_CART;
  }
}

function notifyCartCookieChanged(): void {
  if (globalThis.window !== undefined) {
    globalThis.window.dispatchEvent(new Event(CART_COOKIE_CHANGED_EVENT));
  }
}

/** Subscribe to cookie changes via local events and page visibility/focus refreshes. */
export function subscribeToCartCookie(onStoreChange: () => void): () => void {
  if (globalThis.window === undefined) {
    return () => {};
  }

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      onStoreChange();
    }
  };

  globalThis.window.addEventListener(CART_COOKIE_CHANGED_EVENT, onStoreChange);
  globalThis.window.addEventListener("focus", onStoreChange);
  globalThis.document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    globalThis.window.removeEventListener(
      CART_COOKIE_CHANGED_EVENT,
      onStoreChange,
    );
    globalThis.window.removeEventListener("focus", onStoreChange);
    globalThis.document.removeEventListener(
      "visibilitychange",
      handleVisibility,
    );
  };
}

/** Clear the cart cookie by expiring it. Host-only: every app shares one origin. */
export function clearCartCookie(): void {
  deleteCookie(CART_COOKIE_KEY, { path: "/" });
  notifyCartCookieChanged();
}
