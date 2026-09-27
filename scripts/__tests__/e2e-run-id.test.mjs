import { describe, expect, it } from "vitest";

import {
  EMAIL_RUN_ID_PATTERN,
  RUN_ID_PATTERN,
  isRunId,
  mintRunId,
} from "../lib/e2e-run-id.mjs";

describe("mintRunId", () => {
  it("formats as e2e-YYYYMMDD-HHmm-xxxx in UTC", () => {
    const id = mintRunId(new Date("2026-09-27T19:30:07Z"), () =>
      Buffer.from([0xa3, 0xf1]),
    );
    expect(id).toBe("e2e-20260927-1930-a3f1");
  });

  it("differs for two runs in the same minute", () => {
    const now = new Date("2026-09-27T19:30:00Z");
    const a = mintRunId(now, () => Buffer.from([0x00, 0x01]));
    const b = mintRunId(now, () => Buffer.from([0x00, 0x02]));
    expect(a).not.toBe(b);
  });

  it("matches its own pattern", () => {
    expect(RUN_ID_PATTERN.test(mintRunId())).toBe(true);
    expect(isRunId("e2e-20260927-1930-a3f1")).toBe(true);
    expect(isRunId("e2e-20260927-1930-A3F1")).toBe(false);
    expect(isRunId("e2e-1234567890")).toBe(false);
    expect(isRunId("")).toBe(false);
  });

  it("extracts the run id from an E2E email", () => {
    const m = EMAIL_RUN_ID_PATTERN.exec(
      "e2e-buyer-reports-e2e-20260927-1930-a3f1+clerk_test@example.com",
    );
    expect(m?.[1]).toBe("e2e-20260927-1930-a3f1");
    expect(
      EMAIL_RUN_ID_PATTERN.exec(
        "e2e-buyer-1727000000000+clerk_test@example.com",
      ),
    ).toBeNull();
  });
});
