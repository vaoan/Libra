import { describe, expect, it } from "vitest";

import {
  PRODUCTION_HOST,
  assertNotProductionClerk,
} from "../e2e/helpers/guardEnv";

const RUN = "e2e-20260927-1930-a3f1";
const ok = {
  targetEnv: "prod",
  runId: RUN,
  ack: RUN,
  baseUrl: `https://${PRODUCTION_HOST}/store`,
};

describe("assertNotProductionClerk", () => {
  it("lets a development key through with no context", () => {
    expect(() => assertNotProductionClerk("sk_test_abc")).not.toThrow();
  });

  it("refuses a live key with no context, as before", () => {
    expect(() => assertNotProductionClerk("sk_live_abc")).toThrow(
      /refusing to run against a production Clerk instance/,
    );
  });

  it("admits a live key when env, ack and host all agree", () => {
    expect(() => assertNotProductionClerk("sk_live_abc", ok)).not.toThrow();
  });

  it.each([
    ["ack differs from run id", { ...ok, ack: "e2e-20260927-1930-ffff" }],
    ["ack set but run id unset", { ...ok, runId: undefined }],
    ["both empty strings", { ...ok, runId: "", ack: "" }],
    ["run id is not in the run id format", { ...ok, runId: "x", ack: "x" }],
    [
      "run id is a bare timestamp",
      { ...ok, runId: "1727000000000", ack: "1727000000000" },
    ],
    ["env is staging", { ...ok, targetEnv: "staging" }],
    ["host is staging", { ...ok, baseUrl: "https://store.ffxivbe.org/store" }],
    [
      "host is a lookalike",
      { ...ok, baseUrl: "https://store.furrycolombia.com.evil.net/" },
    ],
    ["host is localhost", { ...ok, baseUrl: "http://localhost:5050/store" }],
    ["base url missing", { ...ok, baseUrl: undefined }],
  ])("refuses a live key when %s", (_name, ctx) => {
    expect(() => assertNotProductionClerk("sk_live_abc", ctx)).toThrow(
      /refusing to run against a production Clerk instance/,
    );
  });
});
