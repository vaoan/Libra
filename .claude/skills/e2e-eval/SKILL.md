---
name: e2e-eval
description: Fully autonomous E2E test evaluator. Starts all required services, runs Playwright tests, diagnoses failures, optionally fixes production code, and delivers a structured report. Unattended except when test code itself may need changing.
---

# E2E Eval Skill

## Description

Fully autonomous end-to-end test runner for this monorepo. You handle everything without being asked: kill stale services, start Docker and Supabase, build images, launch the Cloudflare tunnel, install missing Playwright browsers, run the tests, analyze every failure, and optionally fix production code.

**You are unattended from start to finish** — the only exception is when a test file itself appears to contain a bug and you believe test code should change. That case requires user confirmation before touching any test file.

---

## Usage

```
/e2e-eval [env] [options]
```

Natural language also works:

```
Run all E2E tests on staging
Run E2E headless on dev for admin app, fix failures
Run e2e staging headed for the reports spec
Run e2e dev --fix
```

## Parameters

| Parameter      | Values                                              | Default            | Description                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env`          | `dev` \| `staging`                                  | `dev`              | Target environment                                                                                                                                                                                                   |
| `--headed`     | flag                                                | off (headless)     | Show the browser window during tests. Mutually exclusive with `--ci`.                                                                                                                                                |
| `--ui`         | flag                                                | off                | Open Playwright UI mode after infra setup; skips analysis/report phases. Requires `--app <single>`. Mutually exclusive with `--fix`, `--retries`, `--replay`, `--ci`.                                                |
| `--debug`      | spec path                                           | (none)             | Open Playwright inspector after infra setup; requires a spec path. Skips analysis/report phases. Requires `--app <single>`. Mutually exclusive with `--fix`, `--retries`, `--replay`, `--ui`, `--ci`.                |
| `--app`        | `auth` \| `admin` \| `store` \| `payments` \| `all` | `all`              | Which app suite(s) to run                                                                                                                                                                                            |
| `--fix`        | flag                                                | off                | Auto-fix production code when tests fail. Mutually exclusive with `--ui`, `--debug`.                                                                                                                                 |
| `--no-ux`      | flag                                                | off                | Skip UX-tagged tests (drag-and-drop, animations, layout). UX tests run by default.                                                                                                                                   |
| `--files`      | path(s) or pattern                                  | all specs          | Restrict to specific test files or grep pattern. Mutually exclusive with `--replay`.                                                                                                                                 |
| `--skip-infra` | flag                                                | off                | Skip infrastructure startup (phases 1–2); assume services are already running                                                                                                                                        |
| `--clean`      | flag                                                | off                | Reset Supabase DB before running (re-applies all migrations from scratch)                                                                                                                                            |
| `--replay`     | flag                                                | off                | Re-run only the failures from the most recent `.ai-context/reports/e2e-eval-*.md`. Mutually exclusive with `--ui`, `--debug`, `--files`, `--ci`.                                                                     |
| `--retries`    | integer                                             | `1`                | Number of times to retry a failing test before classifying it as a real failure (flaky detection). Mutually exclusive with `--ui`, `--debug`, `--ci`.                                                                |
| `--ci`         | flag                                                | off                | Match GitHub Actions runtime config: `workers=1`, `retries=2`, headless. Disables skill-level flaky-detection retry (Playwright retries instead). Mutually exclusive with `--headed`, `--ui`, `--debug`, `--replay`. |
| `--timeout`    | milliseconds                                        | Playwright default | Override per-test timeout for slow environments                                                                                                                                                                      |

**UX tests are included by default.** Pass `--no-ux` to skip them (e.g. for a fast smoke run). Do not require the user to opt-in — if they didn't say "skip ux" or "no ux", run them.

Google OAuth tests are always skipped automatically (they require live Google credentials and are explicitly skipped by the specs themselves).

---

## Project Infrastructure Reference

### Monorepo layout

```
apps/
  auth/     e2e/  ← playwright.config.ts  (port 5000 dev)
  store/    e2e/  ← playwright.config.ts  (port 5001 dev)
  admin/    e2e/  ← playwright.config.ts  (port 5002 dev)
  payments/ e2e/  ← playwright.config.ts  (port 5005 dev)
scripts/
  e2e.mjs                  ← unified runner (use this)
  supabase-docker.mjs      ← supabase start/stop/reset
  docker-build.mjs         ← docker build + compose up
  cloudflared.mjs          ← tunnel start
  cloudflared-stop.mjs     ← tunnel stop
```

### Test runner command

Always use `node scripts/e2e.mjs`. Never call Playwright directly.

```bash
# Supported --app values: auth | store | admin | payments
node scripts/e2e.mjs --env {dev|staging} --app {auth|store|admin|payments} [--headed] [-- playwright_passthrough_args]

# Examples
node scripts/e2e.mjs --env dev --app auth
node scripts/e2e.mjs --env staging --app admin -- apps/admin/e2e/reports.spec.ts
node scripts/e2e.mjs --env staging --app auth --headed -- --grep "permission-management"
node scripts/e2e.mjs --env staging --app payments -- apps/payments/e2e/seller-reports.spec.ts
```

### App → spec files mapping

| --app      | Spec files                    |
| ---------- | ----------------------------- |
| `auth`     | `apps/auth/e2e/*.spec.ts`     |
| `store`    | `apps/store/e2e/*.spec.ts`    |
| `admin`    | `apps/admin/e2e/*.spec.ts`    |
| `payments` | `apps/payments/e2e/*.spec.ts` |

### Infrastructure per environment

**dev:**

- Supabase: local Docker (port from `.env.dev`, key `SUPABASE_PORT`)
- Apps: `pnpm dev` (six dev servers plus the dev proxy on `HOST_PORT`, 5050; tests hit `http://localhost:5050/<app>`)
- No Docker container, no tunnel

**staging:**

- Supabase: local Docker (port 64321, config in `.env.staging`)
- App: single Docker container (port 7542) via `pnpm docker:build --env staging --up`
- Tunnel: Cloudflare tunnel via `pnpm tunnel --env staging`
- All URLs go through the tunnel on the one hostname, by path (e.g. `https://store.ffxivbe.org/auth`)

### Playwright artifact locations

After each test run, Playwright saves artifacts for failing tests:

```
apps/{app}/test-results/
  {test-name}/
    screenshot.png       ← Screenshot at point of failure
    trace.zip            ← Full trace (open with: npx playwright show-trace trace.zip)
    video.webm           ← Video (if enabled)
```

Always include the trace path in the report for each failing test.

---

## Execution Phases

Work through each phase in order. Skip phases 1–2 when `--skip-infra` is set.

---

### PHASE 0 — Environment Variable Pre-flight

**Always run this phase, even when `--skip-infra` is set.**

Before touching any infrastructure, verify all required environment variables are present. Read the appropriate `.env.{env}` file and check for:

| Variable                    | Required for       |
| --------------------------- | ------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`  | All environments   |
| `SUPABASE_SERVICE_ROLE_KEY` | All environments   |
| `NEXT_PUBLIC_AUTH_URL`      | Auth app tests     |
| `NEXT_PUBLIC_STORE_URL`     | Store app tests    |
| `NEXT_PUBLIC_ADMIN_URL`     | Admin app tests    |
| `NEXT_PUBLIC_PAYMENTS_URL`  | Payments app tests |
| `SUPABASE_PORT`             | Dev environment    |

If any required variable is missing, **exit immediately** with a clear error naming the missing variable and which `.env.*` file to check. Do not proceed to Phase 1.

---

### PHASE 1 — Preflight Checks

_(Skip when `--skip-infra` is set)_

**1a. Playwright browsers**

Check that Playwright browsers are installed for each app you will test. Run for each app in the run (auth, store, admin, payments):

```bash
pnpm --dir apps/auth exec playwright --version
pnpm --dir apps/store exec playwright --version
pnpm --dir apps/admin exec playwright --version
pnpm --dir apps/payments exec playwright --version
```

If any command fails or shows "Please run `playwright install`", install for that app:

```bash
pnpm --dir apps/auth exec playwright install --with-deps chromium
pnpm --dir apps/store exec playwright install --with-deps chromium
pnpm --dir apps/admin exec playwright install --with-deps chromium
pnpm --dir apps/payments exec playwright install --with-deps chromium
```

**1b. Docker (staging only)**

For staging, verify Docker is running:

```bash
docker info 2>&1 | head -5
```

If Docker is not running, exit with a clear error — Docker Desktop must be started manually.

**1c. cloudflared (staging only)**

```bash
cloudflared --version 2>&1 | head -2
```

If missing, exit with an error instructing the user to install cloudflared.

---

### PHASE 2 — Start Infrastructure

_(Skip when `--skip-infra` is set)_

#### Dev environment

**2a. Supabase (cached detection)**

If `--clean` was requested, reset unconditionally — cached detection does not apply with `--clean`:

```bash
node scripts/supabase-docker.mjs reset --env dev
```

Otherwise, **probe before starting**. Read `SUPABASE_PORT` from `.env.dev` and TCP-probe it:

```powershell
$port = (Get-Content .env.dev | Select-String '^SUPABASE_PORT=').ToString().Split('=')[1]
Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet
```

| Probe result | Action                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| Responds     | Skip Supabase start. Record `Supabase: ♻️ Reused (already running on port N)`.         |
| No response  | Run `node scripts/supabase-docker.mjs start --env dev`. Record `Supabase: ✅ Started`. |

**2b. Dev servers — always kill and restart**

For dev runs, **always kill any existing dev server processes and start a fresh one**, even if ports are already responding. A long-running dev server can accumulate Turbopack module state that causes silent SSR failures (HTTP 500 with no obvious cause). A fresh start guarantees a clean slate and gives you captured stdout/stderr for immediate diagnosis.

**Step 1 — Kill all app ports:**

```powershell
# PowerShell — kill processes on all dev app ports
$ports = @(5000, 5001, 5002, 5003, 5004, 5005, 5006)
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $procId = ($conn.OwningProcess | Select-Object -Unique)
        Write-Host "Killing PID $procId on port $port"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
}
```

**Step 2 — Start `pnpm dev` with captured output:**

```powershell
# Redirect both stdout and stderr to a log file
$proc = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c pnpm dev > C:\Temp\devserver.log 2>&1" `
    -WorkingDirectory "Z:\Github\libra" `
    -WindowStyle Hidden -PassThru
Write-Host "Dev server started, PID $($proc.Id)"
```

**Step 3 — Wait for required ports to respond:**

Tests hit the dev proxy on `HOST_PORT` (5050), which fronts every app by path;
the per-app ports live in `config/app-links.json` and are not what to probe.
Poll each app route you need through the proxy, bounded to 120 seconds:

```bash
for i in $(seq 1 40); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:5050/admin/en | grep -qE "^[23]" && break
  sleep 3
done
echo "admin up (or 120 s elapsed — check the log)"
```

**Step 4 — Check log for startup errors:**

Once ports respond (or if a port times out), read the captured log to catch any startup exceptions before running tests:

```powershell
Get-Content "C:\Temp\devserver.log" | Select-Object -First 100
```

If you see stack traces, module-not-found errors, or missing env var throws, diagnose and fix before proceeding to Phase 3. Common patterns:

| Log pattern                                   | Likely cause                                               |
| --------------------------------------------- | ---------------------------------------------------------- |
| `Error: NEXT_PUBLIC_SUPABASE_URL is required` | Env var not propagated to SSR — check `.env.dev` is loaded |
| `Module not found`                            | Import path error or missing dependency                    |
| `Cannot find module '...'`                    | Package not installed — run `pnpm install`                 |
| `Error: listen EADDRINUSE`                    | Port still held — re-run kill step                         |

**Step 5 — Verify app routes return expected status:**

After ports respond, do a quick sanity check on the actual app routes (not just the root):

```bash
curl -s -o /dev/null -w "admin /admin/en: %{http_code}\n" http://localhost:5050/admin/en
curl -s -o /dev/null -w "auth /auth/en: %{http_code}\n" http://localhost:5050/auth/en
```

A 200 or 3xx is healthy. A bare app port without its prefix
(`http://localhost:5002/en`) is a 404 by design — every app serves only under
its `basePath`. A 500 on a valid route means the server is broken — **do not proceed to Phase 3**. Read `C:\Temp\devserver.log` for the exception, fix the underlying cause, then restart.

#### Staging environment

Execute in this exact order. **Each step probes first, then starts only if not responding.** `--skip-infra` bypasses all probes; `--clean` forces a Supabase reset regardless of probe result.

**2a. Cloudflare tunnel — pre-check**

Probe the tunnel URL (from `NEXT_PUBLIC_STORE_URL` or equivalent in `.env.staging`):

```bash
curl -sI {tunnel_url} --max-time 5 | head -1
```

| Probe result | Action                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| 2xx/3xx      | Tunnel is up — leave it alone for now (we'll re-confirm in 2d). Skip the `tunnel:stop` step. |
| No response  | Stop any zombie tunnel state: `pnpm tunnel:stop --env staging`.                              |

**2b. Start Supabase Docker (cached)**

If `--clean` was requested, reset unconditionally:

```bash
node scripts/supabase-docker.mjs reset --env staging
```

Otherwise probe port 64321:

```bash
nc -z 127.0.0.1 64321
```

| Probe result | Action                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------ |
| Responds     | Skip start. Record `Supabase: ♻️ Reused (already running on port 64321)`.                  |
| No response  | Run `node scripts/supabase-docker.mjs start --env staging`. Record `Supabase: ✅ Started`. |

If start fails with a schema/migration error (e.g. "column not found in schema cache") and `--clean` was NOT requested, run a full reset then retry:

```bash
node scripts/supabase-docker.mjs reset --env staging
node scripts/supabase-docker.mjs start --env staging
```

**2c. Build and start Docker container (cached)**

Probe `http://localhost:7542/`:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:7542/ --max-time 5
```

| Probe result                | Action                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| 2xx / 3xx / 4xx             | Container is responding (4xx is fine — the server is up). Record `Docker container: ♻️ Reused`. |
| No response / 5xx / timeout | Run `pnpm docker:build --env staging --up`. Record `Docker container: ✅ Built+started`.        |

**2d. Start Cloudflare tunnel (cached, re-probe)**

Re-probe the tunnel URL:

```bash
curl -sI {tunnel_url} --max-time 5 | head -1
```

| Probe result | Action                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| 2xx/3xx      | Skip start. Record `Cloudflare tunnel: ♻️ Reused (active)`.             |
| No response  | Run `pnpm tunnel --env staging`. Record `Cloudflare tunnel: ✅ Active`. |

Wait until port 7542 responds (the tunnel script does this internally). If it times out, check Docker container logs:

```bash
docker logs libra-staging --tail 50
```

---

### PHASE 3 — Run Tests

Run tests for each requested app using `node scripts/e2e.mjs`.

**UX tests:** Included by default. Only skip when `--no-ux` was explicitly passed. UX tests cover drag-and-drop, animations, mobile layouts, and other interaction-heavy scenarios — they run as part of the normal suite and their results appear in the summary table.

**Strategy for `--app all`:** Run auth first, then admin. Collect all results.

**Pass-through args for specific files:**

```bash
node scripts/e2e.mjs --env staging --app auth -- apps/auth/e2e/permission-management.spec.ts
```

**Pass-through args for grep:**

```bash
node scripts/e2e.mjs --env staging --app auth -- --grep "turns payments"
```

**Pass-through timeout override (when `--timeout` specified):**

```bash
node scripts/e2e.mjs --env staging --app admin -- --timeout 60000
```

**Important:** Capture full stdout/stderr — you will parse it in Phase 4.

Collect:

- Total tests run
- Number passed / failed / skipped
- For each failure: test name, file, line, error message, expected vs actual
- Path to `test-results/` directory for artifact locations

---

### PHASE 4 — Analyze Failures

If all tests passed, skip to Phase 6 (Report).

For each failing test, apply **flaky test detection** before root cause analysis:

#### Flaky Test Detection

Re-run each failing test up to `--retries` times (default: 1 additional attempt) in isolation:

```bash
node scripts/e2e.mjs --env {env} --app {app} -- {spec_file}:{line}
```

- **Passes on retry** → classify as **Flaky** (see classification table below). Do NOT attempt to fix flaky tests automatically.
- **Fails consistently on every attempt** → proceed to root cause analysis below.

#### Root Cause Analysis (for consistent failures)

**Step 1: Read the test**

Read the test file and identify exactly what the test expects (selector, text, URL, attribute, etc.).

**Step 2: Reproduce the failure**

Look at the error output:

- **Timeout waiting for locator** → element never appeared (selector wrong, or feature broken)
- **Expected X, received Y** → assertion mismatch (wrong value, or test expectation is wrong)
- **Navigation failed** → network/tunnel issue, or route doesn't exist
- **403 / permission denied** → auth/permission setup issue in test data
- **Console error** → runtime crash in the app

**Step 3: Locate artifacts**

Find the trace and screenshot for this failure:

```
apps/{app}/test-results/{test-name-slugified}/trace.zip
apps/{app}/test-results/{test-name-slugified}/screenshot.png
```

Include these paths in the report so the user can inspect them.

**Step 4: Classify the failure**

| Classification           | Criteria                                                                  | Action                                        |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------- |
| **Flaky**                | Fails on first run but passes on retry                                    | Document; do not fix automatically            |
| **Infrastructure**       | Network timeout, port not responding, Docker not ready                    | Retry Phase 2–3; if persists, report and stop |
| **Code bug**             | App returns wrong data, wrong behavior, missing element that should exist | Fix production code (Phase 5)                 |
| **Test data bug**        | Seed data missing, wrong IDs, DB state issue                              | Fix seed data or test setup (Phase 5)         |
| **Test bug**             | Selector outdated, wrong URL pattern, assertion tests wrong thing         | Ask user before changing (see below)          |
| **Requirements changed** | The feature was deliberately changed and the test is now stale            | Ask user before changing tests                |

**Test code change policy — ALWAYS ASK:**

If you believe a test file needs to change, STOP and ask the user:

```
Test `{test name}` in `{file}:{line}` appears to fail because the test itself
may be incorrect (not the production code). Here's what I found:

- Test expects: {expectation}
- Current behavior: {actual behavior}
- My diagnosis: {why I think this is a test bug / requirements change}

Should I:
a) Fix the test to match the current behavior
b) Fix the production code to match the original test intent
c) Skip this test and continue
```

Do NOT change test files without explicit user confirmation.

---

### PHASE 5 — Fix Production Code (if --fix)

Only executed when `--fix` was requested AND the failure is classified as a **code bug** or **test data bug** (not a test bug, not flaky).

**Fix process:**

1. Read the failing test to understand the expected behavior
2. Identify the production files responsible (API routes, components, hooks, DB queries)
3. Apply the minimal fix needed to make the test pass
4. Do NOT refactor or improve surrounding code — only fix what's needed
5. Re-run only the failing test to verify:

```bash
node scripts/e2e.mjs --env {env} --app {app} -- {spec_file}:{line}
```

6. If the fix causes other tests to fail, investigate the regression before proceeding
7. Record every file changed and why

**After all individual fixes — regression check:**

Once all failing tests have been fixed, run the **full suite** one more time to confirm no regressions were introduced:

```bash
node scripts/e2e.mjs --env {env} --app {app}
```

If new failures appear that weren't in the original run, investigate and fix them before proceeding to the report.

**Generate a git diff summary of all changes:**

```bash
git diff --stat
```

Include this in the report under "Fixes Applied".

**If `--fix` was NOT requested:** Document the diagnosis and recommended fix in the report, but make no code changes.

---

### PHASE 6 — Generate Report

Save a timestamped markdown report to `.ai-context/reports/`:

```
.ai-context/reports/e2e-eval-{YYYY-MM-DDTHH-MM-SS}.md
```

#### Report format

```markdown
# E2E Eval Report

**Date:** {timestamp}
**Environment:** dev | staging
**Mode:** headless | headed
**Fix mode:** on | off
**Infra skipped:** yes | no
**DB reset (--clean):** yes | no
**Retries per failure:** {N}

---

## Summary

| App       | Total | Passed | Failed | Flaky | Skipped | Duration |
| --------- | ----- | ------ | ------ | ----- | ------- | -------- |
| auth      | X     | X      | X      | X     | X       | Xs       |
| admin     | X     | X      | X      | X     | X       | Xs       |
| **Total** | **X** | **X**  | **X**  | **X** | **X**   | **Xs**   |

**Overall status:** ✅ ALL PASSED | ⚠️ {N} FLAKY | ❌ {N} FAILED

---

## Infrastructure

| Service             | Status                                                               |
| ------------------- | -------------------------------------------------------------------- |
| Supabase            | ♻️ Reused (already running) / ✅ Started / ⏭️ Skipped (--skip-infra) |
| Docker container    | ♻️ Reused (already running) / ✅ Built+started / ⏭️ N/A (dev)        |
| Cloudflare tunnel   | ♻️ Reused (active) / ✅ Active / ⏭️ N/A (dev)                        |
| Playwright browsers | ✅ Installed                                                         |
| DB reset            | ✅ Done (--clean) / ⏭️ Skipped                                       |
| Dev server (dev)    | ✅ Killed + restarted clean / ⏭️ N/A (staging)                       |
| Dev server log      | ✅ Clean startup / ⚠️ Errors captured at `C:\Temp\devserver.log`     |
| UX tests            | ✅ Included (default) / ⏭️ Skipped (--no-ux)                         |

---

## Failed Tests

### {Test name} — {file}:{line}

**Classification:** Code bug | Test data bug | Infrastructure | Test bug (user confirmation needed)

**Error:**
```

{exact error message}

```

**Root cause:** {your diagnosis}

**Artifacts:**
- Screenshot: `apps/{app}/test-results/{slug}/screenshot.png`
- Trace: `apps/{app}/test-results/{slug}/trace.zip` (open with: `npx playwright show-trace`)

**Fix applied:** {what was changed, or "None — --fix not requested"}

---

## Flaky Tests

### {Test name} — {file}:{line}

**Pattern:** Failed on attempt 1, passed on attempt 2 (or vice versa)

**Recommendation:** Investigate selector stability, timing issues, or test data race conditions. Not auto-fixed.

---

## Fixes Applied

| File | Change | Reason |
|------|--------|--------|
| {path} | {description} | {failing test name} |

**Git diff summary:**
```

{output of git diff --stat}

```

---

## Regression Check

{Result of full-suite re-run after fixes, if --fix was used}

| Status | Notes |
|--------|-------|
| ✅ No regressions | All previously-passing tests still pass |
| ❌ {N} new failures | {list of new failures introduced by fixes} |

---

## Items Requiring User Decision

{List any test bug / requirements-change failures that were NOT fixed autonomously}

---

## Recommendations

{Any patterns, recurring issues, flaky tests worth stabilizing, or infrastructure improvements worth noting}
```

---

## Interactive Modes

`--ui` and `--debug` provide interactive debugging on top of e2e-eval's autonomous infrastructure setup. Both modes run Phases 0–2 normally (env preflight, browser/Docker/tunnel checks, infrastructure start) then hand off control to Playwright. They skip Phases 3–6 (no failure analysis, no fix, no report).

### `--ui` (Playwright UI mode)

```bash
/e2e-eval --app auth --ui
/e2e-eval --env staging --app admin --ui
```

After Phase 2, invoke:

```bash
node scripts/e2e.mjs --env {env} --app {app} --ui
```

Wait for the Playwright UI process to exit; propagate its exit code.

**Requirements:**

- Must specify a single app via `--app`. `--app all` is rejected with: `--ui requires a single --app (auth, admin, store, or payments)`.
- Mutually exclusive with `--fix`, `--retries`, `--replay`, `--ci`. Combining them is rejected with: `--ui cannot be combined with {flag}`.

### `--debug <spec>` (Playwright inspector)

```bash
/e2e-eval --app admin --debug apps/admin/e2e/reports.spec.ts
```

After Phase 2, invoke:

```bash
node scripts/e2e.mjs --env {env} --app {app} -- --debug {spec}
```

Wait for the inspector to exit; propagate exit code.

**Requirements:**

- Spec path argument is required. If omitted, reject with: `--debug requires a spec file path`.
- Must specify a single app via `--app`. `--app all` is rejected.
- Mutually exclusive with `--fix`, `--retries`, `--replay`, `--ui`, `--ci`.

---

## Replay Mode

`--replay` re-runs only the failing tests from the most recent report, with full Phases 0–2 setup and Phases 4–6 analysis/fix/report.

### Behavior

1. Locate the newest report file matching `.ai-context/reports/e2e-eval-*.md` by filename timestamp.
2. If no report file exists at all → exit with: `No previous reports found in .ai-context/reports/`.
3. Parse the "Failed Tests" section. For each `### {Test name} — {file}:{line}` heading:
   - Extract `{app}` from the file path: `apps/{app}/e2e/...` → `{app}` is the second path segment.
   - Extract `{spec_file}:{line}` as the runner argument.
4. If no failures in the newest report → exit with: `No failures to replay (last report: {path})`.
5. Group failures by app, preserving auth-before-admin order.
6. Run Phases 0–2 normally (with cached detection).
7. For each app group, invoke:

```bash
node scripts/e2e.mjs --env {env} --app {app} -- {spec1}:{line1} {spec2}:{line2}
```

8. Continue with Phases 4–6 (analysis, fix if `--fix` was also passed, report).
9. In the new report, add this line directly under the existing `**Retries per failure:**` line:

```markdown
**Replay of:** .ai-context/reports/e2e-eval-{source_timestamp}.md
```

### Edge cases

| Situation                                             | Action                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| Test file no longer exists at referenced path         | Log `Skipping {spec}:{line} — file no longer exists` and continue with the rest |
| Newest report mixes apps                              | Group and run sequentially (auth before admin)                                  |
| Replay run produces new failures not in source report | Treat normally — they appear in the new report under "Failed Tests"             |
| `--replay --fix` combination                          | Allowed: replay failures, fix each one, regression-check                        |

---

## CI Parity Mode

`--ci` reproduces how GitHub Actions runs the suite. Use it to debug failures that only manifest in CI.

### Behavior

- Force headless. If `--headed` was also passed, reject with: `--ci cannot be combined with --headed`.
- Pass through to `e2e.mjs` as: `-- --workers=1 --retries=2`.
- Disable the skill's flaky-detection retry loop. Treat Playwright's `retries=2` as the only retry mechanism; ignore the skill's `--retries` flag if also set.
- All other phases (0–6) run normally.

### Invocation

```bash
node scripts/e2e.mjs --env {env} --app {app} -- --workers=1 --retries=2
```

### Use cases

- A test passes locally but fails in CI → run `/e2e-eval --ci --files <spec>` to reproduce locally.
- Suspect a parallelism-related race → `--ci` forces single-worker.
- Suspect flakiness only in CI → `--ci` uses Playwright's retry instead of skill-level retry, matching CI behavior exactly.

---

## Rules

1. **Never skip Phase 0** — env var validation runs even with `--skip-infra`.
2. **Never skip a phase** — infrastructure must be verified before tests run (unless `--skip-infra`).
3. **Never change test files** without user confirmation.
4. **Never commit changes** — only fix files; let the user decide when to commit.
5. **Always retry failures** before classifying (flaky detection, default 1 retry).
6. **Always run regression check** after applying fixes with `--fix`.
7. **Always include artifact paths** (screenshot, trace) for every failing test in the report.
8. **Always re-run failing tests after a fix** to confirm they pass.
9. **Report path must be saved** — always write the file even if all tests passed.
10. **Minimal fixes only** — no refactoring, no surrounding cleanup.

---

## Related

- [E2E Selectors](../../rules/e2e-selectors.md) — Selector guidelines
- [Testing Rules](../../rules/testing.md) — When to change tests
- `scripts/e2e.mjs` — Unified test runner
- `scripts/supabase-docker.mjs` — Supabase control
- `scripts/docker-build.mjs` — Docker image/container control
