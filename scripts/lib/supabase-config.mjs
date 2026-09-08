/**
 * Generates supabase/config.toml from config.toml.template.
 *
 * Extracted so that every entry point which shells out to the Supabase CLI
 * generates it. `supabase:start` previously did not: with no config.toml the
 * CLI falls back to its own defaults (base port 54321), which is a different
 * instance from the one this project is configured for and collides with any
 * other Supabase running on the machine.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..", "..");

const templatePath = resolve(rootDir, "supabase/config.toml.template");
export const configPath = resolve(rootDir, "supabase/config.toml");

/**
 * Derive all Supabase service ports from a single base port.
 * Convention matches Supabase CLI defaults (base = API port):
 *   base+0 → API
 *   base+1 → DB
 *   base-1 → shadow DB
 *   base+8 → pooler
 *   base+2 → Studio
 *   base+3 → Inbucket
 *   base+6 → Analytics
 *   inspector → base + 10000 - 21 (keeps the 8083/18083 pattern)
 */
export function derivePorts(base) {
  return {
    SUPABASE_API_PORT: String(base),
    SUPABASE_DB_PORT: String(base + 1),
    SUPABASE_SHADOW_PORT: String(base - 1),
    SUPABASE_POOLER_PORT: String(base + 8),
    SUPABASE_STUDIO_PORT: String(base + 2),
    SUPABASE_INBUCKET_PORT: String(base + 3),
    SUPABASE_ANALYTICS_PORT: String(base + 6),
    SUPABASE_INSPECTOR_PORT: String(base + 10000 - 21), // 54321→8300, 64321→18300
  };
}

export function generateConfig(targetEnv) {
  if (!existsSync(templatePath)) {
    console.error(`ERROR: Template file not found: ${templatePath}`);
    process.exit(1);
  }

  const basePort = Number.parseInt(process.env.SUPABASE_PORT ?? "54321", 10);
  if (Number.isNaN(basePort)) {
    console.error(
      `ERROR: SUPABASE_PORT is not a valid number: ${process.env.SUPABASE_PORT}`,
    );
    process.exit(1);
  }

  const ports = derivePorts(basePort);

  // Expose derived ports back onto process.env so downstream code can read them
  for (const [key, value] of Object.entries(ports)) {
    process.env[key] = value;
  }

  // Derive redirect URLs from the app origin vars already in process.env
  const redirectUrls = {
    SUPABASE_AUTH_REDIRECT_URL_AUTH: `${process.env.NEXT_PUBLIC_AUTH_URL ?? ""}/auth/callback`,
    SUPABASE_AUTH_REDIRECT_URL_STORE: `${process.env.NEXT_PUBLIC_STORE_URL ?? ""}/auth/callback`,
    SUPABASE_AUTH_REDIRECT_URL_ADMIN: `${process.env.NEXT_PUBLIC_ADMIN_URL ?? ""}/auth/callback`,
    SUPABASE_AUTH_REDIRECT_URL_PAYMENTS: `${process.env.NEXT_PUBLIC_PAYMENTS_URL ?? ""}/auth/callback`,
    SUPABASE_AUTH_REDIRECT_URL_LANDING: `${process.env.NEXT_PUBLIC_LANDING_URL ?? ""}/auth/callback`,
    SUPABASE_AUTH_REDIRECT_URL_STUDIO: `${process.env.NEXT_PUBLIC_STUDIO_URL ?? ""}/auth/callback`,
  };
  for (const [key, value] of Object.entries(redirectUrls)) {
    process.env[key] = value;
  }

  let template = readFileSync(templatePath, "utf-8");

  const projectId = `libra-${targetEnv}`;
  template = template.replace("{{PROJECT_ID}}", projectId);

  for (const [key, value] of Object.entries(ports)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }

  // Disable the edge runtime in CI — no edge functions exist in this project,
  // and the container's health check reliably times out due to ECR rate limiting.
  const edgeRuntimeEnabled =
    process.env.SUPABASE_EDGE_RUNTIME_ENABLED ??
    (process.env.CI ? "false" : "true");
  template = template.replaceAll(
    "{{SUPABASE_EDGE_RUNTIME_ENABLED}}",
    edgeRuntimeEnabled,
  );

  template = template.replace(
    "{{SUPABASE_CLERK_ENABLED}}",
    process.env.SUPABASE_CLERK_ENABLED ?? "false",
  );
  template = template.replace(
    "{{SUPABASE_CLERK_DOMAIN}}",
    process.env.SUPABASE_CLERK_DOMAIN ?? "",
  );

  writeFileSync(configPath, template, "utf-8");
  console.log(
    `✓ Generated config.toml (Project: ${projectId}, API: ${ports.SUPABASE_API_PORT}, Studio: ${ports.SUPABASE_STUDIO_PORT})`,
  );
  return { projectId, ports };
}

export function cleanupConfig() {
  if (existsSync(configPath)) {
    unlinkSync(configPath);
    console.log(`✓ Cleaned up temporary config.toml`);
  }
}
