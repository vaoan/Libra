/**
 * The image swap around a production E2E window: dispatch
 * deploy-production.yml with test_ids, wait until the public site serves
 * (or stops serving) data-testid attributes.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §8.
 */
import { spawn } from "node:child_process";

import { TEST_ID_MARKER, hasTestIdMarker } from "./e2e-prod-plan.mjs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const DEPLOY_DIR = "/opt/libra";
const BOX_PORT = 9090;

/** Runs `gh <args>` and resolves with stdout; rejects on a non-zero exit. */
export function runGhCli(args) {
  return new Promise((resolvePromise, reject) => {
    const child = isWindows
      ? spawn("cmd.exe", ["/d", "/s", "/c", "gh", ...args], {
          windowsHide: true,
        })
      : spawn("gh", args);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise(out)
        : reject(
            new Error(`gh ${args.join(" ")} -> exit ${code}: ${err.trim()}`),
          ),
    );
  });
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitForTestIds({
  url,
  present,
  timeoutMs = 15 * 60_000,
  intervalMs = 10_000,
  fetchImpl = fetch,
  sleep = defaultSleep,
  clock = Date.now,
}) {
  const start = clock();
  for (;;) {
    const html = await fetchImpl(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .catch(() => "");
    if (hasTestIdMarker(html) === present) return;
    if (clock() - start >= timeoutMs) {
      throw new Error(
        `${url} did not ${present ? "start" : "stop"} serving test ids within ${timeoutMs}ms`,
      );
    }
    await sleep(intervalMs);
  }
}

async function latestRun(runGh) {
  const out = await runGh([
    "run",
    "list",
    "--workflow",
    "deploy-production.yml",
    "--limit",
    "1",
    "--json",
    "databaseId,createdAt",
  ]);
  const [latest] = JSON.parse(out || "[]");
  return latest ?? null;
}

/**
 * Dispatches the deploy and returns the id of the run it created. The new
 * run is recognised by id — the latest run changing from what it was before
 * the dispatch — never by comparing createdAt with the local clock: the
 * first rehearsal (2026-09-27) saw GitHub stamp the run three seconds
 * before the caller's `Date.now()`, and a clock comparison waited forever.
 */
export async function dispatchDeploy({
  testIds,
  ref,
  runGh = runGhCli,
  sleep = defaultSleep,
}) {
  const before = await latestRun(runGh);
  await runGh([
    "workflow",
    "run",
    "deploy-production.yml",
    "--ref",
    ref,
    "-f",
    `test_ids=${testIds ? "true" : "false"}`,
  ]);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const latest = await latestRun(runGh);
    if (latest && latest.databaseId !== before?.databaseId) {
      return String(latest.databaseId);
    }
    await sleep(5_000);
  }
  throw new Error("dispatched deploy-production.yml but no new run appeared");
}

export async function watchRun(runId, runGh = runGhCli) {
  await runGh(["run", "watch", runId, "--exit-status"]);
}

/** SSH target for the box, from the env loadEnv("prod") resolved. Throws when incomplete. */
export function boxSshTarget(env = process.env) {
  const host = env.RACKNERD_VPS_IP;
  const user = env.RACKNERD_VPS_USER ?? "root";
  const key =
    env.RACKNERD_VPS_SSH_KEY_PATH ??
    resolve(homedir(), ".ssh/libra_prod_ed25519");
  if (!host || !existsSync(key)) {
    throw new Error(
      "RACKNERD_VPS_IP and the deploy key (~/.ssh/libra_prod_ed25519 or RACKNERD_VPS_SSH_KEY_PATH) are required to reach the box",
    );
  }
  return { host, user, key };
}

/** Runs one command on the box over SSH and resolves with stdout. */
export function runSshCli(command, target = boxSshTarget()) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ssh", [
      "-i",
      target.key,
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${target.user}@${target.host}`,
      command,
    ]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) =>
      code === 0
        ? resolvePromise(out)
        : reject(new Error(`ssh -> exit ${code}: ${err.trim()}`)),
    );
  });
}

/**
 * Put the pre-window image back. deploy-production.yml keeps the previous
 * rendered env as env.prod.previous before every deploy, and the previous
 * image is still on the box, so the exact image that served before the
 * test-id deploy comes back with a compose up — no build, no branch, no
 * dependency on the tunnel. Verified on the box's loopback: the landing page
 * (following its locale redirect) must no longer carry tid()'s
 * `data-testid="app-navigation"` marker — the clean build keeps one literal
 * `theme-toggle` test id, so "no data-testid at all" was never true.
 *
 * Guarded on the box: acts only when the serving image is a test-id build and
 * `env.prod.previous` is clean. A later normal deploy makes the previous env
 * the test-id one, and restoring it would bring test ids back, so "clean
 * already" is a no-op and a test-id previous refuses.
 */
export async function restorePreviousImage({
  runSsh = runSshCli,
  sleep = defaultSleep,
  clock = Date.now,
  timeoutMs = 5 * 60_000,
  intervalMs = 5_000,
} = {}) {
  // Guarded on the box itself: restore only when the serving image is a
  // test-id build and the previous env is clean. A later normal deploy makes
  // env.prod.previous the test-id env, and restoring it would bring test
  // ids back — so "clean already" is a no-op and a test-id previous refuses.
  const out = await runSsh(
    [
      `cd ${DEPLOY_DIR}`,
      `cur=$(grep '^SITE_PROD_IMAGE_NAME=' env.prod.rendered | cut -d= -f2-)`,
      `prev=$(grep '^SITE_PROD_IMAGE_NAME=' env.prod.previous 2>/dev/null | cut -d= -f2-)`,
      `case "$cur" in *-testids) ;; *) echo "clean already: $cur"; exit 0;; esac`,
      `case "$prev" in ""|*-testids) echo "no clean previous env"; exit 0;; esac`,
      `mv -f env.prod.previous env.prod.rendered`,
      `docker compose --env-file env.prod.rendered up -d --remove-orphans >/dev/null 2>&1`,
      `echo restored`,
    ].join(" && "),
  );
  if (/clean already/.test(out)) return;
  if (!/restored/.test(out)) {
    throw new Error(`box has no clean previous env to restore (${out.trim()})`);
  }
  const start = clock();
  for (;;) {
    const count = await runSsh(
      `curl -sL http://127.0.0.1:${BOX_PORT}/ | grep -c '${TEST_ID_MARKER}' || true`,
    );
    if (count.trim() === "0") return;
    if (clock() - start >= timeoutMs) {
      throw new Error(
        `the box still serves test ids ${timeoutMs}ms after the restore`,
      );
    }
    await sleep(intervalMs);
  }
}

/** The branch the image now serving was built from (last successful deploy). */
export async function servingBranch(runGh = runGhCli) {
  const out = await runGh([
    "run",
    "list",
    "--workflow",
    "deploy-production.yml",
    "--status",
    "success",
    "--limit",
    "1",
    "--json",
    "headBranch",
  ]);
  const [latest] = JSON.parse(out || "[]");
  return latest?.headBranch ?? null;
}
