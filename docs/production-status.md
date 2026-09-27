# Production status & restore path

> **Current state: production is OFFLINE, and so is its database.** Last
> served 2026-08-07. This document exists so nobody has to re-derive the
> situation from scratch. Written 2026-08-09, updated 2026-08-29 — see
> [Database status (update, 2026-08-29)](#database-status-update-2026-08-29)
> below; the sections after it were accurate as of 2026-08-09 but predate the
> database loss.

## What happened

The **GCP free trial ended**. Google suspended the project, which stopped the
VM, which killed the `cloudflared` process running the production tunnel. Every
production hostname has returned Cloudflare **530 / error 1033** ("no tunnel
connected") ever since.

Dated from the repo webhook's delivery log, which is the most precise record we
have:

| when (UTC)                | webhook response  | meaning                                     |
| ------------------------- | ----------------- | ------------------------------------------- |
| 2026-08-07 17:36 → 18:03  | `404`, empty body | tunnel **connected**, no route for the host |
| 2026-08-08 02:27 → onward | `530` / `1033`    | **no tunnel connected at all**              |

The last successful deploy — and therefore the newest built image — is
**2026-07-08**. The site kept serving that image for a month until the VM died;
"last deploy" and "went offline" are a month apart and should not be confused.

**Nothing in the repo caused this.** The repository transfer, the rename to
Libra, and the workflow changes all happened around the same window, which makes
for an alarming coincidence, but none of them touch the VM, Cloudflare, or GCP.

## What this means going forward

GCP is not coming back: restoring it needs a paid billing account, and **paying
anything is a hard stop**. The deploy workflows (`deploy-gcp.yml`,
`deploy-local.yml`, `deploy-production.yml`) were deleted for that reason — each
pointed at a host that no longer exists. They are in git history.

## Domain topology — read this before touching Cloudflare

This is the part that is easy to get wrong, and was got wrong during the
2026-08-09 investigation — an hour went into testing the wrong domain:

| domain              | role                | notes                                            |
| ------------------- | ------------------- | ------------------------------------------------ |
| `furrycolombia.com` | **production**      | `store.furrycolombia.com` is the real storefront |
| `ffxivbe.org`       | **staging / local** | app hostnames here are _not_ production          |
| `ffxiv.be`          | dev tooling         | console, code-server, ttyd — the PCSetup tunnels |

Three secrets are misleadingly named and have cost time already:

- **`PROD_CF_ZONE_ID` holds the `ffxivbe.org` zone** — a staging zone under a
  "PROD" name. Using it with `PROD_CF_API_TOKEN` produces a confusing
  "unauthorized" error, because the token is scoped to the _other_ domain.
- **`PROD_CF_API_TOKEN` does reach `furrycolombia.com`**, but only for
  **zone-read and cache-purge**. DNS read returns `403`.
- **`CLOUDFLARED_CONFIG` / `CLOUDFLARED_TUNNEL_CREDENTIALS`** are the
  **staging** tunnel's, despite the generic names — their ingress lists
  `ffxivbe.org` hostnames. They are stored base64-encoded with a `_BASE64`
  suffix because they are multi-line; searching `.secrets` for the bare name
  finds nothing.

## Why the old tunnel cannot simply be restarted

The production tunnel (`libra-prod`) was created **on the VM**, so its
credentials died with the disk. It is not merely disconnected: listing tunnels
in the production Cloudflare account returns **zero**. There is nothing to
reattach and nothing to recover — a new tunnel has to be created.

## Database status (update, 2026-08-29)

The 2026-08-09 verification below ("the production Supabase project is
alive") is **no longer true**. Both the production Supabase project
(`olafyajipvsltohagiah`) and the dev one (`dsczudkhoolxjaxjeqdf`) are gone —
`NXDOMAIN` on three resolvers, and both Personal Access Tokens get `401` on
`/v1/projects`. Only the host restarting won't bring anything back; the
database it would talk to no longer exists either.

**The July 15 backup (`prod_2026-07-15T06-22-42`) is the database's final
state.** The scheduled backup that ran 2026-08-09 logged
`"DB content unchanged since last upload"` with row counts identical to the
July file — so nothing was lost between the last real activity and the
project's disappearance. That backup is complete and consistent: 17/17
tables, 196 user profiles, 154/154 storage receipts, and zero orphaned
foreign keys, confirmed by the full restore-and-verify rehearsal in
`.superpowers/sdd/2026-08-29-aeleos-login-migration/task-12-report.md`.

Restoring now is **not** "turn the old project back on" — there is no old
project to turn on. It means:

1. **Provisioning a brand-new Supabase project** (a new project ref, a new
   Postgres instance with nothing in it).
2. **Applying every migration in `supabase/migrations/`** to build the schema
   from scratch, including the Clerk identity re-key done in this branch (see
   `docs/superpowers/specs/2026-08-29-aeleos-login-migration-design.md`) —
   the schema the backup restores into is not the schema production had in
   July, and that is by design: the old schema FK'd every user row to
   `auth.users`, which cannot exist again because those Clerk-less identities
   are gone. The new schema keys on `user_profiles` instead, which is what
   makes the backup restorable at all.
3. **Restoring `prod_2026-07-15T06-22-42`** via `scripts/backup-prod.mjs
--restore` into that fresh project, **before anyone signs in** — the
   restore truncates `user_profiles`, so restoring over a live system would
   wipe every `identity_sub` already claimed.

   The migrations now **seed** the reference tables — `permissions`,
   `resource_permissions`, `product_templates`, `payment_settings` — so a
   fresh database is usable before any restore. `backup-prod.mjs --restore`
   empties every table before inserting, so those seeded rows are replaced by
   the backup's and nothing collides. **A restore done by hand must do the
   same**, or it silently corrupts the reference tables rather than failing:
   `resource_permissions` and `product_templates` have no unique key that
   catches a duplicate (`resource_permissions`' unique index includes a
   nullable column, and NULL never equals NULL), so seeded rows and restored
   rows simply coexist — a rehearsal ended with 92 and 10 rows where 46 and 5
   were correct, with no error raised. Truncate `audit.logged_actions` too:
   seeding writes 100 audit rows, which take the `event_id` values the
   backup's own audit rows need.

4. **Pointing every app's env at the new project** (`NEXT_PUBLIC_SUPABASE_URL`,
   keys, and Supabase's trusted-Clerk-domain config) and re-enabling
   `backup-scheduled.yml`, which is currently `disabled_manually` because it
   targets the dead project and can only fail as long as it stays pointed
   there.

None of this is blocked on Cloudflare, DNS, or the host below — it is a
separate prerequisite that has to happen first, since the app has nothing to
serve without a database.

## What is already in place

Verified working 2026-08-09 (host/tunnel facts only — see the database update
above for why the Supabase bullet no longer holds):

- ~~The production Supabase project is alive — `/auth/v1/health` answers
  `401`, meaning up and requiring auth, not paused.~~ **No longer true** — the
  project is gone; see [Database status](#database-status-update-2026-08-29).
- **The known-good image exists**: digest `c60338c1…`, the 2026-07-08 build.
  Present locally and in GHCR under both the old and new names.
- **Docker and `cloudflared` are installed** on the workstation, and a
  `cloudflared` already runs there for the dev console.
- **The container recipe** is in `scripts/deploy-production.sh`: published as
  `-p 9090:8080`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`,
  `--pids-limit=1024`, `--restart unless-stopped`, `--env-file`.

## The one missing piece

**A Cloudflare API token for the `furrycolombia.com` account with
`Account → Cloudflare Tunnel → Edit` and `Zone → DNS → Edit`.** Everything else
is ready; without it neither the tunnel nor the DNS record can be created.

Create it under **My Profile → API Tokens** in the Cloudflare account that owns
`furrycolombia.com`, and store it as a repository secret — suggested name
`PROD_CF_TUNNEL_TOKEN`, to avoid inheriting the naming confusion above.

## Restore runbook

Once that token exists:

1. **Create a tunnel** in the production account, e.g. `libra-prod`, and save
   its credentials as a repository secret so the next rebuild does not repeat
   this exercise.
2. **Write an ingress config** mapping `store.furrycolombia.com` (and any other
   hostnames wanted) to `http://localhost:9090`.
3. **Start the container** from the recipe above, with runtime env resolved for
   `prod` (`scripts/load-env.mjs` resolves `$secret:` references from
   `.secrets` — do **not** set `CI=true`, which makes it skip that file).
4. **Point DNS** — `store.furrycolombia.com` CNAME to
   `<tunnel-uuid>.cfargotunnel.com`, proxied.
5. **Verify** the hostname returns `200`, not `530`.

### Clerk production instance and the Supabase side effect

The apps assume one Clerk instance on one domain. Nothing in code changes for
production; these are dashboard steps, done once, before the first
authenticated request.

1. In Clerk, create the production instance with primary domain
   `store.furrycolombia.com`. Clerk lists the DNS records it needs — a
   frontend-API CNAME (`clerk.store.furrycolombia.com`), plus account-portal
   and email records if those features are used. Create them in the
   `furrycolombia.com` Cloudflare zone as **DNS-only** records.
2. Copy the production publishable key, secret key and frontend-API domain into
   the repository secrets `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and
   `CLERK_DOMAIN`. `.env.prod` already references all three.
3. In Clerk, set the sign-in, sign-up and after-sign-in paths under
   `/auth/<locale>/...`, matching the auth app's `basePath`.
4. **Change `SUPABASE_CLERK_DOMAIN` in `.env.prod`** from the development
   `regular-puma-47.clerk.accounts.dev` host to the production frontend-API
   domain, and set the same value on the production Supabase project's
   third-party-auth provider. Supabase trusts Clerk tokens by issuer domain: if
   this step is skipped, every authenticated Supabase call falls back to the
   anon key and returns nothing, with no error.
5. Restrict Clerk's allowed redirect origins to
   `https://store.furrycolombia.com`.

Dev and staging keep the development instance, which already works on
`localhost` and on the staging tunnel hostname. No satellite domains are
needed anywhere: every app shares the one origin.

### Decide these before starting

- **The host would be the workstation**, so the store is online only while that
  machine is. For a shop with no active users this may be fine; it is still a
  change in what "production" means.
- **The image is the 2026-07-08 build**, which predates the Libra rename. The
  renamed build changes the cart cookie, the checkout session key and the
  permission cache key, so deploying it drops existing carts. Bringing back the
  old image first is the lower-risk order.
- **It talks to live production Supabase** — or rather, it would have to: as of
  2026-08-29 there is no live production Supabase project to talk to. This
  runbook restores the _host_; see
  [Database status](#database-status-update-2026-08-29) above for the
  separate, and now necessary, prerequisite of standing up a new Supabase
  project and restoring into it before this app can serve anything. The
  2026-07-08 image also predates the Clerk-based login in this branch, so
  whichever build gets deployed once the database exists again needs to match
  whichever auth stack that new project is configured to trust.
