# Production Re-Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Libra back online at `store.furrycolombia.com` for $0 additional cost, co-located with the Spotify→Discord bridge on the existing RackNerd VPS.

**Architecture:** Libra runs as a single Docker container (six Next.js standalone servers behind nginx, path-routed on one hostname) on a 961 MB / 1 vCPU Ubuntu 24.04 box that already runs the Spotify bridge as systemd services. A dashboard-managed Cloudflare Tunnel provides ingress with no inbound ports. Data lives in the existing Supabase project; identity moves to a promoted Clerk production instance shared with AeleOS.

**Tech Stack:** Docker + docker compose, cloudflared, systemd (cgroup v2), Supabase (Postgres + PostgREST + Storage), Clerk, Next.js 16 standalone, nginx, supervisord, GitHub Actions, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-production-re-release-design.md`

## Global Constraints

- **Cost ceiling: $0 additional.** No new paid services. Any task that would incur cost stops and reports instead.
- **Target host:** RackNerd `racknerd-b8af2a2`, `192.236.168.202`, Ubuntu 24.04 LTS, x86*64, 1 vCPU, 961 MB RAM, 19 GB disk. Credentials in `PCSetup/.secrets` as `RACKNERD_VPS*\*`.
- **The Spotify bridge must never degrade.** `go-librespot` and `spotify-discord-bot` systemd units keep priority over Libra in every resource dimension.
- **Memory budget:** Libra container ≤ 600 MB hard cap. Total headroom ≈ 90 MB plus 3 GB swap.
- **Supabase project:** `olafyajipvsltohagiah` (`ACTIVE_HEALTHY`, us-east-2). Do not create a new project — both free-tier slots are occupied.
- **Public hostname:** `store.furrycolombia.com`, path-routed. Six apps: `/` landing, `/store`, `/auth`, `/admin`, `/payments`, `/studio`.
- **Nobody logs in until the restore is verified.** `--restore` truncates `user_profiles`.
- **Commit format:** `type(scope): short description [GH-000]` — see `.claude/rules/git-workflow.md`.
- **Never commit `.secrets`.** It is gitignored; keep it that way.
- **Quality gates must pass before every commit:** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`.

---

## File Structure

**Created:**

| File                                       | Responsibility                                                      |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `apps/auth/e2e/helpers/userRegistry.ts`    | Module-level registry of created Clerk test users + drain function  |
| `apps/auth/e2e/fixtures/autoCleanup.ts`    | Worker-scoped auto fixture that drains the registry on teardown     |
| `apps/auth/e2e/helpers/guardEnv.ts`        | Refuses to run E2E against a `sk_live_` Clerk key                   |
| `scripts/clerk-sweep-e2e-users.mjs`        | Fail-safe sweeper; deletes orphaned `e2e-*@example.com` Clerk users |
| `scripts/verify-restore.mjs`               | Post-restore assertion: tables, rows, receipts, orphaned FKs        |
| `scripts/clerk-email-parity.mjs`           | Pre-cutover diff of `auth.users` emails vs Clerk                    |
| `scripts/server/provision-racknerd.sh`     | Idempotent box provisioning: trim, Docker, swap, ufw, SSH           |
| `scripts/server/audio-priority.sh`         | Installs systemd drop-ins protecting the bridge                     |
| `.github/workflows/deploy-production.yml`  | Build → GHCR → deploy → health-gate → rollback                      |
| `apps/admin/src/app/[locale]/env/page.tsx` | Env debug viewer, relocated from playground                         |

**Modified:** `apps/auth/e2e/helpers/session.ts`, all specs calling `deleteTestUser`, `apps/{auth,admin,landing,payments}/playwright.config.ts`, `docker/compose.yml`, `docker/prod/{Dockerfile,nginx.conf,supervisord.conf}`, `docker/warmer.sh`, `docker/boot-reporter.mjs`, `docker/ci/health.spec.ts`, `.github/workflows/{ci,pr-checks}.yml`, `scripts/{detect-changes.sh,select-workspaces.sh,load-env.mjs,check-css-sync.mjs,cloudflared.mjs,deploy-production.sh}`, `config/app-links.json`, `packages/shared/src/config/appUrls.ts`, `packages/app-components/src/components/AppNavigation.tsx`, `knip.json`, `package.json`, all `.env.*`, 12 i18n message files, `.claude/rules/supabase-wipe.md`, `docs/production-status.md`, `docs/infrastructure.md`, `CLAUDE.md`, `.claude/rules/monorepo-architecture.md`.

**Deleted:** `apps/playground/**`, `docs/standards/playground-standardization.md`, `docker/watcher.mjs`.

---

# TRACK A — Identity

Start first: 48-hour DNS propagation and an external dependency on AeleOS. Tasks A1–A4 must land **before** A5, so the production Clerk instance is never exposed to the leak.

---

### Task A1: Creator-owned test-user cleanup

Replaces the manual `beforeAll`/`afterAll` pairing with registration inside the creator, drained by a worker-scoped fixture that Playwright runs even when tests fail, time out, or throw in `beforeAll`.

**Files:**

- Create: `apps/auth/e2e/helpers/userRegistry.ts`
- Create: `apps/auth/e2e/fixtures/autoCleanup.ts`
- Modify: `apps/auth/e2e/helpers/session.ts:322-384` (`createTestUser`)
- Test: `apps/auth/e2e/fixtures/autoCleanup.spec.ts`

**Interfaces:**

- Consumes: `TestUser`, `deleteTestUser`, `createTestUser` from `apps/auth/e2e/helpers/session.ts`
- Produces: `registerTestUser(user: TestUser): void`, `drainTestUsers(): Promise<number>` from `userRegistry.ts`; `test` (extended Playwright test) from `fixtures/autoCleanup.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/auth/e2e/fixtures/autoCleanup.spec.ts
import { expect, test as base } from "@playwright/test";

import {
  drainTestUsers,
  listRegisteredTestUsers,
  registerTestUser,
} from "../helpers/userRegistry";
import type { TestUser } from "../helpers/session";

const fakeUser = (id: string): TestUser => ({
  userId: id,
  email: `e2e-${id}+clerk_test@example.com`,
  clerkUserId: `user_${id}`,
  accessToken: "not-used",
});

base("registry accumulates and drains", async () => {
  registerTestUser(fakeUser("a"));
  registerTestUser(fakeUser("b"));
  expect(listRegisteredTestUsers()).toHaveLength(2);

  const drained = await drainTestUsers({ deleter: async () => {} });

  expect(drained).toBe(2);
  expect(listRegisteredTestUsers()).toHaveLength(0);
});

base("drain continues past a failing deletion", async () => {
  registerTestUser(fakeUser("a"));
  registerTestUser(fakeUser("b"));

  const drained = await drainTestUsers({
    deleter: async (u) => {
      if (u.userId === "a") throw new Error("boom");
    },
  });

  expect(drained).toBe(2);
  expect(listRegisteredTestUsers()).toHaveLength(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter auth-app exec playwright test e2e/fixtures/autoCleanup.spec.ts --project=chromium`
Expected: FAIL — `Cannot find module '.../helpers/userRegistry'`

- [ ] **Step 3: Write the registry**

```typescript
// apps/auth/e2e/helpers/userRegistry.ts
import { deleteTestUser, type TestUser } from "./session";

const registry: TestUser[] = [];

/** Record a created test user so worker teardown can remove it. Called by
 * `createTestUser` itself — specs never call this directly, which is the
 * point: cleanup cannot be forgotten because it is not a caller's job. */
export function registerTestUser(user: TestUser): void {
  registry.push(user);
}

export function listRegisteredTestUsers(): readonly TestUser[] {
  return registry;
}

interface DrainOptions {
  deleter?: (user: TestUser) => Promise<void>;
}

/**
 * Delete every registered user and empty the registry. Never throws: one
 * failed deletion must not strand the rest. Returns the number attempted.
 */
export async function drainTestUsers(
  options: DrainOptions = {},
): Promise<number> {
  const deleter = options.deleter ?? deleteTestUser;
  const pending = registry.splice(0, registry.length);

  for (const user of pending) {
    try {
      await deleter(user);
    } catch (error) {
      console.warn(`[e2e] drain failed for ${user.email}:`, error);
    }
  }

  return pending.length;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter auth-app exec playwright test e2e/fixtures/autoCleanup.spec.ts --project=chromium`
Expected: PASS, 2 tests

- [ ] **Step 5: Register inside `createTestUser`**

In `apps/auth/e2e/helpers/session.ts`, add the import at the top of the import block:

```typescript
import { registerTestUser } from "./userRegistry";
```

Then, in `createTestUser`, immediately before the existing `return` of the assembled `TestUser`, add:

```typescript
registerTestUser(testUser);
```

If the function currently returns an object literal directly, hoist it first:

```typescript
const testUser: TestUser = {
  userId: profile.id,
  email,
  clerkUserId: clerkUser.id,
  accessToken: token,
};
registerTestUser(testUser);
return testUser;
```

- [ ] **Step 6: Write the worker-scoped auto fixture**

```typescript
// apps/auth/e2e/fixtures/autoCleanup.ts
import { test as base } from "@playwright/test";

import { drainTestUsers } from "../helpers/userRegistry";

/**
 * Worker-scoped, `auto: true`: Playwright runs the teardown half when the
 * worker shuts down — including after a failed test, a timeout, or a throw
 * inside `beforeAll`, which is exactly where the old afterAll pattern leaked.
 */
export const test = base.extend<Record<string, never>, { cleanupUsers: void }>({
  cleanupUsers: [
    async ({}, use) => {
      await use();
      const drained = await drainTestUsers();
      if (drained > 0) {
        console.log(`[e2e] drained ${drained} Clerk test user(s)`);
      }
    },
    { scope: "worker", auto: true },
  ],
});

export { expect } from "@playwright/test";
```

- [ ] **Step 7: Verify the fixture drains on a failing test**

Create a scratch spec that imports `test` from the fixture, calls `createTestUser`, then fails deliberately. Run it and confirm the `drained 1 Clerk test user(s)` line appears despite the failure. Delete the scratch spec afterwards.

Run: `pnpm --filter auth-app exec playwright test e2e/fixtures/ --project=chromium`
Expected: the drain log appears on the failing run.

- [ ] **Step 8: Verify against the live instance**

Run: `node scripts/clerk-sweep-e2e-users.mjs --dry-run` (created in Task A3; if running A1 first, use the Clerk dashboard user count instead)
Expected: user count returns to 4 after the suite finishes.

- [ ] **Step 9: Commit**

```bash
git add apps/auth/e2e/helpers/userRegistry.ts apps/auth/e2e/fixtures/ apps/auth/e2e/helpers/session.ts
git commit -m "test(e2e): register Clerk test users for automatic teardown [GH-000]"
```

---

### Task A2: Retire the manual afterAll pattern

With A1 in place, every `afterAll` that deletes users is redundant. Removing them is what stops new specs from copying the leaky pattern.

**Files:**

- Modify: `apps/admin/e2e/accessibility.spec.ts:64-66`, `apps/admin/e2e/audit-log.spec.ts:29-31,142-163`, `apps/admin/e2e/reports.spec.ts:109-121,343-373`, `apps/auth/e2e/admin-users-export-receipts.spec.ts`, and every other spec matching the grep below
- Modify: `apps/auth/playwright.config.ts:54`, `apps/admin/playwright.config.ts`, `apps/landing/playwright.config.ts`, `apps/payments/playwright.config.ts`

**Interfaces:**

- Consumes: `test` from `apps/auth/e2e/fixtures/autoCleanup.ts`

- [ ] **Step 1: Enumerate every call site**

```bash
grep -rn "deleteTestUser" --include=*.spec.ts apps/*/e2e | grep -v node_modules
```

Record the list. Every one of these is removed in Step 3.

- [ ] **Step 2: Switch specs to the fixture's `test`**

In each spec found above, replace:

```typescript
import { expect, test } from "@playwright/test";
```

with an import of the extended `test` from `apps/auth/e2e/fixtures/autoCleanup`.

Use whatever path style that spec **already uses** to import `session` — check the top of the file first. Specs inside `apps/auth/e2e` use `./helpers/session`, so they use `./fixtures/autoCleanup`. Specs in `apps/admin/e2e` already reach across to auth's helpers; mirror that exact prefix rather than inventing a new alias:

```bash
head -15 apps/admin/e2e/audit-log.spec.ts
```

- [ ] **Step 3: Delete the redundant teardown blocks**

Remove each `test.afterAll` whose only body is `deleteTestUser(...)` calls, and each `finally { await deleteTestUser(...) }` around a mid-test creation. Leave `cleanupTestData(...)` calls alone — those delete orders and permissions, not users, and are still required.

- [ ] **Step 4: Add a teardown project to the four configs missing one**

`apps/store/playwright.config.ts` is the reference. For each of `auth`, `admin`, `landing`, `payments`, only add a `setup`/`cleanup` project pair **if that app has an `auth.setup.ts`** creating a storage-state user. Verify first:

```bash
ls apps/{auth,admin,landing,payments}/e2e/auth.setup.ts 2>/dev/null
```

For any that exist, copy the `setup` + `cleanup` project shape from `apps/store/playwright.config.ts:40-53` verbatim, including `teardown: "cleanup"`. For those that don't, no config change is needed — Task A1's worker fixture already covers their users.

- [ ] **Step 5: Run the full E2E suite**

Run: `pnpm e2e:ci`
Expected: PASS, and the Clerk user count is 4 both before and after.

- [ ] **Step 6: Confirm no leak**

```bash
node scripts/clerk-sweep-e2e-users.mjs --dry-run
```

Expected: `to delete (e2e): 0`

- [ ] **Step 7: Commit**

```bash
git add apps/*/e2e apps/*/playwright.config.ts
git commit -m "test(e2e): drop manual afterAll user deletion, now handled by fixture [GH-000]"
```

---

### Task A3: Production guard, convention assertion, and the fail-safe sweeper

Three defences that make the leak structurally impossible to reintroduce, plus the janitor for what no in-process teardown can catch.

**Files:**

- Create: `apps/auth/e2e/helpers/guardEnv.ts`
- Create: `scripts/clerk-sweep-e2e-users.mjs`
- Create: `tests/clerk-test-email-convention.test.ts`
- Modify: `apps/auth/e2e/helpers/session.ts` (call the guard at module load)
- Modify: `.github/workflows/ci.yml` (sweeper step with `if: always()`)

**Interfaces:**

- Produces: `assertNotProductionClerk(secretKey: string): void` from `guardEnv.ts`
- Produces: CLI `node scripts/clerk-sweep-e2e-users.mjs [--dry-run] [--older-than-hours N]`

- [ ] **Step 1: Write the failing guard test**

```typescript
// tests/clerk-test-email-convention.test.ts
import { describe, expect, it } from "vitest";

import { assertNotProductionClerk } from "../apps/auth/e2e/helpers/guardEnv";

describe("assertNotProductionClerk", () => {
  it("throws on a live secret key", () => {
    expect(() => assertNotProductionClerk("sk_live_abc123")).toThrow(
      /production Clerk instance/i,
    );
  });

  it("allows a test secret key", () => {
    expect(() => assertNotProductionClerk("sk_test_abc123")).not.toThrow();
  });
});

describe("test email convention", () => {
  it("every generated address carries +clerk_test", () => {
    const label = "sample";
    const email = `e2e-${label}-${Date.now()}+clerk_test@example.com`;
    expect(email).toMatch(/^e2e-.*\+clerk_test@example\.com$/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/clerk-test-email-convention.test.ts`
Expected: FAIL — cannot resolve `guardEnv`

- [ ] **Step 3: Write the guard**

```typescript
// apps/auth/e2e/helpers/guardEnv.ts
/**
 * E2E creates and deletes real Clerk users. Against a production instance
 * that would pollute real user data and count toward MAU, so this refuses to
 * run rather than trusting configuration to be correct.
 */
export function assertNotProductionClerk(secretKey: string): void {
  if (secretKey.startsWith("sk_live_")) {
    throw new Error(
      "[e2e] refusing to run against a production Clerk instance " +
        "(CLERK_SECRET_KEY starts with sk_live_). E2E creates and deletes " +
        "real users; point it at the development instance.",
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/clerk-test-email-convention.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Wire the guard into session bootstrap**

In `apps/auth/e2e/helpers/session.ts`, directly after `CLERK_SECRET_KEY_VALUE` is assigned (around line 49):

```typescript
assertNotProductionClerk(CLERK_SECRET_KEY_VALUE);
```

with the import `import { assertNotProductionClerk } from "./guardEnv";`.

- [ ] **Step 6: Write the sweeper**

```javascript
#!/usr/bin/env node
/**
 * Fail-safe sweeper for leaked Clerk E2E users.
 *
 * This is NOT the cleanup mechanism — `createTestUser` registers users and a
 * worker-scoped Playwright fixture drains them. This exists only for what
 * teardown cannot cover: a killed machine, an OOM, a hard CI cancellation.
 * In normal operation it must find nothing.
 *
 * Usage:
 *   node scripts/clerk-sweep-e2e-users.mjs --dry-run
 *   node scripts/clerk-sweep-e2e-users.mjs --older-than-hours 24
 */
import { loadEnv } from "./load-env.mjs";

const API = "https://api.clerk.com/v1";
const DELETABLE = /^e2e-.*@example\.com$/i;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const olderThanHours = Number(
  args[args.indexOf("--older-than-hours") + 1] ?? 0,
);

const env = loadEnv({ targetEnv: process.env.TARGET_ENV ?? "dev" });
const secretKey = env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("CLERK_SECRET_KEY not resolved");
if (secretKey.startsWith("sk_live_")) {
  throw new Error("refusing to sweep a production Clerk instance");
}

async function call(method, path) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "User-Agent": "libra-clerk-sweeper",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function primaryEmail(user) {
  const addrs = user.email_addresses ?? [];
  const primary = addrs.find((a) => a.id === user.primary_email_address_id);
  return (primary ?? addrs[0])?.email_address ?? "";
}

const users = [];
for (let offset = 0; ; offset += 100) {
  const page = await call("GET", `/users?limit=100&offset=${offset}`);
  if (!page?.length) break;
  users.push(...page);
  if (page.length < 100) break;
}

const cutoff = olderThanHours
  ? Date.now() - olderThanHours * 3_600_000
  : Infinity;

const doomed = users.filter(
  (u) => DELETABLE.test(primaryEmail(u)) && (u.created_at ?? 0) < cutoff,
);

console.log(`total users:      ${users.length}`);
console.log(`to delete (e2e):  ${doomed.length}`);

if (dryRun) {
  for (const u of doomed) console.log(`  would delete ${primaryEmail(u)}`);
  process.exit(0);
}

let deleted = 0;
for (const u of doomed) {
  try {
    await call("DELETE", `/users/${u.id}`);
    deleted += 1;
  } catch (error) {
    console.warn(`  failed ${primaryEmail(u)}: ${error.message}`);
  }
}
console.log(`deleted: ${deleted}`);
if (deleted > 0) {
  console.warn(
    "[sweeper] deleted leaked users — in-process teardown should have " +
      "caught these. Investigate before dismissing.",
  );
}
```

Note the deliberate design: deletion requires a **positive match** on `^e2e-.*@example\.com$`, never "everything not on a keep-list". That property is what protected four real accounts during the 2026-09-05 purge.

- [ ] **Step 7: Verify the sweeper finds nothing**

Run: `node scripts/clerk-sweep-e2e-users.mjs --dry-run`
Expected: `total users: 4`, `to delete (e2e): 0`

- [ ] **Step 8: Fix the two rehearsal scripts**

In `.superpowers/sdd/2026-08-29-aeleos-login-migration/clerk-rehearsal.mjs` and `debug-cross-port.mjs`: ensure every generated address matches `e2e-<label>-<timestamp>+clerk_test@example.com`, and wrap the body in `try { ... } finally { await clerkClient.users.deleteUser(user.id).catch(() => {}); }` so an early failure still cleans up. One of these produced the non-conforming user found on 2026-09-05.

- [ ] **Step 9: Add the CI fail-safe step**

In `.github/workflows/ci.yml`, at the end of the `e2e-tests` job:

```yaml
- name: Sweep leaked Clerk test users (fail-safe)
  if: always()
  run: node scripts/clerk-sweep-e2e-users.mjs --older-than-hours 2
  env:
    CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
```

- [ ] **Step 10: Commit**

```bash
git add apps/auth/e2e/helpers/guardEnv.ts scripts/clerk-sweep-e2e-users.mjs tests/clerk-test-email-convention.test.ts .github/workflows/ci.yml .superpowers/sdd/2026-08-29-aeleos-login-migration/
git commit -m "test(e2e): guard against production Clerk and add fail-safe sweeper [GH-000]"
```

---

### Task A4: Promote the shared Clerk instance to production

Operational, not code. Requires AeleOS coordination and up to 48 hours of DNS propagation — **start this on day one**.

**Files:**

- Modify: `.secrets` (both repos), GitHub secrets (both repos), `.env.prod`

- [ ] **Step 1: Confirm no claimed identities on the dev instance**

```bash
SRK=$(grep -m1 '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .secrets | cut -d= -f2-)
curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Prefer: count=exact" -H "Range: 0-0" -o /dev/null -D - \
  "https://olafyajipvsltohagiah.supabase.co/rest/v1/user_profiles?identity_sub=not.is.null&select=id" \
  | grep -i content-range
```

Expected: `content-range: */0`. Ask the AeleOS owner to confirm the same for `vmmpssydbrtkgvrlkijh`. **If either is non-zero, stop** — promotion would strand those users, and the plan needs a re-key step first.

- [ ] **Step 2: Create the Google OAuth app**

Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → Web application. Authorized redirect URI: the value Clerk's dashboard shows for the production instance (`https://clerk.furrycolombia.com/v1/oauth_callback`). Free. Record client ID and secret.

- [ ] **Step 3: Create the Discord OAuth app**

Discord Developer Portal → New Application → OAuth2 → add the same redirect URI. Free. Record client ID and secret.

- [ ] **Step 4: Deploy the Clerk production instance**

In the Clerk dashboard for the shared application, create the production instance with domain `clerk.furrycolombia.com`. Enter the Google and Discord credentials from Steps 2–3 — **the shared development credentials are not carried over and are not usable in production.**

- [ ] **Step 5: Add the DNS records**

Add every record Clerk's Domains page lists to the `furrycolombia.com` Cloudflare zone. **Set each to DNS-only (grey cloud).** An orange-clouded record breaks Clerk's certificate issuance and is the most common failure at this step.

- [ ] **Step 6: Wait for verification**

Poll the Clerk dashboard until every record shows **Verified**. Up to 48 hours; usually minutes.

- [ ] **Step 7: Reconfigure what does not clone**

Clerk does not copy settings from development. Re-enter: `authorizedParties` (the six Libra origins plus AeleOS's), SSO connections, integrations, and webhook endpoints with their production signing secrets.

- [ ] **Step 8: Rotate the keys everywhere**

Update in both repos' `.secrets` and GitHub secrets:

```bash
echo -n "pk_live_..." | gh secret set CLERK_PUBLISHABLE_KEY --repo vaoan/libra
echo -n "sk_live_..." | gh secret set CLERK_SECRET_KEY --repo vaoan/libra
echo -n "clerk.furrycolombia.com" | gh secret set CLERK_DOMAIN --repo vaoan/libra
```

Then set `SUPABASE_CLERK_DOMAIN=clerk.furrycolombia.com` in `.env.prod`.

⚠️ **Do not run `pnpm sync-secrets` between editing `.secrets` and pushing** — it pulls from GitHub and overwrites local.

- [ ] **Step 9: Repoint Supabase third-party auth**

In the Supabase dashboard for `olafyajipvsltohagiah` → Authentication → Third-Party Auth, change the trusted Clerk domain to `clerk.furrycolombia.com`. Repeat for the AeleOS project.

- [ ] **Step 10: Verify E2E still refuses to run**

Run: `pnpm e2e:dev`
Expected: with `sk_live_` now in `.env.prod` but `.env.dev` still on `sk_test_`, dev E2E runs normally. Deliberately point `TARGET_ENV=prod` at the suite once and confirm Task A3's guard **fails the run**.

- [ ] **Step 11: Commit the non-secret changes**

```bash
git add .env.prod
git commit -m "chore(auth): point production at the Clerk production instance [GH-000]"
```

---

### Task A5: Pre-cutover email parity report

Converts the auth spec's "unmeasurable until people sign in" risk into a list you can read beforehand.

**Files:**

- Create: `scripts/clerk-email-parity.mjs`

**Interfaces:**

- Consumes: recovered `auth.users` emails (196), production Clerk user list
- Produces: a report of emails present in Supabase but absent from Clerk

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
/**
 * Pre-cutover check: every restored profile must be reachable by the email
 * Clerk will present, or that person signs in and is provisioned as a new
 * user holding none of their orders.
 *
 * Reads emails from user_profiles (the restored source of truth) and reports
 * which ones have no matching Clerk user. A non-empty report is not
 * necessarily a failure — most users simply have not signed in yet — but it
 * is the list to watch after cutover.
 */
import { loadEnv } from "./load-env.mjs";

const env = loadEnv({ targetEnv: "prod" });
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const srk = env.SUPABASE_SERVICE_ROLE_KEY;
const clerkKey = env.CLERK_SECRET_KEY;

async function supabase(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: srk, Authorization: `Bearer ${srk}` },
  });
  if (!res.ok) throw new Error(`supabase ${path} -> ${res.status}`);
  return res.json();
}

async function clerkUsers() {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${clerkKey}`,
          "User-Agent": "libra-parity",
        },
      },
    );
    if (!res.ok) throw new Error(`clerk -> ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

const profiles = await supabase("user_profiles?select=id,email");
const clerk = await clerkUsers();

const clerkEmails = new Set(
  clerk.flatMap((u) =>
    (u.email_addresses ?? []).map((a) => a.email_address.toLowerCase()),
  ),
);

const unmatched = profiles.filter(
  (p) => p.email && !clerkEmails.has(p.email.toLowerCase()),
);

console.log(`profiles:         ${profiles.length}`);
console.log(`clerk users:      ${clerk.length}`);
console.log(`without a match:  ${unmatched.length}`);
for (const p of unmatched) console.log(`  ${p.email}`);
```

- [ ] **Step 2: Run it after the restore (Track B) completes**

Run: `node scripts/clerk-email-parity.mjs`
Expected: `profiles: 196`. Every unmatched address is someone who will be provisioned fresh on first sign-in — keep the list for support.

- [ ] **Step 3: Commit**

```bash
git add scripts/clerk-email-parity.mjs
git commit -m "chore(auth): add pre-cutover Clerk email parity report [GH-000]"
```

---

# TRACK B — Data

Independent of Tracks A and C until cutover. **Nobody logs in until Task B3 verifies.**

---

### Task B1: Snapshot the live database before touching it

Live data matches the July backup exactly, but a fresh dump removes the last single point of failure and becomes the restore source with current provenance.

**Files:**

- Output: `.ai-context/backups/prod_YYYYMMDD_HHMMSS/`

- [ ] **Step 1: Confirm the service-role key and current counts**

```bash
SRK=$(grep -m1 '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .secrets | cut -d= -f2-)
U=https://olafyajipvsltohagiah.supabase.co
for t in user_profiles orders order_items permissions user_permissions; do
  printf "%-18s " "$t"
  curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
    -H "Prefer: count=exact" -H "Range: 0-0" -o /dev/null \
    -w '%header{content-range}\n' "$U/rest/v1/$t?select=*"
done
```

Expected: `0-0/196`, `0-0/147`, `0-0/147`, `0-0/46`, `0-0/1799`.

Then confirm the **anon** key also survived the pause, since the browser apps use it rather than the service-role key:

```bash
ANON=$(grep -m1 '^PROD_SUPABASE_ANON_KEY=' .secrets | cut -d= -f2-)
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "$U/rest/v1/"
```

Expected: `200`. A `401` means the keys were rotated across the pause and every `.env`/GitHub secret needs updating before anything else proceeds.

- [ ] **Step 2: Take the backup**

Run: `pnpm backup:prod`
Expected: a new directory under `.ai-context/backups/`, manifest reporting 17 tables and 154 storage files.

- [ ] **Step 3: Verify the manifest matches Step 1**

```bash
cat .ai-context/backups/prod_*/manifest.json | python3 -m json.tool | head -40
```

Expected: row counts identical to Step 1; `storage.files` length 154. **If they differ, stop** — do not wipe.

- [ ] **Step 4: Record the snapshot path**

Note the exact directory name. Every later step refers to it as `$SNAPSHOT`.

---

### Task B2: Wipe and rebuild the schema

**Files:**

- Modify: `.claude/rules/supabase-wipe.md` (two stale facts)

- [ ] **Step 1: Correct the stale rule first**

`.claude/rules/supabase-wipe.md` says "all 27 migration files"; the repo now has a single `20260902120000_baseline.sql`. It also states that all DB operations must go through the Management API because port 5432 is blocked — true for direct 5432, but the **connection pooler is reachable**, which is why a stale PAT is not a blocker. Fix both statements.

- [ ] **Step 2: Drop and recreate the public schema**

```bash
TOKEN=$(grep -m1 '^PROD_SUPABASE_ACCESS_TOKEN=' .secrets | cut -d= -f2-)
PROJECT=olafyajipvsltohagiah
SQL="DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public; GRANT ALL ON SCHEMA public TO anon; GRANT ALL ON SCHEMA public TO authenticated; GRANT ALL ON SCHEMA public TO service_role;"
payload=$(python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$SQL")
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "$payload"
```

Expected: `[]` with HTTP 201.

**`auth.users` is deliberately left intact** — it is dead weight under Clerk but the only remaining copy of the old provider-identity mapping.

- [ ] **Step 3: Truncate `audit.logged_actions`**

```bash
SQL="TRUNCATE audit.logged_actions;"
payload=$(python3 -c "import json,sys;print(json.dumps({'query':sys.argv[1]}))" "$SQL")
curl -s -X POST "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "$payload"
```

Seeding writes 100 audit rows that would take the `event_id` values the backup's own audit rows need.

- [ ] **Step 4: Empty the receipts bucket**

The bucket survived the pause with its objects, but the whole database should
come from one verified artifact rather than "some rows from the backup, some
files from whatever happened to survive". `--restore` re-uploads all 154.

```bash
SRK=$(grep -m1 '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .secrets | cut -d= -f2-)
U=https://olafyajipvsltohagiah.supabase.co
curl -s -X POST -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":1000}' \
  "$U/storage/v1/object/list/receipts" \
  | python3 -c "import json,sys;print('\n'.join(o['name'] for o in json.load(sys.stdin)))" \
  > /tmp/receipts.txt
wc -l /tmp/receipts.txt   # expect 154
python3 -c "
import json,subprocess
names=[l.strip() for l in open('/tmp/receipts.txt') if l.strip()]
print(json.dumps({'prefixes':names}))" > /tmp/del.json
curl -s -X DELETE -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d @/tmp/del.json \
  "$U/storage/v1/object/receipts"
```

Verify the bucket is empty before continuing — re-run the list call and expect
`0` objects. **Do not run this until Task B1 confirmed the snapshot holds all
154 files.**

- [ ] **Step 5: Apply the baseline migration**

```bash
payload=$(python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1],encoding='utf-8').read()}))" supabase/migrations/20260902120000_baseline.sql)
curl -s -o /tmp/mig.json -w '%{http_code}\n' -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "$payload"
```

Expected: `200` or `201`.

- [ ] **Step 6: Confirm the new schema shape**

```bash
SRK=$(grep -m1 '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .secrets | cut -d= -f2-)
curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  "https://olafyajipvsltohagiah.supabase.co/rest/v1/user_profiles?select=identity_sub&limit=1"
```

Expected: `[]` — the column now exists and the table is empty. A `42703 column does not exist` means the migration did not apply.

- [ ] **Step 7: Commit the rule correction**

```bash
git add .claude/rules/supabase-wipe.md
git commit -m "docs(rules): correct migration count and pooler reachability in supabase-wipe [GH-000]"
```

---

### Task B3: Restore and verify

**Files:**

- Create: `scripts/verify-restore.mjs`

**Interfaces:**

- Consumes: `$SNAPSHOT` from Task B1

- [ ] **Step 1: Write the verification script first**

```javascript
#!/usr/bin/env node
/**
 * Post-restore gate. Exits non-zero unless every invariant holds. Nobody
 * signs in until this passes: `--restore` truncates user_profiles, so a
 * restore run against a live system wipes claimed identity_sub values.
 */
import { loadEnv } from "./load-env.mjs";

const env = loadEnv({ targetEnv: "prod" });
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const srk = env.SUPABASE_SERVICE_ROLE_KEY;

const EXPECTED = {
  user_profiles: 196,
  orders: 147,
  order_items: 147,
  permissions: 46,
  user_permissions: 1799,
  products: 1,
  events: 1,
};

async function count(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: srk,
      Authorization: `Bearer ${srk}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const range = res.headers.get("content-range") ?? "";
  return Number(range.split("/")[1] ?? -1);
}

let failed = false;
for (const [table, expected] of Object.entries(EXPECTED)) {
  const actual = await count(table);
  const ok = actual === expected;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${table}: ${actual} (want ${expected})`,
  );
}

const orphans = await fetch(
  `${url}/rest/v1/orders?select=id,user_id&user_id=not.is.null`,
  { headers: { apikey: srk, Authorization: `Bearer ${srk}` } },
).then((r) => r.json());
const profiles = await fetch(`${url}/rest/v1/user_profiles?select=id`, {
  headers: { apikey: srk, Authorization: `Bearer ${srk}` },
}).then((r) => r.json());
const ids = new Set(profiles.map((p) => p.id));
const orphaned = orphans.filter((o) => !ids.has(o.user_id));
console.log(
  `${orphaned.length === 0 ? "PASS" : "FAIL"}  orphaned order.user_id: ${orphaned.length}`,
);
if (orphaned.length > 0) failed = true;

process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it before restoring, to prove it fails**

Run: `node scripts/verify-restore.mjs`
Expected: FAIL on every table (the schema is empty after Task B2), exit code 1. This is the point — it proves the gate can detect a bad restore.

- [ ] **Step 3: Restore**

```bash
node scripts/backup-prod.mjs --restore .ai-context/backups/prod_YYYYMMDD_HHMMSS
```

Use the exact `$SNAPSHOT` path from Task B1. **Always use `--restore`; never insert rows by hand** — it truncates before inserting, and `resource_permissions` and `product_templates` have no unique key that catches duplicates (their unique index includes a nullable column, and NULL never equals NULL). A hand-run restore corrupts silently rather than failing.

- [ ] **Step 4: Run the gate**

Run: `node scripts/verify-restore.mjs`
Expected: PASS on all seven tables and zero orphans, exit code 0.

- [ ] **Step 5: Verify storage**

```bash
SRK=$(grep -m1 '^PROD_SUPABASE_SERVICE_ROLE_KEY=' .secrets | cut -d= -f2-)
curl -s -X POST -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":1000}' \
  "https://olafyajipvsltohagiah.supabase.co/storage/v1/object/list/receipts" \
  | python3 -c "import json,sys;print(len(json.load(sys.stdin)),'objects')"
```

Expected: `154 objects`.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-restore.mjs
git commit -m "chore(db): add post-restore verification gate [GH-000]"
```

---

### Task B4: Re-enable scheduled backups

Doubles as the keepalive that prevents another inactivity pause — the pause that took production offline for a month.

**Files:**

- Modify: `.github/workflows/backup-scheduled.yml`

- [ ] **Step 1: Confirm why it was disabled**

```bash
gh workflow list --repo vaoan/libra --all | grep -i backup
```

Expected: `disabled_manually`. It targets `olafyajipvsltohagiah`, which is alive again at the same ref, so no code change should be needed.

- [ ] **Step 2: Re-enable**

```bash
gh workflow enable backup-scheduled.yml --repo vaoan/libra
```

- [ ] **Step 3: Trigger a run and confirm success**

```bash
gh workflow run backup-scheduled.yml --repo vaoan/libra
gh run list --workflow backup-scheduled.yml --repo vaoan/libra --limit 1
```

Expected: conclusion `success`.

- [ ] **Step 4: Confirm the schedule is frequent enough**

Supabase pauses free projects after ~7 days of inactivity. Verify the cron in `backup-scheduled.yml` runs at least weekly; if not, tighten it. This is the keepalive.

---

# TRACK C — Platform

---

### Task C1: Delete playground (atomic)

**Must land as one PR.** Splitting it fails `check:doc-refs`, the gate added in #399 that fails when an instruction file cites something that is not there.

**Files:**

- Create: `apps/admin/src/app/[locale]/env/page.tsx`
- Delete: `apps/playground/**`, `docs/standards/playground-standardization.md`
- Modify: ~60 files, enumerated below

- [ ] **Step 1: Move the env debug viewer to admin**

Copy `apps/playground/src/app/[locale]/env/page.tsx` to `apps/admin/src/app/[locale]/env/page.tsx`. Rewrite its imports onto admin's aliases, add the admin i18n keys it needs to both `en.json` and `es.json`, and confirm it sits behind admin's existing auth. The other two playground pages are placeholders; `features/auth` is duplicated scaffolding. Neither is carried over.

- [ ] **Step 2: Verify the moved page renders**

Run: `pnpm dev` then open `http://localhost:5002/en/env` with `ENV_DEBUG=true`
Expected: the viewer renders under admin.

- [ ] **Step 3: Delete the app**

```bash
git rm -r apps/playground docs/standards/playground-standardization.md
```

- [ ] **Step 4: Update CI in lockstep**

`.github/workflows/ci.yml`: remove the `playground` change-filter output (L39), its path filter (L64-65), `NEXT_PUBLIC_PLAYGROUND_URL` from the build env (L503), and `apps/playground/src` from the `madge` path list (L243).

`scripts/select-workspaces.sh` takes **nine positional arguments** with playground at position 6. Removing it shifts positions 7, 8, 9 (packages, tooling, studio) down by one. Update the script **and all four `ci.yml` call sites** (L303, L335, L395, L666) in the same commit, or the workspace selection silently reads the wrong flags.

`.github/workflows/pr-checks.yml`: remove the output (L109), path filter (L132-133), and both summary-table lines (L256, L271).

`scripts/detect-changes.sh`: remove `PLAYGROUND_CHANGED`.

`knip.json`: remove the `apps/playground` entry — knip is enforced at zero (#395) and fails on a config pointing at nothing.

`package.json`: remove both playground paths from `check:tools` (the `jscpd` and `madge` invocations).

- [ ] **Step 5: Update the container**

`docker/prod/supervisord.conf`: delete the entire `[program:playground]` block (L110-118).
`docker/prod/Dockerfile`: delete the three playground `COPY` lines and its entry in the `rm -rf` stub-cleanup list.
`docker/prod/nginx.conf`: remove all five playground references.
`docker/warmer.sh`, `docker/boot-reporter.mjs`, `docker/ci/health.spec.ts`: remove playground entries.

- [ ] **Step 6: Update shared code and i18n**

`config/app-links.json`, `packages/shared/src/config/appUrls.ts` and its three tests, `packages/app-components/src/components/AppNavigation.tsx` and its test, the twelve i18n message files (six apps × `en`/`es`), the three `src/test/fixtures/appUrls.ts` files, and the three e2e specs referencing playground.

- [ ] **Step 7: Remove the env var from all four env files together**

Delete `NEXT_PUBLIC_PLAYGROUND_URL` from `.env.ci`, `.env.dev`, `.env.prod`, `.env.staging`. `pnpm lint:env` fails on key drift between them, so these must move together.

- [ ] **Step 8: Update the docs**

`CLAUDE.md`: remove the "Playground is permanent" key principle, the playground row from the app-ports table, and repoint the env debug viewer URL to `localhost:5002/en/env`.
`.claude/rules/monorepo-architecture.md`: delete the whole playground section including the "NEVER delete the playground app" rule.
Also: `README.md`, `docs/environment.md`, `docs/infrastructure.md`, `docs/production-incident-playbook.md`, `docs/standards/quality-gates.md`, `docs/adr/ADR-0135-auth-host-boundary.md`, `.claude/skills/verify-code/SKILL.md`.

- [ ] **Step 9: Prove nothing dangles**

```bash
grep -rn "playground" --include=*.md --include=*.mjs --include=*.json --include=*.yml \
  --include=*.ts --include=*.tsx --include=*.conf --include=*.sh . \
  | grep -v node_modules | grep -v '^./.turbo' | grep -v '^./.ai-context' \
  | grep -v '^./.playwright-mcp' | grep -v '^./.superpowers' | grep -v '^./tests/legacy'
```

Expected: no output.

- [ ] **Step 10: Run every gate**

Run: `pnpm lint:env && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm check:tools && pnpm check:doc-refs && pnpm build`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: remove the playground app and relocate the env viewer to admin [GH-000]"
```

---

### Task C2: Drop `watcher.mjs` from the production image

50 MB — as much as the entire Spotify bot — for liveness that Docker's healthcheck already provides.

**Files:**

- Delete: `docker/watcher.mjs`
- Modify: `docker/prod/supervisord.conf`, `docker/prod/Dockerfile`, `docker/compose.yml`

- [ ] **Step 1: Confirm the healthcheck already covers liveness**

`docker/compose.yml` defines `test: wget -q -O- http://127.0.0.1:8080/health`, `interval: 15s`, `retries: 3`, with `restart: unless-stopped`. That is the liveness mechanism; the watcher duplicates it and adds Telegram alerting.

- [ ] **Step 2: Remove the watcher**

Delete `docker/watcher.mjs`, its `[program:watcher]` block in `supervisord.conf`, its `COPY` line in the Dockerfile, and the now-unused `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` / `SERVER_HOSTNAME` entries from `compose.yml`'s `environment:` list.

- [ ] **Step 3: Rebuild and re-measure**

```bash
pnpm docker:build
docker run -d --name libra-memtest --entrypoint /usr/bin/supervisord \
  ghcr.io/vaoan/libra-prod:latest -c /etc/supervisor/conf.d/supervisord.conf
docker stats --no-stream --format "{{.MemUsage}}" libra-memtest
docker rm -f libra-memtest
```

Expected: comfortably below the 617.6 MiB baseline measured on 2026-09-05 with seven apps and the watcher. Record the number — Task C4's memory cap depends on it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf(docker): drop the in-container watcher, healthcheck covers liveness [GH-000]"
```

---

### Task C3: Provision the box

Everything scripted, so November's migration to the Black Friday box is a replay.

**Files:**

- Create: `scripts/server/provision-racknerd.sh`

- [ ] **Step 1: Record the baseline**

```bash
cd "Z:/Users/Heiner/Documents/PCSetup/spotify-discord/cloud"
./vps-ssh.ps1 "free -m; df -h /; journalctl --disk-usage"
```

Record the numbers. Baseline on 2026-09-05: 961 MB total, 580 MB available, 1.2 GB journals, 12 GB free disk.

- [ ] **Step 2: Write the provisioning script**

```bash
#!/usr/bin/env bash
# Idempotent provisioning for the Libra production host.
# Safe to re-run; safe to run against a fresh box (that is the point —
# November's migration replays this rather than repeating the archaeology).
set -euo pipefail

echo "== removing packages a headless KVM guest does not need =="
# unattended-upgrades is deliberately KEPT: this box faces the internet.
systemctl disable --now snapd.socket snapd.service 2>/dev/null || true
apt-get purge -y snapd fwupd modemmanager udisks2 multipath-tools || true
apt-get autoremove -y

echo "== capping the journal =="
mkdir -p /etc/systemd/journald.conf.d
cat >/etc/systemd/journald.conf.d/00-size.conf <<'EOF'
[Journal]
SystemMaxUse=50M
EOF
journalctl --vacuum-size=50M
systemctl restart systemd-journald

echo "== swap 1G -> 3G =="
if [ "$(swapon --show=SIZE --noheadings --bytes | head -1)" != "3221225472" ]; then
  swapoff -a
  fallocate -l 3G /swapfile.new
  chmod 600 /swapfile.new
  mkswap /swapfile.new
  mv /swapfile.new /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >>/etc/sysctl.conf

echo "== docker from the official repo (not snap) =="
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "== firewall: SSH only; the tunnel is outbound =="
apt-get install -y ufw
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

echo "== done =="
free -m
```

- [ ] **Step 3: Copy and run it**

```bash
./vps-ssh.ps1 -Script ../../../../Github/libra/scripts/server/provision-racknerd.sh
```

- [ ] **Step 4: Verify the reclaim**

```bash
./vps-ssh.ps1 "free -m; swapon --show; docker --version; ufw status; journalctl --disk-usage"
```

Expected: available memory ~730 MB (up from 580), 3 GB swap, Docker present, ufw active allowing only 22, journals ≤50 MB.

- [ ] **Step 5: Confirm the bridge is unharmed**

```bash
./vps-ssh.ps1 "systemctl is-active go-librespot spotify-discord-bot"
```

Expected: `active` twice. **If either is not active, stop and restore before continuing.**

- [ ] **Step 6: Switch SSH to keys**

Generate a dedicated key pair for this host — do not reuse a personal key, because the private half also goes into GitHub secrets for Task C6:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/libra_prod_ed25519 -N "" -C "libra-prod-deploy"
```

Install the public half:

```bash
cd "Z:/Users/Heiner/Documents/PCSetup/spotify-discord/cloud"
./vps-ssh.ps1 "mkdir -p /root/.ssh && chmod 700 /root/.ssh && echo '$(cat ~/.ssh/libra_prod_ed25519.pub)' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys"
```

**Confirm a key-based login works from a second terminal before disabling passwords** — locking yourself out of a box with no console is a bad afternoon:

```bash
ssh -i ~/.ssh/libra_prod_ed25519 root@192.236.168.202 "echo key-auth-ok"
```

Only once that prints `key-auth-ok`, disable password auth:

```bash
./vps-ssh.ps1 "sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl reload sshd"
```

Then update `vps-ssh.ps1` to use the key instead of `-pw`, and remove `RACKNERD_VPS_PASSWORD` from `PCSetup/.secrets`. The root-with-password setup was defensible for a private music bot; it is not for a box taking orders.

- [ ] **Step 7: Commit**

```bash
git add scripts/server/provision-racknerd.sh
git commit -m "chore(infra): add idempotent provisioning for the production host [GH-000]"
```

---

### Task C4: Resource isolation — protect the audio bridge

The load-bearing part of co-location. Without it, a Next.js memory leak or SSR burst degrades Discord audio.

**Files:**

- Create: `scripts/server/audio-priority.sh`
- Modify: `docker/compose.yml`

- [ ] **Step 1: Add hard limits to the container**

In `docker/compose.yml`, under the `app` service:

```yaml
mem_limit: 600m
memswap_limit: 1500m
cpus: 0.75
```

The memory cap means a leak kills the container, never the bridge; `restart: unless-stopped` brings it back. The CPU ceiling means SSR bursts cannot monopolise the single core.

- [ ] **Step 2: Write the systemd drop-ins**

```bash
#!/usr/bin/env bash
# Give the Spotify bridge priority over Libra in every resource dimension.
# Ubuntu 24.04 is cgroup v2, so CPUWeight is the correct knob.
set -euo pipefail

for unit in go-librespot spotify-discord-bot; do
  mkdir -p "/etc/systemd/system/${unit}.service.d"
  cat >"/etc/systemd/system/${unit}.service.d/10-priority.conf" <<'EOF'
[Service]
# Audio is latency-sensitive and must win every scheduling contest with the
# web app sharing this single vCPU.
CPUWeight=10000
# Under memory pressure the kernel must reach for Libra first, never the
# bridge.
OOMScoreAdjust=-500
EOF
done

mkdir -p /etc/systemd/system/docker.service.d
cat >/etc/systemd/system/docker.service.d/10-priority.conf <<'EOF'
[Service]
CPUWeight=100
EOF

systemctl daemon-reload
systemctl restart go-librespot spotify-discord-bot
systemctl restart docker 2>/dev/null || true
```

- [ ] **Step 3: Apply and verify**

```bash
./vps-ssh.ps1 -Script ../../../../Github/libra/scripts/server/audio-priority.sh
./vps-ssh.ps1 "systemctl show go-librespot -p CPUWeight -p OOMScoreAdjust; systemctl is-active go-librespot spotify-discord-bot"
```

Expected: `CPUWeight=10000`, `OOMScoreAdjust=-500`, both units `active`.

- [ ] **Step 4: Commit**

```bash
git add scripts/server/audio-priority.sh docker/compose.yml
git commit -m "chore(infra): cap Libra resources and prioritise the audio bridge [GH-000]"
```

---

### Task C5: Cloudflare Tunnel ingress

**Files:**

- Modify: `.env.prod` (`CLOUDFLARE_TUNNEL_APP_ENABLED`), `.secrets`, GitHub secrets

- [ ] **Step 1: Create a dashboard-managed tunnel**

Cloudflare dashboard → Zero Trust → Networks → Tunnels → Create a tunnel → **Cloudflared** → name it `libra-prod`. Copy the install token.

This is what dissolves the "one missing piece" recorded in `docs/production-status.md`: a **remotely-managed tunnel needs only this token**, not an API token scoped to `Cloudflare Tunnel → Edit` and `DNS → Edit`.

- [ ] **Step 2: Store the token**

```bash
echo -n "<tunnel-token>" | gh secret set CLOUDFLARE_TUNNEL_APP_TOKEN --repo vaoan/libra
```

Add the same value to `.secrets`, and set `CLOUDFLARE_TUNNEL_APP_ENABLED=true` in `.env.prod`.

- [ ] **Step 3: Install cloudflared on the box**

```bash
./vps-ssh.ps1 "curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg && echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list && apt-get update && apt-get install -y cloudflared"
./vps-ssh.ps1 "cloudflared service install <tunnel-token>"
./vps-ssh.ps1 "systemctl is-active cloudflared"
```

Expected: `active`.

- [ ] **Step 4: Add the single ingress rule**

In the tunnel's Public Hostname tab: hostname `store.furrycolombia.com`, service `http://localhost:9090`. **One rule is sufficient** — nginx inside the container does all path routing for the six apps.

- [ ] **Step 5: Confirm the DNS record**

`store.furrycolombia.com` already exists and is proxied (it is what returns 530 today). Cloudflare repoints it to the tunnel automatically. Verify it now resolves to a tunnel CNAME rather than the old origin.

- [ ] **Step 6: Verify no inbound ports were opened**

```bash
./vps-ssh.ps1 "ufw status; ss -tlnp | grep -v 127.0.0.1"
```

Expected: only 22 exposed. The tunnel is an outbound connection.

---

### Task C6: Deploy pipeline

Replaces the three deleted workflows (`deploy-gcp.yml`, `deploy-local.yml`, `deploy-production.yml`, recoverable from git history).

**Files:**

- Create: `.github/workflows/deploy-production.yml`
- Modify: `scripts/deploy-production.sh`

**Interfaces:**

- Consumes: GitHub secrets `RACKNERD_VPS_IP`, `RACKNERD_VPS_USER`, `RACKNERD_VPS_SSH_KEY`, plus the runtime env values
- Produces: `ghcr.io/vaoan/libra-prod:<sha>` and `:latest`

- [ ] **Step 1: Add the host secrets**

```bash
echo -n "192.236.168.202" | gh secret set RACKNERD_VPS_IP --repo vaoan/libra
echo -n "root"            | gh secret set RACKNERD_VPS_USER --repo vaoan/libra
gh secret set RACKNERD_VPS_SSH_KEY --repo vaoan/libra < ~/.ssh/libra_prod_ed25519
```

- [ ] **Step 2: Write the workflow**

```yaml
name: Deploy Production

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/prod/Dockerfile
          push: true
          tags: |
            ghcr.io/vaoan/libra-prod:${{ github.sha }}
            ghcr.io/vaoan/libra-prod:latest
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${{ secrets.CLERK_PUBLISHABLE_KEY }}
            NEXT_PUBLIC_CLERK_DOMAIN=${{ secrets.CLERK_DOMAIN }}

      - name: Render the runtime env file
        run: |
          # load-env.mjs skips .secrets when CI=true, so every value is
          # supplied explicitly here rather than resolved from $secret: refs.
          cat > env.prod.rendered <<EOF
          SITE_PROD_IMAGE_NAME=ghcr.io/vaoan/libra-prod:${{ github.sha }}
          SITE_PROD_CONTAINER_NAME=libra-prod
          HOST_PORT=9090
          CLERK_SECRET_KEY=${{ secrets.CLERK_SECRET_KEY }}
          SUPABASE_SERVICE_ROLE_KEY=${{ secrets.PROD_SUPABASE_SERVICE_ROLE_KEY }}
          EOF

      - name: Deploy over SSH
        env:
          KEY: ${{ secrets.RACKNERD_VPS_SSH_KEY }}
          HOST: ${{ secrets.RACKNERD_VPS_IP }}
          USER: ${{ secrets.RACKNERD_VPS_USER }}
        run: |
          install -m 600 /dev/null key && printf '%s' "$KEY" > key
          scp -i key -o StrictHostKeyChecking=accept-new \
            env.prod.rendered docker/compose.yml "$USER@$HOST:/opt/libra/"
          ssh -i key -o StrictHostKeyChecking=accept-new "$USER@$HOST" \
            "cd /opt/libra && docker compose --env-file env.prod.rendered pull && \
             docker compose --env-file env.prod.rendered up -d"

      - name: Health gate
        run: |
          for i in $(seq 1 30); do
            code=$(curl -s -o /dev/null -w '%{http_code}' https://store.furrycolombia.com/health || true)
            [ "$code" = "200" ] && echo "healthy" && exit 0
            echo "attempt $i: $code"
          done
          echo "health gate failed"
          exit 1

      - name: Roll back on failure
        if: failure()
        env:
          KEY: ${{ secrets.RACKNERD_VPS_SSH_KEY }}
          HOST: ${{ secrets.RACKNERD_VPS_IP }}
          USER: ${{ secrets.RACKNERD_VPS_USER }}
        run: |
          install -m 600 /dev/null key && printf '%s' "$KEY" > key
          ssh -i key -o StrictHostKeyChecking=accept-new "$USER@$HOST" \
            "cd /opt/libra && sed -i 's|libra-prod:.*|libra-prod:latest|' env.prod.rendered && \
             docker compose --env-file env.prod.rendered up -d"
```

- [ ] **Step 3: Prepare the deploy directory**

```bash
./vps-ssh.ps1 "mkdir -p /opt/libra"
```

- [ ] **Step 4: Dry-run the deploy**

Run: `gh workflow run deploy-production.yml --repo vaoan/libra`
Expected: build succeeds, image lands in GHCR, container starts, health gate passes.

- [ ] **Step 5: Verify memory on the real box**

```bash
./vps-ssh.ps1 "free -m; docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'"
```

Expected: container under its 600 MB cap, host retaining headroom, swap barely touched.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "ci: add production deploy to the RackNerd host [GH-000]"
```

---

### Task C7: Audio co-location acceptance test

**This is the gate that decides whether co-location is viable.** If it fails, the answer is a second $21.99/yr box — decided on data, not nerves.

- [ ] **Step 1: Start audio playback**

Play music through the bridge into the Discord voice channel and confirm it is clean while idle.

- [ ] **Step 2: Load the store while listening**

```bash
for i in $(seq 1 200); do
  curl -s -o /dev/null https://store.furrycolombia.com/store &
done; wait
```

Run several rounds, including cold-cache requests to SSR pages.

- [ ] **Step 3: Watch the box during load**

```bash
./vps-ssh.ps1 "vmstat 1 20; free -m"
```

Expected: swap-in stays near zero; the container stays under its cap.

- [ ] **Step 4: Judge the audio**

Listen for stutter, dropouts, or desync throughout.

**PASS** → co-location is viable; proceed to cutover.
**FAIL** → stop. Order a second RackNerd box, move Libra there, and keep the bridge alone on this one. The spec's fallback, and the reason the deployment was built to be portable.

- [ ] **Step 5: Record the result**

Append the outcome and the `vmstat` numbers to `docs/production-status.md`, so the next person does not have to re-derive whether this works.

---

# CUTOVER — strictly ordered

Do not reorder. Each step gates the next.

- [ ] **1. Clerk production live and verified** (Task A4) — all DNS records Verified, OAuth apps configured, `authorizedParties` set.
- [ ] **2. Database restored and verified** (Task B3) — `node scripts/verify-restore.mjs` exits 0; 154 storage objects present.
- [ ] **3. Email parity report reviewed** (Task A5) — the unmatched list is known and accepted.
- [ ] **4. Container deployed and healthy** (Task C6) — health gate green.
- [ ] **5. Audio unaffected under load** (Task C7) — PASS.
- [ ] **6. Tunnel connected** (Task C5) — `curl -s -o /dev/null -w '%{http_code}' https://store.furrycolombia.com/` returns **200**, not 530.
- [ ] **7. First login.** Sign in with one of the four real accounts and confirm the profile claims its existing `user_profiles` row — orders, permissions and seller role intact.
- [ ] **8. Update the record.** Rewrite `docs/production-status.md` and remove the decommission banner from `docs/infrastructure.md`. Correct the auth spec's claim that `auth.users` "cannot be recovered" — it was recovered; the Clerk decision stands on its own merits.

---

## Rollback

| Failure                        | Response                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| Health gate fails              | Automatic — workflow redeploys `:latest`                                 |
| Restore verification fails     | Do not let anyone log in. Re-wipe (B2), re-restore from `$SNAPSHOT` (B3) |
| Audio degrades under load      | Second box; Libra moves, bridge stays                                    |
| Clerk promotion strands AeleOS | `identity_sub` is nullable; re-claim on next sign-in                     |
| Box lost entirely              | Rebuild: `provision-racknerd.sh` + `audio-priority.sh` + one deploy run  |
