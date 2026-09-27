/**
 * Run identity for manual production E2E sessions.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §3.
 *
 * `e2e-<YYYYMMDD>-<HHmm>-<4 hex>`: sortable by time, unique within a minute,
 * and short enough to live inside an email address and a product slug.
 */
import { randomBytes } from "node:crypto";

export const RUN_ID_PATTERN = /^e2e-\d{8}-\d{4}-[0-9a-f]{4}$/;

/** Captures the run id out of `e2e-<label>-<run_id>+clerk_test@example.com`. */
export const EMAIL_RUN_ID_PATTERN =
  /-(e2e-\d{8}-\d{4}-[0-9a-f]{4})\+clerk_test@example\.com$/;

export function mintRunId(now = new Date(), random = randomBytes) {
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const suffix = random(2).toString("hex");
  return `e2e-${date}-${time}-${suffix}`;
}

export function isRunId(value) {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}
