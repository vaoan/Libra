import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateWithRedirect = vi.fn();

type MockUseSignInReturn =
  | { isLoaded: false; signIn: undefined }
  | {
      isLoaded: true;
      signIn: { authenticateWithRedirect: typeof authenticateWithRedirect };
    };

const useSignInMock = vi.fn(
  (): MockUseSignInReturn => ({
    isLoaded: true,
    signIn: { authenticateWithRedirect },
  }),
);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("shared", () => ({
  tid: (id: string) => ({ "data-testid": id }),
}));

// The auth app lives under a base path on the shared origin; Clerk resolves
// the redirect URLs it is given against the origin, so they must carry the
// app's own URL (NEXT_PUBLIC_AUTH_URL), never a bare `/${locale}/...`.
vi.mock("@/shared/infrastructure/config", () => ({
  appUrls: { auth: "https://store.example.com/auth" },
}));

const returnToParamMock = vi.fn((): string | null => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "returnTo" ? returnToParamMock() : null),
  }),
}));

vi.mock("@clerk/nextjs/legacy", () => ({
  useSignIn: () => useSignInMock(),
}));

import { SocialLoginButtons } from "@/features/auth/presentation/components/SocialLoginButtons";

describe("SocialLoginButtons", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the available provider buttons", () => {
    render(<SocialLoginButtons />);
    expect(screen.getByTestId("login-google")).toBeInTheDocument();
    expect(screen.getByTestId("login-discord")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("starts a Google sign-in through Clerk", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons />);

    await user.click(screen.getByTestId("login-google"));

    expect(authenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "oauth_google" }),
    );
  });

  it("starts a Discord sign-in through Clerk", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons />);

    await user.click(screen.getByTestId("login-discord"));

    expect(authenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "oauth_discord" }),
    );
  });

  it("points the OAuth flow at the sso-callback page and the final callback route, with no guessed `next` when returnTo is absent", async () => {
    const user = userEvent.setup();
    render(<SocialLoginButtons />);

    await user.click(screen.getByTestId("login-google"));

    // No `next` param here: "/en/profile" alone 404s (the real route is
    // "/en/profile/[id]"), and this component has no id to guess with. The
    // callback route picks the person's real profile once it knows who
    // signed in — see callback/route.test.ts.
    expect(authenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: "https://store.example.com/auth/en/sso-callback",
        redirectUrlComplete: "https://store.example.com/auth/en/callback",
      }),
    );
  });

  it("passes an explicit returnTo through as `next` unchanged", async () => {
    returnToParamMock.mockReturnValueOnce("/en/checkout");

    const user = userEvent.setup();
    render(<SocialLoginButtons />);

    await user.click(screen.getByTestId("login-google"));

    expect(authenticateWithRedirect).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrlComplete: `https://store.example.com/auth/en/callback?next=${encodeURIComponent("/en/checkout")}`,
      }),
    );
  });

  it("logs and shows a visible error when authenticateWithRedirect rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    authenticateWithRedirect.mockRejectedValueOnce(
      new Error("provider misconfigured"),
    );

    const user = userEvent.setup();
    render(<SocialLoginButtons />);
    await user.click(screen.getByTestId("login-google"));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("oauth_google"),
      expect.any(Error),
    );
    expect(await screen.findByTestId("login-error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    errorSpy.mockRestore();
  });

  it("does nothing when Clerk has not finished loading yet", async () => {
    useSignInMock.mockReturnValueOnce({
      isLoaded: false,
      signIn: undefined,
    });

    const user = userEvent.setup();
    render(<SocialLoginButtons />);
    await user.click(screen.getByTestId("login-google"));

    expect(authenticateWithRedirect).not.toHaveBeenCalled();
  });
});
