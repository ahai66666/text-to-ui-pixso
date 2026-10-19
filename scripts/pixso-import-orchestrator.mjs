#!/usr/bin/env node
import {verifyHandoff} from "./html-handoff.mjs";

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cancelActiveRun, describeActiveRun } from "./pixso-import-run-state.mjs";
import { parseArgs } from "./pixso-native-scene-lib.mjs";

const command = process.argv[2];
const forwarded = process.argv.slice(3);
const args = parseArgs(forwarded);
const scripts = path.dirname(fileURLToPath(import.meta.url));
// The managed Bridge is the single source of truth for publications.  Keep
// child-process publishing on the same durable state directory as the
// long-running Bridge process; otherwise a direct `publish` child can write a
// plan into the legacy port-suffixed directory while the plugin polls the
// managed directory and remains stuck at "waiting for a new plan".
const bridgeStateDirectory = path.resolve(
  process.env.TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR
    ?? path.join(scripts, "../.text-to-ui/pixso-bridge"),
);
const usage = `Usage:
  pixso-import-orchestrator.mjs status --runs-root <directory>
  pixso-import-orchestrator.mjs cancel --runs-root <directory> --reason <text>
  pixso-import-orchestrator.mjs start --html-root <directory> --url <rendered-url> [--allow-virtual-route] [--runs-root <directory>] [--mode normal|diagnostic]
  pixso-import-orchestrator.mjs capture --run-manifest <json> [--visual-manifest <json>] [--html-screenshot <png>]
  pixso-import-orchestrator.mjs compile <compile-pixso-import arguments>
  pixso-import-orchestrator.mjs preflight --run-manifest <json>
  pixso-import-orchestrator.mjs publish --run-manifest <json>
  pixso-import-orchestrator.mjs diff <compare-pixso-screenshots arguments>`;

function run(script, scriptArgs) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...scriptArgs], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

function runCapture(script, scriptArgs) {
  const env = script === "pixso-plugin-bridge.mjs"
    ? { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: bridgeStateDirectory }
    : process.env;
  return spawnSync(process.execPath, [path.join(scripts, script), ...scriptArgs], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function parseOutput(result, label) {
  if (result.status !== 0) throw new Error(`${label} failed:\n${result.stderr || result.stdout}`);
  return result.stdout?.trim() ? JSON.parse(result.stdout) : {};
}

function preflightFailureMetadata(result) {
  try {
    const report = result.stdout?.trim() ? JSON.parse(result.stdout) : null;
    const issue = report?.blockingIssues?.[0];
    return {
      classification: issue?.classification ?? "deterministic",
      blockingReason: issue?.classification ? `preflight-${issue.classification}` : "preflight-gate-failed",
      nextAction: report?.nextAction ?? "repair-blocking-input-and-start-new-run",
    };
  } catch (_) {
    return {
      classification: "deterministic",
      blockingReason: "preflight-gate-failed",
      nextAction: "repair-blocking-input-and-start-new-run",
    };
  }
}

if (!command || command === "--help" || command === "help") {
  console.log(usage);
  process.exit(command ? 0 : 2);
}
if (command === "status") {
  if (!args["runs-root"]) throw new Error("status requires --runs-root");
  const state = describeActiveRun(path.resolve(args["runs-root"]));
  console.log(JSON.stringify({
    ok: true,
    active: state.active,
    runId: state.runId,
    status: state.status,
    manifest: state.manifestPath,
    nextAction: state.active ? "resume-or-finish-current-run" : "start-new-run",
  }, null, 2));
  process.exit(0);
}
if (command === "cancel") {
  if (!args["runs-root"]) throw new Error("cancel requires --runs-root");
  console.log(JSON.stringify({ ok: true, ...cancelActiveRun({ runsRoot: path.resolve(args["runs-root"]), reason: args.reason || undefined }) }, null, 2));
  process.exit(0);
}
if (command === "start") {
  if(args["html-root"]){const projectRoot=path.resolve(args["html-root"]),file=args.handoff?path.resolve(args.handoff):path.join(projectRoot,"html-handoff.json");if(fs.existsSync(file))verifyHandoff({projectRoot,handoffPath:file});else if(args.handoff)throw new Error("Explicit handoff is missing");}

  // The import entry point owns service readiness. A user should only need to
  // open the Pixso plugin when its session is absent, not start local services.
  parseOutput(runCapture("start-text-to-ui-services.mjs", ["start"]), "managed services");
  run("create-pixso-import-run.mjs", forwarded);
}
if (command === "capture") {
  if (!args["run-manifest"]) throw new Error("capture requires --run-manifest");
  const manifestPath = path.resolve(args["run-manifest"]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const captureArguments = ["--run-manifest", manifestPath];
  if (args["visual-manifest"]) captureArguments.push("--visual-manifest", path.resolve(args["visual-manifest"]));
  if (args["html-screenshot"]) captureArguments.push("--html-screenshot", path.resolve(args["html-screenshot"]));
  parseOutput(runCapture("update-pixso-import-run.mjs", [
    "--manifest", manifestPath,
    "--stage", "capture",
    "--status", "start",
    "--executor", "browser",
    "--detail", "commit one calibrated browser capture bundle before compilation",
  ]), "capture-stage start");
  const committed = runCapture("pixso-capture-bundle.mjs", captureArguments);
  if (committed.status !== 0) {
    runCapture("update-pixso-import-run.mjs", [
      "--manifest", manifestPath,
      "--stage", "capture",
      "--status", "failed",
      "--classification", "capture-bundle",
      "--blocking-reason", "capture-bundle-invalid",
      "--next-action", "recapture-current-browser-state-and-start-new-run",
      "--executor", "browser",
      "--detail", String(committed.stderr || committed.stdout || "capture bundle validation failed").slice(0, 1000),
    ]);
    throw new Error(`capture bundle validation failed:\n${committed.stderr || committed.stdout}`);
  }
  const capture = parseOutput(committed, "capture bundle");
  const completed = parseOutput(runCapture("update-pixso-import-run.mjs", [
    "--manifest", manifestPath,
    "--stage", "capture",
    "--status", "passed",
    "--executor", "browser",
    "--detail", "one calibrated CSS viewport, visual manifest and exact-size PNG committed as an immutable capture bundle",
    "--metrics", JSON.stringify({ actualWorkMs: 0, screenshotWidth: capture.screenshot.width, screenshotHeight: capture.screenshot.height }),
  ]), "capture-stage pass");
  process.stdout.write(`${JSON.stringify({ ok: true, runId: manifest.runId, stage: "capture", capture, timing: completed.timing }, null, 2)}\n`);
  process.exit();
}
if (command === "compile") run("compile-pixso-import.mjs", forwarded);
function ensurePreflight(manifestPath, manifest, { force = false } = {}) {
  if (!force && manifest.timing?.stages?.preflight?.status === "passed") return null;
  const visualManifestPath = path.resolve(manifest.artifacts.visualManifest);
  const operationPlanPath = path.resolve(manifest.artifacts.operationPlan);
  parseOutput(runCapture("update-pixso-import-run.mjs", [
    "--manifest", manifestPath,
    "--stage", "preflight",
    "--status", "start",
    "--executor", "browser",
    "--detail", "validate current HTML resources, component contracts, visual manifest and capture bundle before Bridge publication",
  ]), "preflight-stage start");
  const preflight = runCapture("preflight-pixso-import.mjs", [
    "--run-manifest", manifestPath,
    "--visual-manifest", visualManifestPath,
    "--operation-plan", operationPlanPath,
  ]);
  if (preflight.status !== 0) {
    const detail = String(preflight.stderr || preflight.stdout || "preflight failed").slice(0, 4000);
    const failure = preflightFailureMetadata(preflight);
    runCapture("update-pixso-import-run.mjs", [
      "--manifest", manifestPath,
      "--stage", "preflight",
      "--status", "failed",
      "--classification", failure.classification,
      "--blocking-reason", failure.blockingReason,
      "--next-action", failure.nextAction,
      "--executor", "browser",
      "--detail", detail,
    ]);
    throw new Error(`preflight failed; no Bridge job was published:\n${detail}`);
  }
  const report = parseOutput(preflight, "preflight");
  const completed = parseOutput(runCapture("update-pixso-import-run.mjs", [
    "--manifest", manifestPath,
    "--stage", "preflight",
    "--status", "passed",
    "--executor", "browser",
    "--detail", report.metrics?.assetRepairCount || report.metrics?.componentRepairCount
      ? "structure import may continue; component and resource repair items were recorded for post-import repair"
      : "HTML resources, component contracts, visual manifest and capture bundle passed",
    "--metrics", JSON.stringify({
      actualWorkMs: report.metrics?.actualWorkMs ?? 0,
      assetRepairCount: report.metrics?.assetRepairCount ?? 0,
      assetRepairItems: report.assetRepairItems ?? [],
      componentRepairCount: report.metrics?.componentRepairCount ?? 0,
      componentRepairItems: report.componentRepairItems ?? [],
      blockingIssueCount: report.metrics?.blockingIssueCount ?? 0,
      preflightStatus: "passed",
    }),
  ]), "preflight-stage pass");
  return { report, completed };
}

if (command === "preflight") {
  if (!args["run-manifest"]) throw new Error("preflight requires --run-manifest");
  const manifestPath = path.resolve(args["run-manifest"]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const visualManifestPath = path.resolve(manifest.artifacts?.visualManifest ?? "");
  const operationPlanPath = path.resolve(manifest.artifacts?.operationPlan ?? "");
  if (!fs.existsSync(visualManifestPath) || !fs.existsSync(operationPlanPath)) throw new Error("preflight requires the current run's visual manifest and operation plan");
  const { report, completed } = ensurePreflight(manifestPath, manifest, { force: true });
  process.stdout.write(`${JSON.stringify({ ok: true, runId: manifest.runId, stage: "preflight", report, timing: completed.timing }, null, 2)}\n`);
  process.exit(0);
}
if (command === "publish") {
  if (!args["run-manifest"]) throw new Error("publish requires --run-manifest");
  const manifestPath = path.resolve(args["run-manifest"]);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const visualManifestPath = path.resolve(manifest.artifacts?.visualManifest ?? "");
  const operationPlanPath = path.resolve(manifest.artifacts?.operationPlan ?? "");
  if (!fs.existsSync(visualManifestPath) || !fs.existsSync(operationPlanPath)) throw new Error("publish requires the current run's visual manifest and operation plan");
  ensurePreflight(manifestPath, manifest);
  parseOutput(runCapture("validate-pixso-import-run.mjs", [
    "--run-manifest", manifestPath,
    "--visual-manifest", visualManifestPath,
    "--operation-plan", operationPlanPath,
  ]), "import validation");
  parseOutput(runCapture("update-pixso-import-run.mjs", [
    "--manifest", manifestPath,
    "--stage", "execute",
    "--status", "start",
    "--detail", "queue validated current-run operation plan for the Pixso Permanent Agent; connection recovery is bounded and separately timed",
  ]), "execution-stage start");
  const published = runCapture("pixso-plugin-bridge.mjs", ["publish", operationPlanPath]);
  if (published.status !== 0) {
    runCapture("update-pixso-import-run.mjs", [
      "--manifest", manifestPath,
      "--stage", "execute",
      "--status", "failed",
      "--detail", String(published.stderr || published.stdout || "plugin publication failed").slice(0, 1000),
    ]);
    throw new Error(`plugin publication failed:\n${published.stderr || published.stdout}`);
  }
  const publication = JSON.parse(published.stdout);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    runId: manifest.runId,
    stage: "publish",
    executor: "plugin",
    mcpFallbackAllowed: false,
    publication,
    nextAction: publication.queued ? publication.waitingAction : "plugin-imports-automatically",
    userMessage: publication.queued
      ? publication.waitingAction === "reload-latest-plugin"
        ? "当前 Pixso 插件版本或能力与计划不兼容；请在目标文件中加载新版 Text-to-UI 插件，连接后会自动执行。"
        : "请在目标 Pixso 文件中打开 Text-to-UI 插件；打开后会自动领取并执行当前导入，无需再次点击生成。"
      : "Pixso 插件已连接，导入将自动开始。",
  }, null, 2)}\n`);
  process.exit();
}
if (command === "diff") run("compare-pixso-screenshots.mjs", forwarded);
throw new Error(`Unknown orchestrator command: ${command}\n${usage}`);
