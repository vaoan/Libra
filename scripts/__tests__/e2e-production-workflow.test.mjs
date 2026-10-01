import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const read = (p) => readFileSync(join(repoRoot, p), "utf8");
const workflow = read(".github/workflows/e2e-production.yml");
const deploy = read(".github/workflows/deploy-production.yml");
const envProd = read(".env.prod");

describe("e2e-production.yml", () => {
  it("runs after a successful production deploy and by hand", () => {
    expect(workflow).toMatch(
      /workflow_run:\s+workflows: \["Deploy Production"\]\s+types: \[completed\]/,
    );
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
  });

  it("is switched off by a repository variable, no code change needed", () => {
    expect(workflow).toContain("vars.PRODUCTION_E2E_IN_CI == 'true'");
  });

  it("does not run for the test-id deploy the runner itself dispatches", () => {
    // The runner deploys a -testids image mid-window; that deploy completes
    // "successfully" and would re-trigger this workflow into its own window.
    expect(deploy).toMatch(/^run-name: .*test_ids.*test-id/m);
    expect(workflow).toContain(
      "!contains(github.event.workflow_run.display_title, 'test-id')",
    );
  });

  it("opts the runner into CI explicitly, and only here", () => {
    expect(workflow).toContain('E2E_PROD_CI_ALLOWED: "true"');
    expect(workflow).toContain(
      "pnpm e2e:prod --i-am-running-against-production",
    );
  });

  it("injects every secret .env.prod references, plus the box coordinates", () => {
    const refs = [...envProd.matchAll(/\$secret:([A-Z0-9_]+)/g)].map(
      (m) => m[1],
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const name of new Set(refs)) {
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    for (const name of ["RACKNERD_VPS_IP", "RACKNERD_VPS_USER"]) {
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    expect(workflow).toContain("secrets.RACKNERD_VPS_SSH_KEY");
  });

  it("can dispatch and read the deploy workflow through gh", () => {
    expect(workflow).toMatch(/permissions:\s+contents: read\s+actions: write/);
    expect(workflow).toContain("GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}");
  });

  it("never shares the deploy concurrency group (the runner dispatches a deploy and waits for it)", () => {
    expect(workflow).toMatch(/concurrency:\s+group: e2e-production/);
    expect(workflow).not.toMatch(/group: deploy-production/);
  });

  it("audits the registry and the served image even after a failure", () => {
    expect(workflow).toMatch(
      /- name: Audit[^\n]*\n\s+if: always\(\)[\s\S]*?pnpm e2e:prod:audit/,
    );
  });

  it("keeps traces and screenshots, and alerts the critical thread on failure", () => {
    expect(workflow).toMatch(/upload-artifact[\s\S]*?test-results/);
    expect(workflow).toContain("TELEGRAM_CRITICAL_THREAD_ID");
    expect(workflow).toMatch(/- name: Notify[^\n]*\n\s+if: failure\(\)/);
  });
});
