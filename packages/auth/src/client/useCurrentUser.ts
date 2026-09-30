"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import {
  createBrowserSupabaseClient,
  getCurrentUserIdResult,
} from "api/supabase";
import { useEffect, useMemo, useState } from "react";

export interface CurrentUser {
  /**
   * The signed-in person's local `user_profiles.id` — NOT the Clerk
   * subject. Every foreign key that used to reference `auth.users.id`
   * (orders, products, seller_admins, user_permissions, ...) now references
   * `user_profiles.id` instead (see
   * supabase/migrations/20260829120000_repoint_user_fks.sql), so this is
   * the id every call site that used to read `useSupabaseAuth().user.id`
   * needs.
   */
  id: string;
  email: string | null;
}

interface UseCurrentUserReturn {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * True when Clerk reports a signed-in session but the `current_user_id()`
   * profile lookup could not be completed after retrying — a transient
   * failure, NOT the same thing as "signed out". `profileId === null` after
   * a *successful* lookup means "no linked profile"; this flag means "we
   * don't actually know yet." Consumers (e.g. `ProtectedRoute`) must not
   * treat this the same as signed-out — redirecting a person who is
   * genuinely signed in to `/login` because one network call was flaky logs
   * them out of every protected page for no reason. Show an error/retry
   * state instead.
   */
  hasProfileLookupError: boolean;
  /**
   * True when Clerk reports a signed-in session and the lookup *succeeded*
   * but no profile is linked to that identity. The person is signed in; the
   * link was never made (see `buildProfileLinkUrl`). Consumers send them
   * through the auth callback to link it — not to `/login`, which can only
   * offer the sign-in they already completed.
   */
  needsProfileLink: boolean;
  signOut: () => Promise<void>;
}

/** One retry, one short fixed delay — not an elaborate backoff. */
const MAX_PROFILE_LOOKUP_ATTEMPTS = 2;
const PROFILE_LOOKUP_RETRY_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces `useSupabaseAuth()` now that Supabase Auth's session is gone.
 *
 * `useSupabaseAuth()` (and the `useAuth()` it wrapped) read
 * `supabaseClient.auth.getSession()`/`getUser()` — under Third-Party Auth
 * there is no such session to read, so both hooks always reported
 * signed-out. Clerk (`useUser()`) is now the source of sign-in state, but
 * its `user.id` is the Clerk subject, not a row in any of this app's
 * tables — every former consumer of `useSupabaseAuth().user.id` needs the
 * local profile id instead, resolved the same way the server-side call
 * sites do: the `current_user_id()` RPC (see `getCurrentUserIdResult`).
 *
 * A signed-in Clerk session resolves to one of three outcomes, and consumers
 * must keep them apart: a profile id (`isAuthenticated`), a lookup that
 * failed (`hasProfileLookupError`), or a lookup that succeeded and found no
 * linked profile (`needsProfileLink`). The last is a person whose sign-in
 * never reached the auth callback that links profiles — they are signed in,
 * and must be sent to link, not to log in again.
 */
export function useCurrentUser(): UseCurrentUserReturn {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [hasProfileLookupError, setHasProfileLookupError] = useState(false);
  const [isResolvingProfile, setIsResolvingProfile] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setProfileId(null);
      setHasProfileLookupError(false);
      setIsResolvingProfile(false);
      return;
    }

    let isActive = true;
    setIsResolvingProfile(true);
    setHasProfileLookupError(false);

    async function resolveProfileId() {
      let result = await getCurrentUserIdResult(supabase);

      for (
        let attempt = 2;
        result.error && attempt <= MAX_PROFILE_LOOKUP_ATTEMPTS;
        attempt++
      ) {
        await delay(PROFILE_LOOKUP_RETRY_DELAY_MS);
        if (!isActive) return;
        result = await getCurrentUserIdResult(supabase);
      }

      if (!isActive) return;

      if (result.error) {
        setHasProfileLookupError(true);
        setProfileId(null);
      } else {
        setProfileId(result.id);
      }
      setIsResolvingProfile(false);
    }

    void resolveProfileId();

    return () => {
      isActive = false;
    };
    // clerkUser?.id (not the whole clerkUser object) so this only re-runs
    // when the signed-in identity actually changes.
  }, [isLoaded, isSignedIn, clerkUser?.id, supabase]);

  const isLoading = !isLoaded || (isSignedIn && isResolvingProfile);
  const user: CurrentUser | null =
    isSignedIn && profileId
      ? {
          id: profileId,
          email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
        }
      : null;

  return {
    user,
    isAuthenticated: user !== null,
    isLoading,
    hasProfileLookupError: Boolean(isSignedIn) && hasProfileLookupError,
    needsProfileLink:
      Boolean(isSignedIn) &&
      !isLoading &&
      !hasProfileLookupError &&
      profileId === null,
    signOut: () => clerkSignOut(),
  };
}
