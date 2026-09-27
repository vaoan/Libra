"use client";

import { type ReactNode, useEffect, useRef } from "react";

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
 */
export function ProtectedRoute({
  children,
  authUrl,
  locale,
  fallback = null,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasProfileLookupError } =
    useCurrentUser();
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated || hasProfileLookupError) {
      hasRedirectedRef.current = false;
      return;
    }

    if (
      !isLoading &&
      !isAuthenticated &&
      !hasProfileLookupError &&
      !hasRedirectedRef.current
    ) {
      hasRedirectedRef.current = true;
      const returnTo = globalThis.location.href;
      globalThis.location.replace(
        `${authUrl}/${locale}/login?returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
  }, [isLoading, isAuthenticated, hasProfileLookupError, authUrl, locale]);

  if (isLoading) {
    return <>{fallback}</>;
  }

  if (hasProfileLookupError) {
    return <ProfileLookupErrorState />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
