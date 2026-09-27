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
    if (!res.ok) {
      throw new Error(
        `${method} ${path} -> HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
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

  async function deleteStoragePrefix(prefix) {
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
    if (!res.ok) {
      throw new Error(`storage delete ${prefix} -> HTTP ${res.status}`);
    }
    return names.length;
  }

  async function deleteOne(kind, id) {
    switch (kind) {
      case "storage":
        return deleteStoragePrefix(id);
      case "orders":
        return rest("DELETE", `orders?id=eq.${id}`);
      case "rows": {
        const [table, rowId] = id.split(":");
        return rest("DELETE", `${table}?id=eq.${rowId}`);
      }
      case "products":
        return rest("DELETE", `products?id=eq.${id}`);
      case "profiles":
        return rest("DELETE", `user_profiles?id=eq.${id}`);
      case "clerk":
        return clerk("DELETE", `/users/${id}`);
      default:
        throw new Error(`unknown step kind ${kind}`);
    }
  }

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
      for (const r of rows) {
        counts.set(r.run_id, (counts.get(r.run_id) ?? 0) + 1);
      }
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

    deleteStoragePrefix,

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
            await deleteOne(step.kind, id);
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
