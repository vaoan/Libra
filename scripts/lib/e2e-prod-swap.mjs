/**
 * The image swap around a production E2E window: dispatch
 * deploy-production.yml with test_ids, wait until the public site serves
 * (or stops serving) data-testid attributes.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §8.
 */
import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

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
    if (/data-testid=/.test(html) === present) return;
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
