import path from "path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin(
  "./src/shared/infrastructure/i18n/request.ts",
);
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseSocketOrigin = (() => {
  if (!supabaseOrigin) return "";
  const parsed = new URL(supabaseOrigin);
  const socketProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${socketProtocol}//${parsed.host}`;
})();
const clerkOrigin = (() => {
  const domain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
  if (!domain) return "";
  try {
    return new URL(`https://${domain}`).origin;
  } catch {
    return "";
  }
})();
const cspConnectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  supabaseOrigin,
  supabaseSocketOrigin,
  clerkOrigin,
]
  .filter(Boolean)
  .join(" ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  // https://challenges.cloudflare.com is Clerk's Turnstile bot-protection
  // challenge origin (distinct from clerkOrigin, Clerk's own frontend API) —
  // required in script-src and frame-src whenever Clerk's bot protection is on.
  {
    key: "Content-Security-Policy",
    value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://tally.so ${clerkOrigin} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src ${cspConnectSrc} https://cloudflareinsights.com https://*.tally.so; worker-src blob:; frame-src https://tally.so ${clerkOrigin} https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none';`,
  },
];

const nextConfig: NextConfig = {
  // Landing is the one app at the root — no basePath, in any environment.
  // lucide-react v1.x ESM dist uses .ts imports — Turbopack needs explicit extensions
  turbopack: {
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  ...(process.env.STANDALONE === "true" && {
    output: "standalone" as const,
    outputFileTracingRoot: path.join(__dirname, "../.."),
  }),
  transpilePackages: ["api", "ui", "shared", "@monorepo/app-components"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true, // uploads full client bundle for accurate stack traces in Sentry
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
