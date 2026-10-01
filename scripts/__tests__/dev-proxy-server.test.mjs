/**
 * Integration tests for scripts/lib/dev-proxy-server.mjs: real sockets, fake
 * upstreams on ephemeral ports.
 */
import http from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertPortFree,
  createDevProxyServer,
} from "../lib/dev-proxy-server.mjs";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** An upstream that echoes the path and headers it saw. */
function makeUpstream(name) {
  return http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name,
        url: req.url,
        forwardedHost: req.headers["x-forwarded-host"],
      }),
    );
  });
}

describe("assertPortFree", () => {
  it("resolves when nothing listens on the port", async () => {
    const probe = http.createServer();
    const freePort = await listen(probe);
    await close(probe);
    await expect(assertPortFree(freePort)).resolves.toBeUndefined();
  });

  it("rejects naming the port when it is taken", async () => {
    const holder = http.createServer();
    const takenPort = await listen(holder);
    await expect(assertPortFree(takenPort)).rejects.toThrow(
      `port ${takenPort} is already in use`,
    );
    await close(holder);
  });
});

describe("createDevProxyServer", () => {
  const landing = makeUpstream("landing");
  const store = makeUpstream("store");
  let proxy;
  let proxyPort;
  let storePort;

  beforeAll(async () => {
    const landingPort = await listen(landing);
    storePort = await listen(store);
    proxy = createDevProxyServer({
      landing: {
        envKey: "NEXT_PUBLIC_LANDING_URL",
        path: "/",
        port: landingPort,
      },
      store: {
        envKey: "NEXT_PUBLIC_STORE_URL",
        path: "/store",
        port: storePort,
      },
    });
    proxyPort = await listen(proxy);
  });

  afterAll(async () => {
    await close(proxy);
    await close(landing);
    if (store.listening) await close(store);
  });

  it("forwards a prefixed path to the owning app, path intact", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store/en?x=1`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "store",
      url: "/store/en?x=1",
    });
  });

  it("forwards everything else to landing", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/en/legal`);
    expect(await res.json()).toMatchObject({
      name: "landing",
      url: "/en/legal",
    });
  });

  it("sets X-Forwarded-Host to the host the browser used", async () => {
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store`);
    expect((await res.json()).forwardedHost).toBe(`127.0.0.1:${proxyPort}`);
  });

  it("proxies a WebSocket upgrade under an app prefix to that app", async () => {
    // Upstream that speaks just enough of the upgrade handshake to echo bytes.
    const wsUpstream = http.createServer();
    wsUpstream.on("upgrade", (req, socket) => {
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `X-Upstream-Path: ${req.url}\r\n\r\n`,
      );
      socket.on("data", (chunk) => socket.write(chunk));
      // A real WebSocket server closes when its peer does; without this the
      // fake would hold a half-open socket and server.close() would never return.
      socket.on("end", () => socket.destroy());
    });
    const wsPort = await listen(wsUpstream);
    const wsProxy = createDevProxyServer({
      landing: { envKey: "NEXT_PUBLIC_LANDING_URL", path: "/", port: 1 },
      store: { envKey: "NEXT_PUBLIC_STORE_URL", path: "/store", port: wsPort },
    });
    const wsProxyPort = await listen(wsProxy);

    const echoed = await new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1",
        port: wsProxyPort,
        path: "/store/_next/webpack-hmr",
        headers: { Connection: "Upgrade", Upgrade: "websocket" },
      });
      req.on("upgrade", (res, socket) => {
        socket.once("data", (chunk) => {
          socket.destroy();
          resolve({
            path: res.headers["x-upstream-path"],
            data: String(chunk),
          });
        });
        socket.write("ping");
      });
      req.on("response", (res) => {
        reject(new Error(`expected an upgrade, got HTTP ${res.statusCode}`));
      });
      req.on("error", reject);
      req.end();
    });

    expect(echoed).toEqual({ path: "/store/_next/webpack-hmr", data: "ping" });
    await close(wsProxy);
    await close(wsUpstream);
  });

  it("answers 502 naming the app and port when the upstream is down", async () => {
    await close(store);
    const res = await fetch(`http://127.0.0.1:${proxyPort}/store/en`);
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain("store");
    expect(body).toContain(String(storePort));
  });
});
