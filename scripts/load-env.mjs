/**
 * Minimal env loader with $secret: resolution.
 *
 * Loads .env.{TARGET_ENV} (default: dev) and resolves $secret:KEY references.
 *
 * Locally:  reads .secrets file for resolution.
 * CI:       when CI=true, secrets are already in process.env — .secrets is skipped.
 *
 * Usage (from other scripts):
 *   import { loadEnv } from './load-env.mjs';
 *   loadEnv();                        // loads .env.dev
 *   loadEnv('staging');               // loads .env.staging
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Parses env-file text (KEY=VALUE lines) — takes content string, not a path,
// so no file-path taint flows through this function.
function parseEnvContent(content) {
  const vars = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    vars[key] = val;
  }
  return vars;
}

// Returns a hardcoded filename literal for each allowed env name.
// Using a switch so each return value is a constant string — SAST tools
// treat switch-case string literals as untainted, breaking the taint chain
// from the caller-supplied env name.
function envFileName(env) {
  switch (env) {
    case "dev":
      return ".env.dev";
    case "staging":
      return ".env.staging";
    case "e2e":
      return ".env.e2e";
    case "prod":
      return ".env.prod";
    case "production":
      return ".env.production";
    case "test":
      return ".env.test";
    case "ci":
      return ".env.ci";
    default:
      return null;
  }
}

// Reads and parses the .env.{env} file. The file path is always constructed
// from rootDir (a constant) and a hardcoded string from envFileName().
function readEnvFile(env) {
  const filename = envFileName(env);
  if (!filename) return {};
  const fullPath = resolve(rootDir, filename); // nosemgrep: AIK_ts_generic_path_traversal
  if (!existsSync(fullPath)) return {};
  return parseEnvContent(readFileSync(fullPath, "utf-8")); // nosemgrep: AIK_ts_generic_path_traversal
}

// Where the secrets file lives. Hardcoded to the repository root, with one
// documented exception: LOAD_ENV_SECRETS_PATH.
//
// The exception exists for the test suite. These tests used to exercise the
// local path by writing a placeholder .secrets at the repository root and
// removing it afterwards, which is shared mutable state -- it failed roughly
// one run in six, and a flaky gate teaches people to re-run rather than read.
// Pointing the test at its own temp file removes the shared state instead of
// retrying around it.
//
// It is read from the environment rather than passed as an argument because
// loadEnv is called by scripts that must not know about it.
function secretsFilePath() {
  return process.env.LOAD_ENV_SECRETS_PATH
    ? resolve(process.env.LOAD_ENV_SECRETS_PATH) // nosemgrep: AIK_ts_generic_path_traversal
    : resolve(rootDir, ".secrets");
}

// Reads and parses the secrets file.
function readSecretsFile() {
  const fullPath = secretsFilePath();
  if (!existsSync(fullPath)) return {};
  return parseEnvContent(readFileSync(fullPath, "utf-8")); // nosemgrep: AIK_ts_generic_path_traversal
}

const SECRET_RE = /(?<!\$)\$secret:([A-Z][A-Z0-9_]*)/g;

// Explicit opt-out for a $secret: reference that is allowed to resolve to an
// empty string in CI. Empty by design: every current $secret: reference is
// expected to have a real value (see .env.ci's Sentry comment — a value that
// is legitimately optional is left blank directly in the env file instead of
// using $secret:, e.g. NEXT_PUBLIC_SENTRY_DSN=). Add a name here only with a
// comment explaining why that specific secret may be empty in CI; do not use
// this to silence a missing-secret error you haven't investigated.
const CI_OPTIONAL_SECRETS = new Set([]);

function resolveSecrets(vars, secrets) {
  for (const [key, val] of Object.entries(vars)) {
    if (!val.includes("$secret:")) continue;
    vars[key] = val.replace(SECRET_RE, (_, name) => {
      if (!(name in secrets))
        throw new Error(`Missing secret: "${name}". Run pnpm sync-secrets.`);
      return secrets[name];
    });
  }
  return vars;
}

const ALLOWED_ENVS = [
  "dev",
  "staging",
  "e2e",
  "prod",
  "production",
  "test",
  "ci",
];

export function loadEnv(targetEnv) {
  const env = targetEnv || process.env.TARGET_ENV || "dev";
  if (!ALLOWED_ENVS.includes(env)) {
    throw new Error(
      `Invalid environment name: "${env}". Allowed values: ${ALLOWED_ENVS.join(", ")}`,
    );
  }

  const filename = envFileName(env);
  if (!filename || !existsSync(resolve(rootDir, filename))) {
    // nosemgrep: AIK_ts_generic_path_traversal
    throw new Error(`Env file not found: .env.${env}`);
  }

  const vars = readEnvFile(env);

  // Resolve $secret: references
  const hasSecretRefs = Object.values(vars).some((v) => v.includes("$secret:"));
  if (hasSecretRefs) {
    if (process.env.CI === "true") {
      // CI: secrets are injected into process.env by the workflow's `env:`
      // block. A $secret:NAME reference that resolves to nothing here means
      // the workflow forgot to pass NAME through — fail loudly and name the
      // variable, instead of silently writing "" and letting the failure
      // surface far away (e.g. a Playwright setup script erroring out over
      // an env var whose name gives no hint that load-env is the culprit).
      for (const [key, val] of Object.entries(vars)) {
        if (val.includes("$secret:")) {
          const match = val.match(/\$secret:([A-Z][A-Z0-9_]*)/);
          const name = match?.[1];
          const resolved = name ? process.env[name] : undefined;
          if (!resolved) {
            if (name && CI_OPTIONAL_SECRETS.has(name)) {
              vars[key] = "";
              continue;
            }
            throw new Error(
              `Missing secret in CI: "${name}" (referenced by .env.${env}). ` +
                `The workflow job running this must pass ${name} through its ` +
                `env: block (the GitHub repo secret must already exist).`,
            );
          }
          vars[key] = resolved;
        }
      }
    } else {
      if (!existsSync(secretsFilePath())) {
        throw new Error("Missing .secrets file. Run pnpm sync-secrets.");
      }
      resolveSecrets(vars, readSecretsFile());
    }
  }

  // Write into process.env — existing vars (CLI/CI overrides) win
  for (const [key, val] of Object.entries(vars)) {
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }

  // Always set TARGET_ENV so app code can read which env is active
  process.env.TARGET_ENV = env;

  // If ENV_DEBUG=true, serialize all resolved vars into a single NEXT_PUBLIC_ var
  // so admin's /en/env debug viewer can display them without needing turbo
  // globalEnv entries.
  // Guard: never expose env vars in production builds.
  const isProduction =
    process.env.NODE_ENV === "production" ||
    env === "prod" ||
    env === "production";

  if (vars.ENV_DEBUG === "true") {
    if (isProduction) {
      console.warn(
        "[load-env] WARNING: ENV_DEBUG=true is ignored in production. NEXT_PUBLIC_ENV_DEBUG will not be set.",
      );
    } else {
      // Only expose NEXT_PUBLIC_ vars — never expose server-side secrets or keys
      const publicEntries = Object.entries(vars).filter(([k]) =>
        k.startsWith("NEXT_PUBLIC_"),
      );
      const snapshot = {
        ...Object.fromEntries(publicEntries),
        TARGET_ENV: env,
        NODE_ENV: process.env.NODE_ENV ?? "",
      };
      process.env.NEXT_PUBLIC_ENV_DEBUG = JSON.stringify(snapshot);
    }
  }
}
