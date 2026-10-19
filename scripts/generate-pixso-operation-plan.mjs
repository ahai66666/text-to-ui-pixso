#!/usr/bin/env node

import path from "node:path";
import { compileOperationPlan, loadComponentMap, loadTokenResources, parseArgs, permanentAgentContract, readJson, repoRelativePath, writeJson } from "./pixso-native-scene-lib.mjs";
import { reconcileOperationPlanWithVisualManifest } from "./pixso-visual-reconcile.mjs";
import { validateImportRun } from "./validate-pixso-import-run.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: generate-pixso-operation-plan.mjs --scene <pixso-scene.json> --component-map <pixso-native-component-map.json|mapping-registry.json> --out <pixso-operation-plan.json> [--mapping-registry <mapping-registry.json> --mapping-profile <profile-id>] [--token-dir <design-system>] [--run-manifest <json> --visual-manifest <json> --minimum-selector-coverage 0.8 --minimum-visual-evidence-coverage 0.95]";
if (args.help || !args.scene || !args["component-map"] || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}
const scene = readJson(args.scene);
if (scene.schemaVersion !== 1) throw new Error("Unsupported Pixso Scene schemaVersion");
const mappingOptions = {
  mappingRegistry: args["mapping-registry"] ? path.resolve(args["mapping-registry"]) : undefined,
  mappingProfile: args["mapping-profile"] || undefined,
};
const componentMap = loadComponentMap(args["component-map"], mappingOptions);
const tokens = loadTokenResources({ tokenDir: args["token-dir"] ? path.resolve(args["token-dir"]) : undefined, ...mappingOptions });
const plan = compileOperationPlan(scene, { tokens, componentMap });
if (args["run-manifest"] || args["visual-manifest"]) {
  if (!args["run-manifest"] || !args["visual-manifest"]) throw new Error("--run-manifest and --visual-manifest must be provided together");
  const runManifest = readJson(args["run-manifest"]);
  const visualManifest = readJson(args["visual-manifest"]);
  reconcileOperationPlanWithVisualManifest(plan, visualManifest, tokens);
  plan.execution.importRun = {
    runId: runManifest.runId,
    manifestPath: repoRelativePath(args["run-manifest"]),
    htmlSourceFingerprint: runManifest.source?.htmlSourceFingerprint,
    visualManifestPath: repoRelativePath(args["visual-manifest"]),
    visualManifestSource: visualManifest.source,
    minimumSelectorCoverage: Number(args["minimum-selector-coverage"] ?? 0.8),
    minimumVisualEvidenceCoverage: Number(args["minimum-visual-evidence-coverage"] ?? 0.95),
    staleArtifactPolicy: "reject"
  };
  plan.execution.agentContract = permanentAgentContract(`${runManifest.runId}:${runManifest.source?.htmlSourceFingerprint ?? "html"}`);
  const report = validateImportRun({ runManifest, visualManifest, operationPlan: plan });
  if (!report.ok) throw new Error(`Pixso import run gate failed:\n${report.failures.join("\n")}`);
}
writeJson(args.out, plan);
console.log(JSON.stringify({ ok: true, plan: path.resolve(args.out), ...plan.summary }, null, 2));
