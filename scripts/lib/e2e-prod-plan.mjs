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
