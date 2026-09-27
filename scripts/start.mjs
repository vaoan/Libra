#!/usr/bin/env node
// Starts all apps in dev mode plus the dev proxy that fronts them on HOST_PORT.
// Loads .env.dev (with $secret: resolution) before starting.
// Each app's port comes from config/app-links.json.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import treeKill from "tree-kill";

import { loadAppRegistry, portForApp } from "./lib/app-registry.mjs";
import { assertPortFree } from "./lib/dev-proxy-server.mjs";
import { loadEnv } from "./load-env.mjs";

const envFlag = process.argv.indexOf("--env");
const targetEnv = envFlag !== -1 ? process.argv[envFlag + 1] : "dev";
loadEnv(targetEnv);

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const registry = loadAppRegistry();

// Fail before spawning anything: a taken HOST_PORT (a CI container left up,
// a previous pnpm dev) would otherwise start six dev servers and then kill
// them, which on Windows leaves the grandchild node processes alive.
const hostPort = Number.parseInt(process.env.HOST_PORT ?? "", 10);
if (!Number.isInteger(hostPort) || hostPort <= 0 || hostPort > 65_535) {
  console.error(
    "pnpm dev: HOST_PORT must be set to a valid port in the env file",
  );
  process.exit(1);
}
try {
  await assertPortFree(hostPort);
} catch (err) {
  console.error(`pnpm dev: ${err.message} — stop what holds it and retry`);
  process.exit(1);
}

const appsDir = resolve(rootDir, "apps");
const appNames = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Clear .next cache for all apps to avoid stale env var mismatches
for (const app of appNames) {
  const cache = resolve(appsDir, app, ".next");
  if (existsSync(cache)) {
    rmSync(cache, { recursive: true, force: true });
  }
}

// pnpm hoists binaries to the workspace root — not to each app's node_modules/.bin/
const nextBin = resolve(
  rootDir,
  "node_modules",
  ".bin",
  isWindows ? "next.CMD" : "next",
);

const children = appNames.map((app) => {
  const appDir = resolve(rootDir, "apps", app); // nosemgrep: AIK_ts_generic_path_traversal
  // portForApp throws for an app directory missing from the registry, which
  // is the right outcome: an unregistered app is also unroutable in prod.
  const args = ["dev", "-p", String(portForApp(registry, app))];

  // On Windows, .CMD files cannot be spawned directly without shell:true.
  // Invoke cmd.exe explicitly with a fixed argument list to avoid shell injection.
  return isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", nextBin, ...args], {
        cwd: appDir,
        stdio: "inherit",
        env: process.env,
      })
    : spawn(nextBin, args, { cwd: appDir, stdio: "inherit", env: process.env });
});

// The proxy is the origin developers actually use: http://localhost:HOST_PORT
children.push(
  spawn(process.execPath, [resolve(__dirname, "dev-proxy.mjs")], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  }),
);

// Kill whole trees: on Windows each dev server is a `node` grandchild under a
// `cmd.exe` wrapper, and child.kill() would only take the wrapper.
function stopAll() {
  for (const child of children) {
    if (child.pid && child.exitCode === null) treeKill(child.pid);
  }
}

children.forEach((child) => {
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      stopAll();
      process.exit(code);
    }
  });
});

process.on("exit", stopAll);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopAll();
    process.exit(0);
  });
}
