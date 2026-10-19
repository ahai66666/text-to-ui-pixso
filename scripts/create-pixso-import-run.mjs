#!/usr/bin/env node
import {verifyHandoff} from "./html-handoff.mjs";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeHtmlSourceFingerprint } from "./html-visual-contract.mjs";
import { parseArgs, writeJson } from "./pixso-native-scene-lib.mjs";
import { acquireActiveRunLock, releaseActiveRunLock } from "./pixso-import-run-state.mjs";
import { resolvePixsoImportUrl } from "./resolve-pixso-import-url.mjs";
import {
  CLAIM_LEASE_MS,
  MODULE_HEARTBEAT_INTERVAL_MS,
  MODULE_HEARTBEAT_TIMEOUT_MS,
  RESULT_ACK_DEADLINE_MS,
  WAITING_FOR_PLUGIN_DEADLINE_MS,
  WAITING_FOR_PLUGIN_RETRY_AFTER_MS,
  MAX_CONNECTION_RECOVERY_ATTEMPTS,
  MAX_RESOURCE_RETRIES,
  IMPORT_LIFECYCLE_STATES,
} from "./pixso-import-governance.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: create-pixso-import-run.mjs --html-root <directory> --url <rendered-url> [--allow-virtual-route] [--runs-root <directory>] [--width 1728] [--height 1152] [--state default-visible] [--component-map <json|mapping-registry.json>] [--mapping-profile <profile-id>] [--mode normal|diagnostic]";
if (args.help || !args["html-root"] || !args.url) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const skillRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const htmlRoot = path.resolve(args["html-root"]);
const renderedUrl = resolvePixsoImportUrl({
  htmlRoot,
  requestedUrl: args.url,
  allowVirtualRoute: args["allow-virtual-route"] === true || String(args["allow-virtual-route"]).toLowerCase() === "true",
});
const handoffFile=args.handoff?path.resolve(args.handoff):path.join(htmlRoot,"html-handoff.json");
const handoff=fs.existsSync(handoffFile)?verifyHandoff({projectRoot:htmlRoot,handoffPath:handoffFile}):null;
if(args.handoff&&!handoff)throw new Error("Explicit handoff file is missing");
const runsRoot = path.resolve(args["runs-root"] || path.join(htmlRoot, ".text-to-ui", "pixso-runs"));
const width = Number(args.width || handoff?.viewport.width || 1728);
const height = Number(args.height || handoff?.viewport.height || 1152);
const mode = String(args.mode || "normal");
if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Viewport width and height must be positive numbers");
if (!["normal", "diagnostic"].includes(mode)) throw new Error("--mode must be normal or diagnostic");
if(handoff && Math.abs(handoff.viewport.zoom-1)>0.01)throw new Error("Current Pixso capture protocol requires zoom 1.0; revalidate at zoom 1.0");
const entry=handoff?.artifact.entry || args.entry || "index.html";
const observedLocalFiles=handoff?.dependencies.observedLocalFiles||[];
if(handoff && ((args.width && width!==handoff.viewport.width)||(args.height && height!==handoff.viewport.height)||(args.state && args.state!==handoff.viewport.stateId)))throw new Error("Requested viewport/state differs from accepted handoff; recapture and regenerate handoff");
const htmlSourceFingerprint = computeHtmlSourceFingerprint(htmlRoot,{entry,observedLocalFiles});
const componentMapPath = path.resolve(args["component-map"] || path.join(skillRoot, "assets/design-system/mapping-registry.json"));
const mappingRegistryPath = path.resolve(args["mapping-registry"] || path.join(skillRoot, "assets/design-system/mapping-registry.json"));
const mappingProfile = args["mapping-profile"] ? String(args["mapping-profile"]) : null;
const componentSpecsPath = path.join(skillRoot, "assets/design-system/pixso-component-specs.json");
const componentFactsPath = path.join(skillRoot, "assets/design-system/pixso-component-facts.json");
const tokenManifestPath = path.join(skillRoot, "assets/design-system/pixso-variables.json");
const runtimePath = path.join(skillRoot, "scripts/pixso-native-execution-runtime.js");
const visualCollectorPath = path.join(skillRoot, "scripts/browser-visual-manifest.js");
const visualReconcilerPath = path.join(skillRoot, "scripts/pixso-visual-reconcile.mjs");
const sceneCompilerPath = path.join(skillRoot, "scripts/pixso-native-scene-lib.mjs");
const digestFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 24);
const now = new Date();
const timestamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const entropy = crypto.randomBytes(3).toString("hex");
const runId = `${timestamp}-${htmlSourceFingerprint.slice(0, 8)}-${entropy}`;
const runDirectory = path.join(runsRoot, runId);
if (fs.existsSync(runDirectory)) throw new Error(`Import run already exists: ${runDirectory}`);
fs.mkdirSync(runsRoot, { recursive: true });
const manifestPath = path.join(runDirectory, "run-manifest.json");
acquireActiveRunLock({ runsRoot, runId, manifestPath });
try {
  fs.mkdirSync(runDirectory, { recursive: false });
} catch (error) {
  releaseActiveRunLock({ runsRoot, runId });
  throw error;
}

const artifacts = {
  visualManifest: path.join(runDirectory, "html-visual-manifest.json"),
  htmlScreenshot: path.join(runDirectory, "html-reference.png"),
  captureBundle: path.join(runDirectory, "capture-bundle.json"),
  preflightReport: path.join(runDirectory, "preflight-report.json"),
  resourceRepair: path.join(runDirectory, "resource-repair.json"),
  domVisualIr: path.join(runDirectory, "dom-visual-ir.json"),
  scene: path.join(runDirectory, "pixso-scene.json"),
  operationPlan: path.join(runDirectory, "pixso-operation-plan.json"),
  mcpCallPlan: path.join(runDirectory, "pixso-mcp-call-plan.json"),
  pluginResult: path.join(runDirectory, "pixso-plugin-result.json"),
  pixsoScreenshot: path.join(runDirectory, "pixso-structured.png"),
  visualDiff: path.join(runDirectory, "visual-diff.json"),
  acceptanceReport: path.join(runDirectory, "pixso-acceptance-report.json"),
  ...(mode === "diagnostic" ? {
    diagnosticVisualBaselinePackage: path.join(runDirectory, "diagnostic-html-baseline.zip")
  } : {})
};
const normalBudgetsMs = {
  total: 90000,
  preflight: 3000,
  capture: 8000,
  compile: 5000,
  execute: 45000,
  readback: 10000,
  diff: 5000,
  cleanup: 5000
};
const diagnosticBudgetsMs = {
  total: 900000,
  preflight: 30000,
  capture: 120000,
  baseline: 120000,
  compile: 180000,
  execute: 120000,
  readback: 120000,
  diff: 120000,
  cleanup: 60000
};
const normalAttemptLimits = Object.fromEntries(Object.keys(normalBudgetsMs).filter((key) => key !== "total").map((key) => [key, 1]));
const diagnosticAttemptLimits = Object.fromEntries(Object.keys(diagnosticBudgetsMs).filter((key) => key !== "total").map((key) => [key, 3]));
const manifest = {
  schemaVersion: 2,
  kind: "text-to-ui-pixso-import-run",
  runId,
  status: "initialized",
  createdAt: now.toISOString(),
  source: {
    htmlRoot,
    entry,
    observedLocalFiles,
    handoff: handoff ? {path:handoffFile,sha256:crypto.createHash("sha256").update(fs.readFileSync(handoffFile)).digest("hex")} : null,
    url: renderedUrl.url,
    requestedUrl: renderedUrl.requestedUrl,
    urlCorrected: renderedUrl.corrected,
    urlCorrectionReason: renderedUrl.reason,
    htmlSourceFingerprint,
    policy: "current-html-only-no-history"
  },
  viewport: { width, height, zoom: 1, stateId: args.state || handoff?.viewport.stateId || "default-visible", ...(handoff?{scroll:handoff.viewport.scroll}:{}) },
  inputs: {
    componentMap: { path: componentMapPath, sha256: digestFile(componentMapPath) },
    mappingRegistry: { path: mappingRegistryPath, sha256: digestFile(mappingRegistryPath), profile: mappingProfile },
    componentFacts: { path: componentFactsPath, sha256: digestFile(componentFactsPath) },
    componentSpecs: { path: componentSpecsPath, sha256: digestFile(componentSpecsPath) },
    tokenManifest: { path: tokenManifestPath, sha256: digestFile(tokenManifestPath) },
    pluginRuntime: { path: runtimePath, sha256: digestFile(runtimePath) },
    visualCollector: { path: visualCollectorPath, sha256: digestFile(visualCollectorPath) },
    visualReconciler: { path: visualReconcilerPath, sha256: digestFile(visualReconcilerPath) },
    sceneCompiler: { path: sceneCompilerPath, sha256: digestFile(sceneCompilerPath) }
  },
  executionPolicy: {
    mode,
    mappingProfile,
    sourceCapture: "single-current-browser-state",
    captureBundle: "required",
    captureCommit: "calibrated-css-viewport-and-png-dimensions",
    visualBaseline: mode === "normal" ? "disabled-use-current-browser-screenshot" : "optional-diagnostic-code-to-design-only",
    planCompilation: "single-current-run-only",
    pixsoWrite: "single-transaction",
    executorRouting: "plugin-required-mcp-explicit-only",
    outputPolicy: "single-managed-artboard",
    runtimeMutation: mode === "diagnostic" ? "allowed-with-new-run" : "forbidden-during-run",
    diagnosticEscalation: "stop-current-run-and-report",
    attemptLimits: mode === "diagnostic" ? diagnosticAttemptLimits : normalAttemptLimits,
    budgetsMs: mode === "diagnostic" ? diagnosticBudgetsMs : normalBudgetsMs,
    retryPolicy: {
      resourceTransient: { maxRetries: MAX_RESOURCE_RETRIES, action: "retain-measured-placeholder-and-repair" },
      pluginDisconnect: { maxRetries: MAX_CONNECTION_RECOVERY_ATTEMPTS, action: "reconnect-and-requeue-once" },
      deterministic: { maxRetries: 0, action: "fail-before-bridge-queue" },
      oldPlan: { maxRetries: 0, action: "start-new-run" },
    },
    bridgeTimeoutsMs: {
      claimLease: CLAIM_LEASE_MS,
      recoveryAfterNoClaim: WAITING_FOR_PLUGIN_RETRY_AFTER_MS,
      pluginStartDeadline: WAITING_FOR_PLUGIN_DEADLINE_MS,
      moduleHeartbeatInterval: MODULE_HEARTBEAT_INTERVAL_MS,
      moduleHeartbeatTimeout: MODULE_HEARTBEAT_TIMEOUT_MS,
      resultAckDeadline: RESULT_ACK_DEADLINE_MS,
    },
  },
  lifecycle: {
    state: IMPORT_LIFECYCLE_STATES.PRECHECKING,
    phase: "preflight",
    attempt: 0,
    lastHeartbeatAt: now.toISOString(),
    deadline: null,
    blockingReason: null,
    nextAction: "capture-current-browser-state",
    recoveryAttempt: 0,
    retryClassification: null,
  },
  timing: {
    startedAt: null,
    wallStartedAt: now.toISOString(),
    stages: {},
    events: []
  },
  pixsoArtifacts: {
    diagnosticVisualBaselineNodeId: null,
    structuredNodeId: null,
    temporaryBaselineCleanup: mode === "diagnostic" ? "after-diagnosis-by-captured-node-id" : "not-applicable"
  },
  telemetry: {
    codeToDesignCalls: 0,
    pixsoCallCount: 0,
    retryCount: 0,
    operationCount: 0,
    visualNodeCount: 0,
    preflightMs: 0,
    queueWaitMs: 0,
    claimMs: 0,
    startConfirmationMs: 0,
    resultConfirmationMs: 0,
    moduleTimings: [],
    retryReasons: [],
    resourceRepairItems: [],
  },
  artifacts,
  gates: {
    freshSource: "pending",
    visualManifest: "pending",
    captureBundle: "pending",
    operationPlan: "pending",
    pluginReadback: "pending",
    visualParity: "pending",
    componentAndVariableParity: "pending",
    noTemporaryBaseline: mode === "normal" ? "required" : "not-applicable"
  }
};
try {
  writeJson(manifestPath, manifest);
  writeJson(path.join(runsRoot, "current-run.json"), { schemaVersion: 1, runId, manifest: manifestPath });
} catch (error) {
  releaseActiveRunLock({ runsRoot, runId });
  throw error;
}
console.log(JSON.stringify({ ok: true, runId, runDirectory, manifest: manifestPath, sourceUrl: renderedUrl, artifacts }, null, 2));
