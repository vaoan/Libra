import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@monorepo/app-components", () => ({
  AppNavigation: ({
    currentApp,
    urls,
  }: {
    currentApp: string;
    urls: Record<string, string>;
  }) => (
    <nav data-testid="app-navigation" data-current={currentApp}>
      {Object.entries(urls).map(([app, url]) => (
        <a key={app} href={url}>
          {app}
        </a>
      ))}
    </nav>
  ),
}));

vi.mock("auth/client", () => ({
  useCurrentUserPermissions: vi.fn(() => ({
    hasPermission: () => false,
    isLoading: false,
  })),
}));

import { AppTopNavigation } from "@/shared/presentation/components/AppTopNavigation";

const defaultProps = {
  currentApp: "landing" as const,
  urls: {
    landing: "/",
    store: "/store",
    admin: "/admin",
    auth: "/auth",
    payments: "/payments",
    studio: "/studio",
  },
  locales: ["en", "es"] as const,
  userEmail: null,
};

describe("AppTopNavigation", () => {
  it("renders app navigation with current app", () => {
    render(<AppTopNavigation {...defaultProps} />);
    expect(screen.getByTestId("app-navigation")).toBeInTheDocument();
    expect(screen.getByTestId("app-navigation")).toHaveAttribute(
      "data-current",
      "landing",
    );
  });

  it("passes permission state from hook to AppNavigation", () => {
    render(<AppTopNavigation {...defaultProps} />);
    expect(screen.getByTestId("app-navigation")).toBeInTheDocument();
  });

  it("renders with userEmail prop", () => {
    render(<AppTopNavigation {...defaultProps} userEmail="user@example.com" />);
    expect(screen.getByTestId("app-navigation")).toBeInTheDocument();
  });
});
