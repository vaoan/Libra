# Production E2E — runbook

Manual only. Never from CI. Design:
`docs/superpowers/specs/2026-09-27-production-e2e-design.md`.

## Run

    pnpm e2e:prod --i-am-running-against-production            # every app
    pnpm e2e:prod --i-am-running-against-production --app auth # one app
    pnpm e2e:prod --i-am-running-against-production -- --grep "checkout"

What happens: preflight (secrets, `gh auth`, public `/health`, no other run
`running`, both audio units active on the box) → `e2e_runs` row → the
test-id image is deployed → Playwright runs with `E2E_RUN_ID` and
`E2E_PRODUCTION_ACK` → prune by run id → clean image redeployed → status
recorded. The Google/Discord login specs never run here.

During the window, E2E products (`e2e-<run_id>-…`) are visible in the live
store. They are deleted in teardown even when the suite fails.

The audio preflight needs `RACKNERD_VPS_IP` and `RACKNERD_VPS_USER` in
`.secrets` (both are repository secrets; `pnpm sync-secrets` brings them) and
the deploy key at `~/.ssh/libra_prod_ed25519` (or `RACKNERD_VPS_SSH_KEY_PATH`).
Without them pass `--skip-audio-check` and watch the bridge yourself.

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
