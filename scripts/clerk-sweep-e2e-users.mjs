#!/usr/bin/env node
/**
 * Fail-safe sweeper for leaked Clerk E2E users.
 *
 * This is NOT the cleanup mechanism — `createTestUser` registers users and a
 * worker-scoped Playwright fixture drains them (see
 * apps/auth/e2e/helpers/userRegistry.ts and its autoCleanup fixture). This
 * exists only for what teardown cannot cover: a killed machine, an OOM, a
 * hard CI cancellation. In normal operation it must find nothing.
 *
 * Deliberately conservative: deletion requires a POSITIVE match against
 * `^e2e-.*@example\.com$`, never "everything not on a keep-list". That
 * property is what protected four real accounts during the 2026-09-05
 * manual purge of this same Clerk dev instance.
 *
 * Usage:
 *   node scripts/clerk-sweep-e2e-users.mjs --dry-run
 *   node scripts/clerk-sweep-e2e-users.mjs --older-than-hours 24
 */
import { loadEnv } from "./load-env.mjs";

const API = "https://api.clerk.com/v1";
const DELETABLE = /^e2e-.*@example\.com$/i;
const CLERK_LIST_PAGE_SIZE = 100;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const olderThanHoursFlagIndex = args.indexOf("--older-than-hours");
const olderThanHoursRaw =
  olderThanHoursFlagIndex === -1
    ? 0
    : Number(args[olderThanHoursFlagIndex + 1] ?? 0);
const olderThanHours = Number.isFinite(olderThanHoursRaw)
  ? olderThanHoursRaw
  : 0;

loadEnv(process.env.TARGET_ENV ?? "dev");

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY not resolved");
// Deliberately duplicated rather than importing
// apps/auth/e2e/helpers/guardEnv.ts: this is a plain .mjs script run
// standalone (including from CI, outside any app's build), and guardEnv.ts
// is a TypeScript module that lives inside one app's e2e folder -- importing
// it cleanly from a root-level .mjs script isn't a clean dependency, so the
// one-line sk_live_ check is kept local instead. Keep both in sync if the
// check ever changes.
if (secretKey.startsWith("sk_live_")) {
  throw new Error("refusing to sweep a production Clerk instance");
}

async function call(method, path) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "User-Agent": "libra-clerk-sweeper",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function primaryEmail(user) {
  const addrs = user.email_addresses ?? [];
  const primary = addrs.find((a) => a.id === user.primary_email_address_id);
  return (primary ?? addrs[0])?.email_address ?? "";
}

const users = [];
try {
  for (let offset = 0; ; offset += CLERK_LIST_PAGE_SIZE) {
    const page = await call(
      "GET",
      `/users?limit=${CLERK_LIST_PAGE_SIZE}&offset=${offset}`,
    );
    if (!page?.length) break;
    users.push(...page);
    if (page.length < CLERK_LIST_PAGE_SIZE) break;
  }
} catch (error) {
  // A fail-safe must never be able to fail the build: a transient Clerk
  // error or rate-limit here would otherwise throw uncaught and red a CI
  // job whose entire purpose is to be a safety net, not a gate (the DELETE
  // loop below already handles its own failures per-user). Log and exit 0 --
  // the CI step also carries continue-on-error as a second, independent
  // layer against exactly this.
  console.warn(
    `[sweeper] failed to list users, skipping this sweep: ${error.message}`,
  );
  process.exit(0);
}

const cutoff = olderThanHours
  ? Date.now() - olderThanHours * 3_600_000
  : Infinity;

const doomed = users.filter(
  (u) => DELETABLE.test(primaryEmail(u)) && (u.created_at ?? 0) < cutoff,
);

console.log(`total users:      ${users.length}`);
console.log(`to delete (e2e):  ${doomed.length}`);

if (dryRun) {
  for (const u of doomed) console.log(`  would delete ${primaryEmail(u)}`);
  process.exit(0);
}

let deleted = 0;
for (const u of doomed) {
  try {
    await call("DELETE", `/users/${u.id}`);
    deleted += 1;
  } catch (error) {
    console.warn(`  failed ${primaryEmail(u)}: ${error.message}`);
  }
}
console.log(`deleted: ${deleted}`);
if (deleted > 0) {
  console.warn(
    "[sweeper] deleted leaked users — in-process teardown should have " +
      "caught these. Investigate before dismissing.",
  );
}
