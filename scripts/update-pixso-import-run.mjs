#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson, writeJson } from "./pixso-native-scene-lib.mjs";
import { releaseActiveRunLock, TERMINAL_RUN_STATUSES } from "./pixso-import-run-state.mjs";
import { validateCaptureBundle } from "./pixso-capture-bundle.mjs";
import {
  IMPORT_LIFECYCLE_STATES,
  WAITING_FOR_PLUGIN_DEADLINE_MS,
  ensureRunControl,
  transitionRunLifecycle,
  lifecycleForRunStatus,
} from "./pixso-import-governance.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: update-pixso-import-run.mjs --manifest <run-manifest.json> --stage preflight|capture|compile|execute|readback|diff|cleanup|baseline(diagnostic only) --status start|passed|failed|attention [--executor plugin|mcp] [--detail <text>] [--classification <kind>] [--blocking-reason <reason>] [--next-action <action>] [--metrics <json>] [--baseline-node-id <id>] [--structured-node-id <id>]";
if (args.help || !args.manifest || !args.stage || !args.status) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const allowedStages = ["preflight", "capture", "baseline", "compile", "execute", "readback", "diff", "cleanup"];
const allowedStatuses = ["start", "passed", "failed", "attention"];
const stage = String(args.stage);
const status = String(args.status);
if (!allowedStages.includes(stage)) throw new Error(`Unknown import stage: ${stage}`);
if (!allowedStatuses.includes(status)) throw new Error(`Unknown import status: ${status}`);

const manifestPath = path.resolve(args.manifest);
if (!fs.existsSync(manifestPath)) throw new Error(`Run manifest not found: ${manifestPath}`);
const manifest = readJson(manifestPath);
if (manifest.kind !== "text-to-ui-pixso-import-run") throw new Error("Input is not a Text-to-UI Pixso import run manifest");

const now = new Date();
const mode = manifest.executionPolicy?.mode ?? "normal";
if (stage === "baseline" && mode !== "diagnostic") throw new Error("Baseline is disabled in normal mode; use the current browser screenshot or start a separate diagnostic run");
const timing = manifest.timing ?? { startedAt: null, wallStartedAt: manifest.createdAt ?? now.toISOString(), stages: {}, events: [] };
timing.stages = timing.stages ?? {};
timing.events = timing.events ?? [];
const current = timing.stages[stage] ?? { attempts: 0 };
const attemptLimit = Number(manifest.executionPolicy?.attemptLimits?.[stage] ?? (mode === "diagnostic" ? 3 : 1));
let metrics = null;
if (args.metrics) {
  try { metrics = JSON.parse(String(args.metrics)); }
  catch (_) { throw new Error("--metrics must be valid JSON"); }
  if (!metrics || Array.isArray(metrics) || typeof metrics !== "object") throw new Error("--metrics must be a JSON object");
}

if (status === "start") {
  if (current.status === "in_progress") throw new Error(`${stage} is already in progress`);
  if (current.status === "passed" && mode === "normal") throw new Error(`Normal import already passed ${stage}; repeated work requires a new run or diagnostic mode`);
  if (Number(current.attempts ?? 0) >= attemptLimit) throw new Error(`${stage} attempt limit reached (${attemptLimit})`);
  timing.stages[stage] = {
    ...current,
    status: "in_progress",
    attempts: Number(current.attempts ?? 0) + 1,
    startedAt: now.toISOString(),
    endedAt: null,
    elapsedMs: null,
    executor: args.executor ?? current.executor ?? null,
    detail: args.detail ?? null
  };
  if (!timing.startedAt) timing.startedAt = now.toISOString();
  manifest.status = "running";
  const lifecycleState = stage === "execute"
    ? IMPORT_LIFECYCLE_STATES.WAITING_FOR_PLUGIN
    : IMPORT_LIFECYCLE_STATES.PRECHECKING;
  transitionRunLifecycle(manifest, lifecycleState, {
    at: now.toISOString(),
    stage,
    status: "started",
    phase: stage,
    attempt: timing.stages[stage].attempts,
    lastHeartbeatAt: now.toISOString(),
    deadline: stage === "execute" ? new Date(now.getTime() + WAITING_FOR_PLUGIN_DEADLINE_MS).toISOString() : null,
    blockingReason: null,
    nextAction: stage === "execute" ? "wait-for-unified-plugin" : `run-${stage}`,
    detail: args.detail ?? null,
  });
} else {
  if (current.status !== "in_progress") throw new Error(`${stage} must be started before it can be marked ${status}`);
  if (stage === "capture" && status === "passed" && manifest.executionPolicy?.captureBundle === "required") {
    const capture = validateCaptureBundle({ runManifest: manifest });
    if (!capture.ok) throw new Error(`capture cannot pass: ${capture.failures.join("; ")}`);
  }
  const started = Date.parse(current.startedAt);
  const elapsedMs = Number.isFinite(started) ? Math.max(0, now.getTime() - started) : null;
  const budgetMs = Number(manifest.executionPolicy?.budgetsMs?.[stage] ?? 0) || null;
  const measuredWorkMs = Number(metrics?.actualWorkMs);
  const workElapsedMs = Number.isFinite(measuredWorkMs) && measuredWorkMs >= 0 ? measuredWorkMs : elapsedMs;
  timing.stages[stage] = {
    ...current,
    status,
    endedAt: now.toISOString(),
    elapsedMs,
    workElapsedMs,
    orchestrationElapsedMs: elapsedMs,
    budgetMs,
    withinBudget: budgetMs === null || workElapsedMs === null ? null : workElapsedMs <= budgetMs,
    detail: args.detail ?? current.detail ?? null,
    metrics: { ...(current.metrics ?? {}), ...(metrics ?? {}) }
  };
  if (status === "failed") manifest.status = "failed";
  if (status === "attention") manifest.status = "needs-attention";
}

if (args["baseline-node-id"]) manifest.pixsoArtifacts = { ...(manifest.pixsoArtifacts ?? {}), diagnosticVisualBaselineNodeId: String(args["baseline-node-id"]) };
if (args["structured-node-id"]) manifest.pixsoArtifacts = { ...(manifest.pixsoArtifacts ?? {}), structuredNodeId: String(args["structured-node-id"]) };
if (metrics) manifest.telemetry = { ...(manifest.telemetry ?? {}), ...metrics };

manifest.gates = manifest.gates ?? {};
if (stage === "capture" && status === "passed") {
  manifest.gates.freshSource = "passed";
  manifest.gates.visualManifest = "passed";
  if (manifest.executionPolicy?.captureBundle === "required") manifest.gates.captureBundle = "passed";
}
if (stage === "capture" && status === "failed") {
  manifest.gates.visualManifest = "failed";
  if (manifest.executionPolicy?.captureBundle === "required") manifest.gates.captureBundle = "failed";
}
if (stage === "compile" && status === "passed") manifest.gates.operationPlan = "passed";
if (stage === "compile" && status === "failed") manifest.gates.operationPlan = "failed";
if (stage === "readback" && status === "passed") manifest.gates.pluginReadback = "passed";
if (stage === "readback" && status === "failed") manifest.gates.pluginReadback = "failed";
if (stage === "diff" && status === "passed") manifest.gates.visualParity = "passed";
if (stage === "diff" && status === "failed") manifest.gates.visualParity = "failed";

const event = {
  at: now.toISOString(),
  stage,
  status,
  attempt: timing.stages[stage].attempts,
  elapsedMs: timing.stages[stage].elapsedMs ?? null,
  executor: timing.stages[stage].executor ?? null,
  detail: args.detail ?? null
};
timing.events.push(event);
const totalStart = Date.parse(timing.wallStartedAt ?? timing.startedAt);
timing.wallElapsedMs = Number.isFinite(totalStart) ? Math.max(0, now.getTime() - totalStart) : null;
timing.elapsedMs = Object.values(timing.stages).reduce((sum, entry) => sum + (Number(entry.workElapsedMs) || 0), 0);
timing.totalBudgetMs = Number(manifest.executionPolicy?.budgetsMs?.total ?? 0) || null;
timing.withinTotalBudget = timing.totalBudgetMs === null || timing.elapsedMs === null ? null : timing.elapsedMs <= timing.totalBudgetMs;
timing.breakdownMs = {
  preflight: Number(timing.stages.preflight?.workElapsedMs) || 0,
  capture: Number(timing.stages.capture?.workElapsedMs) || 0,
  compile: Number(timing.stages.compile?.workElapsedMs) || 0,
  executeWork: Number(timing.stages.execute?.workElapsedMs) || 0,
  executeOrchestration: Number(timing.stages.execute?.orchestrationElapsedMs) || 0,
  readback: Number(timing.stages.readback?.workElapsedMs) || 0,
  diff: Number(timing.stages.diff?.workElapsedMs) || 0,
  cleanup: Number(timing.stages.cleanup?.workElapsedMs) || 0,
};
manifest.timing = timing;

ensureRunControl(manifest);
if (status === "failed") {
  transitionRunLifecycle(manifest, lifecycleForRunStatus("failed"), {
    at: now.toISOString(),
    stage,
    status: "failed",
    phase: stage,
    blockingReason: args["blocking-reason"] ?? args.classification ?? `${stage}-failed`,
    retryClassification: args.classification ?? "deterministic",
    nextAction: args["next-action"] ?? "repair-input-and-start-new-run",
    deadline: null,
    lastHeartbeatAt: now.toISOString(),
    detail: args.detail ?? null,
  });
}
if (status === "attention") {
  transitionRunLifecycle(manifest, lifecycleForRunStatus("needs-attention"), {
    at: now.toISOString(),
    stage,
    status: "needs-attention",
    phase: stage,
    blockingReason: args["blocking-reason"] ?? args.classification ?? `${stage}-needs-attention`,
    retryClassification: args.classification ?? "manual-recovery",
    nextAction: args["next-action"] ?? "open-unified-plugin-and-start-new-run",
    deadline: null,
    lastHeartbeatAt: now.toISOString(),
    detail: args.detail ?? null,
  });
}
if (status === "passed") {
  const nextState = stage === "preflight"
    ? IMPORT_LIFECYCLE_STATES.READY
    : stage === "execute"
      ? IMPORT_LIFECYCLE_STATES.RUNNING
      : IMPORT_LIFECYCLE_STATES.PRECHECKING;
  transitionRunLifecycle(manifest, nextState, {
    at: now.toISOString(),
    stage,
    status: "passed",
    phase: stage,
    blockingReason: null,
    retryClassification: null,
    nextAction: stage === "preflight"
      ? "publish-to-unified-plugin"
      : `run-${stage === "capture" ? "compile" : stage === "compile" ? "preflight" : "next-stage"}`,
    deadline: null,
    lastHeartbeatAt: now.toISOString(),
    detail: args.detail ?? null,
  });
}
if (args.classification || args["blocking-reason"] || args["next-action"]) {
  manifest.telemetry = {
    ...(manifest.telemetry ?? {}),
    ...(args.classification ? { lastRetryClassification: String(args.classification) } : {}),
    ...(args["blocking-reason"] ? { blockingReason: String(args["blocking-reason"]) } : {}),
    ...(args["next-action"] ? { nextAction: String(args["next-action"]) } : {}),
  };
}

const required = ["preflight", "capture", "compile", "execute", "readback", "diff"];
const diagnosticBaselineUsed = mode === "diagnostic" && Boolean(timing.stages.baseline);
const diagnosticCleanupReady = !diagnosticBaselineUsed || timing.stages.cleanup?.status === "passed";
if (required.every((name) => timing.stages[name]?.status === "passed")) {
  manifest.status = diagnosticCleanupReady ? "completed" : "accepted-awaiting-cleanup";
  transitionRunLifecycle(manifest, IMPORT_LIFECYCLE_STATES.COMPLETED, {
    at: now.toISOString(),
    stage: "lifecycle",
    status: "completed",
    phase: "cleanup",
    blockingReason: null,
    nextAction: null,
    deadline: null,
    lastHeartbeatAt: now.toISOString(),
    detail: "all required import stages passed",
  });
}

writeJson(manifestPath, manifest);
if (TERMINAL_RUN_STATUSES.has(manifest.status)) {
  releaseActiveRunLock({ runsRoot: path.dirname(path.dirname(manifestPath)), runId: manifest.runId });
}
console.log(JSON.stringify({ ok: true, runId: manifest.runId, mode, stage, status, runStatus: manifest.status, timing: timing.stages[stage], totalWorkElapsedMs: timing.elapsedMs, wallElapsedMs: timing.wallElapsedMs, withinTotalBudget: timing.withinTotalBudget }, null, 2));
