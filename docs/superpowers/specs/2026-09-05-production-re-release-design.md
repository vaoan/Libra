# Production Re-Release — Design Spec

**Date:** 2026-09-05
**Status:** Draft — awaiting review
**Scope:** Hosting, database, identity, E2E hygiene, ingress, deploy pipeline

---

## Summary

Bring Libra back online after the 2026-08-07 outage, at effectively **zero
marginal cost**, by co-locating it on the RackNerd VPS that already runs the
Spotify→Discord bridge.

The constraint driving every decision: **paying anything is close to a hard
stop** (ceiling ~$20/year). The arrangement described here costs **$0
additional**, because the box, the domain, the Supabase project and the Clerk
plan are all already paid for or free.

This is explicitly a **temporary shape**. The intent is to migrate to a larger
box at Black Friday (~11 weeks out, 2 GB for ~$18/yr), so everything is built
so that migration is an afternoon: a tagged image, an env file, and a DNS
change.

---

## Current state (verified 2026-09-05)

| Fact                                     | Evidence                                                          |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Production has no host                   | GCP trial ended; VM, tunnel and its credentials gone              |
| Deploy workflows deleted                 | `deploy-gcp.yml`, `deploy-local.yml`, `deploy-production.yml`     |
| Supabase prod project is **alive**       | `ACTIVE_HEALTHY` via Management API; was **paused**, not deleted  |
| Prod data is intact                      | 196 profiles, 147 orders, 46 permissions, 1799 user_permissions   |
| Prod is on the **old** schema            | `user_profiles.identity_sub` does not exist                       |
| `auth.users` recovered                   | 196 users, all with emails                                        |
| Supabase dev project is **gone**         | Absent from the Management API project list                       |
| Clerk is a **development** instance      | `regular-puma-47.clerk.accounts.dev`, `pk_test`/`sk_test`         |
| Clerk instance is **shared** with AeleOS | Identical domain and keys in both repos' `.secrets`               |
| Clerk had 77 users, 4 real               | 73 leaked E2E users purged 2026-09-05; now 4                      |
| RackNerd box exists and is idle          | 1 vCPU, 961 MB, 19 GB, Ubuntu 24.04 x86_64, load 0.01, 58d uptime |
| Libra container measures 617.6 MiB       | Measured from `ghcr.io/vaoan/libra-prod:latest`, cgroup figure    |

### Correcting the record

Two documents are now wrong in ways that would mislead:

- `docs/production-status.md` states both Supabase projects are gone and
  unrecoverable. Prod was **paused**; pausing removes the subdomain from DNS,
  which is why three resolvers returned NXDOMAIN.
- The auth migration spec justifies re-keying on the grounds that `auth.users`
  rows "are gone and cannot be recovered." They were recovered. **The decision
  to move to Clerk stands on its own merits** — it is already merged, and
  keying domain data on a local id is the better design — but the stated
  rationale must be corrected so a future reader does not think the reshape
  was forced.

---

## Decisions

| Decision                | Choice                                             |
| ----------------------- | -------------------------------------------------- |
| Host                    | Existing RackNerd VPS, co-located with bot         |
| Database                | Reuse Supabase `olafyajipvsltohagiah`              |
| Identity                | Clerk, promoted to production                      |
| Clerk production domain | `clerk.furrycolombia.com`                          |
| Playground              | **Deleted entirely** from the monorepo             |
| Public apps             | Six: landing, store, auth, admin, payments, studio |
| Ingress                 | Dashboard-managed Cloudflare Tunnel                |
| Container runtime       | Docker (not Podman)                                |
| Horizon                 | Migrate to a 2 GB box at Black Friday              |

### Options rejected

- **Cloudflare Workers / OpenNext** — $0 forever and commercial use permitted,
  but weeks of re-platform work and a hard **10 ms CPU per request** limit on
  the free plan that Next.js SSR may exceed. Failing that limit means Workers
  Paid at $60/yr, worse than every alternative.
- **A second VPS** ($21.99/yr) — the clean answer if co-location degrades
  audio. Held as the fallback, decided by the load test in §6.
- **Oracle Always Free** — signup rejections are a widely reported 2026
  problem and have already affected this user.
- **A new Supabase project** — impossible anyway: both free-tier slots are
  occupied by AeleOS and Libra.

---

## §1 Host and topology

Libra runs as a **Docker container** on the RackNerd box; the Spotify bridge
stays as **systemd services on the host**. Same machine, separate lifecycles —
that separation is what allows Libra's resources to be capped without touching
the bridge.

Measured budget:

```
 961 MB  total
−230 MB  OS + Spotify bridge, after the §6.1 trim
         (380 MB used today, ~150 MB reclaimed)
−100 MB  dockerd + containerd
− 40 MB  cloudflared
−500 MB  Libra container (6 apps, 1 nginx worker, no watcher)
────────
 ≈90 MB  headroom, plus 3 GB swap
```

Ninety megabytes is thin, and it is the honest number — an earlier draft
computed ~140 MB by subtracting the trim from _total_ rather than from _used_.
The 3 GB swap and the container's hard 600 MB cap are what make it safe: under
pressure Libra degrades or restarts, and the audio bridge does not.

The container measured **617.6 MiB** on a many-core machine with 34 nginx
workers; the VPS's single core yields one worker, and dropping playground and
`watcher.mjs` accounts for the rest.

**Portability is a first-class requirement.** No host-specific state outside
the provisioning script; deployment is a tagged image plus an env file.

---

## §2 Database

Reuse `olafyajipvsltohagiah`. `NEXT_PUBLIC_SUPABASE_URL` needs no change.

1. **PAT regenerated** and pushed to GitHub secrets (done 2026-09-05). Not a
   blocker either way — the wipe and migrations can also run over the Supabase
   **connection pooler** using `PROD_SUPABASE_DB_PASSWORD` and `pg`.
2. **Verify** anon and service-role keys and the JWT secret survived the pause.
   Service-role key confirmed working.
3. **Snapshot before wiping.** Live data matches the July backup exactly, but
   a fresh dump removes the last single point of failure — and becomes the
   restore source, so its provenance is current.
4. **Wipe and rebuild** per `.claude/rules/supabase-wipe.md`: `DROP SCHEMA
public CASCADE`, recreate, re-grant, apply migrations.
5. **Leave `auth.users` alone.** Dead weight under Clerk, but the only
   remaining copy of the old provider-identity mapping.
6. **Wipe storage and restore all 154 receipts** from the backup, so the whole
   database comes from one verified artifact.
7. **Restore → verify → only then allow logins.** `--restore` truncates
   `user_profiles`; restoring over a live system wipes claimed `identity_sub`
   values.
8. **Re-enable `backup-scheduled.yml`**, which doubles as the keepalive that
   prevents another inactivity pause.

### Restore traps (already paid for once)

- Migrations **seed** `permissions`, `resource_permissions`,
  `product_templates`, `payment_settings`. `--restore` truncates first. A
  hand-run restore that skips the truncate **corrupts silently** —
  `resource_permissions` and `product_templates` have no unique key that
  catches duplicates, because the unique index includes a nullable column and
  NULL never equals NULL. A rehearsal produced 92 and 10 rows where 46 and 5
  were correct, with no error raised.
- **Truncate `audit.logged_actions` too** — seeding writes 100 audit rows that
  take `event_id` values the backup's own rows need.

### Acceptance

17/17 tables, 196 profiles, 154/154 receipts, zero orphaned foreign keys —
before a single login.

---

## §3 Removing playground

One atomic PR. Splitting it fails `check:doc-refs`.

**Keep one thing:** `[locale]/env/page.tsx`, the env debug viewer, moves to
**admin** — back-office diagnostics behind auth, which is where it belonged.
The other two pages are placeholders; `features/auth` is duplicated
scaffolding.

**CI:** `ci.yml` (change-filter output, path filter, four `select-workspaces.sh`
call sites, the `madge` path list, `NEXT_PUBLIC_PLAYGROUND_URL`),
`pr-checks.yml` (filter, output, summary row), `detect-changes.sh`,
`select-workspaces.sh` (whose positional-argument contract shifts — the four
`ci.yml` call sites must change in lockstep), `knip.json`, and the two
playground path lists in `package.json`'s `check:tools`.

**Code:** `config/app-links.json`, `packages/shared/src/config/appUrls.ts` + 3
tests, `AppNavigation.tsx` + test, 12 i18n message files, 3 test fixtures, 3
e2e specs, `docker/prod/nginx.conf`, `supervisord.conf`, `warmer.sh`,
`watcher.mjs`, `boot-reporter.mjs`, `ci/health.spec.ts`, 6 scripts.

**Env:** remove `NEXT_PUBLIC_PLAYGROUND_URL` from all four env files together —
`pnpm lint:env` fails on key drift.

**Docs:** CLAUDE.md (the "Playground is permanent" principle, ports table, env
viewer URL), `monorepo-architecture.md` (delete the section and the "NEVER
delete" rule), `environment.md`, `README.md`, `quality-gates.md`,
`production-incident-playbook.md`, `ADR-0135`, the `verify-code` skill. Delete
`docs/standards/playground-standardization.md`.

This is load-bearing for §1: six `next-server` processes instead of seven is
what makes the memory budget work.

---

## §4 Clerk production promotion

**Free**: 10,000 MAU and a custom domain on the free plan. 196 users.

**Longest lead item — start first.** DNS propagation can take 48 hours and it
depends on AeleOS.

Libra and AeleOS share one dev instance, so promotion moves the **platform's**
Clerk application and both apps together. Confirm AeleOS has no claimed
identities on the dev instance before starting.

1. Deploy the production instance on `clerk.furrycolombia.com`.
2. **Create your own Google and Discord OAuth apps** (both free). Mandatory —
   Clerk's shared development credentials "are not secure" in production. Your
   users split 170 Google / 26 Discord.
3. Add Clerk's DNS records to the Cloudflare zone, **DNS-only (grey cloud)** —
   proxying breaks certificate issuance and is the most common failure here.
4. Swap in `pk_live_` / `sk_live_` and the new `CLERK_DOMAIN`, in `.secrets`
   and GitHub secrets for **both repos**.
5. Repoint `SUPABASE_CLERK_DOMAIN` on the Libra and AeleOS projects.
6. Set `authorizedParties`; reconfigure SSO, integrations and webhooks by hand
   — **Clerk does not clone settings from development**.

**Ordering:** promotion changes every `sub`. `identity_sub` is entirely NULL
today, so it costs nothing now and strands users later. Sequence is rigid:
**Clerk production live → database restored and verified → first login.**

**Pre-cutover check:** diff the 196 recovered `auth.users` emails against what
production Clerk will present, producing a mismatch report. This converts the
auth spec's "unmeasurable until people sign in" risk into a list.

---

## §5 E2E test-user hygiene

**Done 2026-09-05:** purged 73 leaked users; 77 → 4. Dev instances are capped
at **100 users**, and at ~33/month the cap was ~3 weeks away.

**Root cause is the pattern, not an oversight.** Cleanup is a convention every
spec must remember:

```ts
test.beforeAll(async () => { user = await createTestUser("label", [...]); });
test.afterAll(async () => { await deleteTestUser(user).catch(() => {}); });
```

It fails when a spec creates without a matching delete (already the case at
`audit-log.spec.ts:142`, `reports.spec.ts:343`), when `beforeAll` throws
between two creations, when CI is cancelled, and when `--max-failures` bails
the worker.

### The fix: cleanup belongs to the creator

- `createTestUser` registers each user in a module-level registry; a
  **worker-scoped auto fixture** drains it on worker teardown, which Playwright
  runs even when tests fail or `beforeAll` throws. Existing call sites keep
  working; their `afterAll` blocks come out.
- `apps/store/e2e/auth.setup.ts` keeps the **teardown project** mechanism —
  correct, but currently wired only in `store`. Audit `auth`, `admin`,
  `landing`, `payments`.
- The two `.superpowers/sdd/` rehearsal scripts get `try/finally` and
  `+clerk_test` addresses. One is the likely source of the non-conforming user
  found on 2026-09-05.
- Assert every generated address carries `+clerk_test`.
- **Hard-fail E2E when `CLERK_SECRET_KEY` starts with `sk_live_`.**

### The sweep script is a fail-safe only

Not scheduled, not relied upon. It exists for killed machines, OOMs and hard
CI cancellations. Run it in CI with `if: always()` after the E2E job. **The
invariant is that it finds nothing.**

---

## §6 The box

Everything scripted into a provisioning script in the repo, so November's
migration is a replay.

**6.1 Reclaim first.** Purge `snapd`, `fwupd`, `ModemManager`, `udisks2`,
`multipathd`. Cap journald (`SystemMaxUse=50M`) and vacuum the existing 1.2 GB.
Expect 120–180 MB back. **Keep `unattended-upgrades`** — this box now faces the
internet.

**6.2 Docker** from the official apt repo (not snap). Costs ~100 MB for
`dockerd` + `containerd`. Podman would return most of that but Docker keeps the
existing `compose.yml` and `deploy-production.sh` and the November portability
story.

**6.3 Resource isolation — the load-bearing part.**

- `--memory=600m --memory-swap=1500m` — a Next.js leak kills the container,
  never the bridge; `restart: unless-stopped` recovers it.
- `--cpus="0.75"` — SSR bursts cannot monopolise the single core.
- `CPUWeight` high on `go-librespot` and `spotify-discord-bot` (cgroup v2 on
  Ubuntu 24.04) — audio wins every scheduling contest.
- `OOMScoreAdjust=-500` on both audio units — under pressure the kernel
  reaches for Libra first.

**6.4 Swap** 1 GB → 3 GB, `vm.swappiness=10`.

**6.5 Hardening.** Container binds `127.0.0.1:9090` only; with the tunnel the
box needs **no inbound ports except SSH**, enforced by `ufw`. Keep
`--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--pids-limit=1024`.

**Switch SSH to keys.** `vps-ssh.ps1` authenticates as `root` with a password
held in plaintext in `.secrets`. Defensible for a private music bot; not for a
box taking orders. Set `PasswordAuthentication no`.

**6.6 Acceptance test.** Record `free -m` before and after. Then **load-test
the store while the bridge is streaming and confirm no audio stutter.** That
test decides co-location; if it fails, buy the second box.

---

## §7 Ingress and deploy

**One hostname, path-routed** — nginx in the container already does the
routing:

```
store.furrycolombia.com/  → landing    /store → store      /auth → auth
                        /admin → admin  /payments → payments  /studio → studio
```

So Cloudflare needs exactly one ingress rule → `http://localhost:9090`. The
record already exists and is proxied.

**Dashboard-managed Cloudflare Tunnel.** This dissolves the "one missing
piece" in `production-status.md`: a remotely-managed tunnel needs only a
**tunnel token**, not an API token with Tunnel-Edit and DNS-Edit. `.env.prod`
already has `CLOUDFLARE_TUNNEL_APP_TOKEN` and
`CLOUDFLARE_TUNNEL_APP_ENABLED=false`.

**Drop `watcher.mjs` from the prod image** — 50 MB, as much as the entire
Spotify bot. Docker's healthcheck plus `restart: unless-stopped` covers
liveness; alerting moves to an external Cloudflare health check.

**`deploy-production.yml`**, replacing the three deleted workflows:

1. Trigger: push to `main`, plus `workflow_dispatch`.
2. Build on GitHub Actions (free, unlimited on a public repo) → GHCR
   `:<sha>` and `:latest`.
3. Render `.env.prod` from GitHub secrets in CI and copy it over; never
   committed. **`load-env.mjs` skips `.secrets` when `CI=true`** — the render
   step must supply values explicitly.
4. SSH with a key (new `RACKNERD_*` secrets) → `docker compose pull && up -d`.
5. Health-gate `/health` through the tunnel; roll back to the previous tag on
   failure.

---

## Sequencing

Three tracks run in parallel; only the cutover is ordered.

| Track            | Work                                        | Blocks  |
| ---------------- | ------------------------------------------- | ------- |
| **A — Identity** | §4 Clerk promotion, §5 E2E hygiene          | Cutover |
| **B — Data**     | §2 snapshot, wipe, migrate, restore, verify | Cutover |
| **C — Platform** | §3 playground removal, §6 box, §7 pipeline  | Cutover |

Track A starts first (48 h DNS, external dependency). Within it, the §5
cleanup work — creator-owned teardown and the `sk_live_` guard especially —
lands **before** the §4 promotion, so the production instance is never exposed
to the leak.

**Cutover, strictly ordered:**

1. Clerk production live and verified
2. Database restored and verified (17/17, 196, 154/154, zero orphans)
3. Container deployed, healthcheck green, audio unaffected under load
4. Tunnel connected, `store.furrycolombia.com` returns 200
5. First login

---

## Risks

| Risk                                        | Mitigation                                                |
| ------------------------------------------- | --------------------------------------------------------- |
| Web load degrades Discord audio             | cgroup caps, CPUWeight, OOMScoreAdjust; load test decides |
| 90 MB headroom is thin                      | 3 GB swap; 600 MB hard cap; second box at $21.99          |
| Single point of failure — one box, two apps | Accepted; November migration splits them                  |
| Supabase pauses again                       | `backup-scheduled.yml` as keepalive                       |
| Clerk email mismatch strands a user         | Pre-cutover mismatch report from recovered `auth.users`   |
| Promotion invalidates AeleOS identities     | Verify no claims on the dev instance first                |
| RackNerd is a budget host                   | Portable by design; backups off-box                       |
| Restore run by hand corrupts silently       | Always use `--restore`; never hand-run                    |

---

## Out of scope

- Re-platforming to edge/serverless
- Restoring a dev Supabase project (deleted; local Docker stack covers dev)
- The AeleOS actor registry and picker
- Migrating to the Black Friday box (planned, separate)
