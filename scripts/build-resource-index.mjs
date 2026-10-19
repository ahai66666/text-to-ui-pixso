#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./navigation-index-lib.mjs";
import { sourceFile, indexFile, resourceSource, aggregateText, makeResourceIndex, json } from "./resource-index-lib.mjs";
const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args["skill-root"] || args.repo || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const source = resourceSource(root);
if (!args.check) {
  for (const doc of source.documents) fs.writeFileSync(path.join(root, doc.path), aggregateText(root, source, doc));
}
const index = makeResourceIndex(root, source);
const output = path.join(root, indexFile);
if (args.check) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== json(index)) throw new Error("Resource index drift: run resources:build");
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, json(index));
}
console.log(json({ ok: true, check: Boolean(args.check), documents: source.documents.length, resources: index.resources.length, digest: index.digest, source: sourceFile }));
