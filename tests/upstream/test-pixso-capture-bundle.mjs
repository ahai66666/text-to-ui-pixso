#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "../../scripts/pixso-native-scene-lib.mjs";
import { validateCaptureBundle } from "../../scripts/pixso-capture-bundle.mjs";
import { validateImportRun } from "../../scripts/validate-pixso-import-run.mjs";

const scripts = fileURLToPath(new URL("../../scripts/",import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "text-to-ui-capture-bundle-"));
const htmlRoot = path.join(temporary, "html");
const runsRoot = path.join(temporary, "runs");
fs.mkdirSync(htmlRoot, { recursive: true });
fs.writeFileSync(path.join(htmlRoot, "index.html"), "<!doctype html><main>Capture bundle fixture</main>\n");

function writePngHeader(file, width, height) {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  fs.writeFileSync(file, png);
}

function createRun(root = runsRoot) {
  const created = spawnSync(process.execPath, [
    path.join(scripts, "create-pixso-import-run.mjs"),
    "--html-root", htmlRoot,
    "--url", "http://127.0.0.1:43173/fixture/",
    "--runs-root", root,
  ], { encoding: "utf8" });
  assert.equal(created.status, 0, created.stderr);
  return JSON.parse(created.stdout);
}

function writeVisualManifest(manifest) {
  const visual = {
    schemaVersion: 4,
    kind: "text-to-ui-html-visual-manifest",
    source: "browser-computed-visual-manifest",
    runId: manifest.runId,
    htmlSourceFingerprint: manifest.source.htmlSourceFingerprint,
    stateId: manifest.viewport.stateId,
    viewport: { width: manifest.viewport.width, height: manifest.viewport.height, devicePixelRatio: 1.25, zoom: 1 },
    nodeCount: 1,
    nodes: [{ selector: "#app", rect: { width: manifest.viewport.width, height: manifest.viewport.height }, style: { display: "grid" } }],
  };
  fs.writeFileSync(manifest.artifacts.visualManifest, `${JSON.stringify(visual, null, 2)}\n`);
}

const first = createRun();
const firstManifest = readJson(first.manifest);
writeVisualManifest(firstManifest);
writePngHeader(firstManifest.artifacts.htmlScreenshot, 1728, 1152);
const committed = spawnSync(process.execPath, [
  path.join(scripts, "pixso-capture-bundle.mjs"),
  "--run-manifest", first.manifest,
], { encoding: "utf8" });
assert.equal(committed.status, 0, committed.stderr);
const bundle = readJson(firstManifest.artifacts.captureBundle);
assert.equal(bundle.kind, "text-to-ui-pixso-capture-bundle");
assert.equal(bundle.artifacts.screenshot.width, 1728);
assert.equal(bundle.artifacts.screenshot.height, 1152);
assert.equal(validateCaptureBundle({ runManifest: firstManifest }).ok, true);
assert.equal(validateImportRun({ runManifest: firstManifest, visualManifest: readJson(firstManifest.artifacts.visualManifest) }).ok, true, "a committed calibrated capture must pass import validation");

writePngHeader(firstManifest.artifacts.htmlScreenshot, 973, 1152);
const mutated = validateCaptureBundle({ runManifest: firstManifest });
assert.equal(mutated.ok, false);
assert.match(mutated.failures.join("\n"), /dimensions|changed/);
assert.equal(validateImportRun({ runManifest: firstManifest, visualManifest: readJson(firstManifest.artifacts.visualManifest) }).ok, false, "a mutated or cropped screenshot must block before compilation");
const blockedCompile = spawnSync(process.execPath, [
  path.join(scripts, "compile-pixso-import.mjs"),
  "--run-manifest", first.manifest,
  "--visual-manifest", firstManifest.artifacts.visualManifest,
  "--component-map", path.join(temporary, "unused-component-map.json"),
], { encoding: "utf8" });
assert.notEqual(blockedCompile.status, 0, "a bad capture must block the compiler before Pixso work can be planned");
assert.match(blockedCompile.stderr, /verified capture bundle/);

const second = createRun(path.join(temporary, "second-runs"));
const secondManifest = readJson(second.manifest);
writeVisualManifest(secondManifest);
writePngHeader(secondManifest.artifacts.htmlScreenshot, 973, 1152);
const rejected = spawnSync(process.execPath, [
  path.join(scripts, "pixso-capture-bundle.mjs"),
  "--run-manifest", second.manifest,
], { encoding: "utf8" });
assert.notEqual(rejected.status, 0, "a cropped screenshot must not create a capture bundle");
assert.match(rejected.stderr, /dimensions/);

const third = createRun(path.join(temporary, "third-runs"));
const thirdManifest = readJson(third.manifest);
writeVisualManifest(thirdManifest);
writePngHeader(thirdManifest.artifacts.htmlScreenshot, 1728, 1152);
const publicCapture = spawnSync(process.execPath, [
  path.join(scripts, "pixso-import-orchestrator.mjs"),
  "capture",
  "--run-manifest", third.manifest,
], { encoding: "utf8" });
assert.equal(publicCapture.status, 0, publicCapture.stderr);
const publicManifest = readJson(third.manifest);
assert.equal(publicManifest.timing.stages.capture.status, "passed");
assert.equal(publicManifest.gates.captureBundle, "passed");
const terminalPlan = {
  kind: "pixso-operation-plan",
  page: {
    htmlSourceFingerprint: publicManifest.source.htmlSourceFingerprint,
    visualSnapshot: { source: "browser-computed-visual-manifest", htmlSourceFingerprint: publicManifest.source.htmlSourceFingerprint },
  },
  execution: {
    sourcePolicy: "fresh-build-current-html-no-history",
    importRun: {
      runId: publicManifest.runId,
      manifestPath: third.manifest,
      visualManifestPath: publicManifest.artifacts.visualManifest,
      htmlSourceFingerprint: publicManifest.source.htmlSourceFingerprint,
    },
  },
  operations: [],
};
fs.writeFileSync(publicManifest.artifacts.operationPlan, `${JSON.stringify(terminalPlan, null, 2)}\n`);
publicManifest.status = "failed";
fs.writeFileSync(third.manifest, `${JSON.stringify(publicManifest, null, 2)}\n`);
const terminalReplay = spawnSync(process.execPath, [
  path.join(scripts, "pixso-plugin-bridge.mjs"),
  "publish", publicManifest.artifacts.operationPlan,
], { env: { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_PORT: String(47000 + Math.floor(Math.random() * 1000)) }, encoding: "utf8" });
assert.notEqual(terminalReplay.status, 0, "a failed run must never be replayed by the Bridge");
assert.match(terminalReplay.stderr, /terminal/);

fs.rmSync(temporary, { recursive: true, force: true });
console.log("Pixso capture bundle tests passed: calibrated captures commit atomically, while cropped or mutated screenshots block before Pixso.");
