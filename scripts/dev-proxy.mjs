#!/usr/bin/env node
/**
 * Dev proxy: serves every app from http://localhost:<HOST_PORT> by path prefix,
 * the way nginx does in the production container.
 *
 * Usage:
 *   node scripts/dev-proxy.mjs [--env <name>]
 *
 * `scripts/start.mjs` spawns this with the env already loaded; run standalone
 * it loads `.env.<name>` itself (default dev).
 */
import { loadAppRegistry } from "./lib/app-registry.mjs";
import { createDevProxyServer } from "./lib/dev-proxy-server.mjs";
import { loadEnv } from "./load-env.mjs";

if (!process.env.TARGET_ENV) {
  const envFlag = process.argv.indexOf("--env");
  loadEnv(envFlag !== -1 ? process.argv[envFlag + 1] : "dev");
}

const hostPort = Number.parseInt(process.env.HOST_PORT ?? "", 10);
if (!Number.isInteger(hostPort) || hostPort <= 0 || hostPort > 65_535) {
  console.error(
    "dev-proxy: HOST_PORT must be set to a valid port in the active env file",
  );
  process.exit(1);
}

const server = createDevProxyServer(loadAppRegistry());

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`dev-proxy: port ${hostPort} is already in use`);
    process.exit(1);
  }
  throw err;
});

server.listen(hostPort, () => {
  console.log(`dev-proxy: http://localhost:${hostPort} → apps by path prefix`);
});
