# Production E2E — runbook

Design: `docs/superpowers/specs/2026-09-27-production-e2e-design.md`.

Run by hand from an operator's machine, or by CI: since 2026-09-28
`.github/workflows/e2e-production.yml` runs the same runner after every
successful production deploy and on `workflow_dispatch`. That is a temporary
arrangement (spec §13) while the operator's machine cannot carry a Playwright
session; switch it off by setting the repository variable
`PRODUCTION_E2E_IN_CI` to anything but `true`. The runner refuses any other
CI context: only that workflow sets `E2E_PROD_CI_ALLOWED=true`.

## In CI

Trigger: `workflow_run` on "Deploy Production" (success only; the test-id
deploy the runner dispatches mid-window is skipped by its title) and
`workflow_dispatch`. The job injects the same secrets `.env.prod` references,
writes the deploy key to the runner's default path, runs
`pnpm e2e:prod --i-am-running-against-production`, then **always** runs
`pnpm e2e:prod:audit` so a run the job timeout killed shows as a red job and
not a green one. Traces and screenshots are uploaded as an artifact; a
failure posts to the Telegram critical thread. It never rolls production back.

Production runs never retry (`retries: 0` when `TARGET_ENV=prod`) and keep a
trace for every failed attempt (`trace: "retain-on-failure"`). A test that
passes on its second try still failed a real user once, so a flake fails the
run and its trace lands in the artifact; the CI dev suites keep their two
retries.

A real deploy that starts during a window makes the suite fail and puts a
clean image on the box; the runner's restore then sees no test-id image and
does nothing (the guard in `restorePreviousImage`), so production is left
serving the deploy, not the window's image.

## Run

    pnpm e2e:prod --i-am-running-against-production            # every app
    pnpm e2e:prod --i-am-running-against-production --app auth # one app
    pnpm e2e:prod --i-am-running-against-production -- --grep "checkout"

What happens: preflight (secrets, `gh auth`, public `/health`, no other run
`running`, SSH to the box, both audio units active) → `e2e_runs` row → the
test-id image is built **from the branch the serving image came from** and
deployed → Playwright runs with `E2E_RUN_ID` and `E2E_PRODUCTION_ACK` →
prune by run id → **the pre-window image is restored** from the box's
`env.prod.previous` (no rebuild, exact same image) → status recorded. The
Google/Discord login specs never run here. A window never changes what
production serves once it is over; if a `registerRow` failed inside
Playwright the run is marked `failed` and the audit shows it.

During the window, E2E products (`e2e-<run_id>-…`) are visible in the live
store. They are deleted in teardown even when the suite fails.

SSH to the box is required: `RACKNERD_VPS_IP` and `RACKNERD_VPS_USER` in
`.secrets` (both are repository secrets; `pnpm sync-secrets` brings them) and
the deploy key at `~/.ssh/libra_prod_ed25519` (or `RACKNERD_VPS_SSH_KEY_PATH`).
The preflight checks the audio units through it and the restore at the end
depends on it.

## Audit

    pnpm e2e:prod:audit

Every run with its leftover count, whether production currently serves
test ids (or could not be read), and any `e2e-*` Clerk user or
`user_profiles` row no run claims. Exit 1 when anything is off, including
leftovers on a finished run and an unreachable site.

## Prune

    pnpm e2e:prod:prune --run <run_id> --dry-run
    pnpm e2e:prod:prune --run <run_id>
    pnpm e2e:prod:prune --older-than-hours 24

Positive match on the run id only. A run interrupted before its own
cleanup (killed terminal) is pruned this way, the pre-window image is
restored from the box's `env.prod.previous`, and the run is marked
`aborted`. If that restore is not possible (`env.prod.previous` gone), the
prune says so and the audit keeps flagging the test-id image until a
normal deploy replaces it.

## Where things live

| Thing         | Place                                                          |
| ------------- | -------------------------------------------------------------- |
| Run records   | `public.e2e_runs`, `public.e2e_run_rows` (service role only)   |
| Run id format | `e2e-<YYYYMMDD>-<HHmm>-<4 hex>` (`scripts/lib/e2e-run-id.mjs`) |
| Guard         | `apps/auth/e2e/helpers/guardEnv.ts`                            |
| Registration  | `apps/auth/e2e/helpers/runRegistry.ts`                         |
| Prune plan    | `scripts/lib/e2e-prod-plan.mjs`                                |
| Image swap    | `deploy-production.yml` input `test_ids`                       |
