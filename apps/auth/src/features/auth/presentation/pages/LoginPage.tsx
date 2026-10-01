"use client";

import { useTranslations } from "next-intl";
import { tid } from "shared";

import { useContinueExistingSession } from "@/features/auth/application/hooks/useContinueExistingSession";
import { SocialLoginButtons } from "@/features/auth/presentation/components/SocialLoginButtons";

export function LoginPage() {
  const t = useTranslations("auth.login");
  useContinueExistingSession();

  return (
    <main className="flex flex-1 items-center justify-center surface-grid-dots p-4">
      <div
        className="shadow-brutal-lg w-full max-w-md border-strong border-foreground bg-background p-8 sm:p-10"
        {...tid("login-card")}
      >
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <SocialLoginButtons />
      </div>
    </main>
  );
}
