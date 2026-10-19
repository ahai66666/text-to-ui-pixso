#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { servicePaths } from "./compact-paths.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const roots = servicePaths();
const repository = roots.repository;
const galleryRequested = process.argv.includes("--gallery");
const host = "127.0.0.1";
const hubPort = Number(process.env.TEXT_TO_UI_PREVIEW_PORT ?? 43173);
const galleryPort = Number(process.env.TEXT_TO_UI_GALLERY_PORT ?? 43175);
const bridgePort = Number(process.env.TEXT_TO_UI_PIXSO_BRIDGE_PORT ?? 43982);
const minimumBridgeVersion = 7;
const minimumBridgeProtocolVersion = 4;
const bridgeStateDirectory = roots.bridgeState;
const outputsRoot = path.resolve(process.env.TEXT_TO_UI_OUTPUTS_ROOT ?? path.join(repository, "outputs"));
const outputsPrefix = process.env.TEXT_TO_UI_OUTPUTS_PREFIX ?? "/outputs/";
const repositoryPrefix = process.env.TEXT_TO_UI_REPOSITORY_PREFIX ?? "/repo/";
const bridgeScript = path.join(scriptDirectory, "pixso-plugin-bridge.mjs");
const galleryRoot = roots.gallery;
const viteEntry = galleryRoot ? path.join(galleryRoot, "node_modules/vite/bin/vite.js") : null;
const allReady = status => status.hub && status.bridge && (!galleryRequested || status.gallery);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

async function portAvailable(port) {
  return await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

async function waitFor(url, service, attempts = 50, predicate = () => true) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await readJson(url);
    if (result?.service === service && predicate(result)) return result;
    await sleep(100);
  }
  throw new Error(`${service} did not become ready at ${url}`);
}

function bridgeReady(payload) {
  return payload?.service === "text-to-ui-pixso-bridge"
    && Number(payload.bridgeVersion ?? payload.version ?? 0) >= minimumBridgeVersion
    && Number(payload.protocolVersion ?? 0) >= minimumBridgeProtocolVersion;
}

function contentType(file) {
  const extension = path.extname(file).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2"
  })[extension] ?? "application/octet-stream";
}

function galleryUpstreamPath(requestUrl = "/") {
  return requestUrl.startsWith("/components/")
    ? `/gallery/${requestUrl.slice("/components/".length)}`
    : requestUrl;
}

function proxyToGallery(request, response) {
  const upstream = http.request({
    host,
    port: galleryPort,
    method: request.method,
    path: galleryUpstreamPath(request.url),
    headers: { ...request.headers, host: `${host}:${galleryPort}` }
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", (error) => {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: false, error: error.message }));
  });
  request.pipe(upstream);
}

function proxyGalleryUpgrade(request, socket, head) {
  const upstream = http.request({ host, port: galleryPort, method: request.method, path: galleryUpstreamPath(request.url), headers: request.headers });
  upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    const lines = [`HTTP/${upstreamResponse.httpVersion} ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}`];
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (Array.isArray(value)) for (const item of value) lines.push(`${name}: ${item}`);
      else if (value !== undefined) lines.push(`${name}: ${value}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
}

function isGalleryPath(pathname) {
  return pathname.startsWith("/components/") || pathname.startsWith("/gallery/");
}

function serveFileTree(response, pathname, prefix, root) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { decoded = pathname; }
  if (!decoded.startsWith(prefix)) return false;
  const relative = decoded.slice(prefix.length);
  let target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`) && target !== root) {
    response.writeHead(403);
    response.end("Forbidden");
    return true;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404);
    response.end("Not Found");
    return true;
  }
  response.writeHead(200, { "content-type": contentType(target), "cache-control": "no-store" });
  fs.createReadStream(target).pipe(response);
  return true;
}

const serveOutput = (_request, response, pathname) => serveFileTree(response, pathname, outputsPrefix, outputsRoot);
const serveRepository = (_request, response, pathname) => serveFileTree(response, pathname, repositoryPrefix, repository);

function createHub() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}:${hubPort}`);
    if (url.pathname === "/__text_to_ui_health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return response.end(JSON.stringify({ ok: true, service: "text-to-ui-preview-hub", galleryPort, bridgePort }));
    }
    if (url.pathname === "/components") {
      response.writeHead(302, { location: "/components/" });
      return response.end();
    }
    if (url.pathname === "/gallery") {
      response.writeHead(302, { location: "/gallery/" });
      return response.end();
    }
    if (isGalleryPath(url.pathname)) {
      if (!galleryRoot) { response.writeHead(503, {"content-type":"text/plain; charset=utf-8"}); return response.end("Gallery is optional. Configure TEXT_TO_UI_GALLERY_ROOT and start --gallery."); }
      return proxyToGallery(request, response);
    }
    if (serveOutput(request, response, url.pathname)) return;
    if (serveRepository(request, response, url.pathname)) return;
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return response.end(`<!doctype html><meta charset="utf-8"><title>Text-to-UI Preview Hub</title><style>body{font:16px system-ui;margin:40px;line-height:1.6}a{display:block}</style><h1>Text-to-UI Preview Hub</h1><a href="/gallery/">组件预览</a><p>页面产物路径：${outputsPrefix}&lt;artifact&gt;/</p><p>Pixso 自动桥接：${host}:${bridgePort}</p>`);
    }
    response.writeHead(404);
    response.end("Not Found");
  });
  server.on("upgrade", (request, socket, head) => {
    if (isGalleryPath(request.url ?? "")) proxyGalleryUpgrade(request, socket, head);
    else socket.destroy();
  });
  return server;
}

async function main() {
  const command = process.argv[2] ?? "start";
  const endpoints = {
    hub: `http://${host}:${hubPort}/__text_to_ui_health`,
    gallery: `http://${host}:${galleryPort}/__text_to_ui_gallery_health`,
    bridge: `http://${host}:${bridgePort}/health`
  };
  if (command === "status") {
    const bridgeHealth = await readJson(endpoints.bridge);
    const status = {
      hub: (await readJson(endpoints.hub))?.service === "text-to-ui-preview-hub",
      gallery: (await readJson(endpoints.gallery))?.service === "text-to-ui-component-gallery",
      bridge: bridgeReady(bridgeHealth),
    };
    process.stdout.write(`${JSON.stringify({ ok: allReady(status), status, bridgeVersion: bridgeHealth?.bridgeVersion ?? bridgeHealth?.version ?? null, protocolVersion: bridgeHealth?.protocolVersion ?? null, urls: { hub: `http://${host}:${hubPort}/`, gallery: `http://${host}:${hubPort}/components/` } }, null, 2)}\n`);
    return;
  }
  if (command === "start") {
    const bridgeHealth = await readJson(endpoints.bridge);
    const initialStatus = {
      hub: (await readJson(endpoints.hub))?.service === "text-to-ui-preview-hub",
      gallery: (await readJson(endpoints.gallery))?.service === "text-to-ui-component-gallery",
      bridge: bridgeReady(bridgeHealth),
    };
    if (allReady(initialStatus)) {
    process.stdout.write(`${JSON.stringify({ ok: true, reused: true, hub: `http://${host}:${hubPort}/`, gallery: `http://${host}:${hubPort}/gallery/`, bridge: `http://${host}:${bridgePort}` }, null, 2)}\n`);
      return;
    }
    if (galleryRequested && !initialStatus.gallery) {
      if (!(await portAvailable(galleryPort))) throw new Error(`Port ${galleryPort} is occupied by a service other than Text-to-UI Component Gallery`);
      if (!viteEntry || !fs.existsSync(viteEntry)) throw new Error(`Gallery is optional; configure TEXT_TO_UI_GALLERY_ROOT or TEXT_TO_UI_FULL_REPOSITORY before start --gallery. Missing: ${viteEntry}`);
      spawn(process.execPath, [viteEntry, "--host", host, "--port", String(galleryPort), "--strictPort"], {
        cwd: galleryRoot,
        env: { ...process.env, TEXT_TO_UI_GALLERY_BASE: "/gallery/" },
        detached: true,
        stdio: "ignore"
      }).unref();
      await waitFor(endpoints.gallery, "text-to-ui-component-gallery");
    }
    if (!initialStatus.bridge) {
      if (bridgeHealth?.service === "text-to-ui-pixso-bridge") {
        throw new Error(`Text-to-UI Pixso Bridge v${bridgeHealth.bridgeVersion ?? bridgeHealth.version ?? "unknown"} is already running; restart that managed service before starting v${minimumBridgeVersion}`);
      }
      if (!(await portAvailable(bridgePort))) throw new Error(`Port ${bridgePort} is occupied by a service other than Text-to-UI Pixso Bridge`);
      spawn(process.execPath, [bridgeScript, "serve"], {
        env: { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: bridgeStateDirectory },
        detached: true,
        stdio: "ignore"
      }).unref();
      await waitFor(endpoints.bridge, "text-to-ui-pixso-bridge", 50, bridgeReady);
    }
    if (!initialStatus.hub) {
      if (!(await portAvailable(hubPort))) throw new Error(`Port ${hubPort} is occupied by a service other than Text-to-UI Preview Hub`);
      spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], { detached: true, stdio: "ignore" }).unref();
      await waitFor(endpoints.hub, "text-to-ui-preview-hub");
    }
    process.stdout.write(`${JSON.stringify({ ok: true, hub: `http://${host}:${hubPort}/`, gallery: `http://${host}:${hubPort}/gallery/`, outputs: `http://${host}:${hubPort}${outputsPrefix}<artifact>/`, bridge: `http://${host}:${bridgePort}` }, null, 2)}\n`);
    return;
  }
  if (command !== "serve") throw new Error("Usage: start-text-to-ui-services.mjs [start|status] [--gallery]");

  const existingHub = await readJson(endpoints.hub);
  if (existingHub?.service === "text-to-ui-preview-hub") return;
  if (!(await portAvailable(hubPort))) throw new Error(`Port ${hubPort} is occupied by a service other than Text-to-UI Preview Hub`);

  const hub = createHub();
  await new Promise((resolve, reject) => {
    hub.once("error", reject);
    hub.listen(hubPort, host, resolve);
  });
  process.stdout.write(`${JSON.stringify({ ok: true, hub: `http://${host}:${hubPort}/`, gallery: `http://${host}:${hubPort}/gallery/`, outputs: `http://${host}:${hubPort}${outputsPrefix}<artifact>/`, bridge: `http://${host}:${bridgePort}` }, null, 2)}\n`);

  const shutdown = () => {
    hub.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

await main();
