/**
 * Decides whether the production E2E runner may proceed under CI.
 *
 * The runner was written as manual-only. Running it from GitHub Actions is a
 * deliberate, temporary arrangement (docs/production-e2e.md): the job in
 * e2e-production.yml sets E2E_PROD_CI_ALLOWED=true, and nothing else does. A
 * stray CI=true anywhere else still refuses, so the old protection holds for
 * every other pipeline.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null} the refusal message, or null when the run may go on
 */
export function ciRefusal(env) {
  if (!env.CI) return null;
  if (env.E2E_PROD_CI_ALLOWED === "true") return null;
  return "refusing: production E2E under CI needs E2E_PROD_CI_ALLOWED=true, which only .github/workflows/e2e-production.yml sets";
}
