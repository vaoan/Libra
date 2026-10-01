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

  // 2026-09-28: the box's 19 GB disk filled with 1.09 GB images — one per
  // deploy, one per E2E window, none ever removed. nginx in the container
  // could not create its temp dir and every route answered 502; the rollback
  // restored a container into the same full disk. Prune before pulling, but
  // keep the previous image: the rollback and the E2E restore start it again.
  it("prunes old images on the box before pulling, keeping current and previous", () => {
    const deploy = workflow.indexOf("- name: Deploy over SSH");
    const prune = workflow.indexOf("- name: Prune old images on the box");
    expect(prune).toBeGreaterThan(-1);
    expect(prune).toBeLessThan(deploy);
    const step = workflow.slice(prune, deploy);
    expect(step).toContain("grep '^SITE_PROD_IMAGE_NAME=' env.prod.rendered");
    expect(step).toContain("grep '^SITE_PROD_IMAGE_NAME=' env.prod.previous");
    // The shell quoting inside `ssh box "..."` is what the box receives:
    // keep the serving image and the previous one, remove the rest.
    expect(step).toContain("grep -vxF -e");
    expect(step).toContain("$cur");
    expect(step).toContain("$prev");
    expect(step).toContain("| xargs -r docker rmi");
    expect(step).toContain("df -h /");
  });
});
