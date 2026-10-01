"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  buildProfileLinkUrl,
  clearProfileLinkAttempt,
  hasRecentProfileLinkAttempt,
  markProfileLinkAttempt,
} from "./profileLink";
import { ProfileLookupErrorState } from "./ProfileLookupErrorState";
import { useCurrentUser } from "./useCurrentUser";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Full URL to the auth app (e.g. "http://localhost:5050/auth") */
  authUrl: string;
  /** Current locale for the redirect URL */
  locale: string;
  /** Content to show while checking auth. Defaults to empty. */
  fallback?: ReactNode;
}

/**
 * Wraps content that requires authentication.
 *
 * Redirects to the auth app's login page if the user is not signed in.
 * Shows a fallback while checking auth state to prevent flash of content.
 *
 * Used to check `useAuth({ supabaseClient })` — a Supabase Auth session that
 * no longer exists under Third-Party Auth, so this component redirected
 * every signed-in visitor straight back to login on every app that wraps
 * pages in `<ProtectedRoute>` (store, admin, payments, studio). Replaced
 * with `useCurrentUser()`, which resolves sign-in state from Clerk.
 *
 * `hasProfileLookupError` is a third, distinct terminal state from
 * "loading" and "signed out": Clerk confirms a session exists, but the
 * `current_user_id()` profile lookup could not be completed (a transient
 * failure, already retried once inside `useCurrentUser`). That is NOT the
 * same fact as "not authenticated" — treating it as such would redirect a
 * genuinely signed-in customer to `/login` over one flaky network call,
 * logging them out of every protected page with no way back. This state
 * renders neither the protected content nor a blank fallback (which would
 * strand the person with no explanation and no way forward) — it shows an
 * error/retry surface instead, and never triggers the login redirect.
 *
 * `needsProfileLink` is the fourth: Clerk has a session and the lookup
 * succeeded, but no profile is linked to it. Login cannot help — it offers
 * the sign-in the person already completed — so they go through the auth
 * callback, which links the profile and sends them back here. If that was
 * already tried in the last minute and the link is still missing, redirecting
 * again would loop, so the error state is shown instead.
 */
export function ProtectedRoute({
  children,
  authUrl,
  locale,
  fallback = null,
}: ProtectedRouteProps) {
  const {
    isAuthenticated,
    isLoading,
    hasProfileLookupError,
    needsProfileLink,
  } = useCurrentUser();
  const hasRedirectedRef = useRef(false);
  // Read once on mount, before this instance marks an attempt of its own.
  const [hadRecentLinkAttempt] = useState(hasRecentProfileLinkAttempt);
  const isProfileLinkStuck = needsProfileLink && hadRecentLinkAttempt;

  useEffect(() => {
    if (isAuthenticated || hasProfileLookupError) {
      hasRedirectedRef.current = false;
      if (isAuthenticated) clearProfileLinkAttempt();
      return;
    }

    if (isLoading || isProfileLinkStuck || hasRedirectedRef.current) {
      return;
    }

    hasRedirectedRef.current = true;
    const returnTo = globalThis.location.href;

    if (needsProfileLink) {
      markProfileLinkAttempt();
      globalThis.location.replace(
        buildProfileLinkUrl(authUrl, locale, returnTo),
      );
      return;
    }

    globalThis.location.replace(
      `${authUrl}/${locale}/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [
    isLoading,
    isAuthenticated,
    hasProfileLookupError,
    needsProfileLink,
    isProfileLinkStuck,
    authUrl,
    locale,
  ]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (hasProfileLookupError || isProfileLinkStuck) {
    return <ProfileLookupErrorState />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
