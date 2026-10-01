import { afterAll, describe, expect, it } from "vitest";

import { withClaims, withSuperuser } from "./helpers";

afterAll(async () => {
  const { closePool } = await import("./helpers");
  await closePool();
});

const RUN = "e2e-20260927-1930-a3f1";

type Queryable = {
  query: (q: string, p?: unknown[]) => Promise<unknown>;
};

async function seedRun(client: Queryable) {
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
        const runs = await c.query<{ n: number }>(
          "select count(*)::int as n from public.e2e_runs",
        );
        const rows = await c.query<{ n: number }>(
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
    const result = await withSuperuser(async (c) =>
      c
        .query(
          `insert into public.e2e_run_rows (run_id, table_name, row_id) values ($1, 'products', 'p1')`,
          ["e2e-20260927-0000-none"],
        )
        .then(() => "inserted")
        .catch((e: Error) => e.message),
    );
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
