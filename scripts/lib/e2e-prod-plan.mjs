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
  // Orders the run's users placed, and orders they sold: orders.seller_id
  // does not cascade, so a seller cannot be deleted while a sale exists.
  const orderIds = orders
    .filter((o) => profileIds.has(o.user_id) || profileIds.has(o.seller_id))
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
    // user_permissions.granted_by does not cascade: grants an E2E admin made
    // (to anyone) go before the admin's own profile.
    { kind: "grants", ids: [...profileIds] },
    { kind: "profiles", ids: [...profileIds] },
    { kind: "clerk", ids: clerkIds },
  ];
}

/**
 * The audit's verdict. Conservative on purpose: leftovers, an unreadable
 * public site and anything unclaimed all count as dirty, because the audit
 * is the recovery path for a run nothing else finished.
 * `testIds` is true/false when the site was read, null when it was not.
 */
export function auditVerdict({
  runs,
  unclaimedUsers,
  unclaimedProfiles,
  testIds,
}) {
  const reasons = [];
  if (runs.some((r) => r.status === "running")) {
    reasons.push("a run is still running");
  }
  const leftovers = runs.reduce((n, r) => n + (r.leftover_rows ?? 0), 0);
  if (leftovers > 0) reasons.push(`${leftovers} leftover row(s) across runs`);
  if (unclaimedUsers > 0) {
    reasons.push(`${unclaimedUsers} e2e clerk user(s) without a known run`);
  }
  if (unclaimedProfiles > 0) {
    reasons.push(`${unclaimedProfiles} e2e profile(s) without a known run`);
  }
  if (testIds === true) reasons.push("production serves test ids");
  if (testIds === null) reasons.push("could not read the public site");
  return { dirty: reasons.length > 0, reasons };
}
