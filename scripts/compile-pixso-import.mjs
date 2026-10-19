#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, readJson } from "./pixso-native-scene-lib.mjs";
import { validateImportRun } from "./validate-pixso-import-run.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: compile-pixso-import.mjs --run-manifest <json> --visual-manifest <json> --component-map <json> [--mapping-registry <mapping-registry.json> --mapping-profile <profile-id>] [--pipeline dom-visual-ir|legacy-semantic] [--name <board-name>] [--single-transaction] [legacy: --page-spec <json> --layout-contract <json> --page-data <json>]";
if (args.help || !args["run-manifest"] || !args["visual-manifest"] || !args["component-map"]) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const scripts = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.resolve(args["run-manifest"]);
const manifest = readJson(manifestPath);
const pipeline = String(args.pipeline || "dom-visual-ir");
if (!['dom-visual-ir', 'legacy-semantic'].includes(pipeline)) throw new Error("--pipeline must be dom-visual-ir or legacy-semantic");
if (pipeline === "legacy-semantic" && manifest.executionPolicy?.mode !== "diagnostic") {
  throw new Error("legacy-semantic is diagnostic-only; a normal import must compile the current browser manifest through dom-visual-ir");
}
if (pipeline === "legacy-semantic" && (!args["page-spec"] || !args["layout-contract"] || !args["page-data"])) throw new Error("legacy-semantic requires --page-spec, --layout-contract and --page-data");
const mappingArgs = [];
const mappingRegistry = args["mapping-registry"] || manifest.inputs?.mappingRegistry?.path;
const mappingProfile = args["mapping-profile"] || manifest.inputs?.mappingRegistry?.profile;
if (mappingRegistry) mappingArgs.push("--mapping-registry", path.resolve(mappingRegistry));
if (mappingProfile) mappingArgs.push("--mapping-profile", String(mappingProfile));
const sceneOut = path.resolve(manifest.artifacts?.scene ?? path.join(path.dirname(manifestPath), "pixso-scene.json"));
const planOut = path.resolve(manifest.artifacts?.operationPlan ?? path.join(path.dirname(manifestPath), "pixso-operation-plan.json"));
const irOut = path.resolve(manifest.artifacts?.domVisualIr ?? path.join(path.dirname(manifestPath), "dom-visual-ir.json"));
const visualManifestPath = path.resolve(args["visual-manifest"]);

function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...scriptArgs], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${script} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function update(status, detail, metrics = null) {
  const updateArgs = ["--manifest", manifestPath, "--stage", "compile", "--status", status];
  if (detail) updateArgs.push("--detail", detail);
  if (metrics) updateArgs.push("--metrics", JSON.stringify(metrics));
  return run("update-pixso-import-run.mjs", updateArgs);
}

const captureValidation = validateImportRun({ runManifest: manifest, visualManifest: readJson(visualManifestPath) });
if (!captureValidation.ok) {
  throw new Error(`compile requires a verified capture bundle: ${captureValidation.failures.join("; ")}`);
}
update("start", "compile Scene and Operation Plan from the verified current-run capture bundle only");
const compileStartedAt = Date.now();
try {
  if (pipeline === "dom-visual-ir") {
    const result = run("compile-dom-visual-ir.mjs", [
      "--run-manifest", manifestPath,
      "--visual-manifest", visualManifestPath,
      "--component-map", path.resolve(args["component-map"]),
      ...mappingArgs,
      "--ir-out", irOut,
      "--plan-out", planOut,
      "--minimum-selector-coverage", String(args["minimum-selector-coverage"] ?? 0.95),
      "--minimum-visual-evidence-coverage", String(args["minimum-visual-evidence-coverage"] ?? 0.95),
      ...(args.name ? ["--name", String(args.name)] : []),
      ...(args["target-page"] ? ["--target-page", String(args["target-page"])] : []),
      ...(args["single-transaction"] === true || String(args["single-transaction"]).toLowerCase() === "true" ? ["--single-transaction"] : []),
    ]);
    const operationPlan = readJson(planOut);
    const metrics = {
      actualWorkMs: Date.now() - compileStartedAt,
      operationCount: Number(operationPlan.summary?.operationCount ?? operationPlan.operations?.length ?? 0),
      domVisualNodeCount: Number(operationPlan.summary?.retainedNodeCount ?? 0),
      collapsedNodeCount: Number(operationPlan.summary?.collapsedNodeCount ?? 0),
      componentCandidateCount: Number(operationPlan.summary?.componentCandidateCount ?? 0),
      selectorCoverage: Number(operationPlan.summary?.selectorCoverage ?? 0),
      geometryCoverage: Number(operationPlan.summary?.geometryCoverage ?? 0),
    };
    update("passed", "DOM Visual IR compiled from current browser geometry; component mapping applied only after geometry lock", metrics);
    process.stdout.write(`${JSON.stringify({ ok: true, runId: manifest.runId, pipeline, ir: irOut, plan: planOut, metrics, compiler: result }, null, 2)}\n`);
    process.exit(0);
  }
  const sceneArgs = [
    "--page-spec", path.resolve(args["page-spec"]),
    "--layout-contract", path.resolve(args["layout-contract"]),
    "--page-data", path.resolve(args["page-data"]),
    "--component-map", path.resolve(args["component-map"]),
    ...mappingArgs,
    "--out", sceneOut
  ];
  if (args["html-root"]) sceneArgs.push("--html-root", path.resolve(args["html-root"]));
  const scene = run("generate-pixso-scene.mjs", sceneArgs);
  const plan = run("generate-pixso-operation-plan.mjs", [
    "--scene", sceneOut,
    "--component-map", path.resolve(args["component-map"]),
    ...mappingArgs,
    "--run-manifest", manifestPath,
    "--visual-manifest", path.resolve(args["visual-manifest"]),
    "--minimum-selector-coverage", String(args["minimum-selector-coverage"] ?? 0.8),
    "--minimum-visual-evidence-coverage", String(args["minimum-visual-evidence-coverage"] ?? 0.95),
    "--out", planOut
  ]);
  const operationPlan = readJson(planOut);
  const metrics = {
    actualWorkMs: Date.now() - compileStartedAt,
    operationCount: Array.isArray(operationPlan.operations) ? operationPlan.operations.length : Number(plan.operationCount ?? 0),
    moduleCount: Array.isArray(operationPlan.modules) ? operationPlan.modules.length : 0,
    sceneNodeCount: Number(operationPlan.summary?.nodeCount ?? scene.nodeCount ?? 0)
  };
  update("passed", "Scene, Operation Plan and current-run provenance validated", metrics);
  process.stdout.write(`${JSON.stringify({ ok: true, runId: manifest.runId, scene: sceneOut, plan: planOut, metrics }, null, 2)}\n`);
} catch (error) {
  try { update("failed", error.message); } catch (_) {}
  throw error;
}
