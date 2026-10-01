/**
 * The Playwright invocation for one app in a production E2E run.
 *
 * Node itself runs Playwright's CLI with an argv array: no pnpm, no shell,
 * no cmd.exe. The first production runs (2026-09-28) went through
 * `cmd.exe /c pnpm …` and lost the `--grep-invert` regex to cmd's pipe
 * parsing (`'google-login' is not recognized as a command`); quoting it did
 * not survive Node's own Windows escaping either. An argv entry handed to
 * node needs no quoting on any platform.
 */
import { resolve } from "node:path";

export function buildPlaywrightCommand({
  rootDir,
  app,
  excluded,
  passthrough = [],
  execPath = process.execPath,
  cliPath = resolve(rootDir, "node_modules/@playwright/test/cli.js"),
}) {
  return {
    command: execPath,
    cwd: resolve(rootDir, "apps", app),
    args: [
      cliPath,
      "test",
      "--config",
      "playwright.config.ts",
      "--grep-invert",
      `@ux|${excluded}`,
      ...passthrough,
    ],
  };
}
