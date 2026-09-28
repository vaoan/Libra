import { AppFooter } from "@monorepo/app-components";
import { getServerUserEmail } from "api/supabase/server";
import { PermissionsProvider } from "auth/client";
import { readPermCacheServer } from "auth/server";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { Providers } from "@/app/[locale]/providers";
import { appHref, appUrls } from "@/shared/infrastructure/config";
import { routing } from "@/shared/infrastructure/i18n";
import { ThemeProvider } from "@/shared/infrastructure/providers";
import { AppTopNavigation } from "@/shared/presentation/components/AppTopNavigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const messages = await getMessages();
  const tFooter = await getTranslations({ locale, namespace: "footer" });
  const termsHref = appHref(appUrls.landing, `/${locale}/legal/terms`);
  const privacyHref = appHref(appUrls.landing, `/${locale}/legal/privacy`);

  const [userEmail, initialGrantedKeys] = await Promise.all([
    getServerUserEmail(),
    readPermCacheServer(),
  ]);

  return (
    <ThemeProvider>
      <NextIntlClientProvider messages={messages}>
        <PermissionsProvider initialGrantedKeys={initialGrantedKeys}>
          <Providers>
            <div className="flex min-h-screen flex-col">
              <AppTopNavigation
                currentApp="auth"
                urls={appUrls}
                locales={routing.locales}
                userEmail={userEmail}
              />
              <div className="flex flex-1">{children}</div>
              <AppFooter
                copyrightSuffix={tFooter("copyrightSuffix")}
                termsLabel={tFooter("terms")}
                privacyLabel={tFooter("privacy")}
                termsHref={termsHref}
                privacyHref={privacyHref}
              />
            </div>
          </Providers>
        </PermissionsProvider>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
