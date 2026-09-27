#!/usr/bin/env node
/**
 * Manual production E2E session. Never run from CI.
 *
 *   pnpm e2e:prod --i-am-running-against-production [--app <name>] [--ref <branch>] [-- <playwright args>]
 *
 * preflight → e2e_runs row → deploy the test-id image (built from the branch
 * the serving image came from) → Playwright per app → prune by run id →
 * restore the pre-window image from the box's env.prod.previous → record
 * status. Steps after the run row live in one finally, so a failed suite
 * still prunes and still puts the exact previous image back. SSH to the box
 * is required (audio preflight and the restore).
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §9–§10.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pruneRun } from "./e2e-prod-prune.mjs";
import { createRegistry } from "./lib/e2e-prod-registry.mjs";
import {
  boxSshTarget,
  dispatchDeploy,
  restorePreviousImage,
  runSshCli,
  servingBranch,
  waitForTestIds,
  watchRun,
} from "./lib/e2e-prod-swap.mjs";
import { mintRunId } from "./lib/e2e-run-id.mjs";
import { loadEnv } from "./load-env.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i === -1 ? undefined : args[i + 1];
};
const sep = args.indexOf("--");
const passthrough = sep === -1 ? [] : args.slice(sep + 1);
const E2E_APPS = ["auth", "store", "admin", "payments", "landing"];
const EXCLUDED = "google-login|discord-login|setup-discord-session";
/** Branches a serving image may come from without an explicit --ref. */
const KNOWN_REFS = ["main", "develop"];

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!args.includes("--i-am-running-against-production")) {
  fail(
    "refusing: pass --i-am-running-against-production to acknowledge a live run",
  );
}
if (process.env.CI) fail("refusing: production E2E is manual, never CI");

const apps = flag("--app") ? [flag("--app")] : E2E_APPS;
if (apps.some((a) => !E2E_APPS.includes(a))) {
  fail(`--app must be one of ${E2E_APPS.join(", ")}`);
}

loadEnv("prod");
for (const k of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_DOMAIN",
  "NEXT_PUBLIC_LANDING_URL",
]) {
  if (!process.env[k]) fail(`preflight: ${k} is unset in .env.prod/.secrets`);
}
if (!process.env.CLERK_SECRET_KEY.startsWith("sk_live_")) {
  fail("preflight: .env.prod resolves a non-production Clerk key");
}

const landing = process.env.NEXT_PUBLIC_LANDING_URL;
const registry = createRegistry({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
});

const gh = isWindows
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", "gh", "auth", "status"], {
      windowsHide: true,
    })
  : spawnSync("gh", ["auth", "status"]);
if (gh.status !== 0) fail("preflight: gh auth status failed");

const publicCode = await fetch(`${landing}/health`)
  .then((r) => r.status)
  .catch(() => 0);
if (publicCode !== 200) fail(`preflight: ${landing}/health -> ${publicCode}`);

const running = await registry.runningRuns();
if (running.length > 0) {
  fail(
    `preflight: run ${running[0].run_id} is still running — audit or prune it first`,
  );
}

// SSH is not optional: the restore at the end goes through it.
try {
  boxSshTarget();
} catch (error) {
  fail(`preflight: ${error.message}`);
}
const units = await runSshCli(
  "systemctl is-active go-librespot spotify-discord-bot",
).catch((e) => fail(`preflight: ssh to the box failed: ${e.message}`));
if (!/^active\s+active\s*$/.test(units ?? "")) {
  fail(`preflight: audio units not both active:\n${units}`);
}

// The test-id image is built from the branch the serving image came from,
// so the window runs the code that is live. Never a default of develop: the
// window must not become a release path.
const ref = flag("--ref") ?? (await servingBranch());
if (!ref) fail("preflight: no successful deploy found to take the ref from");
if (!flag("--ref") && !KNOWN_REFS.includes(ref)) {
  fail(
    `preflight: the serving image came from "${ref}"; pass --ref explicitly`,
  );
}

const runId = mintRunId();
const gitSha = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
  cwd: rootDir,
}).stdout.trim();
const operator =
  spawnSync("git", ["config", "user.email"], {
    encoding: "utf8",
    cwd: rootDir,
  }).stdout.trim() || "unknown";
const imageTag = `ghcr.io/vaoan/libra-prod:${gitSha}-testids`;
const failuresFile = join(
  mkdtempSync(join(tmpdir(), "e2e-prod-")),
  "registry-failures.log",
);
writeFileSync(failuresFile, "");

console.log(
  `\n🧪 production e2e  run=${runId}  apps=${apps.join(",")}  ref=${ref}\n`,
);
await registry.createRun({
  runId,
  operator,
  gitSha,
  imageTag,
  baseUrl: landing,
  apps,
});

let status = "failed";
let notes = null;
try {
  console.log(`▶ deploying the test-id image from ${ref}`);
  const deployRun = await dispatchDeploy({ testIds: true, ref });
  await watchRun(deployRun);
  await waitForTestIds({ url: `${landing}/`, present: true });
  console.log("✓ production serves test ids\n");

  let suiteFailed = false;
  for (const app of apps) {
    const code = await playwright(app);
    if (code !== 0) {
      suiteFailed = true;
      break;
    }
  }
  status = suiteFailed ? "failed" : "passed";
  // A registration that failed inside Playwright is a row prune cannot see.
  const unregistered = readFileSync(failuresFile, "utf8")
    .split("\n")
    .filter(Boolean);
  if (unregistered.length > 0) {
    status = "failed";
    notes = `${unregistered.length} row registration(s) failed: ${unregistered.slice(0, 5).join(" | ")}`;
  }
} catch (error) {
  notes = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${notes}`);
} finally {
  console.log("\n▶ pruning");
  const result = await pruneRun(registry, runId, { dryRun: false }).catch(
    (e) => ({ failures: [e.message], deleted: {} }),
  );
  if (result.failures.length > 0) {
    status = "failed";
    notes = `${notes ? `${notes}; ` : ""}prune left ${result.failures.length} item(s)`;
  }

  console.log("▶ restoring the pre-window image");
  try {
    await restorePreviousImage();
    console.log("✓ the box serves the pre-window image again");
  } catch (error) {
    status = "failed";
    notes = `${notes ? `${notes}; ` : ""}restore failed: ${error.message} — PRODUCTION MAY STILL SERVE TEST IDS`;
    console.error(notes);
  }
  await registry.finishRun(runId, status, notes);
  console.log(`\n${runId}: ${status}${notes ? ` (${notes})` : ""}`);
  console.log("audit: pnpm e2e:prod:audit");
}
process.exit(status === "passed" ? 0 : 1);

function playwright(app) {
  const appDir = resolve(rootDir, `apps/${app}`);
  const pwArgs = [
    "--dir",
    appDir,
    "exec",
    "playwright",
    "test",
    "--config",
    "playwright.config.ts",
    "--grep-invert",
    `@ux|${EXCLUDED}`,
    ...passthrough,
  ];
  const env = {
    ...process.env,
    TARGET_ENV: "prod",
    E2E_RUN_ID: runId,
    E2E_PRODUCTION_ACK: runId,
    E2E_RUN_FAILURES_FILE: failuresFile,
  };
  console.log(`▶ playwright  app=${app}\n`);
  return new Promise((resolvePromise) => {
    const child = isWindows
      ? spawn("cmd.exe", ["/d", "/s", "/c", "pnpm", ...pwArgs], {
          cwd: rootDir,
          stdio: "inherit",
          windowsHide: true,
          env,
        })
      : spawn("pnpm", pwArgs, { cwd: rootDir, stdio: "inherit", env });
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}
