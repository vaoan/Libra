import { describe, expect, it } from "vitest";

import { ciRefusal } from "../lib/e2e-prod-guard.mjs";

describe("ciRefusal", () => {
  it("lets a local run through", () => {
    expect(ciRefusal({})).toBeNull();
  });

  it("refuses CI without the explicit opt-in", () => {
    expect(ciRefusal({ CI: "true" })).toMatch(/E2E_PROD_CI_ALLOWED/);
  });

  it("admits CI only when the workflow sets the opt-in to exactly 'true'", () => {
    expect(ciRefusal({ CI: "true", E2E_PROD_CI_ALLOWED: "true" })).toBeNull();
    expect(ciRefusal({ CI: "true", E2E_PROD_CI_ALLOWED: "1" })).toMatch(
      /E2E_PROD_CI_ALLOWED/,
    );
  });

  it("ignores the opt-in outside CI", () => {
    expect(ciRefusal({ E2E_PROD_CI_ALLOWED: "true" })).toBeNull();
  });
});
