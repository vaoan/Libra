/* eslint-disable @next/next/no-head-element */
"use server";

import localFont from "next/font/local";
import type { ReactNode } from "react";

import { ThemeScript } from "./ThemeScript";

// Vendored (OFL) variable fonts under ../fonts. The Google-hosted font loader
// fetched these at build time, and that fetch failed repeatedly in Docker and
// on GitHub's runners on 2026-09-27, blocking the production image. A build
// must need no network. scripts/__tests__/no-google-fonts.test.mjs guards
// against reintroducing the network loader.
const syne = localFont({
  src: "../fonts/syne-latin-wght.woff2",
  variable: "--font-syne",
  weight: "400 800",
  display: "swap",
});

const dmSans = localFont({
  src: "../fonts/dm-sans-latin-wght.woff2",
  variable: "--font-dm-sans",
  weight: "400 700",
  display: "swap",
});

interface AppRootLayoutProps {
  children: ReactNode;
  locale: string;
}

export async function AppRootLayout({ children, locale }: AppRootLayoutProps) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${syne.variable} ${dmSans.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
