#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function decodeSegments(pathname) {
  return pathname.split("/").filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch (_) { return segment; }
  });
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolvePixsoImportUrl({ htmlRoot, requestedUrl, allowVirtualRoute = false }) {
  const root = path.resolve(htmlRoot);
  const parsed = new URL(requestedUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`Rendered URL must use http or https: ${requestedUrl}`);

  const rootName = path.basename(root);
  const decodedSegments = decodeSegments(parsed.pathname);
  const rootIndex = decodedSegments.lastIndexOf(rootName);
  const suffix = rootIndex >= 0 ? decodedSegments.slice(rootIndex + 1) : [];
  if (allowVirtualRoute || rootIndex < 0 || suffix.length === 0) {
    return { url: parsed.href, requestedUrl: parsed.href, corrected: false, reason: null };
  }

  const localTarget = path.resolve(root, ...suffix);
  if (isInside(root, localTarget) && fs.existsSync(localTarget)) {
    return { url: parsed.href, requestedUrl: parsed.href, corrected: false, reason: null };
  }

  if (!fs.existsSync(path.join(root, "index.html"))) {
    throw new Error(`Cannot correct rendered URL because ${path.join(root, "index.html")} does not exist`);
  }

  const encodedRootSegments = parsed.pathname.split("/").filter(Boolean).slice(0, rootIndex + 1);
  parsed.pathname = `/${encodedRootSegments.join("/")}/`;
  return {
    url: parsed.href,
    requestedUrl: new URL(requestedUrl).href,
    corrected: true,
    reason: `removed-nonexistent-suffix:${suffix.join("/")}`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const values = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, input) => {
    if (!value.startsWith("--")) return pairs;
    pairs.push([value.slice(2), input[index + 1] && !input[index + 1].startsWith("--") ? input[index + 1] : true]);
    return pairs;
  }, []));
  if (!values["html-root"] || !values.url) {
    console.error("Usage: resolve-pixso-import-url.mjs --html-root <directory> --url <rendered-url> [--allow-virtual-route]");
    process.exit(2);
  }
  const result = resolvePixsoImportUrl({
    htmlRoot: values["html-root"],
    requestedUrl: values.url,
    allowVirtualRoute: values["allow-virtual-route"] === true || String(values["allow-virtual-route"]).toLowerCase() === "true",
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}
