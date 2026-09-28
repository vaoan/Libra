import { describe, expect, it } from "vitest";

import { quoteForCmd } from "../lib/cmd-quote.mjs";

describe("quoteForCmd", () => {
  it("wraps arguments cmd.exe would otherwise interpret", () => {
    expect(quoteForCmd("@ux|google-login|discord-login")).toBe(
      '"@ux|google-login|discord-login"',
    );
    expect(quoteForCmd("two words")).toBe('"two words"');
    expect(quoteForCmd("a&b")).toBe('"a&b"');
  });
  it("leaves plain arguments alone", () => {
    expect(quoteForCmd("--grep-invert")).toBe("--grep-invert");
    expect(quoteForCmd("playwright.config.ts")).toBe("playwright.config.ts");
  });
  it("escapes embedded double quotes", () => {
    expect(quoteForCmd('say "hi"')).toBe('"say \\"hi\\""');
  });
});
