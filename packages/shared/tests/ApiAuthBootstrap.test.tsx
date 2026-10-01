import { render } from "@testing-library/react";

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("api", () => ({
  setAccessTokenGetter: vi.fn(),
  setOnUnauthorized: vi.fn(),
  setRefreshTokenCallback: vi.fn(),
}));

vi.mock("auth", () => ({
  AUTH_COOKIE_NAMES: { accessToken: "sb-access-token" },
  AUTH_REFRESH_ENDPOINT: "/auth/v1/token?grant_type=refresh_token",
  TOKEN_TTL_SECONDS: { access: 3600 },
}));

import {
  setAccessTokenGetter,
  setOnUnauthorized,
  setRefreshTokenCallback,
} from "api";
import { ApiAuthBootstrap } from "@shared/providers/ApiAuthBootstrap";

describe("ApiAuthBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null (no visible output)", () => {
    const { container } = render(
      <ApiAuthBootstrap authHostUrl="http://localhost:5000" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("registers access token getter on mount", () => {
    render(<ApiAuthBootstrap authHostUrl="http://localhost:5000" />);
    expect(setAccessTokenGetter).toHaveBeenCalledWith(expect.any(Function));
  });

  it("registers refresh token callback on mount", () => {
    render(<ApiAuthBootstrap authHostUrl="http://localhost:5000" />);
    expect(setRefreshTokenCallback).toHaveBeenCalledWith(expect.any(Function));
  });

  it("registers onUnauthorized callback on mount", () => {
    render(<ApiAuthBootstrap authHostUrl="http://localhost:5000" />);
    expect(setOnUnauthorized).toHaveBeenCalledWith(expect.any(Function));
  });

  describe("onUnauthorized redirect (auth host lives under a path on the one origin)", () => {
    function stubLocation(href: string) {
      const url = new URL(href);
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        writable: true,
        value: { href, origin: url.origin, protocol: url.protocol },
      });
    }

    function fireUnauthorized(authHostUrl: string, locale?: string) {
      render(<ApiAuthBootstrap authHostUrl={authHostUrl} locale={locale} />);
      const onUnauthorized = vi.mocked(setOnUnauthorized).mock.calls[0]![0];
      onUnauthorized!();
      return globalThis.location.href;
    }

    it("keeps the auth host's path when it is an absolute URL", () => {
      stubLocation("http://localhost:5050/store/en/cart");

      const href = fireUnauthorized("http://localhost:5050/auth");

      expect(href).toBe(
        "http://localhost:5050/auth/en/login?returnTo=http%3A%2F%2Flocalhost%3A5050%2Fstore%2Fen%2Fcart",
      );
    });

    it("resolves a root-relative auth host against the current origin", () => {
      stubLocation("https://store.example.com/store/es/cart");

      const href = fireUnauthorized("/auth", "es");

      expect(href).toBe(
        "https://store.example.com/auth/es/login?returnTo=https%3A%2F%2Fstore.example.com%2Fstore%2Fes%2Fcart",
      );
    });

    it("tolerates a trailing slash on the auth host", () => {
      stubLocation("http://localhost:5050/store/en");

      const href = fireUnauthorized("http://localhost:5050/auth/");

      expect(href.startsWith("http://localhost:5050/auth/en/login?")).toBe(
        true,
      );
    });
  });

  it("cleans up callbacks on unmount", () => {
    const { unmount } = render(
      <ApiAuthBootstrap authHostUrl="http://localhost:5000" />,
    );

    vi.clearAllMocks();
    unmount();

    expect(setAccessTokenGetter).toHaveBeenCalledWith(null);
    expect(setRefreshTokenCallback).toHaveBeenCalledWith(null);
    expect(setOnUnauthorized).toHaveBeenCalledWith(null);
  });
});
