/* eslint-disable i18next/no-literal-string */
// This route only ever renders rare, non-happy-path pages (a support-contact
// notice, an email-required notice, a generic failure notice) as raw HTML —
// not part of the app's translated UI, the same way Next's own framework
// error pages are not translated either.
// `apps/admin/src/app/api/admin/_shared/adminRest.ts` carries the same
// file-level disable for the same reason (technical, non-UI text).
import { currentUser } from "@clerk/nextjs/server";
import { createServiceRoleSupabaseClient } from "api/supabase/server";
import {
  createSupabaseProfileStore,
  resolveProfile,
  resolveSafeRedirectTarget,
  type ClerkIdentity,
  type ResolveResult,
} from "auth/server";
import { NextResponse, type NextRequest } from "next/server";

const HTTP_STATUS = {
  BAD_REQUEST: 400,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * Origins a post-sign-in redirect (`?next=`) may point to. Anything else
 * falls back to the locale's profile page — this is the same open-redirect
 * defense `packages/api/src/supabase/callback.ts` used for the old
 * Supabase OAuth flow.
 */
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.NEXT_PUBLIC_AUTH_URL,
  process.env.NEXT_PUBLIC_STORE_URL,
  process.env.NEXT_PUBLIC_ADMIN_URL,
  process.env.NEXT_PUBLIC_PAYMENTS_URL,
  process.env.NEXT_PUBLIC_STUDIO_URL,
  process.env.NEXT_PUBLIC_LANDING_URL,
].filter((value): value is string => value !== undefined);

/**
 * This app's own declared, trusted external URL (e.g.
 * `http://127.0.0.1:5050/auth` behind the Docker/CI nginx, `http://localhost:5000`
 * in local dev). Every absolute redirect below is built from this instead of
 * `new URL(request.url).origin`: behind nginx, Next.js's standalone server
 * constructs `request.url` from its own bind address (`HOSTNAME`/`PORT` in
 * `docker/prod/supervisord.conf` — `0.0.0.0:5000` for this app), not the
 * `Host`/`X-Forwarded-Host` header nginx actually forwards. A redirect built
 * from it lands on `http://0.0.0.0:5000/...` — Chromium refuses to navigate
 * to `0.0.0.0` at all (`net::ERR_ADDRESS_INVALID`), and even where it
 * doesn't, nothing external listens on the container's internal port
 * (`net::ERR_CONNECTION_REFUSED`) — which is what made
 * `apps/store/e2e/auth.setup.ts`'s post-sign-in navigation fail. It also
 * drops this app's `/auth` basePath, since an already-absolute URL bypasses
 * Next's automatic basePath prefixing. `NEXT_PUBLIC_AUTH_URL` carries both
 * the real external host and the basePath correctly in every environment.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;

type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

function toClerkIdentity(user: CurrentUser): ClerkIdentity {
  const primaryEmail = user.primaryEmailAddress;

  return {
    sub: user.id,
    email: primaryEmail?.emailAddress ?? null,
    emailVerified: primaryEmail?.verification?.status === "verified",
    displayName: user.fullName ?? user.username ?? null,
    avatarUrl: user.imageUrl ?? null,
  };
}

/**
 * A small, self-contained HTML page for the error states below. These are
 * security refusals and rare backend failures — not part of the app's normal
 * translated UI — so they are plain, un-internationalized text, the same way
 * Next's own framework error pages are not translated either.
 */
function htmlErrorResponse(status: number, title: string, message: string) {
  const body = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem;">
    <h1>${title}</h1>
    <p>${message}</p>
  </body>
</html>`;

  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function assertNever(value: never): never {
  throw new Error(`Unhandled resolveProfile status: ${JSON.stringify(value)}`);
}

/**
 * Runs after Clerk has already established the session (this is the
 * `redirectUrlComplete` target reached from `/{locale}/sso-callback`, see
 * `SocialLoginButtons`). Resolves the signed-in Clerk identity to a local
 * `user_profiles` row — matching, claiming a restored profile, or creating a
 * new one — before continuing to the original destination.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const { searchParams, origin: requestOrigin } = new URL(request.url);
  // See the AUTH_URL comment above: prefer this app's own declared URL over
  // the request's own (possibly internal, proxy-blind) origin.
  const authBase = AUTH_URL ?? requestOrigin;
  const siteOrigin = AUTH_URL ? new URL(AUTH_URL).origin : requestOrigin;

  const user = await currentUser();
  if (!user) {
    // No Clerk session — the flow was interrupted or hit directly. Send the
    // person back to sign in rather than guessing at an identity.
    return NextResponse.redirect(`${authBase}/${locale}/login`);
  }

  const store = createSupabaseProfileStore(createServiceRoleSupabaseClient());

  let result: ResolveResult;
  try {
    result = await resolveProfile(toClerkIdentity(user), store);
  } catch (error) {
    console.error("[auth/callback] resolveProfile failed:", error);
    return htmlErrorResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      "Something went wrong",
      "We couldn't finish signing you in. Please try again in a moment.",
    );
  }

  switch (result.status) {
    case "matched":
    case "claimed":
    case "created": {
      // The fallback (no explicit `?next=`, the ordinary case) must be a real
      // route: `/${locale}/profile` alone 404s — the app only has
      // `/${locale}/profile/[id]`. We now have the signed-in person's own
      // profile id, so send them there instead of guessing at a path that
      // doesn't exist.
      const destination = resolveSafeRedirectTarget({
        value: searchParams.get("next"),
        fallback: `${authBase}/${locale}/profile/${result.profile.id}`,
        requestOrigin: siteOrigin,
        allowedOrigins: ALLOWED_REDIRECT_ORIGINS,
      });
      return NextResponse.redirect(destination);
    }

    case "conflict": {
      // Someone else already claimed this email's profile. Refuse rather
      // than reassign it — log so support can investigate and manually
      // reconcile the two accounts.
      console.error(
        `[auth/callback] profile conflict: ${result.email} is already linked to another account`,
      );
      return htmlErrorResponse(
        HTTP_STATUS.CONFLICT,
        "Sign-in conflict",
        "This email address is already linked to another account. Please contact support for help.",
      );
    }

    case "email_required": {
      return htmlErrorResponse(
        HTTP_STATUS.BAD_REQUEST,
        "Email required",
        "Signing in requires an email address. Please use a provider that shares your email, or contact support.",
      );
    }

    default: {
      return assertNever(result);
    }
  }
}
