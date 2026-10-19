#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { parseArgs } from "./navigation-index-lib.mjs";
import { locateMonorepo } from "./navigation-index-lib.mjs";
import {
  materialSnapshot,
  readGeneratedRouteMaterialIndex,
  assertRouteMaterialSourceFresh,
  writeReadReceipt,
} from "./route-material-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const routeId = String(args.route ?? "").trim();
const skillRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const indexPath = path.join(skillRoot, "references/routes/index.json");
const generatedPath = path.join(skillRoot, "references/index/generated/workflow-route-index.json");
if (!fs.existsSync(generatedPath)) throw new Error("Workflow route directory has not been built. Run pnpm index:build.");
const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
const currentHash = crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex");
const expectedHash = generated.generatedFrom?.find((entry) => entry.path === "skill-support/references/routes/index.json")?.sha256;
if (currentHash !== expectedHash) throw new Error("Workflow route directory is stale. Run pnpm index:build before routing.");
const index = { routes: Object.fromEntries((generated.routes ?? []).map((route) => [route.id, route])) };
const materialIndex = assertRouteMaterialSourceFresh({
  repo: skillRoot,
  skillRoot,
  index: readGeneratedRouteMaterialIndex(skillRoot),
});

if (args.list) {
  process.stdout.write(`${JSON.stringify({ ok: true, routes: Object.entries(index.routes).map(([id, route]) => ({ id, description: route.description })) }, null, 2)}\n`);
  process.exit(0);
}
if (!routeId || !index.routes[routeId]) {
  const available = Object.keys(index.routes).join(", ");
  throw new Error(`Unknown or missing --route. Available routes: ${available}`);
}
const route = index.routes[routeId];
const references = route.exactReferencesToRead.map((relative) => {
  const absolute = path.join(skillRoot, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Route ${routeId} points to a missing reference: ${relative}`);
  return { relative, absolute };
});
const located = locateMonorepo({ start: args.start || process.cwd(), explicitRepo: args.repo });
const repo = located.root || skillRoot;
const materialRoute = materialIndex.routes?.[routeId];
if (!materialRoute) throw new Error(`Route material index is missing route '${routeId}'`);
const snapshot = materialSnapshot({
  repo,
  skillRoot,
  definitions: materialRoute.materials.map(({ path: materialPath, role, required }) => ({ path: materialPath, role, required })),
});
if (snapshot.digest !== materialRoute.materialsDigest) throw new Error(`Route '${routeId}' material snapshot is stale. Run pnpm index:build before routing.`);
const routeDigest = crypto.createHash("sha256").update(JSON.stringify({ id: routeId, description: route.description, exactReferencesToRead: route.exactReferencesToRead, materialsDigest: snapshot.digest })).digest("hex");
let receipt = null;
if (args["receipt-out"]) receipt = writeReadReceipt({ output: args["receipt-out"], routeId, routeDigest, snapshot });
process.stdout.write(`${JSON.stringify({
  ok: true,
  routeId,
  description: route.description,
  routeDigest,
  exactReferencesToRead: references,
  materialsDigest: snapshot.digest,
  materials: snapshot.materials.map(({ path: materialPath, role, required, sha256 }) => ({ path: materialPath, role, required, sha256 })),
  ...(receipt ? { readReceipt: { path: path.resolve(args["receipt-out"]), materialsDigest: receipt.materialsDigest } } : {})
}, null, 2)}\n`);
