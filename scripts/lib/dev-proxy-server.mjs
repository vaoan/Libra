/**
 * One origin for every app in dev. Routes by longest path prefix to the
 * `next dev` servers, forwards WebSocket upgrades so HMR works, preserves the
 * browser's Host header and sets the same X-Forwarded-* headers the
 * production nginx sets, so server-action origin checks behave identically.
 */
import http from "node:http";
import net from "node:net";

import httpProxy from "http-proxy";

import { buildRoutes, matchRoute } from "./dev-proxy-router.mjs";

const UPSTREAM_HOST = "127.0.0.1";

/**
 * Rejects when something already listens on `port`, so `start.mjs` can fail
 * before it spawns six dev servers that would then be orphaned.
 *
 * @param {number} port
 * @returns {Promise<void>}
 */
export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    // Connect rather than bind: on Windows a wildcard bind can succeed while a
    // loopback-only listener (or a Docker port mapping) already answers there.
    const probe = net.connect({ port, host: UPSTREAM_HOST });
    probe.once("connect", () => {
      probe.destroy();
      reject(new Error(`port ${port} is already in use`));
    });
    probe.once("error", (err) => {
      if (err.code === "ECONNREFUSED") resolve();
      else reject(err);
    });
  });
}

/**
 * Builds the proxy server. The caller decides where it listens.
 *
 * @param {Record<string, { path: string; port: number }>} registry
 * @returns {http.Server}
 */
export function createDevProxyServer(registry) {
  const routes = buildRoutes(registry);
  const proxy = httpProxy.createProxyServer({
    changeOrigin: false,
    xfwd: true,
  });

  const forwardHost = (proxyReq, req) => {
    proxyReq.setHeader("X-Forwarded-Host", req.headers.host ?? "");
  };
  proxy.on("proxyReq", forwardHost);
  proxy.on("proxyReqWs", (proxyReq, req, socket) => {
    forwardHost(proxyReq, req);
    // Upgraded sockets allow half-close, and http-proxy only tears a pair
    // down on error, so a browser that drops its HMR socket would leave both
    // halves open forever. WebSockets have no half-close: when either side
    // goes away, drop the other.
    socket.on("end", () => socket.destroy());
    proxyReq.on("upgrade", (_res, proxySocket) => {
      proxySocket.on("end", () => proxySocket.destroy());
      socket.on("close", () => proxySocket.destroy());
      proxySocket.on("close", () => socket.destroy());
    });
  });

  proxy.on("error", (err, req, resOrSocket) => {
    const route = matchRoute(routes, req.url ?? "/");
    const body = `dev-proxy: ${route.app} is not listening on :${route.port} (${err.code ?? err.message})\n`;
    if (typeof resOrSocket.writeHead === "function") {
      if (!resOrSocket.headersSent) {
        resOrSocket.writeHead(502, { "Content-Type": "text/plain" });
      }
      resOrSocket.end(body);
    } else {
      resOrSocket.destroy();
    }
  });

  const targetFor = (req) =>
    `http://${UPSTREAM_HOST}:${matchRoute(routes, req.url ?? "/").port}`;

  const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: targetFor(req) });
  });
  server.on("upgrade", (req, socket, head) => {
    proxy.ws(req, socket, head, { target: targetFor(req) });
  });
  server.on("close", () => proxy.close());

  return server;
}
