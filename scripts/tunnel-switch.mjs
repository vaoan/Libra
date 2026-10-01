#!/usr/bin/env node
/**
 * Cloudflare tunnel switcher — routes store.furrycolombia.com traffic
 * between the local production server and the GCP VM.
 *
 * Whichever machine has cloudflared running wins. This script starts it
 * on the target and stops it on the other side.
 *
 * Usage:
 *   node scripts/tunnel-switch.mjs local              # Traffic -> local server
 *   node scripts/tunnel-switch.mjs gcp                # Traffic -> GCP VM
 *   node scripts/tunnel-switch.mjs status             # Show state on both servers
 *   node scripts/tunnel-switch.mjs configure-ingress  # Push Cloudflare ingress rules
 *
 * Or via pnpm:
 *   pnpm tunnel:switch local
 *   pnpm tunnel:switch gcp
 *   pnpm tunnel:switch status
 *   pnpm tunnel:switch configure-ingress
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "ssh2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// ── Constants ─────────────────────────────────────────────────────

const SSH_READY_TIMEOUT = 15_000;
const CMD_TIMEOUT_MS = 30_000;
const CF_API_BASE = "https://api.cloudflare.com/client/v4";

// One hostname: the container's nginx routes every app by path prefix.
// The apex and www are separate sites and are not this project's to route.
const CLOUDFLARE_HOSTNAMES = ["store.furrycolombia.com"];

// ── Secrets loader ────────────────────────────────────────────────

function loadSecrets() {
  const path = resolve(rootDir, ".secrets");
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const secrets = loadSecrets();

function requireSecret(name) {
  const value = secrets[name] ?? "";
  if (!value) throw new Error(`${name} missing from .secrets`);
  return value;
}

// ── Server config ─────────────────────────────────────────────────

const LOCAL_HOST = secrets.LOCAL_PROD_SERVER_HOST ?? "";
const LOCAL_USER = secrets.LOCAL_PROD_SERVER_USER ?? "";
const LOCAL_PASS = secrets.LOCAL_PROD_SERVER_PASS ?? "";
const LOCAL_FINGERPRINT = secrets.LOCAL_PROD_SERVER_HOST_FINGERPRINT ?? "";

const GCP_HOST = secrets.GCP_PROD_SERVER_HOST ?? "";
const GCP_USER = secrets.GCP_PROD_SERVER_USER ?? "";
const GCP_KEY_B64 = secrets.GCP_PROD_SERVER_SSH_KEY_B64 ?? "";
const GCP_FINGERPRINT = secrets.GCP_PROD_SERVER_HOST_FINGERPRINT ?? "";

// ── SSH helpers ───────────────────────────────────────────────────

/**
 * Returns a hostVerifier function for ssh2 if a fingerprint is configured.
 * Compares the server's fingerprint (as hex) against the stored value.
 */
function makeHostVerifier(expectedFingerprint, host) {
  if (!expectedFingerprint) return undefined;
  return (fingerprint) => {
    const fp = Buffer.isBuffer(fingerprint)
      ? fingerprint.toString("hex")
      : String(fingerprint);
    if (fp !== expectedFingerprint) {
      console.error(
        `\nSSH host key mismatch for ${host}!\n` +
          `  expected: ${expectedFingerprint}\n` +
          `  got:      ${fp}\n` +
          `If the host key legitimately changed, update LOCAL_PROD_SERVER_HOST_FINGERPRINT ` +
          `or GCP_PROD_SERVER_HOST_FINGERPRINT in .secrets.\n`,
      );
      return false;
    }
    return true;
  };
}

function sshConnect(options) {
  return new Promise((res, rej) => {
    const conn = new Client();
    conn
      .on("ready", () => res(conn))
      .on("error", rej)
      .connect(options);
  });
}

function connectLocal() {
  if (!LOCAL_HOST || !LOCAL_USER || !LOCAL_PASS) {
    throw new Error(
      "Local server credentials missing from .secrets " +
        "(need LOCAL_PROD_SERVER_HOST, LOCAL_PROD_SERVER_USER, LOCAL_PROD_SERVER_PASS)",
    );
  }
  const hostVerifier = makeHostVerifier(LOCAL_FINGERPRINT, LOCAL_HOST);
  return sshConnect({
    host: LOCAL_HOST,
    username: LOCAL_USER,
    password: LOCAL_PASS,
    readyTimeout: SSH_READY_TIMEOUT,
    ...(hostVerifier && { hostVerifier }),
  });
}

function connectGcp() {
  if (!GCP_HOST || !GCP_USER || !GCP_KEY_B64) {
    throw new Error(
      "GCP credentials missing from .secrets " +
        "(need GCP_PROD_SERVER_HOST, GCP_PROD_SERVER_USER, GCP_PROD_SERVER_SSH_KEY_B64)",
    );
  }
  const privateKey = Buffer.from(GCP_KEY_B64, "base64").toString("utf-8");
  const hostVerifier = makeHostVerifier(GCP_FINGERPRINT, GCP_HOST);
  return sshConnect({
    host: GCP_HOST,
    username: GCP_USER,
    privateKey,
    readyTimeout: SSH_READY_TIMEOUT,
    ...(hostVerifier && { hostVerifier }),
  });
}

/**
 * Run a shell command over SSH.
 * When sudoPass is provided it is written to the remote process stdin so that
 * `sudo -S` can read it — avoids embedding the password in the shell string
 * (prevents CWE-78 shell injection and CWE-214 process list exposure).
 */
function run(conn, cmd, sudoPass) {
  return new Promise((res, rej) => {
    const fullCmd = sudoPass ? `sudo -S sh -c ${JSON.stringify(cmd)}` : cmd;

    conn.exec(fullCmd, (err, stream) => {
      if (err) return rej(err);

      let out = "";

      const timer = setTimeout(() => {
        stream.destroy();
        rej(
          new Error(
            `Command timed out after ${CMD_TIMEOUT_MS / 1000}s: ${cmd}`,
          ),
        );
      }, CMD_TIMEOUT_MS);

      stream.on("error", (e) => {
        clearTimeout(timer);
        rej(e);
      });
      stream.on("data", (d) => {
        out += d;
      });
      stream.stderr.on("data", (d) => {
        out += d;
      });
      stream.on("close", () => {
        clearTimeout(timer);
        res(out.trim());
      });

      if (sudoPass) {
        stream.write(sudoPass + "\n");
        stream.end();
      }
    });
  });
}

/** Returns "active" | "inactive" | "dead" | "failed" | "unknown" */
async function getStatus(conn, sudoPass) {
  const out = await run(conn, "systemctl is-active cloudflared", sudoPass);
  const last = out.split("\n").at(-1)?.trim() ?? "";
  return ["active", "inactive", "dead", "failed"].includes(last)
    ? last
    : "unknown";
}

async function start(conn, sudoPass) {
  await run(
    conn,
    "systemctl start cloudflared && systemctl enable cloudflared",
    sudoPass,
  );
  return getStatus(conn, sudoPass);
}

async function stop(conn, sudoPass) {
  await run(
    conn,
    "systemctl stop cloudflared && systemctl disable cloudflared",
    sudoPass,
  );
  return getStatus(conn, sudoPass);
}

// ── Shared helpers ────────────────────────────────────────────────

async function printServerStatus(label, host, connectFn, sudoPass) {
  process.stdout.write(`  ${label} (${host}): `);
  try {
    const conn = await connectFn();
    const status = await getStatus(conn, sudoPass);
    conn.end();
    console.log(
      status === "active" ? "[active]  <-- serving traffic" : `[${status}]`,
    );
  } catch (e) {
    console.log(`[unreachable] ${e.message}`);
  }
}

// ── Commands ──────────────────────────────────────────────────────

async function cmdStatus() {
  console.log("Checking cloudflared on both servers...\n");
  await printServerStatus("Local", LOCAL_HOST, connectLocal, LOCAL_PASS);
  await printServerStatus("GCP  ", GCP_HOST, connectGcp, undefined);
}

async function cmdSwitch(target) {
  console.log(`\nSwitching tunnel to: ${target.toUpperCase()}\n`);

  if (target === "local") {
    process.stdout.write(
      `[1/2] Starting cloudflared on local (${LOCAL_HOST})... `,
    );
    const local = await connectLocal();
    try {
      const s = await start(local, LOCAL_PASS);
      console.log(s === "active" ? "OK" : `WARNING: ${s}`);
    } finally {
      local.end();
    }

    process.stdout.write(
      `[2/2] Stopping  cloudflared on GCP   (${GCP_HOST})... `,
    );
    try {
      const gcp = await connectGcp();
      try {
        const s = await stop(gcp);
        console.log(["inactive", "dead"].includes(s) ? "OK" : `WARNING: ${s}`);
      } finally {
        gcp.end();
      }
    } catch (e) {
      console.log(`skipped (${e.message})`);
    }
  } else {
    process.stdout.write(
      `[1/2] Starting cloudflared on GCP   (${GCP_HOST})... `,
    );
    const gcp = await connectGcp();
    try {
      const s = await start(gcp);
      console.log(s === "active" ? "OK" : `WARNING: ${s}`);
    } finally {
      gcp.end();
    }

    process.stdout.write(
      `[2/2] Stopping  cloudflared on local (${LOCAL_HOST})... `,
    );
    const local = await connectLocal();
    try {
      const s = await stop(local, LOCAL_PASS);
      console.log(["inactive", "dead"].includes(s) ? "OK" : `WARNING: ${s}`);
    } finally {
      local.end();
    }
  }

  console.log(
    `\nDone. store.furrycolombia.com is now served from: ${target.toUpperCase()}`,
  );
}

/**
 * Push ingress rules to Cloudflare API so the tunnel routes all hostnames
 * to the correct local port.
 */
async function pushIngressRules(apiToken, accountID, tunnelID, hostPort) {
  const service = `http://localhost:${hostPort}`;
  const ingress = [
    ...CLOUDFLARE_HOSTNAMES.map((hostname) => ({ hostname, service })),
    { service: "http_status:404" },
  ];

  const url = `${CF_API_BASE}/accounts/${accountID}/cfd_tunnel/${tunnelID}/configurations`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ config: { ingress } }),
  });

  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await resp.text();
    throw new Error(
      `Cloudflare API returned non-JSON (HTTP ${resp.status}): ${text.slice(0, 300)}`,
    );
  }

  const data = await resp.json();
  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

/**
 * Reads tunnel credentials from explicit secrets (preferred) or falls back
 * to JWT decode of the tunnel token. The token is NOT verified — it is
 * already trusted because it came from .secrets.
 */
function parseTunnelToken(token) {
  if (secrets.CLOUDFLARE_TUNNEL_ID && secrets.CLOUDFLARE_ACCOUNT_ID) {
    return {
      tunnelID: secrets.CLOUDFLARE_TUNNEL_ID,
      accountID: secrets.CLOUDFLARE_ACCOUNT_ID,
    };
  }

  try {
    const payload = token.split(".")[1];
    if (!payload) throw new Error("malformed JWT");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (!decoded["tunnel_id"] || !decoded["account_tag"]) {
      throw new Error("JWT payload missing tunnel_id or account_tag");
    }
    return {
      tunnelID: decoded["tunnel_id"],
      accountID: decoded["account_tag"],
    };
  } catch {
    // Falls through to the error below
  }

  throw new Error(
    "Cannot determine tunnel credentials. Add CLOUDFLARE_TUNNEL_ID and " +
      "CLOUDFLARE_ACCOUNT_ID to .secrets, or ensure CLOUDFLARE_TUNNEL_TOKEN is a valid JWT.",
  );
}

async function cmdConfigureIngress() {
  const apiToken = requireSecret("CLOUDFLARE_API_TOKEN");
  const tunnelToken = requireSecret("CLOUDFLARE_TUNNEL_TOKEN");
  const hostPort = secrets.LOCAL_PROD_SERVER_PORT ?? "3000";

  const { tunnelID, accountID } = parseTunnelToken(tunnelToken);

  console.log(`\nConfiguring Cloudflare ingress for tunnel ${tunnelID}...\n`);
  console.log(`  Hostnames: ${CLOUDFLARE_HOSTNAMES.join(", ")}`);
  console.log(`  Service:   http://localhost:${hostPort}\n`);

  await pushIngressRules(apiToken, accountID, tunnelID, hostPort);

  console.log(
    "Ingress rules updated. Restarting cloudflared on GCP to apply...",
  );
  process.stdout.write(`  Restarting cloudflared on GCP (${GCP_HOST})... `);

  const conn = await connectGcp();
  try {
    await run(conn, "systemctl restart --wait cloudflared");
    const status = await getStatus(conn);
    console.log(status === "active" ? "OK" : `WARNING: ${status}`);
  } finally {
    conn.end();
  }

  console.log("\nDone. Ingress configuration applied.");
}

// ── Main ──────────────────────────────────────────────────────────

const target = process.argv[2];
if (!["local", "gcp", "status", "configure-ingress"].includes(target)) {
  console.error(
    "Usage: node scripts/tunnel-switch.mjs [local|gcp|status|configure-ingress]\n" +
      "       pnpm tunnel:switch [local|gcp|status|configure-ingress]",
  );
  process.exit(1);
}

try {
  if (target === "status") {
    await cmdStatus();
  } else if (target === "configure-ingress") {
    await cmdConfigureIngress();
  } else {
    await cmdSwitch(target);
  }
} catch (e) {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
}
