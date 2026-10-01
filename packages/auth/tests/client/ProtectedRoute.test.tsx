import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseCurrentUser = vi.fn();
vi.mock("@auth/client/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

import {
  clearProfileLinkAttempt,
  hasRecentProfileLinkAttempt,
  markProfileLinkAttempt,
} from "@auth/client/profileLink";
import { ProtectedRoute } from "@auth/client/ProtectedRoute";

const AUTH_URL = "http://localhost:5000";
const LOCALE = "en";

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProfileLinkAttempt();
    // @ts-expect-error -- jsdom's location.replace is not implemented; stub it per test
    delete globalThis.location;
    globalThis.location = {
      href: "http://localhost:3000/en/dashboard",
      replace: vi.fn(),
    } as unknown as Location;
  });

  it("shows the fallback while auth state is loading", () => {
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const { container } = render(
      <ProtectedRoute
        authUrl={AUTH_URL}
        locale={LOCALE}
        fallback={<p>Loading</p>}
      >
        <p>Secret</p>
      </ProtectedRoute>,
    );

    expect(container.textContent).toBe("Loading");
    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it("renders children when there is a signed-in Clerk session", async () => {
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const { findByText } = render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    expect(await findByText("Secret")).not.toBeNull();
    expect(globalThis.location.replace).not.toHaveBeenCalled();
  });

  it("redirects to the auth app's login page when signed out", async () => {
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(globalThis.location.replace).toHaveBeenCalledWith(
        `${AUTH_URL}/${LOCALE}/login?returnTo=${encodeURIComponent(
          globalThis.location.href,
        )}`,
      );
    });
  });

  it("renders nothing while signed out and not loading", () => {
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const { container } = render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    expect(container.textContent).toBe("");
  });

  it("does not render children and does not redirect when the profile lookup errors", async () => {
    // Clerk confirms a session exists (isAuthenticated stays false only
    // because the local profile id couldn't be resolved), but the
    // current_user_id() lookup failed even after useCurrentUser's own
    // retry. This is NOT "signed out" and must not be treated as such.
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      hasProfileLookupError: true,
    });

    const { container, queryByText } = render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    // Give any redirect effect a chance to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(queryByText("Secret")).toBeNull();
    expect(globalThis.location.replace).not.toHaveBeenCalled();
    // A blank fallback would strand the person with no explanation and no
    // way forward - this must render something, not silently render nothing
    // the way the signed-out state above does.
    expect(container.textContent).not.toBe("");
  });

  it("sends a signed-in person with no linked profile to the callback, not to login", async () => {
    // Clerk has a session, the lookup succeeded, but no profile is linked.
    // Login would only show the sign-in buttons again; the callback route
    // claims or creates the profile and returns here.
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      needsProfileLink: true,
    });

    render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(globalThis.location.replace).toHaveBeenCalledWith(
        `${AUTH_URL}/${LOCALE}/callback?next=${encodeURIComponent(
          globalThis.location.href,
        )}`,
      );
    });
    expect(hasRecentProfileLinkAttempt()).toBe(true);
  });

  it("shows the error state instead of looping when linking was just attempted", async () => {
    markProfileLinkAttempt();
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      needsProfileLink: true,
    });

    const { container, queryByText } = render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(queryByText("Secret")).toBeNull();
    expect(globalThis.location.replace).not.toHaveBeenCalled();
    expect(container.textContent).not.toBe("");
  });

  it("clears the link attempt once the person is authenticated", async () => {
    markProfileLinkAttempt();
    mockUseCurrentUser.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <ProtectedRoute authUrl={AUTH_URL} locale={LOCALE}>
        <p>Secret</p>
      </ProtectedRoute>,
    );

    await waitFor(() => expect(hasRecentProfileLinkAttempt()).toBe(false));
  });
});
