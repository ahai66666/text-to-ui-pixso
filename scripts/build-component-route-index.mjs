#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponentRouteIndex, stableComponentIndex } from "./component-route-index.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(skillRoot, "references/index/generated/component-index.json");
const expected = stableComponentIndex(buildComponentRouteIndex(skillRoot));
const checkOnly = process.argv.includes("--check");

if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== expected) {
    console.error("Component route index is stale. Run pnpm components:index:build.");
    process.exitCode = 1;
  } else {
    console.log("Component route index current.");
  }
} else {
  fs.writeFileSync(outputPath, expected);
  console.log(`Built compact component route index: ${JSON.parse(expected).componentCount} contracts.`);
}
