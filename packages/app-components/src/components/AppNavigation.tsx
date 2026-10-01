"use client";

import { useLocale, useTranslations } from "next-intl";

import { tid } from "../utils/tid";

import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";

type AppId = "store" | "studio" | "landing" | "payments" | "admin" | "auth";

interface AppNavigationProps {
  currentApp: AppId;
  urls: Record<AppId, string>;
  locales: readonly string[];
  userEmail?: string | null;
  permissionState?: {
    grantedKeys: string[];
    isAuthenticated?: boolean;
  };
}

const APP_ORDER: { id: AppId; labelKey: string }[] = [
  { id: "landing", labelKey: "landing" },
  { id: "store", labelKey: "store" },
  { id: "studio", labelKey: "studio" },
  { id: "payments", labelKey: "payments" },
  { id: "admin", labelKey: "admin" },
  { id: "auth", labelKey: "auth" },
];

const ADMIN_PERMISSIONS = [
  "templates.read",
  "payment_settings.read",
  "audit.read",
  "user_permissions.read",
] as const;

const APP_ACCESS_RULES: Partial<
  Record<AppId, { required: readonly string[]; mode?: "all" | "any" }>
> = {
  studio: {
    required: ["products.create", "products.update", "products.delete"],
    mode: "any",
  },
  payments: {
    required: [
      "orders.create",
      "receipts.create",
      "orders.read",
      "seller_payment_methods.read",
      "orders.update",
      "receipts.read",
    ],
    mode: "any",
  },
  admin: {
    required: ADMIN_PERMISSIONS,
    mode: "any",
  },
};

function matchesPermissions(
  grantedKeys: string[],
  required: readonly string[],
  mode: "all" | "any" = "all",
): boolean {
  /* v8 ignore next -- all APP_ACCESS_RULES have non-empty required arrays */
  if (required.length === 0) return true;

  if (mode === "any") {
    return required.some((key) => grantedKeys.includes(key));
  }
  /* v8 ignore next -- all APP_ACCESS_RULES use mode:"any"; "all" mode is supported but currently unused */
  return required.every((key) => grantedKeys.includes(key));
}

export function AppNavigation({
  currentApp,
  urls,
  locales,
  userEmail,
  permissionState,
}: AppNavigationProps) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const { grantedKeys } = permissionState ?? { grantedKeys: [] };

  /** Append current locale to cross-app URL so the target app opens in the same language */
  function localizedHref(baseUrl: string): string {
    return `${baseUrl.replace(/\/$/, "")}/${locale}`;
  }

  const visibleApps = APP_ORDER.filter(({ id }) => {
    const rule = APP_ACCESS_RULES[id];
    if (!rule) return true;

    /* v8 ignore next -- all APP_ACCESS_RULES define mode explicitly; "all" default is unreachable */
    const resolvedMode = rule.mode ?? "all";
    return matchesPermissions(grantedKeys, rule.required, resolvedMode);
  });

  return (
    <nav
      {...tid("app-navigation")}
      className="sticky top-0 z-50 isolate flex w-full transform-gpu flex-wrap items-center gap-2 border-b-strong border-foreground bg-background px-3 py-2 backface-hidden contain-[paint] will-change-transform sm:flex-nowrap sm:gap-1 sm:px-4"
    >
      <span className="shrink-0 font-display text-sm font-extrabold tracking-tight sm:mr-4">
        {t("brand")}
      </span>
      <div className="order-3 w-full min-w-0 overflow-hidden sm:order-0 sm:w-auto sm:min-w-fit sm:overflow-visible">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible sm:pb-0">
          {visibleApps.map(({ id, labelKey }) => {
            const isActive = id === currentApp;
            const href = localizedHref(urls[id]);
            const className = [
              "shrink-0 px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
              isActive
                ? "border-2 border-foreground bg-primary text-primary-foreground"
                : "text-foreground/60 hover:text-foreground",
            ].join(" ");

            return (
              <a
                key={id}
                {...tid(`nav-link-${id}`)}
                href={href}
                className={className}
                aria-current={isActive ? "page" : undefined}
              >
                {t(labelKey)}
              </a>
            );
          })}
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {userEmail ? (
          <span
            className="hidden max-w-48 truncate text-xs font-medium text-foreground/70 sm:inline"
            {...tid("nav-user-email")}
          >
            {userEmail}
          </span>
        ) : null}
        <LocaleSwitcher locales={locales} />
        <ThemeToggle />
      </div>
      {userEmail ? (
        <div className="order-4 w-full sm:hidden">
          <span
            className="block max-w-full truncate text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/60"
            {...tid("nav-user-email-mobile")}
          >
            {userEmail}
          </span>
        </div>
      ) : null}
    </nav>
  );
}

export type { AppId, AppNavigationProps };
