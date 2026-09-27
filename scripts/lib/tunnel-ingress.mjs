/**
 * Cloudflare tunnel ingress for one environment: the single hostname the
 * apps live on (routed to the container's HOST_PORT, which fronts every app
 * by path) plus the self-hosted Supabase services on the same zone.
 */

const SUPABASE_STUDIO_PORT_OFFSET = 2;
const MAILPIT_PORT_OFFSET = 3;

/**
 * The hostname the apps are served on, from `NEXT_PUBLIC_LANDING_URL`.
 *
 * @param {string} landingUrl
 * @returns {string}
 */
export function appHostFromLandingUrl(landingUrl) {
  return new URL(landingUrl).hostname;
}

/**
 * The two-label zone a hostname belongs to (`store.ffxivbe.org` → `ffxivbe.org`).
 *
 * @param {string} hostname
 * @returns {string}
 */
export function zoneOf(hostname) {
  return hostname.split(".").slice(-2).join(".");
}

/**
 * The `~/.cloudflared/<env>-config.yml` text.
 *
 * @param {{ tunnelId: string; credentialsFile: string; appHost: string; appPort: number; supabasePort: number }} input
 * @returns {string}
 */
export function buildIngressConfig({
  tunnelId,
  credentialsFile,
  appHost,
  appPort,
  supabasePort,
}) {
  const zone = zoneOf(appHost);
  return `tunnel: ${tunnelId}
credentials-file: ${credentialsFile}
protocol: http2

ingress:
  - hostname: ${appHost}
    service: http://127.0.0.1:${appPort}
  - hostname: supabase.${zone}
    service: http://127.0.0.1:${supabasePort}
  - hostname: supabase-studio.${zone}
    service: http://127.0.0.1:${supabasePort + SUPABASE_STUDIO_PORT_OFFSET}
  - hostname: mailpit.${zone}
    service: http://127.0.0.1:${supabasePort + MAILPIT_PORT_OFFSET}
  - service: http_status:404
`;
}
