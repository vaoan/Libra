#!/usr/bin/env node
/**
 * What production E2E has left behind: every run with its leftover count,
 * whether the box serves a -testids image, and any e2e-* user on the
 * production Clerk instance that no run claims.
 *
 *   node scripts/e2e-prod-audit.mjs [--env prod]
 *
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §9.
 */
import { runIdFromEmail } from "./lib/e2e-prod-plan.mjs";
import { createRegistry } from "./lib/e2e-prod-registry.mjs";
import { loadEnv } from "./load-env.mjs";

export function servedImageIsTestIds(html) {
  return /data-testid=/.test(html);
}

const args = process.argv.slice(2);
const envFlag = args.indexOf("--env");
loadEnv(envFlag === -1 ? "prod" : args[envFlag + 1]);

const registry = createRegistry({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
});

const runs = await registry.listRuns();
console.log(`\nruns: ${runs.length}`);
for (const r of runs) {
  console.log(
    `  ${r.run_id}  ${r.status.padEnd(7)}  leftovers=${r.leftover_rows}  ${r.operator}  ${r.git_sha.slice(0, 7)}  ${r.started_at}`,
  );
}

const landing = process.env.NEXT_PUBLIC_LANDING_URL;
const html = await fetch(`${landing}/`, { cache: "no-store" })
  .then((r) => r.text())
  .catch(() => "");
const testIdsLive = servedImageIsTestIds(html);
console.log(
  `\nserved image carries test ids: ${testIdsLive ? "YES — a -testids build is live" : "no"}`,
);

const known = new Set(runs.map((r) => r.run_id));
const users = await registry.listClerkUsers();
const e2e = users.filter((u) => /^e2e-.*@example\.com$/i.test(u.email));
const unclaimed = e2e.filter((u) => !known.has(runIdFromEmail(u.email)));
console.log(
  `\nproduction clerk users: ${users.length}, e2e-*: ${e2e.length}, without a known run: ${unclaimed.length}`,
);
for (const u of unclaimed) console.log(`  ${u.id}  ${u.email}`);

const running = runs.filter((r) => r.status === "running");
const dirty = running.length > 0 || unclaimed.length > 0 || testIdsLive;
process.exit(dirty ? 1 : 0);
