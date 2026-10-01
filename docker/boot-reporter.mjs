#!/usr/bin/env node
/**
 * boot-reporter.mjs — In-container one-shot Telegram progress reporter.
 *
 * Managed by supervisord with autorestart=false and startretries=0.
 * Runs exactly once per container start; exits 0 on success, 1 on timeout.
 *
 * Uptime gate: /proc/uptime is shared with the host kernel (same Linux kernel).
 * - uptime < 120s → fresh OS boot → host boot-notifier.mjs owns the progress
 *   message → this script exits 0 immediately to avoid double-editing.
 * - uptime >= 120s → deploy restart → TELEGRAM_BOOT_MSG_ID was set by
 *   deploy-production.sh → this script edits that message as ports open.
 *
 * If TELEGRAM_BOOT_MSG_ID is absent (old container, manual docker run, etc.)
 * → exits 0 silently.
 */

import { createConnection } from "net";
import { readFileSync } from "fs";
import { hostname } from "os";

function htmlEscape(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function asPositiveInt(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const BOOT_MSG_ID = asPositiveInt(process.env.TELEGRAM_BOOT_MSG_ID || "") ?? 0;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const CRITICAL_THREAD_ID =
  process.env.TELEGRAM_CRITICAL_THREAD_ID ||
  process.env.TELEGRAM_THREAD_ID ||
  "";
const SERVER_HOSTNAME = htmlEscape(process.env.SERVER_HOSTNAME || "");
const CONTAINER_NAME = htmlEscape(process.env.CONTAINER_NAME || "libra-prod");
const TELEGRAM_SOURCE = htmlEscape(process.env.SERVER_HOSTNAME || hostname());

if (!BOOT_MSG_ID) process.exit(0);

try {
  const uptime = parseFloat(readFileSync("/proc/uptime", "utf8").split(" ")[0]);
  if (uptime < 120) process.exit(0);
} catch {}

const APPS = [
  { name: "auth", port: 5000 },
  { name: "store", port: 5001 },
  { name: "admin", port: 5002 },
  { name: "landing", port: 5004 },
  { name: "payments", port: 5005 },
  { name: "studio", port: 5006 },
];
const NGINX_PORT = 8080;

function checkPort(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1", timeout: 2_000 });
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function tgEdit(text) {
  if (!BOT_TOKEN || !CHAT_ID || !BOOT_MSG_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: BOOT_MSG_ID,
        text: `${text}\n\n📍 ${TELEGRAM_SOURCE}`,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {}
}

async function tgCritical(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const body = {
      chat_id: CHAT_ID,
      text: `${text}\n\n📍 ${TELEGRAM_SOURCE}`,
      parse_mode: "HTML",
    };
    const tid = asPositiveInt(CRITICAL_THREAD_ID);
    if (tid) body.message_thread_id = tid;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {}
}

function progressBar(ready, total) {
  const n = Math.round((ready / total) * 16);
  return "█".repeat(n) + "░".repeat(16 - n);
}

function fmtElapsed(startTime) {
  const s = Math.round((Date.now() - startTime) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function formatProgress(appStatus, startTime) {
  const ready = appStatus.filter((a) => a.readyAt !== null).length;
  const total = appStatus.length;
  const pct = Math.round((ready / total) * 100);
  const dateStr =
    new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const rows = appStatus.map((a) => {
    if (a.readyAt !== null) {
      const s = Math.round((a.readyAt - startTime) / 1000);
      return `  ✅ ${a.name.padEnd(12)}${s}s`;
    }
    return `  ⏳ ${a.name.padEnd(12)}...`;
  });
  rows.push(`  ⏳ ${"nginx".padEnd(12)}waiting for all apps...`);

  return [
    `🔄 <b>Container Boot</b>${SERVER_HOSTNAME ? `  •  <code>${SERVER_HOSTNAME}</code>` : ""}  •  <code>${CONTAINER_NAME}</code>  •  ${dateStr}`,
    "",
    `Progress: ${ready}/${total}  ${progressBar(ready, total)}  ${pct}%`,
    "",
    ...rows,
    "",
    `Elapsed: ${fmtElapsed(startTime)}`,
  ].join("\n");
}

async function main() {
  const startTime = Date.now();
  const appStatus = APPS.map((a) => ({ ...a, readyAt: null }));
  const deadline = startTime + 120_000;

  while (Date.now() < deadline) {
    for (const app of appStatus) {
      if (app.readyAt === null && (await checkPort(app.port))) {
        app.readyAt = Date.now();
      }
    }

    if (appStatus.every((a) => a.readyAt !== null)) {
      const nginxOk = await checkPort(NGINX_PORT);
      const dur = fmtElapsed(startTime);
      const host = SERVER_HOSTNAME
        ? `  •  <code>${SERVER_HOSTNAME}</code>`
        : "";
      await tgEdit(
        nginxOk
          ? `✅ <b>All ${APPS.length} apps ready</b>${host}  •  <code>${CONTAINER_NAME}</code>  •  Boot in ${dur}\n   nginx up — traffic restored`
          : `✅ <b>All ${APPS.length} apps ready</b>${host}  •  <code>${CONTAINER_NAME}</code>  •  Boot in ${dur}\n   ⚠️ nginx not yet up`,
      );
      process.exit(0);
    }

    await tgEdit(formatProgress(appStatus, startTime));
    await new Promise((r) => setTimeout(r, 3_000));
  }

  const failed = appStatus
    .filter((a) => a.readyAt === null)
    .map((a) => a.name)
    .join(", ");
  const host = SERVER_HOSTNAME ? `  •  <code>${SERVER_HOSTNAME}</code>` : "";
  await tgCritical(
    `❌ <b>${failed} failed to start after 120s</b>${host}  •  <code>${CONTAINER_NAME}</code>\n   Check: <code>docker logs ${CONTAINER_NAME}</code>`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[boot-reporter]", err.message);
  process.exit(1);
});
