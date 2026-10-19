#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(scripts, "pixso-unified-agent-plugin");
const syncSource = fs.readFileSync(
  path.join(scripts, "pixso-component-registry-sync-plugin/main.js"),
  "utf8",
);
const begin = "// BEGIN EMBEDDABLE_COMPONENT_SYNC_CORE";
const end = "// END EMBEDDABLE_COMPONENT_SYNC_CORE";
const beginIndex = syncSource.indexOf(begin);
const endIndex = syncSource.indexOf(end);
if (beginIndex < 0 || endIndex <= beginIndex) {
  throw new Error("Component sync plugin is missing embeddable core markers");
}
const componentSyncCore = [
  "const TextToUiComponentSync = (() => {",
  syncSource.slice(beginIndex + begin.length, endIndex).trim(),
  "return { readComponentFacts, repairSlots };",
  "})();",
].join("\n");

const runtime = fs.readFileSync(path.join(scripts, "pixso-native-execution-runtime.js"), "utf8").trim();
const template = fs.readFileSync(path.join(source, "main.template.js"), "utf8");
if (!template.includes("__TUI_PIXSO_RUNTIME__")) throw new Error("Unified plugin template is missing runtime marker");
if (!template.includes("__TUI_COMPONENT_SYNC_CORE__")) throw new Error("Unified plugin template is missing component sync marker");
const output = template
  .replace("__TUI_PIXSO_RUNTIME__", runtime)
  .replace("__TUI_COMPONENT_SYNC_CORE__", componentSyncCore);
fs.writeFileSync(path.join(source, "main.js"), output);

for (const [file, from] of [
  ["pixso-native-execution-runtime.js", path.join(scripts, "pixso-native-execution-runtime.js")],
  ["pixso-plugin-bridge.mjs", path.join(scripts, "pixso-plugin-bridge.mjs")],
  ["pixso-capture-bundle.mjs", path.join(scripts, "pixso-capture-bundle.mjs")],
  ["pixso-official-adapter.mjs", path.join(scripts, "pixso-official-adapter.mjs")],
  ["pixso-native-component-map.json", path.join(scripts, "../assets/design-system/pixso-native-component-map.json")],
  ["permanent-agent-capabilities.json", path.join(scripts, "../protocol/permanent-agent-capabilities.json")],
  ["compatibility-matrix.json", path.join(scripts, "../protocol/compatibility-matrix.json")],
]) {
  fs.copyFileSync(from, path.join(source, file));
}

console.log(JSON.stringify({
  ok: true,
  source,
  mainBytes: Buffer.byteLength(output),
  componentSyncCoreBytes: Buffer.byteLength(componentSyncCore),
}, null, 2));
