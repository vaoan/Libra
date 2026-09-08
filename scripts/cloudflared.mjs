#!/usr/bin/env node
/**
 * Launches all enabled Cloudflare tunnels declared in the active env file.
 *
 * Usage:
 *   node scripts/cloudflared.mjs [--env <name>] [--help]
 *
 *   --env <name>   Environment to load from .env.<name> (default: prod)
 *   --help         Print this help and exit
 *
 * Examples:
 *   pnpm tunnel --env staging
 *   pnpm tunnel
 */

import { spawn, spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadEnv } from "./load-env.mjs";

const isWindows = process.platform === "win32";

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
Usage: node scripts/cloudflared.mjs [--env <name>] [--help]

  --env <name>   Environment to load from .env.<name> (default: prod)
  --help         Print this help and exit

Examples:
  pnpm tunnel --env staging
  pnpm tunnel
`);
  process.exit(0);
}

const envFlag = args.indexOf("--env");
const targetEnv = envFlag !== -1 ? args[envFlag + 1] : "prod";

// ── Load env file ─────────────────────────────────────────────────────────────

try {
  loadEnv(targetEnv);
} catch (err) {
  console.error(`ERROR: Failed to load .env.${targetEnv}: ${err.message}`);
  process.exit(1);
}

// ── Print summary ─────────────────────────────────────────────────────────────

console.log(`\n🌐 cloudflared`);
console.log(`   env: ${targetEnv}\n`);

// ── Generate ~/.cloudflared/config.yml from env ───────────────────────────────

const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID;
let baseHost = null; // set below when tunnelId is present; used for readiness poll

if (tunnelId) {
  const credentialsFile = resolve(
    homedir(),
    ".cloudflared",
    `${tunnelId}.json`,
  );

  const appPort = Number.parseInt(process.env.HOST_PORT ?? "", 10);
  if (Number.isNaN(appPort)) {
    console.error(
      "ERROR: HOST_PORT is not set — cannot generate tunnel config",
    );
    process.exit(1);
  }

  const supabasePortRaw = process.env.SUPABASE_PORT;
  if (!supabasePortRaw || supabasePortRaw === "N/A") {
    console.error(
      "ERROR: SUPABASE_PORT is not set — cannot generate tunnel config",
    );
    process.exit(1);
  }
  const supabasePort = Number.parseInt(supabasePortRaw, 10);
  if (Number.isNaN(supabasePort)) {
    console.error(
      `ERROR: SUPABASE_PORT is not a valid number: ${supabasePortRaw}`,
    );
    process.exit(1);
  }

  const siteUrl = process.env.SUPABASE_AUTH_SITE_URL;
  if (!siteUrl) {
    console.error(
      "ERROR: SUPABASE_AUTH_SITE_URL is not set — cannot derive hostname",
    );
    process.exit(1);
  }
  baseHost = new URL(siteUrl).hostname.split(".").slice(-2).join(".");

  const configPath = resolve(
    homedir(),
    ".cloudflared",
    `${targetEnv}-config.yml`,
  );
  const config = `tunnel: ${tunnelId}
credentials-file: ${credentialsFile}
protocol: http2

ingress:
  - hostname: ${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: www.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: store.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: auth.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: admin.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: payments.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: studio.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: landing.${baseHost}
    service: http://127.0.0.1:${appPort}
  - hostname: supabase.${baseHost}
    service: http://127.0.0.1:${supabasePort}
  - hostname: supabase-studio.${baseHost}
    service: http://127.0.0.1:${supabasePort + 2}
  - hostname: mailpit.${baseHost}
    service: http://127.0.0.1:${supabasePort + 3}
  - service: http_status:404
`;
  writeFileSync(configPath, config, "utf-8");
  console.log(
    `✓ Generated ~/.cloudflared/${targetEnv}-config.yml (app: ${appPort}, supabase: ${supabasePort})`,
  );
}

// ── Discover tunnels ──────────────────────────────────────────────────────────

const TUNNEL_ENABLED_RE = /^CLOUDFLARE_TUNNEL_(.+)_ENABLED$/;

const tunnelNames = Object.keys(process.env)
  .map((key) => {
    const match = TUNNEL_ENABLED_RE.exec(key);
    return match ? match[1] : null;
  })
  .filter(Boolean);

if (tunnelNames.length === 0) {
  console.log("No CLOUDFLARE_TUNNEL_*_ENABLED keys found — nothing to launch.");
  process.exit(0);
}

// ── Launch enabled tunnels ────────────────────────────────────────────────────

let launchedCount = 0;

for (const name of tunnelNames) {
  const enabled = process.env[`CLOUDFLARE_TUNNEL_${name}_ENABLED`];
  if (enabled !== "true") continue;

  const token = process.env[`CLOUDFLARE_TUNNEL_${name}_TOKEN`] ?? "";
  if (!token) {
    console.error(
      `ERROR: CLOUDFLARE_TUNNEL_${name}_TOKEN is not set — skipping`,
    );
    continue;
  }

  const cloudflaredDir = resolve(homedir(), ".cloudflared");
  try {
    mkdirSync(cloudflaredDir, { recursive: true });
  } catch {
    // already exists
  }
  const logFile = resolve(
    cloudflaredDir,
    `${name.toLowerCase()}-${targetEnv}.log`,
  );

  if (isWindows) {
    // On Windows, Node's detached+windowsHide can still surface a console.
    // Use PowerShell Start-Process -WindowStyle Hidden for a guaranteed hidden launch.
    // NOTE: Do NOT use -RedirectStandardError here — it keeps PowerShell alive until
    // cloudflared exits (a long-running daemon), which would block spawnSync forever.
    const psScript = [
      `Start-Process`,
      `-FilePath cloudflared`,
      `-ArgumentList @('tunnel','run','--token','${token}')`,
      `-WindowStyle Hidden`,
    ].join(" ");
    spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", psScript],
      { stdio: "pipe", windowsHide: true },
    );
  } else {
    const logFd = openSync(logFile, "a");
    const child = spawn("cloudflared", ["tunnel", "run", "--token", token], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    closeSync(logFd);
  }

  console.log(`✓ Tunnel launched: ${name}`);
  console.log(`   Logs: tail -f ${logFile}`);
  launchedCount++;
}

if (launchedCount === 0) {
  console.log("No tunnels were enabled — nothing launched.");
}

// Wait until the tunnel is actually routing traffic before exiting.
// cloudflared takes 5–15 s to connect to Cloudflare's edge after spawning.
// Without this poll, callers (e2e.mjs) would start tests before the tunnel
// is ready, receiving 530 HTML responses instead of JSON from Supabase.
if (launchedCount > 0 && baseHost) {
  const checkUrl = `https://supabase.${baseHost}/auth/v1/health`;
  console.log(`\n   Waiting for tunnel to route traffic (${checkUrl})...`);
  const deadline = Date.now() + 300_000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      // Manual controller avoids AbortSignal.timeout() libuv crash on Windows
      // when process.exit() fires while the internal timer is still pending.
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 5_000);
      let res;
      try {
        res = await fetch(checkUrl, { signal: ac.signal });
      } finally {
        clearTimeout(tid);
      }
      if (res.status !== 530) {
        console.log(`✓ Tunnel ready (HTTP ${res.status})\n`);
        ready = true;
        break;
      }
    } catch {
      // connection error or abort — tunnel not yet routing, keep polling
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!ready) {
    console.warn(
      `⚠ Tunnel readiness check timed out after 300 s — tests may fail\n`,
    );
  }
}

process.exit(0);
