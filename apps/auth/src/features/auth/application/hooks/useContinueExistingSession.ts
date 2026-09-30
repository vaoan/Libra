"use client";

import { useAuth } from "@clerk/nextjs";
import {
  buildProfileLinkUrl,
  hasRecentProfileLinkAttempt,
  markProfileLinkAttempt,
} from "auth/client";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useRef } from "react";

import { appUrls } from "@/shared/infrastructure/config";

/**
 * A person who reaches the login page while already signed in to Clerk
 * cannot sign in again — Clerk rejects a second sign-in while a session is
 * active — so the buttons would leave them stuck. Send them through the
 * callback route instead, which links their profile and forwards them to
 * `returnTo`. Skipped when that was just tried, so a link that cannot be made
 * shows the callback's own error page once rather than looping.
 *
 * Only when `returnTo` is present: that is how every protected page sends
 * people here. A bare `/login` visit with a session keeps the page usable for
 * signing out and switching accounts, which the E2E session helper does on
 * this very page.
 */
export function useContinueExistingSession(): void {
  const { isLoaded, isSignedIn } = useAuth();
  const locale = useLocale();
  const returnTo = useSearchParams().get("returnTo");
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !returnTo || hasRedirectedRef.current) {
      return;
    }
    if (hasRecentProfileLinkAttempt()) return;

    hasRedirectedRef.current = true;
    markProfileLinkAttempt();
    globalThis.location.replace(
      buildProfileLinkUrl(appUrls.auth, locale, returnTo),
    );
  }, [isLoaded, isSignedIn, locale, returnTo]);
}
