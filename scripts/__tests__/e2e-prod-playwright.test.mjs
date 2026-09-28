import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildPlaywrightCommand } from "../lib/e2e-prod-playwright.mjs";

describe("buildPlaywrightCommand", () => {
  const built = buildPlaywrightCommand({
    rootDir: "Z:/repo",
    app: "auth",
    excluded: "google-login|discord-login|setup-discord-session",
    passthrough: ["--grep", "two words"],
    execPath: "/usr/bin/node",
    cliPath: "Z:/repo/node_modules/@playwright/test/cli.js",
  });

  it("runs node on Playwright's CLI directly — no shell, no pnpm, no cmd.exe", () => {
    expect(built.command).toBe("/usr/bin/node");
    expect(built.args[0]).toBe("Z:/repo/node_modules/@playwright/test/cli.js");
    expect(built.args[1]).toBe("test");
    expect(built.cwd).toBe(resolve("Z:/repo", "apps", "auth"));
  });

  it("keeps the exclusion regex and passthrough args as single argv entries", () => {
    const i = built.args.indexOf("--grep-invert");
    expect(built.args[i + 1]).toBe(
      "@ux|google-login|discord-login|setup-discord-session",
    );
    expect(built.args.slice(-2)).toEqual(["--grep", "two words"]);
  });
});
