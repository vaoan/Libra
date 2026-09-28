import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const APPS = ["auth", "store", "admin", "payments", "landing"];

// Production runs have zero tolerance for flakiness: a test that passes on
// its second try still failed a real buyer once. Retries would hide that as
// "flaky" and, with trace "on-first-retry", leave no trace of the attempt
// that failed (CI production run e2e-20260928-0535-a808: two first attempts,
// two screenshots, no traces).
describe.each(APPS)(
  "apps/%s/playwright.config.ts under TARGET_ENV=prod",
  (app) => {
    const config = readFileSync(
      join(repoRoot, `apps/${app}/playwright.config.ts`),
      "utf8",
    );

    it("never retries", () => {
      expect(config).toMatch(
        /retries: isProductionTarget \? 0 : process\.env\.CI \? 2 : 0/,
      );
    });

    it("keeps a trace of every failed attempt", () => {
      expect(config).toMatch(
        /trace: isProductionTarget \? "retain-on-failure" : "on-first-retry"/,
      );
    });

    it("derives the flag from TARGET_ENV", () => {
      expect(config).toContain(
        'const isProductionTarget = process.env.TARGET_ENV === "prod";',
      );
    });
  },
);
