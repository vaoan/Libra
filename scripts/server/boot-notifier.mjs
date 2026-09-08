#!/usr/bin/env node
/**
 * boot-notifier.mjs — Host-side PM2 process for OS reboot detection.
 *
 * Sends a live-updating Telegram progress message when the server reboots.
 * Uses /proc/uptime to distinguish OS boot (< 120s) from a deploy restart
 * (>= 120s). On deploy restarts, the container's boot-reporter.mjs handles
 * Telegram updates; this script simply idles to avoid double-editing.
 *
 * Managed by PM2. Added to pm2 save so it restores on OS boot automatically.
 * Environment: inherited from PM2 (WATCHER_NGINX_PORT set by deploy-production.sh).
 */

import { readFileSync } from "fs";
import { hostname } from "os";

const NGINX_PORT = process.env.WATCHER_NGINX_PORT || "9090";
const SERVER_HOSTNAME = htmlEscape(process.env.SERVER_HOSTNAME || hostname());
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const THREAD_ID = process.env.TELEGRAM_THREAD_ID || "";
const CRITICAL_THREAD_ID = process.env.TELEGRAM_CRITICAL_THREAD_ID || THREAD_ID;
const TELEGRAM_SOURCE = SERVER_HOSTNAME;

function htmlEscape(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function asPositiveInt(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const APPS = [
  { name: "auth", path: "/auth/health" },
  { name: "store", path: "/store/health" },
  { name: "admin", path: "/admin/health" },
  { name: "landing", path: "/en" },
  { name: "payments", path: "/payments/health" },
  { name: "studio", path: "/studio/health" },
];

function readUptime() {
  try {
    return parseFloat(readFileSync("/proc/uptime", "utf8").split(" ")[0]);
  } catch {
    return 9999;
  }
}

async function tgPost(text, threadId) {
  if (!BOT_TOKEN || !CHAT_ID) return null;
  try {
    const body = {
      chat_id: CHAT_ID,
      text: `${text}\n\n📍 ${TELEGRAM_SOURCE}`,
      parse_mode: "HTML",
    };
    const tid = asPositiveInt(threadId);
    if (tid) body.message_thread_id = tid;
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const d = await res.json();
    return d.ok ? d.result.message_id : null;
  } catch {
    return null;
  }
}

async function tgEdit(msgId, text) {
  if (!BOT_TOKEN || !CHAT_ID || !msgId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        message_id: msgId,
        text: `${text}\n\n📍 ${TELEGRAM_SOURCE}`,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {}
}

async function checkHealth(path) {
  try {
    const res = await fetch(`http://127.0.0.1:${NGINX_PORT}${path}`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function progressBar(ready, total) {
  const n = Math.round((ready / total) * 16);
  return "█".repeat(n) + "░".repeat(16 - n);
}

function fmtElapsed(startTime) {
  const s = Math.round((Date.now() - startTime) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function formatProgress(appStatus, startTime, label) {
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
    `🔄 <b>${label}</b>  •  <code>${SERVER_HOSTNAME}</code>  •  ${dateStr}`,
    "",
    `Progress: ${ready}/${total}  ${progressBar(ready, total)}  ${pct}%`,
    "",
    ...rows,
    "",
    `Elapsed: ${fmtElapsed(startTime)}`,
  ].join("\n");
}

async function runBootSequence(label) {
  const startTime = Date.now();
  const appStatus = APPS.map((a) => ({ ...a, readyAt: null }));
  const msgId = await tgPost(
    formatProgress(appStatus, startTime, label),
    THREAD_ID,
  );
  const deadline = startTime + 180_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));

    for (const app of appStatus) {
      if (app.readyAt === null && (await checkHealth(app.path))) {
        app.readyAt = Date.now();
      }
    }

    if (appStatus.every((a) => a.readyAt !== null)) {
      const dur = fmtElapsed(startTime);
      await tgEdit(
        msgId,
        `✅ <b>All ${APPS.length} apps ready</b>  •  <code>${SERVER_HOSTNAME}</code>  •  Boot in ${dur}\n   nginx up — traffic restored`,
      );
      return;
    }

    await tgEdit(msgId, formatProgress(appStatus, startTime, label));
  }

  const failed = appStatus
    .filter((a) => a.readyAt === null)
    .map((a) => a.name)
    .join(", ");
  await tgPost(
    `❌ <b>${failed} failed to start after 180s</b>  •  <code>${SERVER_HOSTNAME}</code>\n   Check: <code>docker logs libra-prod</code>`,
    CRITICAL_THREAD_ID,
  );
}

async function main() {
  if (readUptime() >= 120) {
    // Deploy restart — container's boot-reporter.mjs handles Telegram updates.
    // Idle so PM2 doesn't restart this as a crash.
    while (true) await new Promise((r) => setTimeout(r, 100_000));
  }
  await runBootSequence("Server Boot");
  while (true) await new Promise((r) => setTimeout(r, 100_000));
}

main().catch((err) => {
  console.error("[boot-notifier]", err.message);
  process.exit(1);
});
