import { beforeEach, describe, expect, it } from "vitest";

import {
  buildProfileLinkUrl,
  clearProfileLinkAttempt,
  hasRecentProfileLinkAttempt,
  markProfileLinkAttempt,
} from "@auth/client/profileLink";

const AUTH_URL = "https://store.example.com/auth";

describe("buildProfileLinkUrl", () => {
  it("points at the locale's callback route with the destination as `next`", () => {
    expect(
      buildProfileLinkUrl(
        AUTH_URL,
        "es",
        "https://store.example.com/store/es?tab=1",
      ),
    ).toBe(
      `${AUTH_URL}/es/callback?next=${encodeURIComponent("https://store.example.com/store/es?tab=1")}`,
    );
  });

  it("omits `next` when there is no destination, so the callback picks one", () => {
    expect(buildProfileLinkUrl(AUTH_URL, "en", null)).toBe(
      `${AUTH_URL}/en/callback`,
    );
  });
});

describe("profile link attempt marker", () => {
  beforeEach(() => {
    clearProfileLinkAttempt();
  });

  it("reports no recent attempt by default", () => {
    expect(hasRecentProfileLinkAttempt()).toBe(false);
  });

  it("reports a recent attempt once marked", () => {
    markProfileLinkAttempt();
    expect(hasRecentProfileLinkAttempt()).toBe(true);
  });

  it("forgets the attempt once cleared", () => {
    markProfileLinkAttempt();
    clearProfileLinkAttempt();
    expect(hasRecentProfileLinkAttempt()).toBe(false);
  });
});
