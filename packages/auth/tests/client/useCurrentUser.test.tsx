import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseUser = vi.fn();
const mockGetCurrentUserIdResult = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useUser: () => mockUseUser(),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("api/supabase", () => ({
  createBrowserSupabaseClient: vi.fn(() => ({})),
  getCurrentUserIdResult: (...args: unknown[]) =>
    mockGetCurrentUserIdResult(...args),
}));

import { useCurrentUser } from "@auth/client/useCurrentUser";

const SIGNED_IN = {
  isLoaded: true,
  isSignedIn: true,
  user: {
    id: "user_clerk",
    primaryEmailAddress: { emailAddress: "buyer@example.com" },
  },
};

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is authenticated once the profile id resolves", async () => {
    mockUseUser.mockReturnValue(SIGNED_IN);
    mockGetCurrentUserIdResult.mockResolvedValue({
      id: "profile-1",
      error: false,
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.needsProfileLink).toBe(false);
  });

  it("needs a profile link when Clerk has a session but no profile is linked to it", async () => {
    // A returning customer's first Clerk sign-in can finish without the
    // callback route ever claiming their profile. That is not "signed out".
    mockUseUser.mockReturnValue(SIGNED_IN);
    mockGetCurrentUserIdResult.mockResolvedValue({ id: null, error: false });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.needsProfileLink).toBe(true);
    expect(result.current.hasProfileLookupError).toBe(false);
  });

  it("does not claim a missing link when the lookup itself failed", async () => {
    mockUseUser.mockReturnValue(SIGNED_IN);
    mockGetCurrentUserIdResult.mockResolvedValue({ id: null, error: true });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasProfileLookupError).toBe(true);
    expect(result.current.needsProfileLink).toBe(false);
  });

  it("does not need a profile link when signed out", async () => {
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.needsProfileLink).toBe(false);
    expect(mockGetCurrentUserIdResult).not.toHaveBeenCalled();
  });
});
