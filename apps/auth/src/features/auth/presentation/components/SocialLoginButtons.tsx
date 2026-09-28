"use client";

// `@clerk/nextjs`'s *default* `useSignIn()` (re-exported straight from
// `@clerk/react`) now returns the new "signals" API — `{ errors, fetchStatus,
// signIn }` where `signIn` is a `SignInFutureResource` with no
// `authenticateWithRedirect` method at all (only `.sso()`, a different shape).
// `@clerk/nextjs/legacy` re-exports the classic hook instead — `{ isLoaded,
// signIn, setActive }` where `signIn: SignInResource` still has
// `authenticateWithRedirect()` — which is what this redirect-based custom
// OAuth flow needs. Verified by reading
// node_modules/@clerk/react/dist/{index,legacy}.d.mts.
import { useSignIn } from "@clerk/nextjs/legacy";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { tid } from "shared";
import { cn } from "ui";

import { DiscordIcon } from "./DiscordIcon";
import { GoogleIcon } from "./GoogleIcon";

import { appUrls } from "@/shared/infrastructure/config";

type Provider = "google" | "discord";

interface ProviderConfig {
  id: Provider;
  labelKey: string;
  strategy: `oauth_${Provider}`;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "google",
    labelKey: "google",
    strategy: "oauth_google",
    icon: <GoogleIcon />,
  },
  {
    id: "discord",
    labelKey: "discord",
    strategy: "oauth_discord",
    icon: <DiscordIcon />,
  },
];

export function SocialLoginButtons() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);

  // No default guess here: the callback route knows the signed-in person's
  // real profile id and picks a real destination itself (see
  // apps/auth/src/app/[locale]/callback/route.ts) when `next` is absent.
  // A hardcoded `/${locale}/profile` guess here 404s — that route requires
  // an id (`/${locale}/profile/[id]`), which doesn't exist until sign-in
  // resolves.
  const returnTo = searchParams.get("returnTo");

  const handleSignIn = async (strategy: `oauth_${Provider}`) => {
    if (!isLoaded || !signIn) return;

    setError(null);

    try {
      // Clerk resolves these against the page ORIGIN, not against Next's
      // basePath, and this app lives under `/auth` on the shared origin. A
      // bare `/${locale}/sso-callback` therefore lands on the landing app
      // (404) — the first production login on 2026-09-28 did exactly that.
      // `appUrls.auth` (NEXT_PUBLIC_AUTH_URL, or the registry path `/auth`)
      // carries the base path in every environment.
      const callbackUrl = returnTo
        ? `${appUrls.auth}/${locale}/callback?next=${encodeURIComponent(returnTo)}`
        : `${appUrls.auth}/${locale}/callback`;
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: `${appUrls.auth}/${locale}/sso-callback`,
        redirectUrlComplete: callbackUrl,
      });
    } catch (error_) {
      // authenticateWithRedirect only rejects when the request never made it
      // to the provider (misconfigured strategy, network failure, popup
      // blocked) — a working redirect navigates the browser away and this
      // code never runs. Silently swallowing this left the button looking
      // inert with no signal anywhere, on the one path a locked-out
      // customer needs to work. Log it and tell the person.
      console.error(`[SocialLoginButtons] ${strategy} sign-in failed:`, error_);
      setError(t("signInError"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {PROVIDERS.map(({ id, labelKey, strategy, icon }) => (
        <button
          key={id}
          type="button"
          className={cn(
            "button-brutal button-press-sm shadow-brutal-sm w-full justify-center gap-3 px-6 py-4 text-sm",
            id === "google" &&
              "border-strong border-border bg-background text-foreground hover:bg-muted",
            id === "discord" && "bg-info text-info-foreground hover:bg-info/90",
          )}
          onClick={() => handleSignIn(strategy)}
          {...tid(`login-${id}`)}
        >
          {icon}
          {t(labelKey)}
        </button>
      ))}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
          {...tid("login-error")}
        >
          {error}
        </p>
      )}
    </div>
  );
}
