#!/usr/bin/env node
/**
 * Pre-cutover check: every restored profile must be reachable by the email
 * Clerk will present, or that person signs in and is provisioned as a new
 * user holding none of their orders.
 *
 * Reads emails from user_profiles (the restored source of truth) and reports
 * which ones have no matching Clerk user. A non-empty report is not
 * necessarily a failure — most users simply have not signed in yet — but it
 * is the list to watch after cutover.
 *
 * Usage:
 *   node scripts/clerk-email-parity.mjs [--env prod]
 */
import { loadEnv } from "./load-env.mjs";

const envFlag = process.argv.indexOf("--env");
loadEnv(envFlag !== -1 ? process.argv[envFlag + 1] : "prod");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clerkKey = process.env.CLERK_SECRET_KEY;
for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: srk,
  CLERK_SECRET_KEY: clerkKey,
})) {
  if (!value) {
    console.error(`${name} is not set in the loaded env`);
    process.exit(1);
  }
}

const CLERK_PAGE = 100;

async function supabase(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: srk, Authorization: `Bearer ${srk}` },
  });
  if (!res.ok) throw new Error(`supabase ${path} -> ${res.status}`);
  return res.json();
}

async function clerkUsers() {
  const out = [];
  for (let offset = 0; ; offset += CLERK_PAGE) {
    const res = await fetch(
      `https://api.clerk.com/v1/users?limit=${CLERK_PAGE}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${clerkKey}`,
          "User-Agent": "libra-parity",
        },
      },
    );
    if (!res.ok) throw new Error(`clerk -> ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < CLERK_PAGE) break;
  }
  return out;
}

const profiles = await supabase("user_profiles?select=id,email");
const clerk = await clerkUsers();
const clerkEmails = new Set(
  clerk.flatMap((u) =>
    (u.email_addresses ?? []).map((a) => a.email_address.toLowerCase()),
  ),
);
const unmatched = profiles.filter(
  (p) => p.email && !clerkEmails.has(p.email.toLowerCase()),
);

console.log(
  `clerk instance:   ${clerkKey.startsWith("sk_live_") ? "production" : "development"}`,
);
console.log(`profiles:         ${profiles.length}`);
console.log(`clerk users:      ${clerk.length}`);
console.log(`without a match:  ${unmatched.length}`);
for (const p of unmatched) console.log(`  ${p.email}`);
