#!/usr/bin/env node
/**
 * Delete everything one production E2E run created, by run id only.
 *
 *   node scripts/e2e-prod-prune.mjs --run <run_id> [--dry-run]
 *   node scripts/e2e-prod-prune.mjs --older-than-hours <n> [--dry-run]
 *
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §6.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPrunePlan } from "./lib/e2e-prod-plan.mjs";
import { createRegistry } from "./lib/e2e-prod-registry.mjs";
import { restorePreviousImage } from "./lib/e2e-prod-swap.mjs";
import { isRunId } from "./lib/e2e-run-id.mjs";
import { loadEnv } from "./load-env.mjs";

/**
 * Gather what the registry and the database know about `runId`, build the
 * plan, run it. Returns `{ deleted, failures }`; the caller decides what a
 * non-empty `failures` means for the run's status.
 */
export async function pruneRun(reg, runId, { dryRun }) {
  const rows = await reg.rowsForRun(runId);
  const profiles = await reg.profilesForRun(runId);
  const profileIds = profiles.map((p) => p.id);
  const orders = await reg.ordersForProfiles(profileIds);
  const products = await reg.productsForRun(runId, profileIds);
  const clerkUsers = await reg.listClerkUsers();
  const plan = buildPrunePlan({
    runId,
    rows,
    profiles,
    orders,
    products,
    clerkUsers,
  });

  console.log(`\n${dryRun ? "DRY RUN " : ""}prune ${runId}`);
  for (const step of plan) {
    console.log(`  ${step.kind.padEnd(9)} ${step.ids.length}`);
  }

  const result = await reg.executePlan(plan, { dryRun });
  if (!dryRun && result.failures.length === 0) await reg.clearRunRows(runId);
  for (const f of result.failures) console.log(`  FAIL ${f}`);
  return result;
}

const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
const isMain =
  norm(fileURLToPath(import.meta.url)) === norm(resolve(process.argv[1] ?? ""));

if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const dryRun = args.includes("--dry-run");
  const runArg = flag("--run");
  const olderThanHours = Number(flag("--older-than-hours") ?? Number.NaN);
  const envName = flag("--env") ?? "prod";

  if (!runArg && !Number.isFinite(olderThanHours)) {
    console.error(
      "usage: e2e-prod-prune --run <run_id> | --older-than-hours <n> [--dry-run]",
    );
    process.exit(2);
  }
  if (runArg && !isRunId(runArg)) {
    console.error(`"${runArg}" is not a run id (e2e-YYYYMMDD-HHmm-xxxx)`);
    process.exit(2);
  }

  loadEnv(envName);
  const registry = createRegistry({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    clerkSecretKey: process.env.CLERK_SECRET_KEY,
  });

  const targets = [];
  if (runArg) targets.push(runArg);
  else {
    const cutoff = Date.now() - olderThanHours * 3_600_000;
    for (const r of await registry.listRuns()) {
      const old = new Date(r.started_at).getTime() < cutoff;
      if (old && (r.leftover_rows > 0 || r.status === "running")) {
        targets.push(r.run_id);
      }
    }
    console.log(
      `runs older than ${olderThanHours}h with leftovers: ${targets.length}`,
    );
  }

  let failed = false;
  for (const runId of targets) {
    const result = await pruneRun(registry, runId, { dryRun });
    if (result.failures.length > 0) failed = true;
    if (!dryRun) {
      const run = (await registry.listRuns()).find((r) => r.run_id === runId);
      if (run?.status === "running") {
        // A run left `running` never reached its own finally: the box may
        // still serve the test-id image. Put the pre-window image back.
        let note = "pruned by hand";
        try {
          await restorePreviousImage();
          note += "; clean image restored";
          console.log("  clean image restored on the box");
        } catch (error) {
          failed = true;
          note += `; CLEAN IMAGE NOT RESTORED: ${error.message}`;
          console.error(`  ${note}`);
        }
        await registry.finishRun(runId, "aborted", note);
      } else if (result.failures.length > 0) {
        await registry.finishRun(
          runId,
          "failed",
          `prune left ${result.failures.length} item(s)`,
        );
      }
    }
  }
  process.exit(failed ? 1 : 0);
}
