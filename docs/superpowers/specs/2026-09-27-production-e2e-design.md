# Production E2E — design

Manual, operator-run Playwright sessions against the live
`store.furrycolombia.com`, where everything a run creates carries one run
identity, so a run's leftovers are one query to find, one command to delete,
and one table to audit. Never run from CI.

Decided 2026-09-27 with the owner; the questions and answers are in §2.

## 1. Why

The production stack now differs from staging in three ways E2E cannot
ignore: the production Clerk instance, real user data in the same tables,
and an image built without test IDs. Running the existing suites there
unchanged would fail to find elements, would be refused by the E2E guard, and
would leave untagged rows behind if anything broke.

## 2. Decisions

| Question                               | Answer                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CI or manual?                          | **Manual only.** No workflow runs it; CI keeps the development instance and staging.                                          |
| How does production get `data-testid`? | **Swap the image for the window.** A test-ID build is deployed, the suite runs, the clean build is redeployed.                |
| E2E products visible to real shoppers? | **Yes, for the window's minutes, pruned right after.** Hidden products cannot be bought, so the purchase flows would not run. |
| Registry or naming convention?         | **Registry tables in the production database** (approach 1). Names carry the run id too.                                      |
| Google / Discord login specs?          | **Excluded** from production runs. They sign in with a real Google account and would create an untagged real user.            |
| Persistent production test accounts?   | **None.** Every principal is created by a run and deleted by it.                                                              |

## 3. Run identity

`run_id = e2e-<YYYYMMDD>-<HHmm>-<4 lowercase hex>`, for example
`e2e-20260927-1930-a3f1`. The runner mints it and exports it to Playwright
as `E2E_RUN_ID`.

- E2E emails: `e2e-<label>-<run_id>+clerk_test@example.com`.
- E2E-created names (products, reports): prefix `e2e-<run_id>-`.
- When `E2E_RUN_ID` is unset (dev, staging, CI) the helpers behave exactly
  as today, with `Date.now()` where the run id would go.

The sweep script's positive-match rule (`^e2e-.*@example\.com$`) still
matches every address this produces.

## 4. Registry tables

One migration adds two tables to `public`. RLS enabled, **no policy for
`anon` or `authenticated`**; only the service role reads or writes them.

```sql
create table public.e2e_runs (
  run_id      text primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null check (status in ('running','passed','failed','aborted')),
  operator    text not null,          -- git user email of the terminal that ran it
  git_sha     text not null,
  image_tag   text not null,          -- the -testids tag that served the run
  base_url    text not null,
  apps        text[] not null,
  notes       text
);

create table public.e2e_run_rows (
  run_id     text not null references public.e2e_runs(run_id) on delete restrict,
  table_name text not null,           -- 'clerk_users', 'user_profiles', 'products', 'storage:receipts', ...
  row_id     text not null,           -- uuid, Clerk user id, or storage prefix
  created_at timestamptz not null default now(),
  primary key (table_name, row_id)
);
create index on public.e2e_run_rows (run_id);
```

The FK means nothing can be tagged without a run. `on delete restrict` means
a run row cannot disappear while it still owns rows, so a half-pruned run
stays visible in the audit.

## 5. Helpers register what they create

In `apps/auth/e2e/helpers`:

- `createTestUser` registers the Clerk user id (`clerk_users`) the instant it
  exists, then the `user_profiles` id once the profile RPC returns.
- `adminInsert(table, data)` registers every row it returns.
- The receipt upload helper registers `storage:receipts` with the
  `<order_id>/` prefix.
- `registerRow(table, id)` is the single entry point; it is a no-op without
  `E2E_RUN_ID`, and it never throws into the test (a failed registration is
  logged and the run is marked `failed` at the end, because an unregistered
  row is exactly what prune must not miss).

Rows the UI creates are reached by ownership, not registration: `orders`
cascade from `user_profiles`, `order_items`, `check_ins` and
`ticket_transfers` from `orders`, receipts live under `<order_id>/`.

## 6. Prune

`pnpm e2e:prod:prune --run <run_id> [--dry-run]` and
`pnpm e2e:prod:prune --older-than-hours <n> [--dry-run]`.

Order, all filtered by the run's id and nothing else:

1. Storage objects under every `storage:receipts` prefix of the run, and
   under `<order_id>/` for every order of the run's users.
2. `orders` where `user_id` is one of the run's `user_profiles` (cascades
   items, check-ins, transfers).
3. Registered rows in `e2e_run_rows`, newest first, skipping tables already
   emptied by cascade.
4. `products` whose `name_en` starts with `e2e-<run_id>-` — needed because
   `products.seller_id` is `on delete set null`, so deleting the seller would
   orphan them rather than remove them.
5. `user_profiles` of the run.
6. Clerk users on the production instance whose email contains `-<run_id>+clerk_test@`.
7. `e2e_run_rows` of the run. The `e2e_runs` row is **kept** as the audit
   record; prune never sets its status. The runner sets `status` and
   `finished_at` (§9 step 7). A standalone prune of a run still marked
   `running` (a killed terminal) sets it to `aborted` with `finished_at`.

Rules: every delete is a positive match on the run id; `--dry-run` prints
the exact plan with counts and exits; a prune that cannot finish reports the
leftovers by table and id and leaves the run `failed`.

## 7. Guard and session minting

`assertNotProductionClerk(secretKey, ack?)` accepts an `sk_live_` key only
when **all** hold:

- `TARGET_ENV === "prod"`,
- `E2E_PRODUCTION_ACK === E2E_RUN_ID` (both set, both equal),
- the base URL host is exactly `store.furrycolombia.com`.

Any other combination with a live key throws, as today.

Session minting: `sessions.createSession` is refused by production
instances. `mintSessionToken(secretKey, domain, userId)` is ported from
`aeleos/scripts/run-cloud-idp.mjs`: the dev path is unchanged; the
`sk_live_` path creates a sign-in token, redeems it at
`https://<domain>/v1/client/sign_ins?_is_native=1`, and mints the session
JWT from the created session. Chosen by key prefix, so dev suites do not
change.

## 8. The image swap

`deploy-production.yml` gains a `workflow_dispatch` input `test_ids`
(boolean, default `false`). When true:

- the build arg `NEXT_PUBLIC_ENABLE_TEST_IDS=true`,
- the image is tagged `:<sha>-testids` and **not** `:latest`,
- the rendered env file records `SITE_PROD_IMAGE_NAME=…:<sha>-testids`.

Pushes to `main` never set it. The runner dispatches with `test_ids=true`,
waits for the run to succeed, then polls `https://store.furrycolombia.com/`
until the served HTML contains `data-testid=`; after the suite it dispatches
with `test_ids=false` and polls until the attribute is gone.

## 9. Operator flow

```
pnpm e2e:prod --i-am-running-against-production [--app <auth|store|admin|payments|landing>] [-- <playwright args>]
```

1. **Preflight**: `TARGET_ENV=prod` loaded; `PROD_CLERK_*`,
   `PROD_SUPABASE_SERVICE_ROLE_KEY`, `RACKNERD_*` present; `gh auth status`
   ok; the public site answers 200; no `e2e_runs` row is `running`; both
   audio units on the box are `active`.
2. Insert the `e2e_runs` row (`running`).
3. Dispatch the test-ID deploy; wait for the swap.
4. Run Playwright per app with `E2E_RUN_ID`, `E2E_PRODUCTION_ACK`,
   `TARGET_ENV=prod`, excluding `google-login.spec.ts`,
   `discord-login.spec.ts` and `setup-discord-session.ts`.
5. Prune the run (§6).
6. Dispatch the clean deploy; wait for the swap back.
7. Set `status` and `finished_at`; print the audit line.

Steps 5–7 live in one `finally`, so a failed or interrupted suite still
prunes, still redeploys clean, and still records its status. A run
interrupted before `finally` (killed terminal) is what `e2e:prod:audit`
exists for.

```
pnpm e2e:prod:audit
```

Prints: every `e2e_runs` row (newest first, with leftover counts from
`e2e_run_rows`), whether the box currently serves a `-testids` image, and
every user on the production Clerk instance matching `^e2e-.*@example\.com$`
whose run id is unknown to `e2e_runs`.

## 10. Error handling

- One run at a time: preflight refuses while any run is `running`.
- A failed prune never marks the run finished; it prints leftovers per table.
- A failed clean redeploy is reported loudly and the audit shows the
  `-testids` tag until someone redeploys.
- No step calls `process.exit` between the run row and the `finally`.

## 11. Testing

- **Unit** (`scripts/__tests__/`, `apps/auth/tests/`): run-id format; guard
  matrix over live key × ack × env × host; prune plan ordering and
  positive-match filtering against a fake registry; `registerRow` no-op
  without a run id; test-ID tag selection in the workflow input mapping.
- **Database invariants** (`tests/db`): `anon` and `authenticated` are denied
  on both tables; inserting into `e2e_run_rows` without a run fails; deleting
  a run that owns rows fails.
- **Rehearsal on staging**: the full `e2e:prod` flow against the staging
  container with the guard's host check pointed at the staging hostname,
  proving swap, run, prune and audit end to end.
- **First real run**: `--app landing` and the smoke spec only, operator and
  owner both watching, then `e2e:prod:audit` must show zero leftovers.

## 12. Out of scope

Running from CI or on a schedule; persistent production test accounts;
Google and Discord login specs in production; hiding E2E products.
