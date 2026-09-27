import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const workflow = readFileSync(
  join(repoRoot, ".github/workflows/deploy-production.yml"),
  "utf8",
);

describe("deploy-production.yml test_ids input", () => {
  it("declares a boolean test_ids input defaulting to false", () => {
    expect(workflow).toMatch(
      /workflow_dispatch:\s+inputs:\s+test_ids:[\s\S]*?type: boolean[\s\S]*?default: false/,
    );
  });

  it("derives the test-id build arg from the input, false on push", () => {
    expect(workflow).toContain(
      "echo \"NEXT_PUBLIC_ENABLE_TEST_IDS=${{ inputs.test_ids == true && 'true' || 'false' }}\"",
    );
  });

  it("suffixes the tag with -testids and drops :latest when test_ids is set", () => {
    expect(workflow).toMatch(
      /TAG_SUFFIX: \$\{\{ inputs\.test_ids == true && '-testids' \|\| '' \}\}/,
    );
    expect(workflow).toMatch(
      /\$\{\{ env\.IMAGE \}\}:\$\{\{ github\.sha \}\}\$\{\{ env\.TAG_SUFFIX \}\}/,
    );
    expect(workflow).toMatch(
      /\$\{\{ inputs\.test_ids != true && format\('\{0\}:latest', env\.IMAGE\) \|\| '' \}\}/,
    );
  });

  it("renders the env file with the same suffixed tag", () => {
    expect(workflow).toContain(
      "SITE_PROD_IMAGE_NAME=${IMAGE}:${GITHUB_SHA}${TAG_SUFFIX}",
    );
  });

  it("only rolls back when SSH was actually prepared", () => {
    // A build failure happens before "Prepare SSH"; the rollback step must
    // not then try to ssh to an unconfigured host (exit 255, seen 2026-09-27).
    expect(workflow).toMatch(/- name: Prepare SSH\s+id: ssh/);
    expect(workflow).toMatch(
      /- name: Roll back on failure\s+if: failure\(\) && steps\.ssh\.outcome == 'success'/,
    );
  });

  it("never tags a push-to-main build with -testids", () => {
    // The only place the suffix is computed reads inputs.test_ids, which is
    // empty on a push event, so the expression yields ''.
    const occurrences = workflow.match(/-testids/g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
