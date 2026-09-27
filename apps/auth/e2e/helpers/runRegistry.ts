/**
 * Registers every row an E2E run creates in `public.e2e_run_rows`, so a
 * production run's leftovers are one query to find and one command to
 * delete (scripts/e2e-prod-prune.mjs). Outside a production run
 * (`E2E_RUN_ID` unset: dev, staging, CI) every function here is a no-op and
 * the suites behave exactly as before.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §5.
 */

export type RowRegistrar = (tableName: string, rowId: string) => Promise<void>;

const failures: string[] = [];
let registrar: RowRegistrar = postToRegistry;

export function currentRunId(): string | undefined {
  const id = process.env.E2E_RUN_ID;
  return id && id.length > 0 ? id : undefined;
}

/**
 * The token that makes an E2E email or name unique: the run id inside a
 * production run, `Date.now()` otherwise (the historical behaviour).
 */
export function runScopedToken(): string {
  return currentRunId() ?? String(Date.now());
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
    failures.push(`${tableName}/${rowId}: ${message}`);
    console.warn(`[e2e] run registry: ${tableName}/${rowId}: ${message}`);
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
