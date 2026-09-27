/**
 * Registers every row an E2E run creates in `public.e2e_run_rows`, so a
 * production run's leftovers are one query to find and one command to
 * delete (scripts/e2e-prod-prune.mjs). Outside a production run
 * (`E2E_RUN_ID` unset: dev, staging, CI) every function here is a no-op and
 * the suites behave exactly as before.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §5.
 */

import { appendFileSync } from "node:fs";

export type RowRegistrar = (tableName: string, rowId: string) => Promise<void>;

const failures: string[] = [];
let registrar: RowRegistrar = postToRegistry;
let runCheck: Promise<void> | null = null;

export function currentRunId(): string | undefined {
  const id = process.env.E2E_RUN_ID;
  return id && id.length > 0 ? id : undefined;
}

/**
 * The token that makes an E2E email or name unique: `Date.now()` outside a
 * run (the historical behaviour); inside a production run
 * `<Date.now()>-<run_id>`, so two specs using the same label never collide
 * and the value still ends in the run id that prune and the sweep match on.
 */
export function runScopedToken(): string {
  const runId = currentRunId();
  return runId ? `${Date.now()}-${runId}` : String(Date.now());
}

/**
 * Refuse to create anything for a run id that `e2e_runs` does not know:
 * a hand-typed `E2E_RUN_ID` would otherwise pass the guard and leave rows
 * no prune can find. One request per process, cached. No-op without a run.
 */
export function ensureRunRegistered(): Promise<void> {
  const runId = currentRunId();
  if (!runId) return Promise.resolve();
  runCheck ??= (async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase URL or service role key unset");
    const res = await fetch(
      `${url}/rest/v1/e2e_runs?select=run_id&run_id=eq.${runId}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = res.ok ? ((await res.json()) as unknown[]) : [];
    if (rows.length !== 1) {
      throw new Error(
        `[e2e] no e2e_runs row for ${runId} — start production runs through \`pnpm e2e:prod\`, never by exporting E2E_RUN_ID by hand.`,
      );
    }
  })();
  return runCheck;
}

/**
 * Never throws into the test: a failed registration is exactly the row prune
 * must not miss, so it is recorded and the runner marks the run `failed`.
 */
export async function registerRow(
  tableName: string,
  rowId: string,
): Promise<void> {
  if (!currentRunId()) return;
  try {
    await registrar(tableName, rowId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const line = `${tableName}/${rowId}: ${message}`;
    failures.push(line);
    console.warn(`[e2e] run registry: ${line}`);
    // Playwright runs in a child process; the runner reads this file in its
    // finally and marks the run failed, because an unregistered row is
    // exactly what prune must not miss.
    const file = process.env.E2E_RUN_FAILURES_FILE;
    if (file) {
      try {
        appendFileSync(
          file,
          `${line}
`,
        );
      } catch (writeError) {
        console.warn(
          `[e2e] run registry: could not write ${file}:`,
          writeError,
        );
      }
    }
  }
}

export function registrationFailures(): readonly string[] {
  return failures;
}

export function setRowRegistrar(fn: RowRegistrar): void {
  registrar = fn;
}

async function postToRegistry(tableName: string, rowId: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL or service role key unset");
  const res = await fetch(`${url}/rest/v1/e2e_run_rows`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // A row registered twice (setup retry) is the same row; not an error.
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({
      run_id: currentRunId(),
      table_name: tableName,
      row_id: rowId,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
}
