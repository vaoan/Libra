#!/usr/bin/env node
/**
 * Manages isolated Supabase Docker stacks for different environments.
 * Each environment gets its own set of Docker containers and ports,
 * allowing multiple Supabase instances to run simultaneously without conflicts.
 *
 * The script generates a temporary config.toml from config.toml.template
 * with ports resolved from the env file, ensuring each instance is isolated.
 *
 * Usage:
 *   node scripts/supabase-docker.mjs <command> [--env <name>] [--help]
 *
 *   Commands:
 *     start    Start the Supabase stack (pulls images if needed)
 *     stop     Stop the Supabase stack
 *     restart  Stop then start
 *     reset    Reset the database (runs migrations + seed)
 *     status   Show running Supabase services and their URLs
 *
 *   Options:
 *     --env <name>   Environment to load (default: dev)
 *     --help         Print this help and exit
 *
 * Examples:
 *   pnpm supabase:docker start --env dev
 *   pnpm supabase:docker start --env staging
 *   pnpm supabase:docker stop --env dev
 *   pnpm supabase:docker reset --env dev
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupConfig, generateConfig } from "./lib/supabase-config.mjs";
import { loadEnv } from "./load-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const isWindows = process.platform === "win32";

const VALID_COMMANDS = ["start", "stop", "restart", "reset", "status"];

// ── CLI arg parsing ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help") || args.length === 0) {
  console.log(`
Usage: node scripts/supabase-docker.mjs <command> [--env <name>] [--help]

  Commands:
    start    Start the Supabase stack (pulls images if needed)
    stop     Stop the Supabase stack
    restart  Stop then start
    reset    Reset the database (runs migrations + seed)
    status   Show running Supabase services and their URLs

  Options:
    --env <name>   Environment to load from .env.<name> (default: dev)
    --help         Print this help and exit

Examples:
  pnpm supabase:docker start --env dev
  pnpm supabase:docker start --env staging
  pnpm supabase:docker stop --env dev
  pnpm supabase:docker reset --env dev
`);
  process.exit(0);
}

const envFlag = args.indexOf("--env");
const targetEnv = envFlag !== -1 ? args[envFlag + 1] : "dev";

// First non-flag arg is the command
const command = args.find((a) => !a.startsWith("-") && a !== args[envFlag + 1]);

if (!command || !VALID_COMMANDS.includes(command)) {
  console.error(
    `ERROR: Unknown or missing command "${command ?? ""}". Valid commands: ${VALID_COMMANDS.join(", ")}`,
  );
  process.exit(1);
}

// ── Load env file ─────────────────────────────────────────────────────────────

try {
  loadEnv(targetEnv);
} catch (err) {
  console.error(`ERROR: Failed to load .env.${targetEnv}: ${err.message}`);
  process.exit(1);
}

console.log(`\n🗄  supabase-docker`);
console.log(`   env:     ${targetEnv}`);
console.log(`   command: ${command}\n`);

// ── Generate temporary config.toml from template ──────────────────────────────

// Generate config before running commands
generateConfig(targetEnv);

// Ensure cleanup on exit
process.on("exit", cleanupConfig);
process.on("SIGINT", () => {
  cleanupConfig();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanupConfig();
  process.exit(143);
});

// ── Run supabase command(s) ───────────────────────────────────────────────────

/**
 * `start` pulls a dozen images from public.ecr.aws, and in CI that pull is the
 * flakiest step there is: on 2026-09-30 it failed five times in one evening,
 * as "toomanyrequests: Data limit exceeded" and as connection timeouts. CI
 * caches the images (see the "Supabase images" steps in ci.yml); these retries
 * cover a cache miss and a registry that is only briefly unreachable. Waits
 * are in seconds, one per retry.
 */
const START_RETRY_WAITS_S = [30, 90];

function spawnSupabase(subcommand) {
  const commandArgs =
    subcommand === "reset"
      ? ["supabase", "db", "reset"]
      : ["supabase", subcommand];

  return spawnSync(
    // nosemgrep: spawn-shell-true
    isWindows ? "pnpm.cmd" : "pnpm",
    commandArgs,
    {
      cwd: rootDir,
      stdio: "inherit",
      env: process.env,
      shell: isWindows,
    },
  );
}

function runSupabase(subcommand) {
  console.log(`Running: supabase ${subcommand} ...`);
  let result = spawnSupabase(subcommand);

  if (subcommand === "start") {
    for (const waitS of START_RETRY_WAITS_S) {
      if (result.status === 0) break;
      console.warn(
        `\nsupabase start failed (exit ${result.status ?? "unknown"}); retrying in ${waitS}s`,
      );
      removeContainers(`libra-${targetEnv}`);
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        waitS * 1000,
      );
      result = spawnSupabase(subcommand);
    }
  }

  if (result.status !== 0) {
    console.error(
      `\nERROR: supabase ${subcommand} failed (exit ${result.status ?? "unknown"})`,
    );
    cleanupConfig();
    process.exit(result.status ?? 1);
  }

  console.log(`\n✓ supabase ${subcommand} completed`);
}

/** Remove every container a previous (possibly half-finished) start left. */
function removeContainers(projectId) {
  const containers = getSupabaseContainers(projectId);
  if (containers.length === 0) return 0;
  spawnSync("docker", ["rm", "-f", ...containers], {
    cwd: rootDir,
    stdio: "pipe",
    env: process.env,
  });
  return containers.length;
}

if (command === "restart" || command === "start") {
  // Clean up any orphaned containers before start/restart
  const projectId = `libra-${targetEnv}`;
  const removed = removeContainers(projectId);
  if (removed > 0) {
    console.log(`✓ Removed ${removed} orphaned container(s) for ${projectId}`);
  }

  if (command === "restart") {
    runSupabase("stop");
  }
  runSupabase("start");
} else {
  runSupabase(command);
}

function getSupabaseContainers(projectId) {
  const result = spawnSync(
    "docker",
    [
      "ps",
      "-a",
      "--filter",
      `label=com.supabase.cli.project=${projectId}`,
      "-q",
    ],
    {
      cwd: rootDir,
      stdio: "pipe",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    return [];
  }

  return result.stdout.toString().trim().split("\n").filter(Boolean);
}

// ── Print connection info after start ─────────────────────────────────────────

if (command === "start" || command === "restart") {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const studioPort = process.env.SUPABASE_STUDIO_PORT;
  console.log(`\n   Supabase URL: ${supabaseUrl ?? "(check supabase status)"}`);
  console.log(`   Studio:       http://localhost:${studioPort}`);
}

process.exit(0);
