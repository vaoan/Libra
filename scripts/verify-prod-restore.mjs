#!/usr/bin/env node
/**
 * Post-restore gate. Exits non-zero unless every invariant holds. Nobody
 * signs in until this passes: `backup-prod.mjs --restore` truncates
 * user_profiles, so a restore run against a live system wipes claimed
 * identity_sub values.
 *
 * The expected counts come from the snapshot's own manifest, so the gate
 * checks "the database holds exactly what we backed up", not a hand-typed
 * list that drifts.
 *
 * Usage:
 *   node scripts/verify-prod-restore.mjs <snapshot-dir> [--env prod]
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnv } from "./load-env.mjs";
import { compareCounts } from "./verify-restore.mjs";

const args = process.argv.slice(2);
const envFlag = args.indexOf("--env");
loadEnv(envFlag !== -1 ? args[envFlag + 1] : "prod");
const snapshotDir = args.find(
  (a) => !a.startsWith("--") && a !== args[envFlag + 1],
);
if (!snapshotDir || !existsSync(resolve(snapshotDir, "manifest.json"))) {
  console.error(
    "usage: node scripts/verify-prod-restore.mjs <snapshot-dir with manifest.json>",
  );
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: srk, Authorization: `Bearer ${srk}` };
const manifest = JSON.parse(
  readFileSync(resolve(snapshotDir, "manifest.json"), "utf8"),
);

// Tables the migrations seed themselves; `--restore` truncates them first, so
// after a restore they must hold exactly the backup's rows — no more.
const expectedTables = Object.fromEntries(
  Object.entries(manifest.tables).filter(([, v]) => typeof v === "number"),
);

async function count(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range") ?? "";
  return Number(range.split("/")[1] ?? -1);
}

const actual = {};
for (const table of Object.keys(expectedTables))
  actual[table] = await count(table);
const { ok, mismatches } = compareCounts(expectedTables, actual);
for (const [table, expected] of Object.entries(expectedTables)) {
  const bad = mismatches.find((m) => m.table === table);
  console.log(
    `${bad ? "FAIL" : "PASS"}  ${table}: ${actual[table]} (want ${expected})`,
  );
}

let failed = !ok;

const orders = await fetch(
  `${url}/rest/v1/orders?select=id,user_id&user_id=not.is.null`,
  { headers },
).then((r) => r.json());
const profiles = await fetch(`${url}/rest/v1/user_profiles?select=id`, {
  headers,
}).then((r) => r.json());
const ids = new Set(profiles.map((p) => p.id));
const orphaned = orders.filter((o) => !ids.has(o.user_id));
console.log(
  `${orphaned.length === 0 ? "PASS" : "FAIL"}  orphaned order.user_id: ${orphaned.length}`,
);
if (orphaned.length > 0) failed = true;

const expectedFiles = (manifest.storage?.files ?? []).filter(
  (f) => !f.error,
).length;
const objects = await fetch(`${url}/storage/v1/object/list/receipts`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ prefix: "", limit: 1000 }),
}).then((r) => r.json());
const topLevel = Array.isArray(objects) ? objects.length : -1;
console.log(
  `INFO  receipts bucket: ${topLevel} top-level entries (snapshot holds ${expectedFiles} files)`,
);

process.exit(failed ? 1 : 0);
