# Production E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operator-run Playwright sessions against the live `store.furrycolombia.com`, where every principal and row a run creates carries one run id, is pruned by that id, and is auditable from one table.

**Architecture:** Two service-role-only registry tables in the production database record runs and the rows they create. E2E helpers stamp the run id into every email and name and register every row they insert; rows the UI creates are reached through the run's users. A runner script mints the run id, swaps in a test-ID image via a `workflow_dispatch` input, runs the suites, prunes by run id, and swaps the clean image back, all inside one `finally`. The E2E guard admits a live Clerk key only with an explicit per-run acknowledgement, and server-side session minting uses sign-in tokens because production Clerk refuses Backend-API sessions.

**Tech Stack:** Node 22 ESM scripts (`scripts/*.mjs`), Playwright + `@clerk/testing`, `@clerk/backend`, Supabase PostgREST with the service role, GitHub Actions (`gh` CLI), vitest (`vitest.config.scripts.js` for scripts, `apps/auth` vitest for helpers, `vitest.config.integration.ts` for database invariants).

**Spec:** `docs/superpowers/specs/2026-09-27-production-e2e-design.md`

## Global Constraints

- Never runs from CI; no workflow invokes any `e2e:prod*` script.
- Run id format: `e2e-<YYYYMMDD>-<HHmm>-<4 lowercase hex>`.
- E2E emails: `e2e-<label>-<run_id>+clerk_test@example.com`; E2E names carry the prefix `e2e-<run_id>-`; without `E2E_RUN_ID` the helpers behave exactly as today.
- Registry tables: `public.e2e_runs`, `public.e2e_run_rows`; RLS enabled, no policy for `anon` or `authenticated`; `e2e_run_rows.run_id` → `e2e_runs(run_id)` `on delete restrict`.
- A live Clerk key (`sk_live_`) is accepted only when `TARGET_ENV === "prod"`, `E2E_PRODUCTION_ACK === E2E_RUN_ID` (both set), and the base URL host is exactly `store.furrycolombia.com`.
- Every delete is a positive match on the run id; `--dry-run` deletes nothing.
- Excluded from production runs: `google-login.spec.ts`, `discord-login.spec.ts`, `setup-discord-session.ts`.
- The test-ID image is tagged `:<sha>-testids` and never `:latest`; pushes to `main` never set `test_ids`.
- Repo rules apply: absolute imports across layers, no `--no-verify`, commit messages end with `[GH-000]` and the Co-Authored-By line, `pnpm format` before commit.

## Review Focus

1. A run whose Playwright worker crashed before registering a profile leaves a Clerk user with a run id in its email and no `user_profiles` row: prune must still delete it (Task 6's plan test "clerk user with no profile").
2. A registered row already removed by cascade (an order's item, a profile's permission) must not fail the prune (Task 6's test "skips rows already gone", Task 7's delete tolerates 404/empty).
3. Two runs started within the same minute must get different ids (Task 2's test on the random suffix).
4. `E2E_PRODUCTION_ACK` set but `E2E_RUN_ID` unset, or both empty strings, must still be refused (Task 3's guard matrix).
5. A killed terminal between the test-ID deploy and the clean redeploy leaves production serving test IDs: `e2e:prod:audit` must say so and `e2e:prod:prune --run` must redeploy clean (Task 8's audit test on the tag suffix; Task 9's `finalizeRun` path).

---

### Task 1: Registry tables migration and database invariants

**Files:**

- Create: `supabase/migrations/20260927200000_e2e_run_registry.sql`
- Test: `tests/db/e2e-registry.test.ts`

**Interfaces:**

- Produces: tables `public.e2e_runs(run_id text pk, started_at, finished_at, status, operator, git_sha, image_tag, base_url, apps text[], notes)` and `public.e2e_run_rows(run_id fk restrict, table_name, row_id, created_at, pk(table_name,row_id))`, both readable/writable only by `service_role`.

- [ ] **Step 1: Write the failing database test**

```ts
// tests/db/e2e-registry.test.ts
import { afterAll, describe, expect, it } from "vitest";

import { withClaims, withSuperuser } from "./helpers";

afterAll(async () => {
  const { closePool } = await import("./helpers");
  await closePool();
});

const RUN = "e2e-20260927-1930-a3f1";

async function seedRun(client: {
  query: (q: string, p?: unknown[]) => Promise<unknown>;
}) {
  await client.query(
    `insert into public.e2e_runs (run_id, status, operator, git_sha, image_tag, base_url, apps)
     values ($1, 'running', 'tester@example.com', 'abc1234', 'ghcr.io/x/y:abc1234-testids', 'https://store.example.com', array['auth'])`,
    [RUN],
  );
}

describe("e2e run registry", () => {
  it("exists with the expected columns", async () => {
    const cols = await withSuperuser(async (c) => {
      const r = await c.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('e2e_runs','e2e_run_rows')
          order by 1, 2`,
      );
      return r.rows.map((x) => `${x.table_name}.${x.column_name}`);
    });
    expect(cols).toEqual([
      "e2e_run_rows.created_at",
      "e2e_run_rows.row_id",
      "e2e_run_rows.run_id",
      "e2e_run_rows.table_name",
      "e2e_runs.apps",
      "e2e_runs.base_url",
      "e2e_runs.finished_at",
      "e2e_runs.git_sha",
      "e2e_runs.image_tag",
      "e2e_runs.notes",
      "e2e_runs.operator",
      "e2e_runs.run_id",
      "e2e_runs.started_at",
      "e2e_runs.status",
    ]);
  });

  it("denies anon and authenticated on both tables", async () => {
    for (const sub of [null, "user_someone"]) {
      const visible = await withClaims(sub, async (c) => {
        const runs = await c.query(
          "select count(*)::int as n from public.e2e_runs",
        );
        const rows = await c.query(
          "select count(*)::int as n from public.e2e_run_rows",
        );
        return [runs.rows[0].n, rows.rows[0].n];
      }).catch((e: Error) => e.message);
      // Either RLS hides everything (0 rows) or the grant is revoked (error).
      expect(
        visible === "permission denied for table e2e_runs" ||
          visible === "permission denied for table e2e_run_rows" ||
          JSON.stringify(visible) === "[0,0]",
      ).toBe(true);
      const write = await withClaims(sub, async (c) => {
        await c.query(
          `insert into public.e2e_runs (run_id, status, operator, git_sha, image_tag, base_url, apps)
           values ('e2e-20260927-0000-dead', 'running', 'x', 'y', 'z', 'w', array['auth'])`,
        );
        return "inserted";
      }).catch((e: Error) => e.message);
      expect(write).not.toBe("inserted");
    }
  });

  it("refuses a row without a run", async () => {
    const result = await withSuperuser(async (c) => {
      return c
        .query(
          `insert into public.e2e_run_rows (run_id, table_name, row_id) values ($1, 'products', 'p1')`,
          ["e2e-20260927-0000-none"],
        )
        .then(() => "inserted")
        .catch((e: Error) => e.message);
    });
    expect(result).toMatch(/violates foreign key constraint/);
  });

  it("refuses deleting a run that still owns rows", async () => {
    const result = await withSuperuser(async (c) => {
      await seedRun(c);
      await c.query(
        `insert into public.e2e_run_rows (run_id, table_name, row_id) values ($1, 'products', 'p1')`,
        [RUN],
      );
      return c
        .query(`delete from public.e2e_runs where run_id = $1`, [RUN])
        .then(() => "deleted")
        .catch((e: Error) => e.message);
    });
    expect(result).toMatch(/violates foreign key constraint/);
  });

  it("rejects an unknown status", async () => {
    const result = await withSuperuser(async (c) =>
      c
        .query(
          `insert into public.e2e_runs (run_id, status, operator, git_sha, image_tag, base_url, apps)
           values ($1, 'done', 'x', 'y', 'z', 'w', array['auth'])`,
          [RUN],
        )
        .then(() => "inserted")
        .catch((e: Error) => e.message),
    );
    expect(result).toMatch(/violates check constraint/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm supabase:start` (if not running) then `pnpm test:db -- tests/db/e2e-registry.test.ts`
Expected: FAIL — `exists with the expected columns` returns `[]`; the FK tests report `relation "public.e2e_run_rows" does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260927200000_e2e_run_registry.sql
-- Registry for manual production E2E runs. Every run mints a run_id and
-- records the rows it creates here so a run's leftovers are one query to
-- find and one command to delete. Service-role only: the app never reads
-- these, and a client must never learn that a row is test data.
-- Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §4.

create table if not exists public.e2e_runs (
  run_id      text primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null
              check (status in ('running', 'passed', 'failed', 'aborted')),
  operator    text not null,
  git_sha     text not null,
  image_tag   text not null,
  base_url    text not null,
  apps        text[] not null,
  notes       text
);

create table if not exists public.e2e_run_rows (
  run_id     text not null references public.e2e_runs (run_id) on delete restrict,
  table_name text not null,
  row_id     text not null,
  created_at timestamptz not null default now(),
  primary key (table_name, row_id)
);

create index if not exists e2e_run_rows_run_id_idx on public.e2e_run_rows (run_id);

alter table public.e2e_runs enable row level security;
alter table public.e2e_run_rows enable row level security;

-- Supabase's default privileges grant client roles table access and rely on
-- RLS to hide rows. With no policies that already yields zero rows, but
-- revoking removes the grant too, so tests/db/exposure-invariants keeps
-- seeing no client-readable column on these tables.
revoke all on table public.e2e_runs from anon, authenticated;
revoke all on table public.e2e_run_rows from anon, authenticated;
grant all on table public.e2e_runs to service_role;
grant all on table public.e2e_run_rows to service_role;

comment on table public.e2e_runs is
  'Manual production E2E runs (docs/superpowers/specs/2026-09-27-production-e2e-design.md). Service role only.';
comment on table public.e2e_run_rows is
  'Rows created by an E2E run, keyed by (table_name, row_id). table_name may be a storage prefix such as storage:receipts.';
```

- [ ] **Step 4: Reset the local database and run the test**

Run: `pnpm supabase:reset && pnpm test:db -- tests/db/e2e-registry.test.ts`
Expected: PASS 5/5.

- [ ] **Step 5: Run the whole database suite**

Run: `pnpm test:db`
Expected: PASS, including `exposure-invariants` (no client role can read the new tables) and `seed-data`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260927200000_e2e_run_registry.sql tests/db/e2e-registry.test.ts
git commit -m "feat(db): e2e run registry tables, service-role only [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Run id module

**Files:**

- Create: `scripts/lib/e2e-run-id.mjs`
- Test: `scripts/__tests__/e2e-run-id.test.mjs`

**Interfaces:**

- Produces: `mintRunId(now = new Date(), random = crypto.randomBytes) → string`, `RUN_ID_PATTERN` (RegExp `^e2e-\d{8}-\d{4}-[0-9a-f]{4}$`), `isRunId(value) → boolean`, `EMAIL_RUN_ID_PATTERN` (RegExp capturing the run id from an E2E email).

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/e2e-run-id.test.mjs
import { describe, expect, it } from "vitest";

import {
  EMAIL_RUN_ID_PATTERN,
  RUN_ID_PATTERN,
  isRunId,
  mintRunId,
} from "../lib/e2e-run-id.mjs";

describe("mintRunId", () => {
  it("formats as e2e-YYYYMMDD-HHmm-xxxx in UTC", () => {
    const id = mintRunId(new Date("2026-09-27T19:30:07Z"), () =>
      Buffer.from([0xa3, 0xf1]),
    );
    expect(id).toBe("e2e-20260927-1930-a3f1");
  });

  it("differs for two runs in the same minute", () => {
    const now = new Date("2026-09-27T19:30:00Z");
    const a = mintRunId(now, () => Buffer.from([0x00, 0x01]));
    const b = mintRunId(now, () => Buffer.from([0x00, 0x02]));
    expect(a).not.toBe(b);
  });

  it("matches its own pattern", () => {
    expect(RUN_ID_PATTERN.test(mintRunId())).toBe(true);
    expect(isRunId("e2e-20260927-1930-a3f1")).toBe(true);
    expect(isRunId("e2e-20260927-1930-A3F1")).toBe(false);
    expect(isRunId("e2e-1234567890")).toBe(false);
    expect(isRunId("")).toBe(false);
  });

  it("extracts the run id from an E2E email", () => {
    const m = EMAIL_RUN_ID_PATTERN.exec(
      "e2e-buyer-reports-e2e-20260927-1930-a3f1+clerk_test@example.com",
    );
    expect(m?.[1]).toBe("e2e-20260927-1930-a3f1");
    expect(
      EMAIL_RUN_ID_PATTERN.exec(
        "e2e-buyer-1727000000000+clerk_test@example.com",
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-run-id.test.mjs`
Expected: FAIL — `Cannot find module '../lib/e2e-run-id.mjs'`.

- [ ] **Step 3: Write the module**

```js
// scripts/lib/e2e-run-id.mjs
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-run-id.test.mjs`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-run-id.mjs scripts/__tests__/e2e-run-id.test.mjs
git commit -m "feat(e2e): run id format for production sessions [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Guard admits a live key only with the per-run acknowledgement

**Files:**

- Modify: `apps/auth/e2e/helpers/guardEnv.ts`
- Modify: `apps/auth/e2e/helpers/session.ts:53` (call site)
- Modify: `apps/store/e2e/auth.setup.ts:33`, `apps/store/e2e/auth.teardown.ts:27` (call sites)
- Test: `apps/auth/tests/guardEnv.test.ts`

**Interfaces:**

- Produces: `assertNotProductionClerk(secretKey: string, ctx?: GuardContext): void` where `GuardContext = { targetEnv?: string; runId?: string; ack?: string; baseUrl?: string }` and `PRODUCTION_HOST = "store.furrycolombia.com"`. Callers pass `productionGuardContext()` which reads `process.env.TARGET_ENV`, `E2E_RUN_ID`, `E2E_PRODUCTION_ACK` and the store URL from `resolveE2EAppUrls().store`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/auth/tests/guardEnv.test.ts
import { describe, expect, it } from "vitest";

import {
  PRODUCTION_HOST,
  assertNotProductionClerk,
} from "../e2e/helpers/guardEnv";

const RUN = "e2e-20260927-1930-a3f1";
const ok = {
  targetEnv: "prod",
  runId: RUN,
  ack: RUN,
  baseUrl: `https://${PRODUCTION_HOST}/store`,
};

describe("assertNotProductionClerk", () => {
  it("lets a development key through with no context", () => {
    expect(() => assertNotProductionClerk("sk_test_abc")).not.toThrow();
  });

  it("refuses a live key with no context, as before", () => {
    expect(() => assertNotProductionClerk("sk_live_abc")).toThrow(
      /refusing to run against a production Clerk instance/,
    );
  });

  it("admits a live key when env, ack and host all agree", () => {
    expect(() => assertNotProductionClerk("sk_live_abc", ok)).not.toThrow();
  });

  it.each([
    ["ack differs from run id", { ...ok, ack: "e2e-20260927-1930-ffff" }],
    ["ack set but run id unset", { ...ok, runId: undefined }],
    ["both empty strings", { ...ok, runId: "", ack: "" }],
    ["env is staging", { ...ok, targetEnv: "staging" }],
    ["host is staging", { ...ok, baseUrl: "https://store.ffxivbe.org/store" }],
    [
      "host is a lookalike",
      { ...ok, baseUrl: "https://store.furrycolombia.com.evil.net/" },
    ],
    ["host is localhost", { ...ok, baseUrl: "http://localhost:5050/store" }],
    ["base url missing", { ...ok, baseUrl: undefined }],
  ])("refuses a live key when %s", (_name, ctx) => {
    expect(() => assertNotProductionClerk("sk_live_abc", ctx)).toThrow(
      /refusing to run against a production Clerk instance/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter auth exec vitest run tests/guardEnv.test.ts`
Expected: FAIL — `PRODUCTION_HOST` is not exported; "admits a live key" throws.

- [ ] **Step 3: Rewrite the guard**

```ts
// apps/auth/e2e/helpers/guardEnv.ts
import path from "node:path";

export const PRODUCTION_HOST = "store.furrycolombia.com";

export interface GuardContext {
  targetEnv?: string;
  runId?: string;
  ack?: string;
  baseUrl?: string;
}

/**
 * E2E creates and deletes real Clerk users. Against a production instance
 * that would pollute real user data and count toward MRU, so a live key is
 * refused unless an operator has explicitly acknowledged THIS run:
 * `TARGET_ENV=prod`, `E2E_PRODUCTION_ACK` equal to the run id, and the base
 * URL pointing at the real production host. Anything less throws.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §7.
 */
export function assertNotProductionClerk(
  secretKey: string,
  ctx: GuardContext = {},
): void {
  if (!secretKey.startsWith("sk_live_")) return;
  if (isAcknowledgedProductionRun(ctx)) return;
  throw new Error(
    "[e2e] refusing to run against a production Clerk instance " +
      "(CLERK_SECRET_KEY starts with sk_live_). E2E creates and deletes " +
      "real users; point it at the development instance, or run it through " +
      "`pnpm e2e:prod`, which sets TARGET_ENV=prod and E2E_PRODUCTION_ACK " +
      "for one acknowledged run.",
  );
}

function isAcknowledgedProductionRun(ctx: GuardContext): boolean {
  if (ctx.targetEnv !== "prod") return false;
  if (!ctx.runId || !ctx.ack || ctx.runId !== ctx.ack) return false;
  if (!ctx.baseUrl) return false;
  try {
    return new URL(ctx.baseUrl).hostname === PRODUCTION_HOST;
  } catch {
    return false;
  }
}

/** The context every call site passes: read from the process, not guessed. */
export function productionGuardContext(): GuardContext {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- shared Node helper
  const { resolveE2EAppUrls } = require(
    path.resolve(__dirname, "../../../../scripts/app-url-resolver.js"),
  );
  return {
    targetEnv: process.env.TARGET_ENV,
    runId: process.env.E2E_RUN_ID,
    ack: process.env.E2E_PRODUCTION_ACK,
    baseUrl: resolveE2EAppUrls().store,
  };
}
```

- [ ] **Step 4: Update the three call sites**

In `apps/auth/e2e/helpers/session.ts` change the import and the call:

```ts
import { assertNotProductionClerk, productionGuardContext } from "./guardEnv";
// ...
assertNotProductionClerk(CLERK_SECRET_KEY_VALUE, productionGuardContext());
```

In `apps/store/e2e/auth.setup.ts` and `apps/store/e2e/auth.teardown.ts`:

```ts
import {
  assertNotProductionClerk,
  productionGuardContext,
} from "../../auth/e2e/helpers/guardEnv";
// ...
assertNotProductionClerk(CLERK_SECRET_KEY, productionGuardContext());
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter auth exec vitest run tests/guardEnv.test.ts tests/createTestUserOrdering.test.ts tests/autoCleanup.test.ts`
Expected: PASS (11 guard cases + the two existing files unchanged).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add apps/auth/e2e/helpers/guardEnv.ts apps/auth/e2e/helpers/session.ts apps/store/e2e/auth.setup.ts apps/store/e2e/auth.teardown.ts apps/auth/tests/guardEnv.test.ts
git commit -m "feat(e2e): guard admits a live Clerk key only for an acknowledged production run [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Row registration helper

**Files:**

- Create: `apps/auth/e2e/helpers/runRegistry.ts`
- Test: `apps/auth/tests/runRegistry.test.ts`

**Interfaces:**

- Produces: `currentRunId(): string | undefined`; `runScopedToken(label?: string): string` (the run id, or `Date.now()` as a string when no run); `registerRow(tableName: string, rowId: string): Promise<void>` (no-op without a run; never throws); `registrationFailures(): readonly string[]`; `RowRegistrar` type `(tableName: string, rowId: string) => Promise<void>` and `setRowRegistrar(fn)` for tests.

- [ ] **Step 1: Write the failing test**

```ts
// apps/auth/tests/runRegistry.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RUN = "e2e-20260927-1930-a3f1";

async function load() {
  vi.resetModules();
  return import("../e2e/helpers/runRegistry");
}

describe("runRegistry", () => {
  const fetchSpy = vi.fn();
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "srk";
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    delete process.env.E2E_RUN_ID;
    vi.unstubAllGlobals();
  });

  it("is a no-op without E2E_RUN_ID", async () => {
    const { registerRow, currentRunId, runScopedToken } = await load();
    expect(currentRunId()).toBeUndefined();
    await registerRow("products", "p1");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(runScopedToken()).toMatch(/^\d{13}$/);
  });

  it("posts one e2e_run_rows row per registration with the run id", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({ ok: true, status: 201, text: async () => "" });
    const { registerRow, runScopedToken } = await load();
    await registerRow("products", "p1");
    expect(runScopedToken()).toBe(RUN);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:54321/rest/v1/e2e_run_rows");
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe("srk");
    expect(init.headers.Prefer).toContain("resolution=ignore-duplicates");
    expect(JSON.parse(init.body)).toEqual({
      run_id: RUN,
      table_name: "products",
      row_id: "p1",
    });
  });

  it("records a failure instead of throwing into the test", async () => {
    process.env.E2E_RUN_ID = RUN;
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    });
    const { registerRow, registrationFailures } = await load();
    await expect(registerRow("orders", "o1")).resolves.toBeUndefined();
    expect(registrationFailures()).toEqual(["orders/o1: HTTP 500 boom"]);
  });

  it("lets a test swap the registrar", async () => {
    process.env.E2E_RUN_ID = RUN;
    const { registerRow, setRowRegistrar } = await load();
    const fake = vi.fn(async () => undefined);
    setRowRegistrar(fake);
    await registerRow("clerk_users", "user_1");
    expect(fake).toHaveBeenCalledWith("clerk_users", "user_1");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter auth exec vitest run tests/runRegistry.test.ts`
Expected: FAIL — `Cannot find module '../e2e/helpers/runRegistry'`.

- [ ] **Step 3: Write the helper**

```ts
// apps/auth/e2e/helpers/runRegistry.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter auth exec vitest run tests/runRegistry.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/auth/e2e/helpers/runRegistry.ts apps/auth/tests/runRegistry.test.ts
git commit -m "feat(e2e): row registration for production runs [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Helpers stamp the run id, register rows, and mint sessions on production

**Files:**

- Create: `apps/auth/e2e/helpers/clerkSession.ts`
- Modify: `apps/auth/e2e/helpers/session.ts` (`adminInsert`, `createTestUser`)
- Modify: `apps/auth/e2e/helpers/receiptFixtures.ts` (`uploadTestReceipt`)
- Modify: `apps/store/e2e/auth.setup.ts` (email, registration)
- Test: `apps/auth/tests/clerkSession.test.ts`, `apps/auth/tests/createTestUserRunId.test.ts`

**Interfaces:**

- Consumes: `registerRow`, `runScopedToken` from Task 4.
- Produces: `mintSessionToken(args: { secretKey: string; domain?: string; userId: string; fetchImpl?: typeof fetch }): Promise<string>` in `clerkSession.ts`. `createTestUser` keeps its signature and return type.

- [ ] **Step 1: Write the failing test for session minting**

```ts
// apps/auth/tests/clerkSession.test.ts
import { describe, expect, it, vi } from "vitest";

import { mintSessionToken } from "../e2e/helpers/clerkSession";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: (init.status ?? 200) < 300,
    status: init.status ?? 200,
    headers: { get: (k: string) => init.headers?.[k.toLowerCase()] ?? null },
    json: async () => body,
  } as unknown as Response;
}

describe("mintSessionToken", () => {
  it("uses the Backend API session on a development key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "sess_1" }))
      .mockResolvedValueOnce(jsonResponse({ jwt: "dev.jwt" }));
    const jwt = await mintSessionToken({
      secretKey: "sk_test_x",
      userId: "user_1",
      fetchImpl,
    });
    expect(jwt).toBe("dev.jwt");
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.clerk.com/v1/sessions",
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://api.clerk.com/v1/sessions/sess_1/tokens",
    );
  });

  it("uses a sign-in token redeemed through the Frontend API on a live key", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tkt" }))
      .mockResolvedValueOnce(
        jsonResponse(
          { response: { created_session_id: "sess_9" } },
          { headers: { authorization: "client_abc" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ jwt: "live.jwt" }));
    const jwt = await mintSessionToken({
      secretKey: "sk_live_x",
      domain: "clerk.furrycolombia.com",
      userId: "user_1",
      fetchImpl,
    });
    expect(jwt).toBe("live.jwt");
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.clerk.com/v1/sign_in_tokens",
    );
    expect(fetchImpl.mock.calls[1][0]).toBe(
      "https://clerk.furrycolombia.com/v1/client/sign_ins?_is_native=1",
    );
    expect(fetchImpl.mock.calls[2][0]).toBe(
      "https://clerk.furrycolombia.com/v1/client/sessions/sess_9/tokens?_is_native=1",
    );
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe("client_abc");
  });

  it("refuses a live key without a domain before any request", async () => {
    const fetchImpl = vi.fn();
    await expect(
      mintSessionToken({ secretKey: "sk_live_x", userId: "user_1", fetchImpl }),
    ).rejects.toThrow(/CLERK_DOMAIN is required/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws, never exits, when the sign-in does not create a session", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: "tkt" }))
      .mockResolvedValueOnce(
        jsonResponse({ response: {} }, { headers: { authorization: "c" } }),
      );
    await expect(
      mintSessionToken({
        secretKey: "sk_live_x",
        domain: "clerk.furrycolombia.com",
        userId: "user_1",
        fetchImpl,
      }),
    ).rejects.toThrow(/without creating a session/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter auth exec vitest run tests/clerkSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `clerkSession.ts`** (a TypeScript port of `aeleos/scripts/run-cloud-idp.mjs`'s `mintSessionToken`)

```ts
// apps/auth/e2e/helpers/clerkSession.ts
/**
 * Mint a real Clerk session JWT for a user without a browser.
 *
 * Development instances allow `POST /v1/sessions` on the Backend API.
 * Production instances refuse it ("Request only valid for development
 * instances"), so there the Backend API issues a sign-in token and the
 * Frontend API consumes it in native mode (`_is_native=1`, client token in
 * the `Authorization` header) and signs the session JWT. The key prefix
 * picks the path. Every failure throws — the caller owns a user to delete.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §7.
 */

const BACKEND_API = "https://api.clerk.com/v1";

export interface MintArgs {
  secretKey: string;
  domain?: string;
  userId: string;
  fetchImpl?: typeof fetch;
}

export async function mintSessionToken({
  secretKey,
  domain,
  userId,
  fetchImpl = fetch,
}: MintArgs): Promise<string> {
  const backend = async (path: string, body: unknown) => {
    const res = await fetchImpl(`${BACKEND_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!res.ok) {
      throw new Error(
        `${path} -> HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return json;
  };

  if (!secretKey.startsWith("sk_live_")) {
    const session = await backend("/sessions", { user_id: userId });
    const minted = await backend(
      `/sessions/${session.id as string}/tokens`,
      {},
    );
    return (minted.jwt ?? minted.token) as string;
  }

  if (!domain) {
    throw new Error(
      "CLERK_DOMAIN is required to mint on a production instance.",
    );
  }
  const ticket = await backend("/sign_in_tokens", {
    user_id: userId,
    expires_in_seconds: 300,
  });
  const fapi = `https://${domain}/v1`;
  const signIn = await fetchImpl(`${fapi}/client/sign_ins?_is_native=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      strategy: "ticket",
      ticket: ticket.token as string,
    }),
  });
  const clientToken = signIn.headers.get("authorization");
  const signInBody = (await signIn.json().catch(() => ({}))) as {
    response?: { created_session_id?: string };
  };
  if (!signIn.ok || !clientToken) {
    throw new Error(
      `${fapi}/client/sign_ins -> HTTP ${signIn.status}: ${JSON.stringify(signInBody).slice(0, 200)}`,
    );
  }
  const sessionId = signInBody.response?.created_session_id;
  if (!sessionId) {
    throw new Error("the sign-in completed without creating a session.");
  }
  const minted = await fetchImpl(
    `${fapi}/client/sessions/${sessionId}/tokens?_is_native=1`,
    { method: "POST", headers: { Authorization: clientToken } },
  );
  const mintedBody = (await minted.json().catch(() => ({}))) as {
    jwt?: string;
  };
  if (!minted.ok || !mintedBody.jwt) {
    throw new Error(
      `${fapi}/client/sessions/…/tokens -> HTTP ${minted.status}`,
    );
  }
  return mintedBody.jwt;
}
```

- [ ] **Step 4: Run the minting test**

Run: `pnpm --filter auth exec vitest run tests/clerkSession.test.ts`
Expected: PASS 4/4.

- [ ] **Step 5: Write the failing test for the run-scoped email and registration**

The existing `createTestUserOrdering.test.ts` mocks the profile RPC to reject, so this gets its own file with a succeeding RPC and a stubbed `fetch` for the development-key session mint:

```ts
// apps/auth/tests/createTestUserRunId.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    users: {
      createUser: vi.fn(async () => ({ id: "user_1" })),
      deleteUser: vi.fn(async () => {}),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: vi.fn(async () => ({ data: { id: "profile_1" }, error: null })),
  }),
}));

const RUN = "e2e-20260927-1930-a3f1";

describe("createTestUser inside a production run", () => {
  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    process.env.CLERK_SECRET_KEY ??= "sk_test_stub";
    process.env.E2E_RUN_ID = RUN;
    process.env.E2E_PRODUCTION_ACK = RUN;
    // Development-key mint: POST /sessions then POST /sessions/:id/tokens.
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: "sess_1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ jwt: "dev.jwt" }),
        }),
    );
  });
  afterEach(() => {
    delete process.env.E2E_RUN_ID;
    delete process.env.E2E_PRODUCTION_ACK;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stamps the run id into the email and registers both halves of the user", async () => {
    const { setRowRegistrar } = await import("../e2e/helpers/runRegistry");
    const registered: string[] = [];
    setRowRegistrar(async (t, id) => {
      registered.push(`${t}:${id}`);
    });
    const { createTestUser } = await import("../e2e/helpers/session");

    const user = await createTestUser("buyer");

    expect(user.email).toBe(`e2e-buyer-${RUN}+clerk_test@example.com`);
    expect(user.accessToken).toBe("dev.jwt");
    expect(registered).toEqual([
      "clerk_users:user_1",
      "user_profiles:profile_1",
    ]);
  });
});
```

Run: `pnpm --filter auth exec vitest run tests/createTestUserRunId.test.ts`
Expected: FAIL — email carries a 13-digit timestamp; `registered` is `[]`; `accessToken` comes from the `@clerk/backend` sessions mock (which this file does not provide, so the call throws).

- [ ] **Step 6: Wire `session.ts`**

In `apps/auth/e2e/helpers/session.ts`:

```ts
import { mintSessionToken } from "./clerkSession";
import { registerRow, runScopedToken } from "./runRegistry";
```

`adminInsert` registers what it returns (after `const rows = await res.json();`):

```ts
const row = rows[0] as Record<string, unknown>;
if (typeof row?.id === "string") await registerRow(table, row.id);
return row;
```

`createTestUser`: the email line becomes

```ts
const email = `e2e-${label}-${runScopedToken()}+clerk_test@example.com`;
```

after `registerClerkUser({ clerkUserId: clerkUser.id, email });` add

```ts
await registerRow("clerk_users", clerkUser.id);
```

after `attachProfileId(clerkUser.id, profileId);` add

```ts
await registerRow("user_profiles", profileId);
```

and replace the two Backend-API session lines with

```ts
// A real backend session — see the `accessToken` doc comment on TestUser.
// Production instances refuse Backend-API sessions; clerkSession.ts picks
// the path by key prefix.
const jwt = await mintSessionToken({
  secretKey: CLERK_SECRET_KEY_VALUE,
  domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN,
  userId: clerkUser.id,
});

return {
  userId: profileId,
  email,
  clerkUserId: clerkUser.id,
  accessToken: jwt,
};
```

- [ ] **Step 7: Register receipt uploads**

In `apps/auth/e2e/helpers/receiptFixtures.ts`, import `registerRow` and, at the end of `uploadTestReceipt` after the `if (!response.ok)` block:

```ts
// `storagePath` is `<order_id>/<file>`; prune deletes the whole prefix.
await registerRow("storage:receipts", storagePath.split("/")[0]);
```

- [ ] **Step 8: Stamp and register in the store's auth setup**

In `apps/store/e2e/auth.setup.ts`:

```ts
import {
  registerRow,
  runScopedToken,
} from "../../auth/e2e/helpers/runRegistry";
// ...
const email = `e2e-${runScopedToken()}+clerk_test@example.com`;
// ...after createUser:
await registerRow("clerk_users", clerkUser.id);
```

Right after the block that reads the profile back (`const { data: profile, error } = await supabaseAdmin.from("user_profiles")…` and its `throw`), register the profile id:

```ts
await registerRow("user_profiles", profile.id);
```

Right after `if (productError || !seededProduct) throw …`, register the product:

```ts
await registerRow("products", seededProduct.id);
```

`auth.teardown.ts` needs no change: it deletes the product and the user by the ids the setup wrote to disk, and prune covers the production case.

- [ ] **Step 9: Run the auth tests and typecheck**

Run: `pnpm --filter auth exec vitest run tests/createTestUserRunId.test.ts tests/createTestUserOrdering.test.ts tests/autoCleanup.test.ts tests/clerkSession.test.ts tests/runRegistry.test.ts tests/guardEnv.test.ts && pnpm typecheck`
Expected: PASS; no type errors.

- [ ] **Step 10: Prove nothing changed for staging**

Run: `pnpm e2e:staging --app auth -- apps/auth/e2e/permission-management.spec.ts`
Expected: PASS, emails still `e2e-<label>-<13 digits>+clerk_test@example.com` in the log (no run id, no registry calls).

- [ ] **Step 11: Commit**

```bash
git add apps/auth/e2e/helpers/clerkSession.ts apps/auth/e2e/helpers/session.ts apps/auth/e2e/helpers/receiptFixtures.ts apps/store/e2e/auth.setup.ts apps/auth/tests/clerkSession.test.ts apps/auth/tests/createTestUserRunId.test.ts
git commit -m "feat(e2e): helpers stamp the run id, register rows, mint sessions on production [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Prune plan (pure)

**Files:**

- Create: `scripts/lib/e2e-prod-plan.mjs`
- Test: `scripts/__tests__/e2e-prod-plan.test.mjs`

**Interfaces:**

- Consumes: `isRunId`, `EMAIL_RUN_ID_PATTERN` from Task 2.
- Produces: `buildPrunePlan({ runId, rows, profiles, orders, products, clerkUsers }) → PruneStep[]` where inputs are `rows: {table_name,row_id}[]`, `profiles: {id}[]` (the run's `user_profiles`), `orders: {id,user_id}[]` (all orders owned by those profiles), `products: {id,seller_id,slug}[]` (products owned by those profiles or whose slug starts with `e2e-<runId>` or registered), `clerkUsers: {id,email}[]` (every production Clerk user); each step is `{ kind: 'storage'|'orders'|'rows'|'products'|'profiles'|'clerk', ids: string[] }` in spec §6 order. Also `runIdFromEmail(email) → string | null`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/e2e-prod-plan.test.mjs
import { describe, expect, it } from "vitest";

import { buildPrunePlan, runIdFromEmail } from "../lib/e2e-prod-plan.mjs";

const RUN = "e2e-20260927-1930-a3f1";
const OTHER = "e2e-20260927-1800-0000";

const base = {
  runId: RUN,
  rows: [
    { table_name: "clerk_users", row_id: "user_a" },
    { table_name: "user_profiles", row_id: "prof_a" },
    { table_name: "products", row_id: "prod_1" },
    { table_name: "storage:receipts", row_id: "order_1" },
    { table_name: "user_permissions", row_id: "perm_1" },
  ],
  profiles: [{ id: "prof_a" }],
  orders: [{ id: "order_1", user_id: "prof_a" }],
  products: [
    { id: "prod_1", seller_id: "prof_a", slug: `e2e-${RUN}-x` },
    { id: "prod_ui", seller_id: "prof_a", slug: "ui-main-1" },
  ],
  clerkUsers: [
    { id: "user_a", email: `e2e-buyer-${RUN}+clerk_test@example.com` },
    { id: "user_other", email: `e2e-buyer-${OTHER}+clerk_test@example.com` },
    { id: "user_real", email: "someone@gmail.com" },
    { id: "user_orphan", email: `e2e-seller-${RUN}+clerk_test@example.com` },
  ],
};

describe("buildPrunePlan", () => {
  it("orders the steps storage → orders → rows → products → profiles → clerk", () => {
    expect(buildPrunePlan(base).map((s) => s.kind)).toEqual([
      "storage",
      "orders",
      "rows",
      "products",
      "profiles",
      "clerk",
    ]);
  });

  it("deletes receipts for registered prefixes and for the run's orders, once", () => {
    const storage = buildPrunePlan(base).find((s) => s.kind === "storage");
    expect(storage.ids).toEqual(["order_1"]);
  });

  it("deletes products owned by the run's sellers even when the UI created them", () => {
    const products = buildPrunePlan(base).find((s) => s.kind === "products");
    expect(products.ids.sort()).toEqual(["prod_1", "prod_ui"]);
  });

  it("skips registered rows already covered by cascade or by a later step", () => {
    const rows = buildPrunePlan(base).find((s) => s.kind === "rows");
    // user_permissions cascades from user_profiles; products, profiles and
    // clerk users have their own steps; storage has its own step.
    expect(rows.ids).toEqual([]);
  });

  it("includes a clerk user with no profile when its email carries the run id", () => {
    const clerk = buildPrunePlan(base).find((s) => s.kind === "clerk");
    expect(clerk.ids.sort()).toEqual(["user_a", "user_orphan"]);
  });

  it("never touches another run's user or a real user", () => {
    const clerk = buildPrunePlan(base).find((s) => s.kind === "clerk");
    expect(clerk.ids).not.toContain("user_other");
    expect(clerk.ids).not.toContain("user_real");
  });

  it("refuses a malformed run id", () => {
    expect(() => buildPrunePlan({ ...base, runId: "e2e-%" })).toThrow(
      /not a run id/,
    );
  });
});

describe("runIdFromEmail", () => {
  it("reads the run id and rejects timestamps", () => {
    expect(runIdFromEmail(`e2e-x-${RUN}+clerk_test@example.com`)).toBe(RUN);
    expect(
      runIdFromEmail("e2e-x-1727000000000+clerk_test@example.com"),
    ).toBeNull();
    expect(runIdFromEmail("someone@gmail.com")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-plan.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

```js
// scripts/lib/e2e-prod-plan.mjs
/**
 * Pure planning for `scripts/e2e-prod-prune.mjs`: given what the registry
 * and the database say about one run, produce the ordered delete steps.
 * No I/O here, so the order and the positive-match rule are unit-tested.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §6.
 */
import { EMAIL_RUN_ID_PATTERN, isRunId } from "./e2e-run-id.mjs";

/** Tables whose rows disappear when their owner does; never deleted directly. */
const CASCADES_FROM_OWNER = new Set([
  "user_permissions",
  "orders",
  "order_items",
  "check_ins",
  "ticket_transfers",
  "product_reviews",
  "seller_admins",
  "seller_payment_methods",
]);

/** Kinds with a dedicated step; registered rows of these are not re-deleted. */
const OWN_STEP = new Set([
  "clerk_users",
  "user_profiles",
  "products",
  "storage:receipts",
]);

export function runIdFromEmail(email) {
  const m = EMAIL_RUN_ID_PATTERN.exec(email ?? "");
  return m ? m[1] : null;
}

export function buildPrunePlan({
  runId,
  rows,
  profiles,
  orders,
  products,
  clerkUsers,
}) {
  if (!isRunId(runId)) throw new Error(`"${runId}" is not a run id`);

  const profileIds = new Set(profiles.map((p) => p.id));
  const orderIds = orders
    .filter((o) => profileIds.has(o.user_id))
    .map((o) => o.id);

  const storagePrefixes = new Set(orderIds);
  for (const r of rows) {
    if (r.table_name === "storage:receipts") storagePrefixes.add(r.row_id);
  }

  const registeredProducts = rows
    .filter((r) => r.table_name === "products")
    .map((r) => r.row_id);
  const productIds = new Set(registeredProducts);
  for (const p of products) {
    if (profileIds.has(p.seller_id)) productIds.add(p.id);
    if (typeof p.slug === "string" && p.slug.startsWith(`e2e-${runId}`))
      productIds.add(p.id);
  }

  // Registered rows that still need their own delete: nothing owned by a
  // profile (cascade), nothing with a dedicated step. Newest first, so a
  // dependent row goes before what it depends on.
  const leftoverRows = [...rows]
    .reverse()
    .filter(
      (r) =>
        !OWN_STEP.has(r.table_name) && !CASCADES_FROM_OWNER.has(r.table_name),
    )
    .map((r) => `${r.table_name}:${r.row_id}`);

  const clerkIds = clerkUsers
    .filter((u) => runIdFromEmail(u.email) === runId)
    .map((u) => u.id);
  for (const r of rows) {
    if (r.table_name === "clerk_users" && !clerkIds.includes(r.row_id))
      clerkIds.push(r.row_id);
  }

  return [
    { kind: "storage", ids: [...storagePrefixes] },
    { kind: "orders", ids: orderIds },
    { kind: "rows", ids: leftoverRows },
    { kind: "products", ids: [...productIds] },
    { kind: "profiles", ids: [...profileIds] },
    { kind: "clerk", ids: clerkIds },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-plan.test.mjs`
Expected: PASS 8/8.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/e2e-prod-plan.mjs scripts/__tests__/e2e-prod-plan.test.mjs
git commit -m "feat(e2e): pure prune plan for a production run [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Registry I/O module, prune script and audit script

**Files:**

- Create: `scripts/lib/e2e-prod-registry.mjs`
- Create: `scripts/e2e-prod-prune.mjs`
- Create: `scripts/e2e-prod-audit.mjs`
- Test: `scripts/__tests__/e2e-prod-registry.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**

- Consumes: `buildPrunePlan`, `runIdFromEmail` (Task 6); `isRunId` (Task 2).
- Produces (all in `e2e-prod-registry.mjs`, each taking `{ fetchImpl = fetch }` in an options object for tests):
  - `createRegistry({ supabaseUrl, serviceRoleKey, clerkSecretKey, fetchImpl })` returning an object with:
    - `createRun({ runId, operator, gitSha, imageTag, baseUrl, apps })`
    - `finishRun(runId, status, notes)`
    - `listRuns()` → rows of `e2e_runs` newest first, each with `leftover_rows` count
    - `runningRuns()` → `e2e_runs` rows with `status = running`
    - `rowsForRun(runId)`, `profilesForRun(runId)`, `ordersForProfiles(ids)`, `productsForRun(runId, profileIds)`
    - `listClerkUsers()` → `{ id, email, created_at }[]` (paged, 100 per page)
    - `executePlan(plan, { dryRun })` → `{ deleted: Record<kind, number>, failures: string[] }`
- Scripts: `node scripts/e2e-prod-prune.mjs --run <id> | --older-than-hours <n> [--dry-run] [--env prod]`; `node scripts/e2e-prod-audit.mjs [--env prod]`.

- [ ] **Step 1: Write the failing test for the I/O module**

```js
// scripts/__tests__/e2e-prod-registry.test.mjs
import { describe, expect, it, vi } from "vitest";

import { createRegistry } from "../lib/e2e-prod-registry.mjs";

const RUN = "e2e-20260927-1930-a3f1";

function ok(body = [], status = 200) {
  return {
    ok: status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function registry(fetchImpl) {
  return createRegistry({
    supabaseUrl: "https://db.example.com",
    serviceRoleKey: "srk",
    clerkSecretKey: "sk_live_x",
    fetchImpl,
  });
}

describe("e2e-prod-registry", () => {
  it("creates a run row with status running", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ run_id: RUN }], 201));
    await registry(fetchImpl).createRun({
      runId: RUN,
      operator: "me@example.com",
      gitSha: "abc1234",
      imageTag: "ghcr.io/x/y:abc1234-testids",
      baseUrl: "https://store.furrycolombia.com",
      apps: ["auth"],
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://db.example.com/rest/v1/e2e_runs");
    expect(JSON.parse(init.body)).toMatchObject({
      run_id: RUN,
      status: "running",
    });
    expect(init.headers.apikey).toBe("srk");
  });

  it("finishRun patches status, finished_at and notes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([], 204));
    await registry(fetchImpl).finishRun(RUN, "failed", "2 leftovers");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://db.example.com/rest/v1/e2e_runs?run_id=eq.${RUN}`,
    );
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.status).toBe("failed");
    expect(body.notes).toBe("2 leftovers");
    expect(typeof body.finished_at).toBe("string");
  });

  it("lists clerk users across pages", async () => {
    const page = (n) =>
      Array.from({ length: n }, (_, i) => ({
        id: `user_${i}`,
        email_addresses: [
          { id: "e", email_address: `e2e-x-${RUN}+clerk_test@example.com` },
        ],
        primary_email_address_id: "e",
        created_at: 1,
      }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok(page(100)))
      .mockResolvedValueOnce(ok(page(3)));
    const users = await registry(fetchImpl).listClerkUsers();
    expect(users).toHaveLength(103);
    expect(users[0].email).toBe(`e2e-x-${RUN}+clerk_test@example.com`);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.clerk.com/v1/users?limit=100&offset=0",
    );
  });

  it("executePlan in dry-run issues no request and counts what it would delete", async () => {
    const fetchImpl = vi.fn();
    const result = await registry(fetchImpl).executePlan(
      [
        { kind: "storage", ids: ["order_1"] },
        { kind: "orders", ids: ["order_1"] },
        { kind: "rows", ids: ["user_permissions:perm_1"] },
        { kind: "products", ids: ["prod_1"] },
        { kind: "profiles", ids: ["prof_1"] },
        { kind: "clerk", ids: ["user_1"] },
      ],
      { dryRun: true },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.deleted).toEqual({
      storage: 1,
      orders: 1,
      rows: 1,
      products: 1,
      profiles: 1,
      clerk: 1,
    });
  });

  it("executePlan tolerates a row already gone and reports real failures", async () => {
    const fetchImpl = vi
      .fn()
      // storage list (empty prefix → nothing to delete)
      .mockResolvedValueOnce(ok([]))
      // orders delete → 200 (PostgREST returns 200 with an empty array when nothing matched)
      .mockResolvedValueOnce(ok([]))
      // products delete → 500
      .mockResolvedValueOnce(ok({ message: "boom" }, 500))
      // profiles delete → 200
      .mockResolvedValueOnce(ok([]))
      // clerk delete → 404 (already deleted)
      .mockResolvedValueOnce(ok({}, 404));
    const result = await registry(fetchImpl).executePlan(
      [
        { kind: "storage", ids: ["order_1"] },
        { kind: "orders", ids: ["order_1"] },
        { kind: "rows", ids: [] },
        { kind: "products", ids: ["prod_1"] },
        { kind: "profiles", ids: ["prof_1"] },
        { kind: "clerk", ids: ["user_1"] },
      ],
      { dryRun: false },
    );
    expect(result.failures).toEqual(["products prod_1: HTTP 500"]);
    expect(result.deleted.clerk).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-registry.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the I/O module**

```js
// scripts/lib/e2e-prod-registry.mjs
/**
 * I/O for the production E2E registry: PostgREST with the service role for
 * `e2e_runs` / `e2e_run_rows` and the app tables, Supabase Storage for
 * receipts, Clerk's Backend API for users. Every delete here is by explicit
 * id; the ids come from scripts/lib/e2e-prod-plan.mjs, which is where the
 * positive-match rule lives and is tested.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §6, §9.
 */

const CLERK_API = "https://api.clerk.com/v1";
const CLERK_PAGE = 100;

export function createRegistry({
  supabaseUrl,
  serviceRoleKey,
  clerkSecretKey,
  fetchImpl = fetch,
}) {
  const sbHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  async function rest(method, path, body, extraHeaders = {}) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: { ...sbHeaders, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok)
      throw new Error(
        `${method} ${path} -> HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    return text ? JSON.parse(text) : [];
  }

  async function clerk(method, path) {
    const res = await fetchImpl(`${CLERK_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        Accept: "application/json",
        "User-Agent": "libra-e2e-prod",
      },
    });
    if (res.status === 404 && method === "DELETE") return null; // already gone
    if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const inList = (ids) => `in.(${ids.map((i) => `"${i}"`).join(",")})`;

  return {
    async createRun({ runId, operator, gitSha, imageTag, baseUrl, apps }) {
      return rest(
        "POST",
        "e2e_runs",
        {
          run_id: runId,
          status: "running",
          operator,
          git_sha: gitSha,
          image_tag: imageTag,
          base_url: baseUrl,
          apps,
        },
        { Prefer: "return=representation" },
      );
    },

    async finishRun(runId, status, notes = null) {
      return rest("PATCH", `e2e_runs?run_id=eq.${runId}`, {
        status,
        notes,
        finished_at: new Date().toISOString(),
      });
    },

    async listRuns() {
      const runs = await rest("GET", "e2e_runs?select=*&order=started_at.desc");
      const rows = await rest("GET", "e2e_run_rows?select=run_id");
      const counts = new Map();
      for (const r of rows)
        counts.set(r.run_id, (counts.get(r.run_id) ?? 0) + 1);
      return runs.map((r) => ({
        ...r,
        leftover_rows: counts.get(r.run_id) ?? 0,
      }));
    },

    async runningRuns() {
      return rest("GET", "e2e_runs?select=*&status=eq.running");
    },

    async rowsForRun(runId) {
      return rest(
        "GET",
        `e2e_run_rows?select=table_name,row_id,created_at&run_id=eq.${runId}&order=created_at.asc`,
      );
    },

    async profilesForRun(runId) {
      const rows = await rest(
        "GET",
        `e2e_run_rows?select=row_id&run_id=eq.${runId}&table_name=eq.user_profiles`,
      );
      return rows.map((r) => ({ id: r.row_id }));
    },

    async ordersForProfiles(profileIds) {
      if (profileIds.length === 0) return [];
      return rest(
        "GET",
        `orders?select=id,user_id&user_id=${inList(profileIds)}`,
      );
    },

    async productsForRun(runId, profileIds) {
      const bySeller = profileIds.length
        ? await rest(
            "GET",
            `products?select=id,seller_id,slug&seller_id=${inList(profileIds)}`,
          )
        : [];
      const bySlug = await rest(
        "GET",
        `products?select=id,seller_id,slug&slug=like.e2e-${runId}*`,
      );
      const seen = new Map();
      for (const p of [...bySeller, ...bySlug]) seen.set(p.id, p);
      return [...seen.values()];
    },

    async listClerkUsers() {
      const users = [];
      for (let offset = 0; ; offset += CLERK_PAGE) {
        const page = await clerk(
          "GET",
          `/users?limit=${CLERK_PAGE}&offset=${offset}`,
        );
        if (!page?.length) break;
        for (const u of page) {
          const primary =
            (u.email_addresses ?? []).find(
              (a) => a.id === u.primary_email_address_id,
            ) ?? u.email_addresses?.[0];
          users.push({
            id: u.id,
            email: primary?.email_address ?? "",
            created_at: u.created_at ?? 0,
          });
        }
        if (page.length < CLERK_PAGE) break;
      }
      return users;
    },

    async deleteStoragePrefix(prefix) {
      const listed = await fetchImpl(
        `${supabaseUrl}/storage/v1/object/list/receipts`,
        {
          method: "POST",
          headers: sbHeaders,
          body: JSON.stringify({ prefix: `${prefix}/`, limit: 1000 }),
        },
      );
      const objects = listed.ok ? await listed.json() : [];
      const names = (Array.isArray(objects) ? objects : []).map(
        (o) => `${prefix}/${o.name}`,
      );
      if (names.length === 0) return 0;
      const res = await fetchImpl(`${supabaseUrl}/storage/v1/object/receipts`, {
        method: "DELETE",
        headers: sbHeaders,
        body: JSON.stringify({ prefixes: names }),
      });
      if (!res.ok)
        throw new Error(`storage delete ${prefix} -> HTTP ${res.status}`);
      return names.length;
    },

    /**
     * Runs the plan in order. `dryRun` performs no request. A failure on one
     * id is recorded and the plan continues: one stuck row must not strand
     * the rest, and the caller decides what a non-empty `failures` means.
     */
    async executePlan(plan, { dryRun }) {
      const deleted = {};
      const failures = [];
      for (const step of plan) {
        deleted[step.kind] = 0;
        for (const id of step.ids) {
          if (dryRun) {
            deleted[step.kind] += 1;
            continue;
          }
          try {
            switch (step.kind) {
              case "storage":
                await this.deleteStoragePrefix(id);
                break;
              case "orders":
                await rest("DELETE", `orders?id=eq.${id}`);
                break;
              case "rows": {
                const [table, rowId] = id.split(":");
                await rest("DELETE", `${table}?id=eq.${rowId}`);
                break;
              }
              case "products":
                await rest("DELETE", `products?id=eq.${id}`);
                break;
              case "profiles":
                await rest("DELETE", `user_profiles?id=eq.${id}`);
                break;
              case "clerk":
                await clerk("DELETE", `/users/${id}`);
                break;
              default:
                throw new Error(`unknown step kind ${step.kind}`);
            }
            deleted[step.kind] += 1;
          } catch (error) {
            const status = /HTTP (\d+)/.exec(error.message)?.[1];
            failures.push(
              `${step.kind} ${id}: ${status ? `HTTP ${status}` : error.message}`,
            );
          }
        }
      }
      return { deleted, failures };
    },

    async clearRunRows(runId) {
      return rest("DELETE", `e2e_run_rows?run_id=eq.${runId}`);
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-registry.test.mjs`
Expected: PASS 5/5.

- [ ] **Step 5: Write the prune script**

```js
#!/usr/bin/env node
// scripts/e2e-prod-prune.mjs
/**
 * Delete everything one production E2E run created, by run id only.
 *
 *   node scripts/e2e-prod-prune.mjs --run <run_id> [--dry-run]
 *   node scripts/e2e-prod-prune.mjs --older-than-hours <n> [--dry-run]
 *
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §6.
 */
import { isRunId } from "./lib/e2e-run-id.mjs";
import { buildPrunePlan } from "./lib/e2e-prod-plan.mjs";
import { createRegistry } from "./lib/e2e-prod-registry.mjs";
import { loadEnv } from "./load-env.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const dryRun = args.includes("--dry-run");
const runArg = flag("--run");
const olderThanHours = Number(flag("--older-than-hours") ?? NaN);
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

export async function pruneRun(reg, runId, { dryRun: dry }) {
  const rows = await reg.rowsForRun(runId);
  const profiles = await reg.profilesForRun(runId);
  const orders = await reg.ordersForProfiles(profiles.map((p) => p.id));
  const products = await reg.productsForRun(
    runId,
    profiles.map((p) => p.id),
  );
  const clerkUsers = await reg.listClerkUsers();
  const plan = buildPrunePlan({
    runId,
    rows,
    profiles,
    orders,
    products,
    clerkUsers,
  });

  console.log(`\n${dry ? "DRY RUN " : ""}prune ${runId}`);
  for (const step of plan)
    console.log(`  ${step.kind.padEnd(9)} ${step.ids.length}`);

  const result = await reg.executePlan(plan, { dryRun: dry });
  if (!dry && result.failures.length === 0) await reg.clearRunRows(runId);
  for (const f of result.failures) console.log(`  FAIL ${f}`);
  return result;
}

const targets = [];
if (runArg) targets.push(runArg);
else {
  const cutoff = Date.now() - olderThanHours * 3_600_000;
  for (const r of await registry.listRuns()) {
    if (
      new Date(r.started_at).getTime() < cutoff &&
      (r.leftover_rows > 0 || r.status === "running")
    )
      targets.push(r.run_id);
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
    const [run] = (await registry.listRuns()).filter((r) => r.run_id === runId);
    if (run?.status === "running")
      await registry.finishRun(runId, "aborted", "pruned by hand");
    else if (result.failures.length > 0)
      await registry.finishRun(
        runId,
        "failed",
        `prune left ${result.failures.length} item(s)`,
      );
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 6: Write the audit script**

```js
#!/usr/bin/env node
// scripts/e2e-prod-audit.mjs
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

const args = process.argv.slice(2);
const envFlag = args.indexOf("--env");
loadEnv(envFlag === -1 ? "prod" : args[envFlag + 1]);

const registry = createRegistry({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
});

export function servedImageIsTestIds(html) {
  return /data-testid=/.test(html);
}

const runs = await registry.listRuns();
console.log(`\nruns: ${runs.length}`);
for (const r of runs) {
  console.log(
    `  ${r.run_id}  ${r.status.padEnd(7)}  leftovers=${r.leftover_rows}  ${r.operator}  ${r.git_sha.slice(0, 7)}  ${r.started_at}`,
  );
}

const landing = process.env.NEXT_PUBLIC_LANDING_URL;
const html = await fetch(`${landing}/`)
  .then((r) => r.text())
  .catch(() => "");
console.log(
  `\nserved image carries test ids: ${servedImageIsTestIds(html) ? "YES — a -testids build is live" : "no"}`,
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
process.exit(
  running.length > 0 || unclaimed.length > 0 || servedImageIsTestIds(html)
    ? 1
    : 0,
);
```

- [ ] **Step 7: Add the package scripts**

In `package.json` `scripts`, after `"e2e:ci:headed"`:

```json
    "e2e:prod": "node scripts/e2e-prod.mjs",
    "e2e:prod:prune": "node scripts/e2e-prod-prune.mjs",
    "e2e:prod:audit": "node scripts/e2e-prod-audit.mjs",
```

(`e2e:prod` points at Task 9's runner; it is wired now so the three names land together.)

- [ ] **Step 8: Dry-run both scripts against production (read-only)**

Run: `node scripts/e2e-prod-audit.mjs` and `node scripts/e2e-prod-prune.mjs --run e2e-20260927-0000-0000 --dry-run`
Expected: audit prints `runs: 0`, `served image carries test ids: no`, `e2e-*: 0` and exits 0 (the registry tables exist on production after Task 10 applies the migration; until then the audit reports the PostgREST error for `e2e_runs` — run this step after Task 10 if so). The dry-run prune prints six steps with 0 and exits 0.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/e2e-prod-registry.mjs scripts/e2e-prod-prune.mjs scripts/e2e-prod-audit.mjs scripts/__tests__/e2e-prod-registry.test.mjs package.json
git commit -m "feat(e2e): production run registry client, prune and audit commands [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Deploy workflow gains the `test_ids` input

**Files:**

- Modify: `.github/workflows/deploy-production.yml`
- Test: `scripts/__tests__/deploy-production-workflow.test.mjs`

**Interfaces:**

- Produces: `workflow_dispatch` input `test_ids` (boolean, default `false`); when true the image is built with `NEXT_PUBLIC_ENABLE_TEST_IDS=true`, tagged `${IMAGE}:${GITHUB_SHA}-testids` only, and the rendered env names that tag. The runner (Task 9) dispatches with `-f test_ids=true|false`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/deploy-production-workflow.test.mjs
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const workflow = readFileSync(
  join(repoRoot, ".github/workflows/deploy-production.yml"),
  "utf8",
);

describe("deploy-production.yml test_ids input", () => {
  it("declares a boolean test_ids input defaulting to false", () => {
    expect(workflow).toMatch(
      /workflow_dispatch:\s+inputs:\s+test_ids:[\s\S]*?type: boolean[\s\S]*?default: false/,
    );
  });

  it("derives the test-id build arg from the input, false on push", () => {
    expect(workflow).toContain(
      "echo \"NEXT_PUBLIC_ENABLE_TEST_IDS=${{ inputs.test_ids == true && 'true' || 'false' }}\"",
    );
  });

  it("suffixes the tag with -testids and drops :latest when test_ids is set", () => {
    expect(workflow).toMatch(
      /TAG_SUFFIX: \$\{\{ inputs\.test_ids == true && '-testids' \|\| '' \}\}/,
    );
    expect(workflow).toMatch(
      /\$\{\{ env\.IMAGE \}\}:\$\{\{ github\.sha \}\}\$\{\{ env\.TAG_SUFFIX \}\}/,
    );
    expect(workflow).toMatch(
      /\$\{\{ inputs\.test_ids != true && format\('\{0\}:latest', env\.IMAGE\) \|\| '' \}\}/,
    );
  });

  it("renders the env file with the same suffixed tag", () => {
    expect(workflow).toContain(
      "SITE_PROD_IMAGE_NAME=${IMAGE}:${GITHUB_SHA}${TAG_SUFFIX}",
    );
  });

  it("never tags a push-to-main build with -testids", () => {
    // The only place the suffix is computed reads inputs.test_ids, which is
    // empty on a push event, so the expression yields ''.
    const occurrences = workflow.match(/-testids/g) ?? [];
    expect(occurrences.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/deploy-production-workflow.test.mjs`
Expected: FAIL on all five.

- [ ] **Step 3: Edit the workflow**

Replace the `on:` block:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      test_ids:
        description: "Build with data-testid attributes for a manual production E2E window (the tag gets a suffix, :latest is not moved). Redeploy with false afterwards."
        type: boolean
        default: false
```

Add to the top-level `env:` block:

```yaml
# '-testids' for a manual E2E window, '' otherwise (inputs.* is empty on push).
TAG_SUFFIX: ${{ inputs.test_ids == true && '-testids' || '' }}
```

In "Collect build args from .env.prod", replace the fixed line with:

```bash
            echo "NEXT_PUBLIC_ENABLE_TEST_IDS=${{ inputs.test_ids == true && 'true' || 'false' }}"
```

In "Build and push", replace the `tags:` block with:

```yaml
tags: |
  ${{ env.IMAGE }}:${{ github.sha }}${{ env.TAG_SUFFIX }}
  ${{ inputs.test_ids != true && format('{0}:latest', env.IMAGE) || '' }}
```

In "Render the runtime env file", change the first line inside the heredoc to:

```bash
          SITE_PROD_IMAGE_NAME=${IMAGE}:${GITHUB_SHA}${TAG_SUFFIX}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/deploy-production-workflow.test.mjs`
Expected: PASS 5/5.

- [ ] **Step 5: Validate the YAML and commit**

Run: `pnpm exec prettier --check .github/workflows/deploy-production.yml && node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/deploy-production.yml','utf8'));console.log('yaml ok')"`
(`yaml` is present at the repo root as a transitive dependency.) Expected: `yaml ok`.

```bash
git add .github/workflows/deploy-production.yml scripts/__tests__/deploy-production-workflow.test.mjs
git commit -m "feat(deploy): test_ids input builds a -testids image for a manual E2E window [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: The runner

**Files:**

- Create: `scripts/lib/e2e-prod-swap.mjs`
- Create: `scripts/e2e-prod.mjs`
- Test: `scripts/__tests__/e2e-prod-swap.test.mjs`

**Interfaces:**

- Consumes: `mintRunId` (Task 2), `createRegistry` (Task 7), `pruneRun` (Task 7, exported from `scripts/e2e-prod-prune.mjs`), the `test_ids` input (Task 8), `E2E_RUN_ID`/`E2E_PRODUCTION_ACK` read by Tasks 3–5.
- Produces (in `e2e-prod-swap.mjs`): `waitForTestIds({ url, present, timeoutMs, intervalMs, fetchImpl, sleep }) → Promise<void>` (resolves when the served HTML does/doesn't contain `data-testid=`; rejects on timeout); `dispatchDeploy({ testIds, ref, runGh }) → Promise<string>` (dispatches via `gh workflow run` and returns the new run id by polling `gh run list`); `watchRun(runId, runGh)`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/__tests__/e2e-prod-swap.test.mjs
import { describe, expect, it, vi } from "vitest";

import { dispatchDeploy, waitForTestIds } from "../lib/e2e-prod-swap.mjs";

const html = (withIds) => ({
  ok: true,
  text: async () => (withIds ? '<div data-testid="x">' : "<div>"),
});

describe("waitForTestIds", () => {
  it("resolves once the served page carries data-testid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(html(false))
      .mockResolvedValueOnce(html(true));
    await expect(
      waitForTestIds({
        url: "https://store.example.com/",
        present: true,
        timeoutMs: 1000,
        intervalMs: 1,
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolves once the attribute is gone when present=false", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(html(true))
      .mockResolvedValueOnce(html(false));
    await waitForTestIds({
      url: "u",
      present: false,
      timeoutMs: 1000,
      intervalMs: 1,
      fetchImpl,
      sleep: async () => undefined,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects on timeout", async () => {
    let now = 0;
    const fetchImpl = vi.fn().mockResolvedValue(html(false));
    await expect(
      waitForTestIds({
        url: "u",
        present: true,
        timeoutMs: 10,
        intervalMs: 5,
        fetchImpl,
        sleep: async () => {
          now += 5;
        },
        clock: () => now,
      }),
    ).rejects.toThrow(/did not start serving test ids within 10ms/);
  });
});

describe("dispatchDeploy", () => {
  it("dispatches with the test_ids input and returns the new run id", async () => {
    const runGh = vi
      .fn()
      // gh workflow run
      .mockResolvedValueOnce("")
      // gh run list (before dispatch there was run 1; now 2 is newest)
      .mockResolvedValueOnce(
        JSON.stringify([{ databaseId: 2, createdAt: "2026-09-27T19:31:00Z" }]),
      );
    const id = await dispatchDeploy({
      testIds: true,
      ref: "develop",
      runGh,
      since: new Date("2026-09-27T19:30:00Z"),
      sleep: async () => undefined,
    });
    expect(id).toBe("2");
    expect(runGh.mock.calls[0][0]).toEqual([
      "workflow",
      "run",
      "deploy-production.yml",
      "--ref",
      "develop",
      "-f",
      "test_ids=true",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-swap.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the swap module**

```js
// scripts/lib/e2e-prod-swap.mjs
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

export async function dispatchDeploy({
  testIds,
  ref,
  runGh = runGhCli,
  since = new Date(),
  sleep = defaultSleep,
}) {
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
    if (latest && new Date(latest.createdAt) >= since)
      return String(latest.databaseId);
    await sleep(5_000);
  }
  throw new Error("dispatched deploy-production.yml but no new run appeared");
}

export async function watchRun(runId, runGh = runGhCli) {
  await runGh(["run", "watch", runId, "--exit-status"]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run -c vitest.config.scripts.js scripts/__tests__/e2e-prod-swap.test.mjs`
Expected: PASS 4/4.

- [ ] **Step 5: Write the runner**

```js
#!/usr/bin/env node
// scripts/e2e-prod.mjs
/**
 * Manual production E2E session. Never run from CI.
 *
 *   pnpm e2e:prod --i-am-running-against-production [--app <name>] [--ref <branch>] [--skip-audio-check] [-- <playwright args>]
 *
 * preflight → e2e_runs row → deploy the -testids image → Playwright per app
 * → prune by run id → redeploy clean → record status. Steps after the run
 * row live in one finally, so a failed suite still prunes and still swaps
 * the clean image back.
 * Spec: docs/superpowers/specs/2026-09-27-production-e2e-design.md §9–§10.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { pruneRun } from "./e2e-prod-prune.mjs";
import { mintRunId } from "./lib/e2e-run-id.mjs";
import { createRegistry } from "./lib/e2e-prod-registry.mjs";
import {
  dispatchDeploy,
  waitForTestIds,
  watchRun,
} from "./lib/e2e-prod-swap.mjs";
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

if (!args.includes("--i-am-running-against-production")) {
  console.error(
    "refusing: pass --i-am-running-against-production to acknowledge a live run",
  );
  process.exit(2);
}
if (process.env.CI) {
  console.error("refusing: production E2E is manual, never CI");
  process.exit(2);
}
const apps = flag("--app") ? [flag("--app")] : E2E_APPS;
if (apps.some((a) => !E2E_APPS.includes(a))) {
  console.error(`--app must be one of ${E2E_APPS.join(", ")}`);
  process.exit(2);
}
const ref = flag("--ref") ?? "develop";

loadEnv("prod");
for (const k of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_DOMAIN",
  "NEXT_PUBLIC_LANDING_URL",
]) {
  if (!process.env[k]) {
    console.error(`preflight: ${k} is unset in .env.prod/.secrets`);
    process.exit(2);
  }
}
if (!process.env.CLERK_SECRET_KEY.startsWith("sk_live_")) {
  console.error("preflight: .env.prod resolves a non-production Clerk key");
  process.exit(2);
}

const landing = process.env.NEXT_PUBLIC_LANDING_URL;
const registry = createRegistry({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
});

const gh = spawnSync(
  isWindows ? "cmd.exe" : "gh",
  isWindows ? ["/d", "/s", "/c", "gh", "auth", "status"] : ["auth", "status"],
  { windowsHide: true },
);
if (gh.status !== 0) {
  console.error("preflight: gh auth status failed");
  process.exit(2);
}

const publicCode = await fetch(`${landing}/health`)
  .then((r) => r.status)
  .catch(() => 0);
if (publicCode !== 200) {
  console.error(`preflight: ${landing}/health -> ${publicCode}`);
  process.exit(2);
}

const running = await registry.runningRuns();
if (running.length > 0) {
  console.error(
    `preflight: run ${running[0].run_id} is still running — audit or prune it first`,
  );
  process.exit(2);
}

if (!args.includes("--skip-audio-check")) {
  const key =
    process.env.RACKNERD_VPS_SSH_KEY_PATH ??
    resolve(homedir(), ".ssh/libra_prod_ed25519");
  const host = process.env.RACKNERD_VPS_IP;
  const user = process.env.RACKNERD_VPS_USER ?? "root";
  if (!host || !existsSync(key)) {
    console.error(
      "preflight: RACKNERD_VPS_IP and the deploy key are needed for the audio check (or pass --skip-audio-check)",
    );
    process.exit(2);
  }
  const ssh = spawnSync(
    "ssh",
    [
      "-i",
      key,
      "-o",
      "BatchMode=yes",
      `${user}@${host}`,
      "systemctl is-active go-librespot spotify-discord-bot",
    ],
    { encoding: "utf8" },
  );
  if (!/^active\s+active\s*$/.test(ssh.stdout ?? "")) {
    console.error(
      `preflight: audio units not both active:\n${ssh.stdout}${ssh.stderr}`,
    );
    process.exit(2);
  }
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
  console.log("▶ deploying the -testids image");
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

  console.log("▶ redeploying the clean image");
  try {
    const cleanRun = await dispatchDeploy({ testIds: false, ref });
    await watchRun(cleanRun);
    await waitForTestIds({ url: `${landing}/`, present: false });
    console.log("✓ production serves the clean image");
  } catch (error) {
    status = "failed";
    notes = `${notes ? `${notes}; ` : ""}clean redeploy failed: ${error.message} — PRODUCTION MAY STILL SERVE TEST IDS`;
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
  console.log(`▶ playwright  app=${app}\n`);
  return new Promise((resolvePromise) => {
    const child = isWindows
      ? spawn("cmd.exe", ["/d", "/s", "/c", "pnpm", ...pwArgs], {
          cwd: rootDir,
          stdio: "inherit",
          windowsHide: true,
          env: env(),
        })
      : spawn("pnpm", pwArgs, { cwd: rootDir, stdio: "inherit", env: env() });
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
  function env() {
    return {
      ...process.env,
      TARGET_ENV: "prod",
      E2E_RUN_ID: runId,
      E2E_PRODUCTION_ACK: runId,
    };
  }
}
```

- [ ] **Step 6: Make `pruneRun` importable without running the CLI**

`scripts/e2e-prod-prune.mjs` currently executes at import. Guard its CLI body:

```js
const norm = (p) => (process.platform === "win32" ? p.toLowerCase() : p);
const isMain =
  norm(fileURLToPath(import.meta.url)) === norm(resolve(process.argv[1] ?? ""));
if (isMain) {
  // ...everything from `const args = process.argv.slice(2);` down to `process.exit(...)`
}
```

(import `fileURLToPath` from `node:url` and `resolve` from `node:path`; keep `export async function pruneRun` at module scope and pass `registry` in from the CLI body.)

- [ ] **Step 7: Run the script test suite and lint**

Run: `pnpm test:workflows && pnpm lint && pnpm format:check`
Expected: PASS; no lint errors (fix any `unicorn`/import-order complaints the linter raises in the new scripts).

- [ ] **Step 8: Commit**

```bash
git add scripts/e2e-prod.mjs scripts/e2e-prod-prune.mjs scripts/lib/e2e-prod-swap.mjs scripts/__tests__/e2e-prod-swap.test.mjs
git commit -m "feat(e2e): manual production runner with image swap, prune and audit trail [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Apply the migration to production, rehearse on staging, document

**Files:**

- Create: `docs/production-e2e.md`
- Modify: `docs/production-status.md` (link in "Related"), `docs/superpowers/specs/2026-09-27-production-e2e-design.md` (§6 step 4 wording)
- Modify: `.claude/skills/e2e-eval/SKILL.md` (one line noting production is manual via `pnpm e2e:prod`)

**Interfaces:**

- Consumes: everything above.

- [ ] **Step 1: Apply the registry migration to production**

Run (Management API, PAT from `.secrets`):

```bash
cd /z/Github/libra && TOKEN=$(grep -E '^PROD_SUPABASE_ACCESS_TOKEN=' .secrets | cut -d= -f2-) && payload=$(python3 -c "import json,sys; print(json.dumps({'query':open(sys.argv[1]).read()}))" supabase/migrations/20260927200000_e2e_run_registry.sql) && curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://api.supabase.com/v1/projects/olafyajipvsltohagiah/database/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$payload"
```

Expected: `201`. Then `node scripts/e2e-prod-audit.mjs` prints `runs: 0` and exits 0.

- [ ] **Step 2: Rehearse the whole flow on staging**

The runner hard-codes `loadEnv("prod")` and the guard hard-codes the production host, so the rehearsal exercises the parts around Playwright with production env but no real deploy:

1. `node scripts/e2e-prod-prune.mjs --run e2e-20260927-0000-0000 --dry-run` → six zero steps, exit 0.
2. Start the staging container with test ids (`pnpm docker:build --env staging --up`), then run one spec with the production env but the staging URL overridden, to prove the guard refuses a host mismatch:
   `TARGET_ENV=prod E2E_RUN_ID=e2e-20260927-0000-0000 E2E_PRODUCTION_ACK=e2e-20260927-0000-0000 NEXT_PUBLIC_STORE_URL=https://store.ffxivbe.org/store pnpm --dir apps/auth exec playwright test smoke-all-apps.spec.ts`
   Expected: fails fast with "refusing to run against a production Clerk instance".
3. Dispatch the test-ID deploy by hand and confirm the swap detector: `gh workflow run deploy-production.yml --ref develop -f test_ids=true`, wait, then `curl -s https://store.furrycolombia.com/ | grep -c 'data-testid='` → non-zero; then `-f test_ids=false`, wait, → `0`. `node scripts/e2e-prod-audit.mjs` must report the test-id state correctly at both points.

Record each result in the ledger.

- [ ] **Step 3: Write the runbook**

```markdown
<!-- docs/production-e2e.md -->

# Production E2E — runbook

Manual only. Never from CI. Design:
`docs/superpowers/specs/2026-09-27-production-e2e-design.md`.

## Run

    pnpm e2e:prod --i-am-running-against-production            # every app
    pnpm e2e:prod --i-am-running-against-production --app auth # one app
    pnpm e2e:prod --i-am-running-against-production -- --grep "checkout"

What happens: preflight (secrets, `gh auth`, public `/health`, no other run
`running`, both audio units active on the box) → `e2e_runs` row → the
`-testids` image is deployed → Playwright runs with `E2E_RUN_ID` and
`E2E_PRODUCTION_ACK` → prune by run id → clean image redeployed → status
recorded. The Google/Discord login specs never run here.

During the window, E2E products (`e2e-<run_id>-…`) are visible in the live
store. They are deleted in teardown even when the suite fails.

## Audit

    pnpm e2e:prod:audit

Every run with its leftover count, whether production currently serves
test ids, and any `e2e-*` user on the production Clerk instance no run
claims. Exit 1 when anything is off.

## Prune

    pnpm e2e:prod:prune --run <run_id> --dry-run
    pnpm e2e:prod:prune --run <run_id>
    pnpm e2e:prod:prune --older-than-hours 24

Positive match on the run id only. A run interrupted before its own
cleanup (killed terminal) is pruned this way and marked `aborted`. If the
audit says production serves test ids, redeploy clean:
`gh workflow run deploy-production.yml --ref develop -f test_ids=false`.

## Where things live

| Thing         | Place                                                          |
| ------------- | -------------------------------------------------------------- |
| Run records   | `public.e2e_runs`, `public.e2e_run_rows` (service role only)   |
| Run id format | `e2e-<YYYYMMDD>-<HHmm>-<4 hex>` (`scripts/lib/e2e-run-id.mjs`) |
| Guard         | `apps/auth/e2e/helpers/guardEnv.ts`                            |
| Registration  | `apps/auth/e2e/helpers/runRegistry.ts`                         |
| Prune plan    | `scripts/lib/e2e-prod-plan.mjs`                                |
| Image swap    | `deploy-production.yml` input `test_ids`                       |
```

- [ ] **Step 4: Cross-link and align the spec**

- `docs/production-status.md` "Related": add `- [Production E2E runbook](./production-e2e.md)`.
- Spec §6 step 4: replace the `name_en` prefix sentence with "`products` owned by the run's sellers, registered by the run, or whose `slug` starts with `e2e-<run_id>` — needed because `products.seller_id` is `on delete set null`". (Task 6 implements exactly that.)
- `.claude/skills/e2e-eval/SKILL.md`: under the `env` parameter row add the sentence "Production is never a target here; it is manual via `pnpm e2e:prod` (see `docs/production-e2e.md`)."

- [ ] **Step 5: Format, spell-check, full gates**

Run: `pnpm format && pnpm exec cspell --no-progress docs/production-e2e.md && pnpm lint && pnpm typecheck && pnpm test && pnpm test:workflows && pnpm lint:env`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add docs/production-e2e.md docs/production-status.md docs/superpowers/specs/2026-09-27-production-e2e-design.md .claude/skills/e2e-eval/SKILL.md
git commit -m "docs(e2e): production E2E runbook and cross-links [GH-000]

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: First real run (with the owner watching)**

After the branch is merged to `develop`:

```bash
pnpm e2e:prod --i-am-running-against-production --app landing
pnpm e2e:prod:audit
```

Expected: the run row ends `passed` with `leftover_rows=0`, the audit exits 0, and `curl -s https://store.furrycolombia.com/ | grep -c 'data-testid='` prints `0`.
