import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseAuth = vi.fn();
const returnToParamMock = vi.fn((): string | null => null);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "returnTo" ? returnToParamMock() : null),
  }),
}));

vi.mock("@/shared/infrastructure/config", () => ({
  appUrls: { auth: "https://store.example.com/auth" },
}));

vi.mock("@/features/auth/presentation/components/SocialLoginButtons", () => ({
  SocialLoginButtons: () => <div data-testid="social-buttons">Buttons</div>,
}));

import {
  clearProfileLinkAttempt,
  hasRecentProfileLinkAttempt,
  markProfileLinkAttempt,
} from "auth/client";

import { LoginPage } from "@/features/auth/presentation/pages/LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileLinkAttempt();
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    // @ts-expect-error -- jsdom's location.replace is not implemented; stub it per test
    delete globalThis.location;
    globalThis.location = { replace: vi.fn() } as unknown as Location;
  });

  it("renders login card", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("login-card")).toBeInTheDocument();
  });

  it("renders social login buttons", () => {
    render(<LoginPage />);
    expect(screen.getByTestId("social-buttons")).toBeInTheDocument();
  });

  it("stays on the page when there is no session", async () => {
    render(<LoginPage />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it("continues an existing session through the callback instead of offering sign-in again", async () => {
    // Clicking a provider with a session already active fails in Clerk, so a
    // person sent here with a session would be stuck. The callback links
    // their profile and forwards them to returnTo.
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    returnToParamMock.mockReturnValue("https://store.example.com/store/en");

    render(<LoginPage />);

    await waitFor(() => {
      expect(globalThis.location.replace).toHaveBeenCalledWith(
        `https://store.example.com/auth/en/callback?next=${encodeURIComponent("https://store.example.com/store/en")}`,
      );
    });
    expect(hasRecentProfileLinkAttempt()).toBe(true);
  });

  it("stays on the page for a session with no returnTo, so accounts can still be switched here", async () => {
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });

    render(<LoginPage />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it("does not redirect again when linking was just attempted", async () => {
    markProfileLinkAttempt();
    mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    returnToParamMock.mockReturnValue("https://store.example.com/store/en");

    render(<LoginPage />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });
});
