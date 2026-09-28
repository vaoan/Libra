# Production status & restore path

> **Current state (2026-09-28): production is LIVE.** `store.furrycolombia.com`
> serves all six apps from the RackNerd box through Cloudflare Tunnel
> `libra-prod`, against the restored production database and the production
> Clerk instance. What remains is the owner's first login and the first
> supervised production E2E run (`docs/production-e2e.md`).
>
> The design this follows is
> `docs/superpowers/specs/2026-09-05-production-re-release-design.md`; the
> run's ledger is `.superpowers/sdd/2026-09-05-production-re-release/progress.md`.

## Where each piece stands

| Piece             | State                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host              | **Ready.** The RackNerd VPS that runs the Spotify→Discord bridge, provisioned by `scripts/server/provision-racknerd.sh` on 2026-09-27.                     |
| Database          | **Ready.** Supabase `olafyajipvsltohagiah` un-paused, wiped, migrated from the baseline, restored from the 2026-09-27 snapshot and verified.               |
| Image             | **Ready.** `docker/ci/Dockerfile` builds the production image; CI builds it on every PR.                                                                   |
| Deploy pipeline   | **Ready, untested against the box.** `.github/workflows/deploy-production.yml`; the dry run needs the branch merged to `develop` first.                    |
| Cloudflare tunnel | **Live.** Tunnel `libra-prod` (`9c82d482-5bfe-4744-a88a-23f4b407a28c`), connector running as systemd `cloudflared` on the box; `store` CNAME points at it. |
| Clerk production  | **Ready.** Production instance live at `clerk.furrycolombia.com`; libra points at it from the next deploy. See [Clerk](#clerk-production-instance).        |
| Scheduled backups | **Running.** `backup-scheduled.yml` re-enabled 2026-09-27, daily 04:00 UTC; it doubles as the keepalive against another Supabase pause.                    |

## What happened, briefly

The GCP free trial ended on 2026-08-07. Google suspended the project, which
stopped the VM and the `cloudflared` process that held the production tunnel.
Every production hostname has returned Cloudflare 530 / 1033 since. GCP is not
coming back: paying anything is a hard stop. The three GCP-era deploy
workflows were deleted on 2026-08-09 and are in git history.

The 2026-08-29 update to this document said both Supabase projects were
**gone**. That was wrong: they were **paused**. Supabase pauses free projects
after a week of inactivity, and a paused project answers `NXDOMAIN` and rejects
its tokens, which is indistinguishable from deletion from the outside. On
2026-09-27 `POST /v1/projects/olafyajipvsltohagiah/restore` on the Management
API brought production back with every row intact.

## Domain topology — read this before touching Cloudflare

This is the part that is easy to get wrong, and cost an hour in the 2026-08-09
investigation:

| domain              | role                | notes                                            |
| ------------------- | ------------------- | ------------------------------------------------ |
| `furrycolombia.com` | **production**      | `store.furrycolombia.com` is the only hostname   |
| `ffxivbe.org`       | **staging / local** | app hostnames here are _not_ production          |
| `ffxiv.be`          | dev tooling         | console, code-server, ttyd — the PCSetup tunnels |

Every app lives under the one origin, path-routed by nginx inside the
container: `/` landing, `/store`, `/auth`, `/admin`, `/payments`, `/studio`.
No subdomains, so Cloudflare needs exactly one ingress rule.

Three secrets are misleadingly named:

- **`PROD_CF_ZONE_ID` holds the `ffxivbe.org` zone** — a staging zone under a
  "PROD" name.
- **`PROD_CF_API_TOKEN` does reach `furrycolombia.com`**, but only for
  zone-read and cache-purge. It cannot create tunnels or touch DNS
  (verified again 2026-09-27: `cfd_tunnel` POST → authentication error).
- **`CLOUDFLARED_CONFIG_BASE64` / `CLOUDFLARED_TUNNEL_CREDENTIALS_BASE64`**
  are the **staging** tunnel's — their ingress lists `ffxivbe.org` hostnames.

### Email Address Obfuscation is off (2026-09-28)

Cloudflare's Scrape Shield rewrote every email-looking string in served HTML
to `[email protected]` plus a decoder script. The landing nav shows the
signed-in user's email, so the server HTML and the hydrated DOM differed and
React threw its hydration mismatch (#418) for every signed-in visitor. The CI
production E2E (`landing-hydration.spec.ts`, run `e2e-20260928-0455-e5fb`)
named the exact words. Turned off through the API with `PROD_CF_MASTER_TOKEN`:

    PATCH /zones/04a535d85c76121383822de00f42f2d3/settings/email_obfuscation {"value":"off"}

Note: `PROD_CF_ZONE_ID` in `.secrets` is **not** the `furrycolombia.com` zone
id (the API answers "Authentication error" for it); the id above came from
`GET /zones?name=furrycolombia.com`. Fix the secret before scripting against
the zone.

## Host

Libra runs as one Docker container on the RackNerd VPS; the Spotify bridge
stays as systemd services on the same host. The box has 961 MB of RAM, so the
container is capped at 600 MB (1.5 GB with swap), 0.75 CPU and 1024 pids, and
the bridge is protected with `CPUWeight=10000` and `OOMScoreAdjust=-500`
(`scripts/server/audio-priority.sh`). Under memory pressure Libra restarts;
the audio does not stutter. Whether that holds under real web load is the one
acceptance test still open — the user judges the audio while the site is
loaded.

Provisioning (`scripts/server/provision-racknerd.sh`, idempotent) purged the
unused daemons, capped journald at 50 MB, added a 2 GB swap file to the 1 GB
partition, installed Docker and `cloudflared`, opened only SSH in ufw, and
created `/opt/libra`. SSH is key-only: the deploy key is
`~/.ssh/libra_prod_ed25519`, stored as the `RACKNERD_VPS_SSH_KEY` repository
secret alongside `RACKNERD_VPS_IP` and `RACKNERD_VPS_USER`. The root password
still works on the RackNerd VNC console, as the recovery path.

## Database

Snapshot `prod_2026-09-27T15-43-03` (`.ai-context/backups/`, 3.8 MB) is the
pre-wipe state: 17 tables, 2404 rows, 154 receipt files, zero errors. The
`public` schema was dropped together with Libra's own `audit` and
`audit_archive` schemas, `supabase/migrations/20260902120000_baseline.sql` was
applied, and the snapshot was restored with `scripts/backup-prod.mjs
--restore`. The gate then passed:

```
node scripts/verify-prod-restore.mjs <snapshot-dir>
```

Every table matched its manifest count (user_profiles 196, orders 147,
order_items 147, permissions 46, user_permissions 1799, …), zero orders point
at a missing profile, and the receipts bucket holds all 154 files.

Two traps, both paid for already, are recorded in
[`.claude/rules/supabase-wipe.md`](../.claude/rules/supabase-wipe.md): drop
the audit schemas with `public` or the baseline fails with 42P16, and always
restore with `--restore` (it truncates the seeded reference tables first;
a hand restore leaves seeded and restored rows coexisting with no error).

**Nobody signs in before the Clerk switch is done.** `--restore` truncates
`user_profiles`, so a restore over a live system would wipe claimed
`identity_sub` values; the restore is finished and must not be repeated
after the first login.

## Deploy pipeline

`.github/workflows/deploy-production.yml` runs on every push to `main` and on
`workflow_dispatch`:

1. Builds `docker/ci/Dockerfile` on GitHub's runners and pushes
   `ghcr.io/vaoan/libra-prod:<sha>` and `:latest`. Build-time public values
   come from `.env.prod`; secrets from the repository.
2. Renders the runtime env file from secrets (never committed) and copies it
   with `docker/compose.yml` to `/opt/libra` over SSH.
3. `docker compose pull && up -d`, then gates on
   `http://127.0.0.1:9090/health` on the box. On failure it rolls back to the
   previous env file and reports.

The container binds `127.0.0.1:9090` only; the tunnel is the sole public path.
Fonts are vendored (`packages/shared/src/fonts`) so the build needs no network
— the Google-hosted loader failed repeatedly on 2026-09-27 and blocked the
image.

## The tunnel

Done 2026-09-28. No token on hand could create a tunnel (every existing API
token lacked `Account → Cloudflare Tunnel → Edit`), so the owner signed in to
the dashboard in an automation browser and a new user API token was minted
from that session with **every** account, zone and user permission group:
`PROD_CF_MASTER_TOKEN` (libra `.secrets` and repository secret). Treat it as
root for the furrycolombia Cloudflare account; rotate it from **My Profile →
API Tokens** if it ever leaks.

With it: tunnel `libra-prod` created (remotely managed), ingress
`store.furrycolombia.com → http://localhost:9090`, connector token saved as
`PROD_CLOUDFLARE_TUNNEL_TOKEN`, `store` CNAME repointed to
`9c82d482-5bfe-4744-a88a-23f4b407a28c.cfargotunnel.com` (proxied), and
`cloudflared service install <token>` on the box. The service is enabled and
survives reboots; a rebuild repeats only that last command.

`.env.prod` keeps `CLOUDFLARE_TUNNEL_APP_ENABLED=false`: that flag drives the
app-side tunnel tooling used for staging, not the production connector, which
is a host service.

## Clerk production instance

The apps assume one Clerk instance on one domain; nothing in code changes.
The production instance was created on 2026-09-27 from the aeleos side
(`aeleos/docs/deployment.md` §1 records how) and is shared with aeleos. Done:

- Primary domain `furrycolombia.com`, frontend API `clerk.furrycolombia.com`,
  the five DNS-only CNAMEs in place and verified; JWKS and OpenID discovery
  answer 200.
- Google (`AeleOS sign-in (Clerk production)`, GCP project
  `furrycolombia-candyshop`) and Discord (`Furry Colombia`) OAuth apps entered
  into the instance's connections. Password sign-up off.
- Clerk's Supabase integration activated on the production instance, so its
  tokens carry `role=authenticated`.
- The production Supabase project trusts the issuer
  `https://clerk.furrycolombia.com` (third-party auth entry
  `e2c78d94-…`, added 2026-09-27 through the Management API). It trusts
  nothing else: the development instance never reaches production data.
- libra reads the keys as the repository secrets `PROD_CLERK_PUBLISHABLE_KEY`,
  `PROD_CLERK_SECRET_KEY` and `PROD_CLERK_DOMAIN`; `.env.prod` and
  `deploy-production.yml` reference those. The unprefixed `CLERK_*` secrets
  stay on the development instance for CI, and the E2E guard refuses any
  `sk_live_` key.

`scripts/clerk-email-parity.mjs` lists restored profiles with no matching
Clerk user. The production instance starts with zero users, so every one of
the 196 profiles is re-linked by email on its owner's first sign-in; the
parity list is the support list if someone's email changed.

## Cutover, strictly ordered

1. Clerk production live and verified — **done 2026-09-27**; libra switches to it on the next deploy.
2. Database restored and verified — **done 2026-09-27**.
3. Container deployed via the workflow, healthcheck green — **done 2026-09-27**;
   audio under load still to be judged by the owner.
4. Tunnel connected, `store.furrycolombia.com` returns 200 — **done 2026-09-28**.
5. First login.

## Related

- [Infrastructure & Deployment Guide](./infrastructure.md) — the GCP-era
  blueprint; the RackNerd setup above supersedes its host sections.
- [Production Incident Playbook](./production-incident-playbook.md)
- [Production E2E runbook](./production-e2e.md) — Playwright runs against
  the live store, run-scoped and prunable; by hand or, since 2026-09-28, from
  `e2e-production.yml` after each deploy (off switch: repository variable
  `PRODUCTION_E2E_IN_CI`)
- [Environment System](./environment.md)
