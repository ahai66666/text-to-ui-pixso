#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDomVisualIr, compileDomVisualIrPlan } from "./dom-visual-ir.mjs";
import { loadComponentMap, loadTokenResources, parseArgs, permanentAgentContract, readJson, writeJson } from "./pixso-native-scene-lib.mjs";
import { validateImportRun } from "./validate-pixso-import-run.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: compile-dom-visual-ir.mjs --run-manifest <json> --visual-manifest <json> --component-map <json> --ir-out <json> --plan-out <json> [--mapping-registry <mapping-registry.json> --mapping-profile <profile-id>] [--component-specs <json>] [--name <board-name>] [--target-page <page>] [--single-transaction] [--minimum-selector-coverage 0.95] [--minimum-visual-evidence-coverage 0.95]";
if (args.help || !args["run-manifest"] || !args["visual-manifest"] || !args["component-map"] || !args["ir-out"] || !args["plan-out"]) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

async function imageResource(node, manifestUrl) {
  const ref = `dom-image-${node.sourceIndex}`;
  const source = String(node.asset?.src ?? "");
  if (!source) throw new Error(`DOM image has no source: ${node.selector}`);
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
    if (!match) throw new Error(`Invalid data URL image: ${node.selector}`);
    const mimeType = match[1] || "image/png";
    const dataBase64 = source.includes(";base64,") ? match[2] : Buffer.from(decodeURIComponent(match[2])).toString("base64");
    return { ref, mimeType, dataBase64 };
  }
  const url = new URL(source, manifestUrl).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to fetch DOM image ${url}: HTTP ${response.status}`);
  return { ref, mimeType: response.headers.get("content-type")?.split(";", 1)[0] || "image/png", dataBase64: Buffer.from(await response.arrayBuffer()).toString("base64") };
}

const runManifestPath = path.resolve(args["run-manifest"]);
const visualManifestPath = path.resolve(args["visual-manifest"]);
const runManifest = readJson(runManifestPath);
const visualManifest = readJson(visualManifestPath);
const mappingOptions = {
  mappingRegistry: args["mapping-registry"] ? path.resolve(args["mapping-registry"]) : undefined,
  mappingProfile: args["mapping-profile"] || undefined,
};
const componentMap = loadComponentMap(path.resolve(args["component-map"]), mappingOptions);
const componentSpecs = readJson(path.resolve(args["component-specs"] ?? fileURLToPath(new URL("../assets/design-system/pixso-component-specs.json", import.meta.url))));
const tokens = loadTokenResources({ tokenDir: args["token-dir"] ? path.resolve(args["token-dir"]) : undefined, ...mappingOptions });
const ir = buildDomVisualIr(visualManifest, { tokens, componentMap, componentSpecs, pageName: args.name || null, targetPage: args["target-page"] || null });
const images = [];
for (const node of ir.nodes.filter((entry) => entry.kind === "image")) images.push(await imageResource(node, visualManifest.url));
const plan = compileDomVisualIrPlan(ir, { tokens, componentMap, images });
const singleTransaction = args["single-transaction"] === true || String(args["single-transaction"]).toLowerCase() === "true";
if (singleTransaction) {
  // Compatibility mode for a currently-open legacy plugin session. Keep the
  // normal resource/layout/icon/image operation order, but execute it in one
  // plugin transaction so the session does not need to rehydrate newly-created
  // nested nodes between modules. New sessions should use the modular plan.
  delete plan.modules;
  plan.execution.moduleExecution = "single-transaction-compatibility";
}
plan.page.htmlSourceFingerprint = runManifest.source?.htmlSourceFingerprint;
plan.page.visualSnapshot = {
  source: visualManifest.source,
  runId: runManifest.runId,
  htmlSourceFingerprint: runManifest.source?.htmlSourceFingerprint,
  stateId: visualManifest.stateId ?? runManifest.viewport?.stateId ?? "default-visible",
  viewport: {
    width: visualManifest.viewport?.width,
    height: visualManifest.viewport?.height,
    zoom: visualManifest.viewport?.zoom,
  },
};
plan.execution.importRun = {
  runId: runManifest.runId,
  manifestPath: runManifestPath,
  htmlSourceFingerprint: runManifest.source?.htmlSourceFingerprint,
  visualManifestPath,
  visualManifestSource: visualManifest.source,
  minimumSelectorCoverage: Number(args["minimum-selector-coverage"] ?? 0.95),
  minimumVisualEvidenceCoverage: Number(args["minimum-visual-evidence-coverage"] ?? 0.95),
  staleArtifactPolicy: "reject",
};
plan.execution.runId = runManifest.runId;
plan.execution.agentContract = permanentAgentContract(`${runManifest.runId}:${runManifest.source?.htmlSourceFingerprint ?? "html"}`);
plan.execution.rootNodeId = ir.nodes.find((node) => node.parentId === null)?.id ?? null;
plan.execution.rootName = ir.page.name;
plan.execution.visualReconciliation = {
  source: "browser-computed-visual-manifest",
  reconciledNodeCount: ir.nodes.length,
  semanticChildMatchCount: 0,
  warningCount: 0,
  staleSceneFallback: "forbidden",
};
const report = validateImportRun({ runManifest, visualManifest, operationPlan: plan });
if (!report.ok) throw new Error(`DOM Visual IR gate failed:\n${report.failures.join("\n")}`);
writeJson(path.resolve(args["ir-out"]), ir);
writeJson(path.resolve(args["plan-out"]), plan);
console.log(JSON.stringify({ ok: true, ir: path.resolve(args["ir-out"]), plan: path.resolve(args["plan-out"]), summary: plan.summary }, null, 2));
