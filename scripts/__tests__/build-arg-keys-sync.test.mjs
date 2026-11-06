/**
 * Guards against drift between BUILD_ARG_KEYS (scripts/lib/docker-build-args.mjs)
 * and the two places that MUST restate the same key list because they cannot
 * import a JS module:
 *
 * - .github/workflows/ci.yml — the docker-build job's `build-args:` block
 * - docker/ci/Dockerfile — the `ARG NEXT_PUBLIC_*` declarations
 *
 * This is the structural guard called for by
 * .claude/rules/single-source-of-truth.md and dry-principle.md: where a
 * duplicate genuinely cannot be eliminated (YAML/Dockerfile have no module
 * system), it must at least fail loudly the moment it diverges from the
 * source of truth, instead of silently shipping an image missing a key
 * (as happened when scripts/docker-health-check.sh's hardcoded copy fell
 * out of sync and every app crashed with "Missing publishableKey").
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { BUILD_ARG_KEYS } from "../lib/docker-build-args.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");

/** Extracts the `KEY=` names from the docker-build job's `build-args: |` block in ci.yml. */
function extractCiWorkflowKeys(ciYamlContent) {
  const lines = ciYamlContent.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    line.trim().startsWith("build-args:"),
  );
  if (startIndex === -1) {
    throw new Error("Could not find 'build-args:' block in ci.yml");
  }

  const keys = [];
  const keyLine = /^\s*(NEXT_PUBLIC_[A-Z0-9_]+)=/;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(keyLine);
    if (!match) break; // Block ends at the first non-matching line
    keys.push(match[1]);
  }
  return keys;
}

/** Extracts the `NEXT_PUBLIC_*` names from `ARG` declarations in the Dockerfile. */
function extractDockerfileArgKeys(dockerfileContent) {
  const keys = [];
  const argLine = /^ARG\s+(NEXT_PUBLIC_[A-Z0-9_]+)(?:=.*)?$/;
  for (const line of dockerfileContent.split(/\r?\n/)) {
    const match = line.match(argLine);
    if (match) keys.push(match[1]);
  }
  return keys;
}

describe("BUILD_ARG_KEYS sync guard", () => {
  const sourceOfTruth = new Set(BUILD_ARG_KEYS);

  it("ci.yml docker-build job build-args match BUILD_ARG_KEYS exactly", () => {
    const ciYaml = readFileSync(
      resolve(rootDir, ".github/workflows/ci.yml"),
      "utf8",
    );
    const ciKeys = extractCiWorkflowKeys(ciYaml);

    const missingFromCi = BUILD_ARG_KEYS.filter((k) => !ciKeys.includes(k));
    const extraInCi = ciKeys.filter((k) => !sourceOfTruth.has(k));

    expect(
      missingFromCi,
      `ci.yml is missing build-args present in BUILD_ARG_KEYS: ${missingFromCi.join(", ")}`,
    ).toEqual([]);
    expect(
      extraInCi,
      `ci.yml has build-args not present in BUILD_ARG_KEYS: ${extraInCi.join(", ")}`,
    ).toEqual([]);
  });

  it("docker/ci/Dockerfile ARG declarations match BUILD_ARG_KEYS exactly", () => {
    const dockerfile = readFileSync(
      resolve(rootDir, "docker/ci/Dockerfile"),
      "utf8",
    );
    const dockerfileKeys = extractDockerfileArgKeys(dockerfile);

    const missingFromDockerfile = BUILD_ARG_KEYS.filter(
      (k) => !dockerfileKeys.includes(k),
    );
    const extraInDockerfile = dockerfileKeys.filter(
      (k) => !sourceOfTruth.has(k),
    );

    expect(
      missingFromDockerfile,
      `Dockerfile is missing ARGs present in BUILD_ARG_KEYS: ${missingFromDockerfile.join(", ")}`,
    ).toEqual([]);
    expect(
      extraInDockerfile,
      `Dockerfile has ARGs not present in BUILD_ARG_KEYS: ${extraInDockerfile.join(", ")}`,
    ).toEqual([]);
  });
});
