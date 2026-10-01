import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `t:${key}`,
  useLocale: () => "en",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type PermissionState = {
  grantedKeys: string[];
  isAuthenticated?: boolean;
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("cookies-next", () => ({
  setCookie: vi.fn(),
}));

vi.mock("shared", () => ({
  useThemeContext: () => ({
    effectiveTheme: "light",
    toggleTheme: vi.fn(),
    mounted: true,
  }),
  tid: (id: string) => ({ "data-testid": id }),
  TID_ATTR: "data-testid",
}));

import {
  AppNavigation,
  type AppId,
} from "@app-components/components/AppNavigation";

const defaultUrls: Record<AppId, string> = {
  store: "/store",
  studio: "/studio",
  landing: "/landing",
  payments: "/payments",
  admin: "/admin",
  auth: "/auth",
};

const defaultLocales = ["en", "es"] as const;

describe("AppNavigation", () => {
  const defaultPermissionState: PermissionState = {
    grantedKeys: [],
    isAuthenticated: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={defaultPermissionState}
      />,
    );
    const nav = screen.getByTestId("app-navigation");
    expect(nav).toBeInTheDocument();
  });

  it("renders the brand name", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={defaultPermissionState}
      />,
    );
    expect(screen.getByText("t:brand")).toBeInTheDocument();
  });

  it("shows public app links and hides protected apps when grantedKeys is empty", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={defaultPermissionState}
      />,
    );
    expect(screen.getByTestId("nav-link-store")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-landing")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-auth")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-admin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-studio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-payments")).not.toBeInTheDocument();
  });

  it("renders base app links for authenticated users without elevated permissions", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{
          grantedKeys: [],
          isAuthenticated: true,
        }}
      />,
    );

    expect(screen.getByTestId("nav-link-store")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-landing")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-auth")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-admin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-studio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-payments")).not.toBeInTheDocument();
  });

  it("renders protected app links when the user has module access", () => {
    const permissionState: PermissionState = {
      grantedKeys: ["products.create", "orders.read", "user_permissions.read"],
      isAuthenticated: true,
    };

    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={permissionState}
      />,
    );

    expect(screen.getByTestId("nav-link-studio")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-payments")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-admin")).toBeInTheDocument();
  });

  it("marks the current app link with aria-current=page", () => {
    render(
      <AppNavigation
        currentApp="admin"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{
          grantedKeys: ["user_permissions.read"],
          isAuthenticated: true,
        }}
      />,
    );
    expect(screen.getByTestId("nav-link-admin")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("nav-link-store")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("appends locale to relative URLs", () => {
    const permissionState: PermissionState = {
      grantedKeys: ["products.read"],
      isAuthenticated: true,
    };

    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={permissionState}
      />,
    );
    expect(screen.getByTestId("nav-link-store")).toHaveAttribute(
      "href",
      "/store/en",
    );
  });

  it("appends locale to absolute URLs", () => {
    const urls = { ...defaultUrls, store: "http://localhost:5001" };
    render(
      <AppNavigation
        currentApp="admin"
        urls={urls}
        locales={defaultLocales}
        permissionState={{
          grantedKeys: ["user_permissions.read"],
          isAuthenticated: true,
        }}
      />,
    );
    expect(screen.getByTestId("nav-link-store")).toHaveAttribute(
      "href",
      "http://localhost:5001/en",
    );
  });

  it("displays user email when provided", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        userEmail="user@example.com"
        permissionState={defaultPermissionState}
      />,
    );
    expect(screen.getByTestId("nav-user-email")).toHaveTextContent(
      "user@example.com",
    );
  });

  it("does not display user email when not provided", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={defaultPermissionState}
      />,
    );
    expect(screen.queryByTestId("nav-user-email")).not.toBeInTheDocument();
  });

  it("shows gated apps immediately when grantedKeys contains the required permission", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{ grantedKeys: ["products.create"] }}
      />,
    );
    expect(screen.getByTestId("nav-link-studio")).toBeInTheDocument();
  });

  it("hides gated apps when grantedKeys is empty regardless of authentication", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{ grantedKeys: [], isAuthenticated: true }}
      />,
    );
    expect(screen.queryByTestId("nav-link-studio")).not.toBeInTheDocument();
  });

  it("renders public apps when permissionState prop is omitted", () => {
    render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        // intentionally omitting permissionState to exercise the ?? fallback
      />,
    );
    expect(screen.getByTestId("nav-link-store")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-landing")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-studio")).not.toBeInTheDocument();
  });

  it("clears protected links when grantedKeys is cleared but keeps public links", () => {
    const { rerender } = render(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{
          grantedKeys: ["products.create"],
          isAuthenticated: true,
        }}
      />,
    );

    expect(screen.getByTestId("nav-link-store")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-studio")).toBeInTheDocument();

    rerender(
      <AppNavigation
        currentApp="store"
        urls={defaultUrls}
        locales={defaultLocales}
        permissionState={{
          grantedKeys: [],
          isAuthenticated: false,
        }}
      />,
    );

    expect(screen.getByTestId("nav-link-store")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-landing")).toBeInTheDocument();
    expect(screen.getByTestId("nav-link-auth")).toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-studio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-admin")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-link-payments")).not.toBeInTheDocument();
  });
});
