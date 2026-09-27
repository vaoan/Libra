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
