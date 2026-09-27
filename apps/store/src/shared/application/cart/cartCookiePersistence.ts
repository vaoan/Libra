import { deleteCookie, setCookie } from "cookies-next";
import { CART_COOKIE_KEY } from "shared/constants/cart";
import {
  HOURS_PER_DAY,
  MINUTES_PER_HOUR,
  SECONDS_PER_MINUTE,
} from "shared/constants/time";
import type { CartCookieItem } from "shared/types";

import type { CartItem } from "@/shared/domain/cart";

const DAYS = 30;
/** Cookie lives for 30 days */
export const COOKIE_MAX_AGE_S =
  DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE;

/**
 * Host-only cookie options. Every app shares one origin, so the cookie needs
 * no `domain` attribute — and must not have one, or it would be readable by
 * unrelated sites on sibling subdomains.
 */
export function getCartCookieOptions() {
  const isSecure =
    globalThis.window !== undefined &&
    globalThis.location.protocol === "https:";

  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecure,
  };
}

export function persistCartCookie(items: CartItem[]) {
  const cookieItems: CartCookieItem[] = items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
  }));

  setCookie(CART_COOKIE_KEY, JSON.stringify(cookieItems), {
    ...getCartCookieOptions(),
    maxAge: COOKIE_MAX_AGE_S,
  });
}

export function removeCartCookie() {
  deleteCookie(CART_COOKIE_KEY, getCartCookieOptions());
}
export { CART_COOKIE_KEY as COOKIE_KEY } from "shared/constants/cart";
