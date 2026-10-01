/**
 * Self-contained CJS env loader with $secret: resolution.
 *
 * Loads .env.{targetEnv} (default: dev) and resolves $secret:KEY references.
 *
 * Locally:  reads .secrets file for resolution.
 * CI:       when CI=true, secrets are already in process.env — .secrets is skipped.
 *
 * This is a deliberate, parallel implementation of scripts/load-env.mjs, NOT a
 * delegation to it. Playwright configs (and app-url-resolver.js) load this file
 * through require(), and Playwright resolves its config through a synchronous
 * pirates/babel CJS-transform require chain. Pulling the ESM load-env.mjs into
 * that chain — even via Node's synchronous `require(esm)` support — breaks it
 * with "ReferenceError: exports is not defined in ES module scope", because the
 * transform hook intercepts the nested require and mis-handles the ESM module.
 * Do not reintroduce a `require("./load-env.mjs")` here to "fix" duplication;
 * it silently reopens this exact regression under Playwright.
 *
 * Because this necessarily duplicates load-env.mjs's logic instead of calling
 * it, the two files WILL drift unless something catches it. That something is
 * scripts/__tests__/load-root-env-equivalence.test.mjs, which asserts both
 * loaders behave identically for the same inputs (secret present, secret
 * missing in CI, secret missing locally). Any change to the $secret: or
 * CI-strictness behavior in either file MUST be mirrored in the other and
 * MUST keep that test green — a change that requires touching one file but
 * not the other is very likely a bug in one of them, not a valid divergence.
 *
 * In particular, keep the CI-missing-secret behavior strict: a $secret:NAME
 * reference that resolves to nothing in CI must throw and name the variable,
 * not silently resolve to "". A previous version of this file diverged from
 * load-env.mjs exactly here (resolved to ""), which let a real bug — empty
 * SUPABASE_AUTH_EXTERNAL_* secrets — go unnoticed in CI for a long time.
 *
 * Usage (existing callers):
 *   const { loadRootEnv } = require('./load-root-env.cjs');
 *   loadRootEnv({ targetEnv: 'staging' });
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { existsSync, readFileSync } = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolve } = require("node:path");

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

// Reads and parses the .secrets file. Path is fully hardcoded — no external
// input flows into the file read.
function readSecretsFile() {
  const fullPath = resolve(rootDir, ".secrets");
  if (!existsSync(fullPath)) return {};
  return parseEnvContent(readFileSync(fullPath, "utf-8"));
}

const SECRET_RE = /(?<!\$)\$secret:([A-Z][A-Z0-9_]*)/g;

// Explicit opt-out for a $secret: reference that is allowed to resolve to an
// empty string in CI. Empty by design: every current $secret: reference is
// expected to have a real value (see .env.ci's Sentry comment — a value that
// is legitimately optional is left blank directly in the env file instead of
// using $secret:, e.g. NEXT_PUBLIC_SENTRY_DSN=). Add a name here only with a
// comment explaining why that specific secret may be empty in CI; do not use
// this to silence a missing-secret error you haven't investigated.
//
// Keep in sync with load-env.mjs's CI_OPTIONAL_SECRETS.
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

/**
 * Load .env.<targetEnv> into process.env, resolving $secret: references.
 *
 * @param {{ targetEnv?: string }} [opts]
 */
function loadRootEnv(opts) {
  const env = (opts && opts.targetEnv) || process.env.TARGET_ENV || "dev";
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
      // an env var whose name gives no hint that load-root-env is the
      // culprit).
      for (const [key, val] of Object.entries(vars)) {
        if (val.includes("$secret:")) {
          const match = val.match(/\$secret:([A-Z][A-Z0-9_]*)/);
          const name = match ? match[1] : undefined;
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
      if (!existsSync(resolve(rootDir, ".secrets"))) {
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
        "[load-root-env] WARNING: ENV_DEBUG=true is ignored in production. NEXT_PUBLIC_ENV_DEBUG will not be set.",
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

module.exports = { loadRootEnv };
