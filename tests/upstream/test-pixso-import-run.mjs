#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateImportRun } from "../../scripts/validate-pixso-import-run.mjs";
import { reconcileOperationPlanWithVisualManifest } from "../../scripts/pixso-visual-reconcile.mjs";

const scripts = fileURLToPath(new URL("../../scripts/",import.meta.url));

const runManifest = { schemaVersion: 1, kind: "text-to-ui-pixso-import-run", runId: "run-1", source: { htmlSourceFingerprint: "html-1" }, viewport: { width: 1728, height: 1152 } };
const visualManifest = {
  schemaVersion: 3, kind: "text-to-ui-html-visual-manifest", source: "browser-computed-visual-manifest", runId: "run-1", htmlSourceFingerprint: "html-1",
  viewport: { width: 1728, height: 1152, zoom: 1 }, nodeCount: 2,
  nodes: [
    { selector: "#app", rect: { width: 1728, height: 1152 }, style: { display: "grid" } },
    { selector: "#app > main", rect: { width: 1000, height: 1000 }, style: { display: "flex" } }
  ]
};
const operationPlan = {
  kind: "pixso-operation-plan", page: { viewport: { width: 1728, height: 1152 }, htmlSourceFingerprint: "html-1", visualSnapshot: { source: "browser-computed-visual-manifest", htmlSourceFingerprint: "html-1" } },
  execution: { importRun: { runId: "run-1", htmlSourceFingerprint: "html-1", visualManifestSource: "browser-computed-visual-manifest", minimumSelectorCoverage: 1 } },
  operations: [
    { op: "create-frame", phase: "layout", nodeId: "root", layout: { direction: "VERTICAL", gap: 0 }, metadata: { htmlSelector: "#app", htmlRect: { width: 1728, height: 1152 }, visualEvidenceSource: "browser-computed-visual-manifest" } },
    { op: "create-frame", phase: "layout", nodeId: "main", parentId: "root", layout: { direction: "VERTICAL", gap: 0 }, metadata: { htmlSelector: "#app > main", htmlRect: { width: 1000, height: 1000 }, visualEvidenceSource: "browser-computed-visual-manifest" } }
  ]
};
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan }).ok, true);
assert.equal(validateImportRun({ runManifest, visualManifest: { ...visualManifest, runId: "old-run" }, operationPlan }).ok, false);
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan: { ...operationPlan, execution: {} } }).ok, false);
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan: { ...operationPlan, page: { ...operationPlan.page, htmlSourceFingerprint: null } } }).ok, false);
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan: { ...operationPlan, page: { ...operationPlan.page, visualSnapshot: {} } } }).ok, false);
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan: { ...operationPlan, operations: [{ ...operationPlan.operations[0], metadata: {} }] } }).ok, false);
assert.equal(validateImportRun({ runManifest, visualManifest, operationPlan: { ...operationPlan, operations: [{ ...operationPlan.operations[0], metadata: { ...operationPlan.operations[0].metadata, selectorOptional: true } }, operationPlan.operations[1]] } }).ok, false, "selectorOptional must not hide missing fidelity evidence");

const visualTokens = {
  values: new Map([
    ["space/4", { type: "number", value: 16 }],
    ["space/5", { type: "number", value: 20 }],
    ["radius/12", { type: "number", value: 12 }],
    ["neutral-light/100", { type: "color", value: "#FFFFFFFF" }],
    ["neutral-dark/10", { type: "color", value: "#00000019" }]
  ]),
  resolve(name) { return { name, ref: `$variable/${name}`, value: this.values.get(name)?.value }; }
};
const visualPlan = {
  operations: [
    { op: "create-page", phase: "resources" },
    { op: "create-frame", phase: "layout", nodeId: "root", parentId: null, layout: { direction: "VERTICAL", width: "fill", height: "fill" }, style: {}, metadata: { htmlSelector: "#app", surfaceOwner: true } },
    { op: "create-text", phase: "layout", nodeId: "label", parentId: "root", layout: { width: "fill", height: "hug" }, style: {}, metadata: { htmlSelector: ".label" } }
  ],
  execution: {}, summary: {}
};
const reconciled = reconcileOperationPlanWithVisualManifest(visualPlan, {
  nodes: [
    { index: 0, childIndex: 0, selector: "#app", selectorAliases: [], rect: { width: 320, height: 200 }, style: { display: "flex", flexDirection: "column", rowGap: "16px", paddingTop: "20px", paddingRight: "20px", paddingBottom: "20px", paddingLeft: "20px", alignItems: "center", justifyContent: "flex-start", backgroundColor: "rgb(255, 255, 255)", backgroundImage: "none", borderTopWidth: "0px", borderRightWidth: "1px", borderBottomWidth: "0px", borderLeftWidth: "0px", borderRightStyle: "solid", borderRightColor: "rgba(0, 0, 0, 0.1)", borderTopLeftRadius: "12px", borderTopRightRadius: "12px", borderBottomRightRadius: "12px", borderBottomLeftRadius: "12px" } },
    { index: 1, childIndex: 0, selector: ".label", selectorAliases: [], rect: { width: 100, height: 20 }, style: { display: "block", paddingTop: "0px", paddingRight: "0px", paddingBottom: "0px", paddingLeft: "0px", backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", borderTopWidth: "0px", borderRightWidth: "0px", borderBottomWidth: "0px", borderLeftWidth: "0px", textAlign: "center", borderTopLeftRadius: "0px", borderTopRightRadius: "0px", borderBottomRightRadius: "0px", borderBottomLeftRadius: "0px" } }
  ]
}, visualTokens);
const reconciledRoot = reconciled.operations.find((entry) => entry.nodeId === "root");
const reconciledLabel = reconciled.operations.find((entry) => entry.nodeId === "label");
assert.equal(reconciledRoot.layout.padding.left.name, "space/5");
assert.equal(reconciledRoot.layout.gap.name, "space/4");
assert.deepEqual(reconciledRoot.style.strokeEdges, ["right"]);
assert.equal(reconciledRoot.style.radius.name, "radius/12");
assert.equal(reconciledLabel.style.textAlignHorizontal, "CENTER");
assert.equal(reconciled.execution.visualReconciliation.staleSceneFallback, "forbidden");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "text-to-ui-import-input-"));
const runtime = path.join(temporary, "runtime.js");
fs.writeFileSync(runtime, "runtime-v1\n");
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(runtime)).digest("hex").slice(0, 24);
const immutableRun = { ...runManifest, inputs: { pluginRuntime: { path: runtime, sha256 } } };
assert.equal(validateImportRun({ runManifest: immutableRun, visualManifest, operationPlan }).ok, true);
fs.writeFileSync(runtime, "runtime-v2\n");
assert.equal(validateImportRun({ runManifest: immutableRun, visualManifest, operationPlan }).ok, false, "runtime mutation must invalidate the active run");

const runtimeSource = fs.readFileSync(path.join(scripts, "pixso-native-execution-runtime.js"), "utf8");
Function(runtimeSource)();
const runtimeGuard = globalThis.TextToUiPixsoRuntime.create({});
const legacyHtmlPlan = {
  kind: "pixso-operation-plan",
  page: { htmlSourceFingerprint: "old-html", visualSnapshot: { source: "html-live-computed-style", htmlSourceFingerprint: "old-html" } },
  execution: { sourcePolicy: "fresh-build-current-html-no-history" },
  operations: []
};
const guarded = await runtimeGuard.execute(legacyHtmlPlan);
assert.equal(guarded.ok, false);
assert.equal(guarded.phase, "stale-plan-guard");

const legacyPlanPath = path.join(temporary, "legacy-pixso-operation-plan.json");
fs.writeFileSync(legacyPlanPath, `${JSON.stringify(legacyHtmlPlan, null, 2)}\n`);
const bridgeGuard = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", legacyPlanPath], {
  env: { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_PORT: "45997" },
  encoding: "utf8"
});
assert.notEqual(bridgeGuard.status, 0);
assert.match(bridgeGuard.stderr, /legacy root plans are blocked/);
fs.rmSync(temporary, { recursive: true, force: true });
console.log("Pixso import run tests passed: stale sources, legacy root plans, missing provenance, and incomplete selector coverage are blocked.");
