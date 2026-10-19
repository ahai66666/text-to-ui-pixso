#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createPixsoOfficialAdapterPlan, pixsoOfficialAdapterVersion } from "./pixso-official-adapter.mjs";
import { validateCaptureBundle } from "./pixso-capture-bundle.mjs";
import { syncPixsoComponentFacts } from "./pixso-component-facts-sync.mjs";
import { releaseActiveRunLock } from "./pixso-import-run-state.mjs";
import {
  CLAIM_LEASE_MS,
  IMPORT_LIFECYCLE_STATES,
  MAX_CONNECTION_RECOVERY_ATTEMPTS,
  MODULE_HEARTBEAT_TIMEOUT_MS,
  MODULE_NO_PROGRESS_TIMEOUT_MS,
  RESULT_ACK_DEADLINE_MS,
  WAITING_FOR_PLUGIN_DEADLINE_MS,
  WAITING_FOR_PLUGIN_CONNECTION_DEADLINE_MS,
  WAITING_FOR_PLUGIN_RETRY_AFTER_MS,
  appendLifecycleEvent,
  elapsedMs,
  isoAfter,
  isoNow,
  transitionRunLifecycle,
  TERMINAL_JOB_STATUSES as GOVERNED_TERMINAL_JOB_STATUSES,
} from "./pixso-import-governance.mjs";

const host = "127.0.0.1";
const port = Number(process.env.TEXT_TO_UI_PIXSO_BRIDGE_PORT ?? 43982);
const stateDirectory = process.env.TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR
  ? path.resolve(process.env.TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR)
  // The managed service and one-off CLI commands must always see the same
  // durable queue. A port-suffixed default created a shadow queue: publish
  // could succeed while the running bridge (using pixso-bridge/) never saw it.
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.text-to-ui/pixso-bridge");
const stateFile = path.join(stateDirectory, "current-plan.json");
const resultFile = path.join(stateDirectory, "latest-result.json");
const pluginSessionFile = path.join(stateDirectory, "plugin-session.json");
const jobFile = path.join(stateDirectory, "current-job.json");
const pluginSessionTtlMs = 15000;
const legacyPluginSessionTtlMs = 30000;
const claimLeaseTtlMs = CLAIM_LEASE_MS;
const bridgeVersion = 7;
const protocolVersion = 4;
const supportedProtocolVersions = [3, 4];
const preferredKernelVersion = "5.0.0";
const permanentExecutorProtocol = 1;
const permanentExecutorCapabilities = new Set([
  "executor.data-plan.v1",
  "executor.transaction.v1",
  "executor.assets.deferred.v1",
  "executor.readback.v1",
]);
const permanentExecutorOperations = new Set([
  "ensure-font", "ensure-variable", "ensure-style", "ensure-icon", "ensure-image",
  "create-page", "create-frame", "create-component", "create-text", "create-icon",
  "create-icon-slot", "create-instance", "create-image", "create-rectangle",
  "create-ellipse", "create-line", "hydrate-icon",
]);
const scriptPath = fileURLToPath(import.meta.url);
const configuredPluginDeliveryPath = process.env.TEXT_TO_UI_UNIFIED_PLUGIN_DELIVERY_ROOT
  ?? process.env.TEXT_TO_UI_PLUGIN_DELIVERY_ROOT
  ?? null;
const scriptDirectory = path.dirname(scriptPath);
const pluginDeliveryPath = configuredPluginDeliveryPath
  ? path.resolve(configuredPluginDeliveryPath)
  : path.basename(scriptDirectory) === "scripts"
    ? path.join(scriptDirectory, "pixso-unified-agent-plugin")
    : scriptDirectory;
const componentSyncRoot = process.env.TEXT_TO_UI_COMPONENT_SYNC_ROOT
  ? path.resolve(process.env.TEXT_TO_UI_COMPONENT_SYNC_ROOT)
  : path.resolve(path.dirname(scriptPath), "..");
// Keep this in sync with TextToUiPixsoRuntime.version. A plan that does not
// declare a minimum is treated as requiring the current renderer, so an old
// installed plugin cannot silently replay an old interpretation of the plan.
const minimumPluginRuntimeVersion = "4.16";
const terminalJobStatuses = new Set(GOVERNED_TERMINAL_JOB_STATUSES);

function parseCapabilities(value) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch (_) {
    return undefined;
  }
}

function headers(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-private-network": "true",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    ...extra
  };
}

function versionTuple(value) {
  const match = String(value ?? "").match(/\d+(?:\.\d+){0,3}/);
  return match ? match[0].split(".").map((part) => Number(part)) : null;
}

function versionAtLeast(actual, required) {
  const left = versionTuple(actual);
  const right = versionTuple(required);
  if (!left || !right) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

function requiredRuntimeVersionFor(plan) {
  if (!plan) return preferredKernelVersion;
  const contract = plan?.execution?.agentContract;
  // A Permanent Executor plan is data-only. Its compiler may evolve, but it
  // must retain the installed executor's stable operation vocabulary instead
  // of forcing every recipient to match a service-side runtime version.
  if (Number(contract?.executorProtocol) === permanentExecutorProtocol) return minimumPluginRuntimeVersion;
  if (contract?.minimumKernelVersion) return String(contract.minimumKernelVersion);
  const declared = String(plan?.execution?.minimumRuntimeVersion ?? minimumPluginRuntimeVersion);
  return versionAtLeast(declared, minimumPluginRuntimeVersion) ? declared : minimumPluginRuntimeVersion;
}

function planProtocolVersion(plan) {
  return Number(plan?.execution?.agentContract?.protocolVersion ?? 3);
}

function planSchemaVersion(plan) {
  return Number(plan?.execution?.agentContract?.planSchemaVersion ?? 1);
}

function planCapabilities(plan) {
  const contract = plan?.execution?.agentContract;
  const requested = [...new Set((contract?.requiredCapabilities ?? []).map(String))];
  if (Number(contract?.executorProtocol) !== permanentExecutorProtocol) return requested;
  const unsupported = requested.filter((capability) => !permanentExecutorCapabilities.has(capability));
  if (unsupported.length) throw new Error(`Permanent Executor plan requests non-stable capabilities: ${unsupported.join(", ")}`);
  return requested.length ? requested : [...permanentExecutorCapabilities];
}

function validatePermanentExecutorPlan(plan) {
  const contract = plan?.execution?.agentContract;
  if (Number(contract?.executorProtocol) !== permanentExecutorProtocol) return;
  planCapabilities(plan);
  const unsupported = (plan.operations ?? [])
    .map((operation) => String(operation?.op ?? ""))
    .filter((operation) => operation && !permanentExecutorOperations.has(operation));
  if (unsupported.length) throw new Error(`Permanent Executor v1 does not support operation(s): ${[...new Set(unsupported)].join(", ")}`);
}

function planIdempotencyKey(plan, absolutePath = "") {
  return String(plan?.execution?.agentContract?.idempotencyKey
    ?? plan?.execution?.importRun?.runId
    ?? plan?.execution?.runId
    ?? crypto.createHash("sha256").update(`${absolutePath}\n${JSON.stringify(plan)}`).digest("hex"));
}

function readJob() {
  if (!fs.existsSync(jobFile)) return null;
  try { return JSON.parse(fs.readFileSync(jobFile, "utf8")); } catch (_) { return null; }
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return null; }
}

function writeJob(job) {
  fs.mkdirSync(stateDirectory, { recursive: true });
  fs.writeFileSync(jobFile, `${JSON.stringify(job, null, 2)}\n`);
}

function importRunManifestPath(state) {
  const declared = state?.plan?.execution?.importRun?.manifestPath;
  return declared ? path.resolve(declared) : null;
}

function updateImportRunLifecycle(state, lifecycleState, details = {}) {
  const manifestPath = importRunManifestPath(state);
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (_) { return null; }
  if (["completed", "failed", "cancelled"].includes(manifest.status) && lifecycleState !== IMPORT_LIFECYCLE_STATES.COMPLETED) return manifest;
  transitionRunLifecycle(manifest, lifecycleState, details);
  if (details.telemetry && typeof details.telemetry === "object") {
    manifest.telemetry = { ...(manifest.telemetry ?? {}), ...details.telemetry };
  }
  if (details.runStatus) manifest.status = details.runStatus;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function appendImportRunTelemetry(state, telemetry, detail = null) {
  const manifestPath = importRunManifestPath(state);
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (_) { return null; }
  manifest.telemetry = { ...(manifest.telemetry ?? {}), ...(telemetry ?? {}) };
  if (detail) appendLifecycleEvent(manifest, { stage: "execute", status: "telemetry", detail, ...telemetry });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function importRunSummary(state) {
  const manifestPath = importRunManifestPath(state);
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return {
      runId: manifest.runId ?? null,
      status: manifest.status ?? null,
      lifecycle: manifest.lifecycle ?? null,
      timing: {
        wallElapsedMs: Number.isFinite(Number(manifest.timing?.wallElapsedMs)) ? Number(manifest.timing.wallElapsedMs) : null,
        workElapsedMs: Number.isFinite(Number(manifest.timing?.elapsedMs)) ? Number(manifest.timing.elapsedMs) : null,
        breakdownMs: manifest.timing?.breakdownMs ?? {},
      },
      telemetry: {
        queueWaitMs: Number(manifest.telemetry?.queueWaitMs) || 0,
        claimMs: Number(manifest.telemetry?.claimMs) || 0,
        startConfirmationMs: Number(manifest.telemetry?.startConfirmationMs) || 0,
        resultConfirmationMs: Number(manifest.telemetry?.resultConfirmationMs) || 0,
        pluginWorkMs: Number(manifest.telemetry?.pluginWorkMs) || 0,
        retryCount: Number(manifest.telemetry?.retryCount) || 0,
        retryReasons: manifest.telemetry?.retryReasons ?? [],
      },
    };
  } catch (_) {
    return null;
  }
}

function markRunNeedsAttention(state, reason, nextAction, detail, metrics = {}) {
  const manifestPath = importRunManifestPath(state);
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (_) { return null; }
  const at = isoNow();
  const executeStage = manifest.timing?.stages?.execute;
  if (executeStage?.status === "in_progress") {
    const started = Date.parse(executeStage.startedAt ?? at);
    const orchestrationElapsedMs = Number.isFinite(started) ? Math.max(0, Date.parse(at) - started) : null;
    manifest.timing.stages.execute = {
      ...executeStage,
      status: "attention",
      endedAt: at,
      elapsedMs: orchestrationElapsedMs,
      orchestrationElapsedMs,
      workElapsedMs: Number(metrics.workElapsedMs) || 0,
      withinBudget: false,
      detail,
    };
  }
  manifest.status = "needs-attention";
  manifest.telemetry = {
    ...(manifest.telemetry ?? {}),
    ...(metrics ?? {}),
    blockingReason: reason,
    nextAction,
  };
  transitionRunLifecycle(manifest, IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION, {
    at,
    stage: "execute",
    status: "needs-attention",
    phase: "execute",
    blockingReason: reason,
    retryClassification: ["module-heartbeat-timeout", "module-no-progress-timeout"].includes(reason) ? reason : "plugin-disconnect",
    nextAction,
    deadline: null,
    lastHeartbeatAt: metrics.lastHeartbeatAt ?? manifest.lifecycle?.lastHeartbeatAt ?? at,
    moduleId: metrics.moduleId,
    moduleLabel: metrics.moduleLabel,
    detail,
    metrics,
  });
  refreshRunTiming(manifest, at);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  releaseActiveRunLock({ runsRoot: path.dirname(path.dirname(manifestPath)), runId: manifest.runId });
  return manifest;
}

function markRunCancelled(state, reason = "user-cancelled") {
  const manifestPath = importRunManifestPath(state);
  if (!manifestPath || !fs.existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")); }
  catch (_) { return null; }
  if (!["completed", "failed", "cancelled"].includes(manifest.status)) {
    manifest.status = "cancelled";
    manifest.cancelledAt = isoNow();
    manifest.cancellationReason = reason;
    transitionRunLifecycle(manifest, IMPORT_LIFECYCLE_STATES.FAILED, {
      at: manifest.cancelledAt,
      stage: "execute",
      status: "cancelled",
      phase: "execute",
      blockingReason: reason,
      retryClassification: "cancelled",
      nextAction: "start-new-run",
      deadline: null,
      lastHeartbeatAt: manifest.lifecycle?.lastHeartbeatAt ?? manifest.cancelledAt,
      detail: reason,
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  releaseActiveRunLock({ runsRoot: path.dirname(path.dirname(manifestPath)), runId: manifest.runId });
  return manifest;
}

function finishRunStage(manifest, stage, status, at, detail, workElapsedMs = null) {
  manifest.timing = manifest.timing ?? { startedAt: at, wallStartedAt: manifest.createdAt ?? at, stages: {}, events: [] };
  manifest.timing.stages = manifest.timing.stages ?? {};
  manifest.timing.events = manifest.timing.events ?? [];
  const current = manifest.timing.stages[stage] ?? { attempts: 0, startedAt: at };
  if (current.status === status) return;
  const startedAt = current.startedAt ?? at;
  const elapsedMs = Math.max(0, Date.parse(at) - Date.parse(startedAt));
  const measured = Number(workElapsedMs);
  manifest.timing.stages[stage] = {
    ...current,
    attempts: Math.max(1, Number(current.attempts ?? 0)),
    status,
    startedAt,
    endedAt: at,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
    workElapsedMs: Number.isFinite(measured) && measured >= 0 ? measured : (Number.isFinite(elapsedMs) ? elapsedMs : 0),
    orchestrationElapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0,
    executor: "plugin",
    detail,
  };
  manifest.timing.events.push({ at, stage, status, attempt: manifest.timing.stages[stage].attempts, executor: "plugin", detail });
}

function refreshRunTiming(manifest, at = isoNow()) {
  manifest.timing = manifest.timing ?? { startedAt: null, wallStartedAt: manifest.createdAt ?? at, stages: {}, events: [] };
  manifest.timing.stages = manifest.timing.stages ?? {};
  const wallStarted = Date.parse(manifest.timing.wallStartedAt ?? manifest.createdAt ?? at);
  const wallEnded = Date.parse(at);
  manifest.timing.wallElapsedMs = Number.isFinite(wallStarted) && Number.isFinite(wallEnded)
    ? Math.max(0, wallEnded - wallStarted)
    : null;
  manifest.timing.elapsedMs = Object.values(manifest.timing.stages).reduce((sum, entry) => sum + (Number(entry?.workElapsedMs) || 0), 0);
  manifest.timing.breakdownMs = {
    preflight: Number(manifest.timing.stages.preflight?.workElapsedMs) || 0,
    capture: Number(manifest.timing.stages.capture?.workElapsedMs) || 0,
    compile: Number(manifest.timing.stages.compile?.workElapsedMs) || 0,
    executeWork: Number(manifest.timing.stages.execute?.workElapsedMs) || 0,
    executeOrchestration: Number(manifest.timing.stages.execute?.orchestrationElapsedMs) || 0,
    readback: Number(manifest.timing.stages.readback?.workElapsedMs) || 0,
    diff: Number(manifest.timing.stages.diff?.workElapsedMs) || 0,
    cleanup: Number(manifest.timing.stages.cleanup?.workElapsedMs) || 0,
  };
}

function syncImportRunFromPluginResult(state, payload, record) {
  const manifestPath = state.plan?.execution?.importRun?.manifestPath;
  if (!manifestPath) return { ok: true, skipped: true, reason: "no-import-run-manifest" };
  const absolute = path.resolve(manifestPath);
  if (!fs.existsSync(absolute)) throw new Error(`run manifest is missing: ${absolute}`);
  const manifest = JSON.parse(fs.readFileSync(absolute, "utf8"));
  const expectedRunId = state.plan.execution?.importRun?.runId ?? state.plan.execution?.runId ?? null;
  if (manifest.kind !== "text-to-ui-pixso-import-run" || (expectedRunId && manifest.runId !== expectedRunId)) {
    throw new Error("run manifest does not match the plugin result");
  }
  if (["completed", "failed", "cancelled", "needs-attention"].includes(manifest.status)) return { ok: true, skipped: true, reason: `run-already-${manifest.status}` };

  const cancelled = payload.result?.phase === "paused" || payload.cancelled === true;
  const pluginWorkElapsedMs = Number(payload.result?.timing?.totalMs);
  if (payload.ok) {
    finishRunStage(manifest, "execute", "passed", record.receivedAt, "Pixso plugin completed structured execution", pluginWorkElapsedMs);
    finishRunStage(manifest, "readback", "passed", record.receivedAt, "Pixso plugin readback verified structure, bindings, components and recoverable assets", 0);
    manifest.status = "running";
    manifest.gates = { ...(manifest.gates ?? {}), pluginReadback: "passed", componentAndVariableParity: "passed" };
    transitionRunLifecycle(manifest, IMPORT_LIFECYCLE_STATES.RUNNING, {
      at: record.receivedAt,
      stage: "result-confirmation",
      status: "received",
      phase: "result-confirmation",
      lastHeartbeatAt: record.receivedAt,
      deadline: null,
      blockingReason: null,
      nextAction: "run-visual-diff",
      detail: "plugin result acknowledged; execute and readback passed",
      metrics: {
        actualWorkMs: Number(payload.result?.timing?.totalMs) || 0,
        resultConfirmationMs: Number(record.bridgeTelemetry?.resultConfirmationMs) || 0,
      },
    });
  } else {
    finishRunStage(manifest, "execute", "failed", record.receivedAt, cancelled ? "Pixso plugin import was paused" : payload.error ?? "Pixso plugin execution failed", pluginWorkElapsedMs);
    manifest.status = cancelled ? "cancelled" : "failed";
    if (payload.result?.phase === "readback" || payload.result?.phase === "modular-readback") {
      manifest.gates = { ...(manifest.gates ?? {}), pluginReadback: "failed" };
    }
    transitionRunLifecycle(manifest, cancelled ? IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION : IMPORT_LIFECYCLE_STATES.FAILED, {
      at: record.receivedAt,
      stage: "result-confirmation",
      status: cancelled ? "cancelled" : "failed",
      phase: "result-confirmation",
      blockingReason: cancelled ? "user-cancelled" : "plugin-execution-failed",
      retryClassification: cancelled ? "cancelled" : "deterministic",
      nextAction: cancelled ? "start-new-run" : "repair-plugin-result-and-start-new-run",
      deadline: null,
      lastHeartbeatAt: record.receivedAt,
      detail: payload.error ?? "Pixso plugin execution failed",
    });
  }
  manifest.telemetry = {
    ...(manifest.telemetry ?? {}),
    queueWaitMs: Number(record.bridgeTelemetry?.queueWaitMs) || Number(manifest.telemetry?.queueWaitMs) || 0,
    claimMs: Number(record.bridgeTelemetry?.claimMs) || Number(manifest.telemetry?.claimMs) || 0,
    startConfirmationMs: Number(manifest.telemetry?.startConfirmationMs) || 0,
    resultConfirmationMs: Number(record.bridgeTelemetry?.resultConfirmationMs) || 0,
    pluginWorkMs: Number(payload.result?.timing?.totalMs) || 0,
    recoveryAttempt: Number(record.bridgeTelemetry?.recoveryAttempt) || Number(manifest.telemetry?.recoveryAttempt) || 0,
    moduleTimings: Array.isArray(payload.result?.modules) ? payload.result.modules.map((module) => ({ id: module.id, label: module.label, operationCount: module.operationCount, elapsedMs: Number(module.elapsedMs) || 0 })) : manifest.telemetry?.moduleTimings ?? [],
    resourceRepairItems: [...(manifest.telemetry?.resourceRepairItems ?? []), ...(payload.result?.audit?.iconFailures ?? []), ...(payload.result?.audit?.imageFailures ?? [])],
  };
  refreshRunTiming(manifest, record.receivedAt);
  fs.writeFileSync(absolute, `${JSON.stringify(manifest, null, 2)}\n`);
  if (["failed", "cancelled"].includes(manifest.status)) {
    releaseActiveRunLock({ runsRoot: path.dirname(path.dirname(absolute)), runId: manifest.runId });
  }
  return { ok: true, runId: manifest.runId, runStatus: manifest.status };
}

function clearCurrentPublication() {
  for (const file of [stateFile, jobFile, resultFile]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

function currentJob(state = readState()) {
  const job = readJob();
  return job && state.plan && job.revision === state.revision ? job : null;
}

function releaseExpiredClaim(state, job = currentJob(state)) {
  if (!job || job.status !== "claimed") return job;
  const expiresAt = Date.parse(job.claimExpiresAt ?? "");
  if (Number.isFinite(expiresAt) && expiresAt > Date.now()) return job;
  const released = {
    ...job,
    status: "queued",
    claimToken: null,
    claimSessionId: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastClaimExpiredAt: new Date().toISOString(),
    blockedReason: null,
    blockingReason: "claim-lease-expired",
    lifecycleState: IMPORT_LIFECYCLE_STATES.WAITING_FOR_PLUGIN,
    phase: "wait-for-plugin",
    nextAction: "wait-for-plugin-reclaim",
    error: null,
  };
  writeJob(released);
  return released;
}

function currentResult(state = readState()) {
  if (!state.plan || !fs.existsSync(resultFile)) return null;
  try {
    const result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    return result.revision === state.revision ? result : null;
  } catch (_) {
    return null;
  }
}

function readState() {
  if (!fs.existsSync(stateFile)) return { revision: "", plan: null, requiredRuntimeVersion: minimumPluginRuntimeVersion };
  let stored;
  try { stored = JSON.parse(fs.readFileSync(stateFile, "utf8")); }
  catch (error) {
    clearCurrentPublication();
    return { revision: "", plan: null, requiredRuntimeVersion: minimumPluginRuntimeVersion };
  }
  const envelope = stored?.kind === "text-to-ui-pixso-publication"
    ? stored
    : { kind: "text-to-ui-pixso-publication", publicationId: "legacy", planPath: null, plan: stored };
  const staleRevision = crypto.createHash("sha256").update(JSON.stringify(envelope)).digest("hex").slice(0, 16);
  // A state file written by an older bridge is historical input, not a
  // publication. Quarantine it in memory so a freshly started service cannot
  // replay an old plan merely because it still exists in /tmp.
  if (!supportedProtocolVersions.includes(Number(envelope.protocolVersion)) || !envelope.requiredRuntimeVersion) {
    return {
      revision: "",
      staleRevision,
      stale: true,
      stalePublicationId: envelope.publicationId ?? null,
      stalePlanPath: envelope.planPath ?? null,
      plan: null,
      requiredRuntimeVersion: minimumPluginRuntimeVersion,
    };
  }
  const plan = envelope.plan;
  const revision = staleRevision;
  return {
    revision,
    stale: false,
    planPath: envelope.planPath ?? null,
    publicationId: envelope.publicationId ?? null,
    publishedAt: envelope.publishedAt ?? null,
    plan,
    requiredRuntimeVersion: envelope.requiredRuntimeVersion ?? requiredRuntimeVersionFor(plan),
  };
}

async function health() {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    return response.ok;
  } catch (_) {
    return false;
  }
}

function readPluginSession() {
  if (!fs.existsSync(pluginSessionFile)) return {
    connected: false,
    sessionId: null,
    lastSeenAt: null,
    ageMs: null,
    runtimeVersion: null,
    protocolVersion: null,
  };
  try {
    const session = JSON.parse(fs.readFileSync(pluginSessionFile, "utf8"));
    const timestamp = Date.parse(session.lastSeenAt);
    const ageMs = Number.isFinite(timestamp) ? Math.max(0, Date.now() - timestamp) : null;
    const ttlMs = session.sessionId === "legacy-plugin" ? legacyPluginSessionTtlMs : pluginSessionTtlMs;
    return { ...session, connected: ageMs !== null && ageMs <= ttlMs, ageMs, ttlMs };
  } catch (_) {
    return {
      connected: false,
      sessionId: null,
      lastSeenAt: null,
      ageMs: null,
      runtimeVersion: null,
      protocolVersion: null,
    };
  }
}

function recordPluginSession(sessionId, revision = "", runtimeVersion = null, pluginProtocolVersion = null, details = {}) {
  if (!sessionId) return readPluginSession();
  fs.mkdirSync(stateDirectory, { recursive: true });
  const normalizedSessionId = String(sessionId);
  const previous = readPluginSession();
  const sameSession = previous.sessionId === normalizedSessionId;
  const normalizedRuntime = runtimeVersion && runtimeVersion !== "unknown"
    ? String(runtimeVersion)
    : sameSession ? previous.runtimeVersion ?? null : null;
  const normalizedProtocol = pluginProtocolVersion !== null && pluginProtocolVersion !== ""
    ? Number(pluginProtocolVersion)
    : sameSession ? previous.protocolVersion ?? null : null;
  const session = {
    sessionId: normalizedSessionId,
    revision: String(revision ?? ""),
    runtimeVersion: normalizedRuntime,
    protocolVersion: Number.isFinite(normalizedProtocol) ? normalizedProtocol : null,
    kernelVersion: String(details.kernelVersion ?? normalizedRuntime ?? previous.kernelVersion ?? "") || null,
    operationPlanVersions: Array.isArray(details.operationPlanVersions)
      ? details.operationPlanVersions.map(Number).filter(Number.isFinite)
      : sameSession ? previous.operationPlanVersions ?? [1] : [1],
    capabilities: Array.isArray(details.capabilities)
      ? [...new Set(details.capabilities.map(String))]
      : sameSession ? previous.capabilities ?? [] : [],
    lastSeenAt: new Date().toISOString(),
  };
  fs.writeFileSync(pluginSessionFile, `${JSON.stringify(session, null, 2)}\n`);
  return { ...session, connected: true, ageMs: 0 };
}

function pluginCompatibility(plan, session = readPluginSession()) {
  const requiredRuntimeVersion = requiredRuntimeVersionFor(plan);
  const requiredProtocolVersion = planProtocolVersion(plan);
  const requiredPlanSchemaVersion = planSchemaVersion(plan);
  const requiredCapabilities = planCapabilities(plan);
  const actualKernelVersion = session.kernelVersion ?? session.runtimeVersion;
  const runtimeCompatible = versionAtLeast(actualKernelVersion, requiredRuntimeVersion);
  const pluginProtocolCompatible = Number(session.protocolVersion) >= requiredProtocolVersion;
  const planSchemaCompatible = (session.operationPlanVersions ?? [1]).includes(requiredPlanSchemaVersion);
  const missingCapabilities = requiredCapabilities.filter((capability) => !(session.capabilities ?? []).includes(capability));
  const capabilitiesCompatible = missingCapabilities.length === 0;
  const ready = Boolean(session.connected && runtimeCompatible && pluginProtocolCompatible && planSchemaCompatible && capabilitiesCompatible);
  const reason = !session.connected
    ? "plugin-disconnected"
    : !runtimeCompatible
      ? "plugin-runtime-mismatch"
      : !pluginProtocolCompatible
        ? "plugin-protocol-mismatch"
        : !planSchemaCompatible
          ? "plugin-plan-schema-mismatch"
          : !capabilitiesCompatible
            ? "plugin-capability-mismatch"
        : null;
  return {
    requiredRuntimeVersion,
    requiredProtocolVersion,
    requiredPlanSchemaVersion,
    requiredCapabilities,
    missingCapabilities,
    runtimeCompatible,
    pluginProtocolCompatible,
    planSchemaCompatible,
    capabilitiesCompatible,
    ready,
    reason,
  };
}

function pluginStatus(state = readState()) {
  const session = readPluginSession();
  const compatibility = pluginCompatibility(state.plan, session);
  const { protocolVersion: pluginProtocolVersion, ...sessionStatus } = session;
  return {
    ...sessionStatus,
    pluginProtocolVersion,
    ...compatibility,
    recommendedExecutor: "plugin",
  };
}

function adapterStatus(state = readState()) {
  return createPixsoOfficialAdapterPlan(state.plan ?? {}, pluginStatus(state));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

async function status() {
  await ensureServer();
  const response = await fetch(`http://${host}:${port}/plugin-status`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    return { ok: true, bridge: `http://${host}:${port}`, bridgeVersion: 1, legacyBridge: true, connected: false, ready: false, reason: "plugin-disconnected", recommendedExecutor: "plugin" };
  }
  return { ok: true, bridge: `http://${host}:${port}`, bridgeVersion, protocolVersion, ...payload };
}

async function ensureServer() {
  if (await health()) return;
  spawn(process.execPath, [scriptPath, "serve"], { detached: true, stdio: "ignore" }).unref();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await health()) return;
  }
  throw new Error(`Pixso bridge did not start on ${host}:${port}`);
}

function isStrictHtmlImportPlan(plan) {
  return plan?.kind === "pixso-operation-plan" && (
    plan.execution?.sourcePolicy === "fresh-build-current-html-no-history" ||
    Boolean(plan.page?.htmlSourceFingerprint) ||
    plan.page?.visualSnapshot?.source === "html-live-computed-style"
  );
}

function validateCurrentImportPublication(plan, planPath) {
  const provenance = plan.execution?.importRun;
  if (isStrictHtmlImportPlan(plan) && !provenance?.runId) {
    throw new Error("Cannot publish: strict HTML import plan has no importRun/runId; legacy root plans are blocked");
  }
  if (!provenance) return;
  for (const [label, file] of [["run manifest", provenance.manifestPath], ["visual manifest", provenance.visualManifestPath]]) {
    if (!file || !fs.existsSync(path.resolve(file))) throw new Error(`Cannot publish: ${label} is missing (${file ?? "not declared"})`);
  }
  const manifestPath = path.resolve(provenance.manifestPath);
  const visualManifestPath = path.resolve(provenance.visualManifestPath);
  const runManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const visualManifest = JSON.parse(fs.readFileSync(visualManifestPath, "utf8"));
  if (["failed", "cancelled", "completed", "needs-attention", "accepted-awaiting-cleanup"].includes(runManifest.status)) {
    throw new Error(`Cannot publish: import run is terminal (${runManifest.status}); start a fresh run instead of replaying it`);
  }
  if (runManifest.runId !== provenance.runId || visualManifest.runId !== provenance.runId) throw new Error("Cannot publish: import runId is stale or mixed");
  if (runManifest.source?.htmlSourceFingerprint !== provenance.htmlSourceFingerprint || visualManifest.htmlSourceFingerprint !== provenance.htmlSourceFingerprint) throw new Error("Cannot publish: HTML source fingerprint is stale or mixed");
  if (runManifest.executionPolicy?.captureBundle === "required") {
    const capture = validateCaptureBundle({ runManifest, visualManifest });
    if (!capture.ok) throw new Error(`Cannot publish: capture bundle is invalid (${capture.failures.join("; ")})`);
  }
  if (runManifest.timing?.stages?.preflight?.status !== "passed") {
    throw new Error("Cannot publish: deterministic preflight has not passed; validate the current capture and component contracts before entering the Bridge queue");
  }
  if (plan.page?.htmlSourceFingerprint !== provenance.htmlSourceFingerprint || plan.page?.visualSnapshot?.htmlSourceFingerprint !== provenance.htmlSourceFingerprint) {
    throw new Error("Cannot publish: plan HTML fingerprint does not match the current import run");
  }
  if (path.resolve(runManifest.artifacts?.operationPlan ?? "") !== path.resolve(planPath)) {
    throw new Error("Cannot publish: plan is not the Operation Plan declared by the current import run");
  }
  if (path.resolve(runManifest.artifacts?.visualManifest ?? "") !== visualManifestPath) {
    throw new Error("Cannot publish: visual manifest is not the artifact declared by the current import run");
  }
  const runsRoot = path.dirname(path.dirname(manifestPath));
  const currentRunPath = path.join(runsRoot, "current-run.json");
  if (!fs.existsSync(currentRunPath)) throw new Error("Cannot publish: current-run.json is missing");
  const currentRun = JSON.parse(fs.readFileSync(currentRunPath, "utf8"));
  if (currentRun.runId !== provenance.runId || path.resolve(currentRun.manifest ?? "") !== manifestPath) {
    throw new Error("Cannot publish: plan belongs to an old import run, not current-run.json");
  }
}

async function publish(planPath, serviceOwned = false) {
  if (!serviceOwned) {
    await ensureServer();
    const response = await fetch(`http://${host}:${port}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planPath: path.resolve(planPath) }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error ?? "Managed Bridge publication failed; update the running Bridge service");
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  if (!planPath) throw new Error("Usage: pixso-plugin-bridge.mjs publish <pixso-operation-plan.json|pixso-component-library-plan.json>");
  const absolute = path.resolve(planPath);
  const plan = JSON.parse(fs.readFileSync(absolute, "utf8"));
  if (!["pixso-operation-plan", "pixso-component-library-plan"].includes(plan.kind)) {
    throw new Error("Input must be a pixso-operation-plan or pixso-component-library-plan");
  }
  validatePermanentExecutorPlan(plan);
  if (plan.kind === "pixso-operation-plan") validateCurrentImportPublication(plan, absolute);
  const pluginSession = readPluginSession();
  const plugin = pluginCompatibility(plan, pluginSession);
  const pluginStartDeadlineMs = plugin.ready
    ? WAITING_FOR_PLUGIN_DEADLINE_MS
    : WAITING_FOR_PLUGIN_CONNECTION_DEADLINE_MS;
  const idempotencyKey = planIdempotencyKey(plan, absolute);
  const existingState = readState();
  const existingJob = currentJob(existingState);
  if (existingState.plan && existingJob?.idempotencyKey === idempotencyKey && !["failed", "cancelled", "needs-attention"].includes(existingJob.status)) {
    return { ok: true, reused: true, queued: !terminalJobStatuses.has(existingJob.status), jobId: existingJob.jobId, revision: existingState.revision, plan: absolute, bridge: `http://${host}:${port}` };
  }
  // A claimed job has not started Pixso execution yet. Replacing it with a
  // freshly published plan is safe: clear the old publication below and
  // let the plugin claim only the new revision. Running or cancelling jobs
  // still require an explicit finish/cancel before publication.
  if (existingJob && !terminalJobStatuses.has(existingJob.status) && existingJob.status !== "claimed") {
    throw new Error("Another import is active; finish or cancel it before publishing");
  }
  const officialAdapter = createPixsoOfficialAdapterPlan(plan, { ...plugin, ready: true });
  fs.mkdirSync(stateDirectory, { recursive: true });
  clearCurrentPublication();
  const publication = {
    kind: "text-to-ui-pixso-publication",
    publicationId: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    publishedAt: new Date().toISOString(),
    protocolVersion: planProtocolVersion(plan),
    planSchemaVersion: planSchemaVersion(plan),
    idempotencyKey,
    requiredRuntimeVersion: requiredRuntimeVersionFor(plan),
    governance: {
      queueRecoveryAfterMs: WAITING_FOR_PLUGIN_RETRY_AFTER_MS,
      pluginStartDeadlineMs,
      moduleHeartbeatTimeoutMs: MODULE_HEARTBEAT_TIMEOUT_MS,
      moduleNoProgressTimeoutMs: MODULE_NO_PROGRESS_TIMEOUT_MS,
      resultAckDeadlineMs: RESULT_ACK_DEADLINE_MS,
      maxConnectionRecoveryAttempts: MAX_CONNECTION_RECOVERY_ATTEMPTS,
    },
    planPath: absolute,
    plan
  };
  fs.writeFileSync(stateFile, `${JSON.stringify(publication, null, 2)}\n`);
  const { revision } = readState();
  const publishedAt = publication.publishedAt;
  writeJob({
    jobId: publication.publicationId,
    revision,
    publicationId: publication.publicationId,
    planPath: absolute,
    status: plugin.ready ? "queued" : "queued-awaiting-plugin",
    idempotencyKey,
    requiredRuntimeVersion: publication.requiredRuntimeVersion,
    createdAt: publishedAt,
    publishedAt,
    startedAt: null,
    finishedAt: null,
    claimedAt: null,
    claimExpiresAt: null,
    lastHeartbeatAt: null,
    lastOperationProgressAt: null,
    operationProgress: null,
    resultReadyAt: null,
    resultAckDeadlineAt: null,
    waitDeadlineAt: isoAfter(pluginStartDeadlineMs, Date.parse(publishedAt)),
    startDeadlineAt: isoAfter(pluginStartDeadlineMs, Date.parse(publishedAt)),
    recoveryAt: isoAfter(WAITING_FOR_PLUGIN_RETRY_AFTER_MS, Date.parse(publishedAt)),
    recoveryAttempt: 0,
    deliveryAttempt: 0,
    lifecycleState: IMPORT_LIFECYCLE_STATES.WAITING_FOR_PLUGIN,
    attempt: 0,
    blockingReason: null,
    nextAction: "wait-for-unified-plugin",
    retryReasons: [],
    cancelRequested: false,
    error: null,
  });
  const job = readJob();
  if (job?.revision === revision) {
    writeJob({
      ...job,
      executorRoute: { ...officialAdapter.route, executor: "text-to-ui-native-plugin", transport: "text-to-ui-plugin-bridge", allowed: true, reason: plugin.ready ? "full-page-bulk-structured-execution" : "queued-awaiting-plugin" },
      officialAdapterVersion: pixsoOfficialAdapterVersion,
    });
  }
  updateImportRunLifecycle(readState(), IMPORT_LIFECYCLE_STATES.WAITING_FOR_PLUGIN, {
    at: publishedAt,
    stage: "execute",
    status: plugin.ready ? "queued" : "queued-awaiting-plugin",
    phase: "wait-for-plugin",
    deadline: isoAfter(pluginStartDeadlineMs, Date.parse(publishedAt)),
    blockingReason: plugin.ready ? null : plugin.reason,
    nextAction: plugin.ready ? "plugin-imports-automatically" : pluginSession.connected ? "reload-latest-plugin" : "open-pixso-plugin-panel",
  });
  return {
    ok: true,
    jobId: publication.publicationId,
    revision,
    plan: absolute,
    bridge: `http://${host}:${port}`,
    pluginConnected: pluginSession.connected,
    pluginRuntimeVersion: pluginSession.runtimeVersion ?? null,
    pluginRuntimeCompatible: plugin.runtimeCompatible,
    pluginReady: plugin.ready,
    pluginReason: plugin.reason,
    missingCapabilities: plugin.missingCapabilities,
    waitingAction: plugin.ready ? null : pluginSession.connected ? "reload-latest-plugin" : "open-pixso-plugin-panel",
    pluginDeliveryPath,
    queued: !plugin.ready,
    requiredRuntimeVersion: publication.requiredRuntimeVersion,
    recommendedExecutor: "plugin",
    executorRoute: officialAdapter.route,
  };
}

function requeueAfterConnectionTimeout(state, job, reason) {
  if (!state.plan || !job || !fs.existsSync(stateFile)) return null;
  let publication;
  try { publication = JSON.parse(fs.readFileSync(stateFile, "utf8")); }
  catch (_) { return null; }
  const now = isoNow();
  const recoveryAttempt = Number(job.recoveryAttempt ?? 0) + 1;
  publication.deliveryAttempt = Number(publication.deliveryAttempt ?? 0) + 1;
  publication.lastRecoveryAt = now;
  publication.lastRecoveryReason = reason;
  fs.writeFileSync(stateFile, `${JSON.stringify(publication, null, 2)}\n`);
  const nextState = readState();
  const nextJob = {
    ...job,
    revision: nextState.revision,
    status: "queued-awaiting-plugin",
    claimToken: null,
    claimSessionId: null,
    claimedAt: null,
    claimExpiresAt: null,
    recoveryAttempt,
    deliveryAttempt: Number(job.deliveryAttempt ?? 0) + 1,
    recoveredAt: now,
    recoveryReason: reason,
    lifecycleState: IMPORT_LIFECYCLE_STATES.RECOVERING,
    lastHeartbeatAt: null,
    lastOperationProgressAt: null,
    operationProgress: null,
    resultReadyAt: null,
    resultAckDeadlineAt: null,
    waitDeadlineAt: job.startDeadlineAt ?? job.waitDeadlineAt ?? isoAfter(WAITING_FOR_PLUGIN_DEADLINE_MS),
    blockingReason: "plugin-reconnect-once",
    nextAction: "reconnect-plugin-once",
    retryReasons: [...(job.retryReasons ?? []), { at: now, classification: "plugin-disconnect", reason }],
    cancelRequested: false,
    error: null,
  };
  writeJob(nextJob);
  updateImportRunLifecycle(nextState, IMPORT_LIFECYCLE_STATES.RECOVERING, {
    at: now,
    stage: "execute",
    status: "recovering",
    phase: "wait-for-plugin",
    attempt: recoveryAttempt,
    lastHeartbeatAt: now,
    deadline: nextJob.waitDeadlineAt,
    blockingReason: "plugin-reconnect-once",
    retryClassification: "plugin-disconnect",
    nextAction: "reconnect-plugin-once",
    detail: reason,
    telemetry: {
      retryCount: recoveryAttempt,
      retryReasons: nextJob.retryReasons,
      lastRetryClassification: "plugin-disconnect",
    },
  });
  return nextJob;
}

function bridgeWatchdog() {
  const state = readState();
  if (state.stale || !state.plan) return;
  let job = releaseExpiredClaim(state);
  if (!job || terminalJobStatuses.has(job.status)) return;
  const now = Date.now();
  const publishedAt = Date.parse(job.publishedAt ?? job.createdAt ?? "");
  const firstRecoveryAt = Number.isFinite(publishedAt) ? publishedAt + WAITING_FOR_PLUGIN_RETRY_AFTER_MS : null;
  const startDeadline = Date.parse(job.startDeadlineAt ?? job.waitDeadlineAt ?? "");
  if (!job.startedAt && firstRecoveryAt !== null && now >= firstRecoveryAt && Number(job.recoveryAttempt ?? 0) < MAX_CONNECTION_RECOVERY_ATTEMPTS) {
    job = requeueAfterConnectionTimeout(state, job, `no plugin claim within ${Math.round(WAITING_FOR_PLUGIN_RETRY_AFTER_MS / 1000)} seconds; publication was re-dispatched once`);
    return job;
  }
  if (!job.startedAt && startDeadline !== null && now >= startDeadline) {
    const reason = "plugin-start-timeout";
    const waitSeconds = Number.isFinite(publishedAt)
      ? Math.round((startDeadline - publishedAt) / 1000)
      : Math.round(WAITING_FOR_PLUGIN_DEADLINE_MS / 1000);
    const detail = `统一 Pixso 插件在 ${waitSeconds} 秒内没有确认启动；已清除领取状态并释放运行锁，不再自动重放。`;
    const updated = {
      ...job,
      status: "needs-attention",
      finishedAt: isoNow(),
      cancelRequested: true,
      cancelRequestedAt: isoNow(),
      blockingReason: reason,
      nextAction: "open-unified-plugin-and-start-new-run",
      lifecycleState: IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION,
      error: detail,
    };
    writeJob(updated);
    markRunNeedsAttention(state, reason, updated.nextAction, detail, {
      waitForPluginMs: elapsedMs(job.publishedAt ?? job.createdAt, now) ?? 0,
      recoveryAttempt: Number(job.recoveryAttempt ?? 0),
      retryClassification: "plugin-disconnect",
      lastHeartbeatAt: job.lastHeartbeatAt,
    });
    return updated;
  }
  if (job.status === "running" || job.status === "cancelling") {
    const resultReadyAt = Date.parse(job.resultReadyAt ?? "");
    const heartbeatAt = Date.parse(job.lastHeartbeatAt ?? job.startedAt ?? "");
    const resultDeadline = Date.parse(job.resultAckDeadlineAt ?? "");
    if (Number.isFinite(resultReadyAt) && Number.isFinite(resultDeadline) && now >= resultDeadline) {
      const reason = "result-ack-timeout";
      const detail = `插件已提交结果但 Bridge 在 ${Math.round(RESULT_ACK_DEADLINE_MS / 1000)} 秒内没有收到确认；已保留结果诊断并释放运行锁。`;
      const updated = {
        ...job,
        status: "needs-attention",
        finishedAt: isoNow(),
        cancelRequested: true,
        cancelRequestedAt: isoNow(),
        blockingReason: reason,
        nextAction: "inspect-result-and-start-new-run",
        lifecycleState: IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION,
        error: detail,
      };
      writeJob(updated);
      markRunNeedsAttention(state, reason, updated.nextAction, detail, {
        resultConfirmationMs: elapsedMs(job.startedAt, now) ?? 0,
        lastHeartbeatAt: job.lastHeartbeatAt,
      });
      return updated;
    }
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt >= MODULE_HEARTBEAT_TIMEOUT_MS) {
      const progress = job.progress ?? {};
      const reason = "module-heartbeat-timeout";
      const detail = `模块 ${progress.label ?? progress.id ?? "unknown"} 已超过 ${Math.round(MODULE_HEARTBEAT_TIMEOUT_MS / 1000)} 秒没有心跳；已请求取消草稿并停止自动重试。`;
      const updated = {
        ...job,
        status: "needs-attention",
        finishedAt: isoNow(),
        cancelRequested: true,
        cancelRequestedAt: isoNow(),
        blockingReason: reason,
        nextAction: "open-unified-plugin-and-start-new-run",
        lifecycleState: IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION,
        error: detail,
      };
      writeJob(updated);
      markRunNeedsAttention(state, reason, updated.nextAction, detail, {
        moduleId: progress.id ?? null,
        moduleLabel: progress.label ?? null,
        lastHeartbeatAt: job.lastHeartbeatAt,
        heartbeatTimeoutMs: MODULE_HEARTBEAT_TIMEOUT_MS,
      });
      return updated;
    }
    const operationProgressAt = Date.parse(job.lastOperationProgressAt ?? job.startedAt ?? "");
    if (Number.isFinite(operationProgressAt) && now - operationProgressAt >= MODULE_NO_PROGRESS_TIMEOUT_MS) {
      const progress = job.progress ?? {};
      const operation = job.operationProgress ?? {};
      const reason = "module-no-progress-timeout";
      const completed = Number.isFinite(Number(operation.completedOperations)) ? Number(operation.completedOperations) : 0;
      const total = Number.isFinite(Number(operation.operationCount)) ? `/${Number(operation.operationCount)}` : "";
      const detail = `模块 ${progress.label ?? progress.id ?? "unknown"} 已超过 ${Math.round(MODULE_NO_PROGRESS_TIMEOUT_MS / 1000)} 秒没有操作进度（${completed}${total}）；已请求取消草稿并停止自动重试。`;
      const updated = {
        ...job,
        status: "needs-attention",
        finishedAt: isoNow(),
        cancelRequested: true,
        cancelRequestedAt: job.cancelRequestedAt ?? isoNow(),
        blockingReason: reason,
        nextAction: "open-unified-plugin-and-start-new-run",
        lifecycleState: IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION,
        error: detail,
      };
      writeJob(updated);
      markRunNeedsAttention(state, reason, updated.nextAction, detail, {
        moduleId: progress.id ?? null,
        moduleLabel: progress.label ?? null,
        lastHeartbeatAt: job.lastHeartbeatAt,
        lastOperationProgressAt: job.lastOperationProgressAt,
        operationProgress: operation,
        noProgressTimeoutMs: MODULE_NO_PROGRESS_TIMEOUT_MS,
        heartbeatTimeoutMs: MODULE_HEARTBEAT_TIMEOUT_MS,
      });
      return updated;
    }
  }
  return job;
}

function serve() {
  const server = http.createServer((request, response) => {
    // Keep queue timeout enforcement independent of UI polling. The HTTP
    // status endpoints also invoke the watchdog, so a one-off Bridge process
    // remains deterministic even when its timer is temporarily delayed.
    bridgeWatchdog();
    if (request.method === "OPTIONS") {
      response.writeHead(204, headers());
      return response.end();
    }
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/publish" && request.method === "POST") {
      if (request.headers.origin) {
        response.writeHead(403, headers());
        return response.end(JSON.stringify({ ok: false, error: "Publication requires the local CLI" }));
      }
      readJsonBody(request).then((payload) => publish(payload.planPath, true)).then((result) => {
        response.writeHead(200, headers());
        response.end(JSON.stringify(result));
      }).catch((error) => {
        response.writeHead(409, headers());
        response.end(JSON.stringify({ ok: false, error: error.message }));
      });
      return;
    }
    if (url.pathname === "/health") {
      response.writeHead(200, headers());
      return response.end(JSON.stringify({
        ok: true,
        service: "text-to-ui-pixso-bridge",
        version: bridgeVersion,
        publicationTransport: "http-service-owned",
        publicationEndpoint: "/publish",
        bridgeVersion,
        protocolVersion,
        supportedProtocolVersions,
        preferredKernelVersion,
        operationPlanVersions: [1, 5],
        minimumPluginRuntimeVersion,
        executionModel: { mode: "installed-permanent-executor", executorProtocol: permanentExecutorProtocol, codeDelivery: "none" },
        legacyRuntimeFloor: minimumPluginRuntimeVersion,
        officialAdapterVersion: pixsoOfficialAdapterVersion,
        componentSync: {
          enabled: true,
          endpoint: "/component-sync",
          root: componentSyncRoot,
        },
      }));
    }
    if (url.pathname === "/component-sync" && request.method === "POST") {
      readJsonBody(request).then((payload) => {
        const result = syncPixsoComponentFacts({
          root: componentSyncRoot,
          stateDirectory,
          incomingFacts: payload.facts,
          mode: payload.mode || "apply-safe",
        });
        response.writeHead(result.ok === false ? 409 : 200, headers());
        response.end(JSON.stringify(result));
      }).catch((error) => {
        response.writeHead(400, headers());
        response.end(JSON.stringify({ ok: false, error: error.message }));
      });
      return;
    }
    if (url.pathname === "/component-sync/status") {
      const syncDirectory = path.join(stateDirectory, "component-sync");
      const proposalFile = path.join(syncDirectory, "latest-proposal.json");
      const factsFile = path.join(syncDirectory, "latest-facts.json");
      response.writeHead(200, headers());
      return response.end(JSON.stringify({
        ok: true,
        enabled: true,
        endpoint: "/component-sync",
        proposal: readJsonFile(proposalFile),
        factsCaptured: fs.existsSync(factsFile),
      }));
    }
    if (url.pathname === "/plugin-status") {
      response.writeHead(200, headers());
      return response.end(JSON.stringify({
        ok: true,
        service: "text-to-ui-pixso-bridge",
        bridgeVersion,
        protocolVersion,
        ...pluginStatus(),
      }));
    }
    if (url.pathname === "/service-status") {
      const state = readState();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({
        ok: true,
        service: "text-to-ui-pixso-service",
        bridge: `http://${host}:${port}`,
        bridgeVersion,
        protocolVersion,
        minimumPluginRuntimeVersion,
        publication: state.plan ? {
          publicationId: state.publicationId,
          revision: state.revision,
          planPath: state.planPath,
          requiredRuntimeVersion: state.requiredRuntimeVersion,
          publishedAt: state.publishedAt,
        } : null,
        plugin: pluginStatus(state),
        officialAdapter: adapterStatus(state),
        job: releaseExpiredClaim(state),
        importRun: importRunSummary(state),
        stalePublication: state.stale ? {
          publicationId: state.stalePublicationId,
          revision: state.staleRevision,
          planPath: state.stalePlanPath,
          ignored: true,
        } : null,
      }));
    }
    if (url.pathname === "/official-adapter") {
      const state = readState();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, ...adapterStatus(state) }));
    }
    if (url.pathname === "/job") {
      const state = readState();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, job: releaseExpiredClaim(state), result: currentResult(state), revision: state.revision, importRun: importRunSummary(state) }));
    }
    if (url.pathname === "/cancel" && request.method === "POST") {
      const state = readState();
      const job = currentJob(state);
      if (!job) {
        response.writeHead(404, headers());
        return response.end(JSON.stringify({ ok: false, error: "no-active-job" }));
      }
      if (terminalJobStatuses.has(job.status)) {
        response.writeHead(409, headers());
        return response.end(JSON.stringify({ ok: false, error: `job-already-${job.status}`, jobId: job.jobId }));
      }
      const cancelledAt = isoNow();
      const nextStatus = job.status === "running" ? "cancelling" : "cancelled";
      writeJob({
        ...job,
        cancelRequested: true,
        cancelRequestedAt: cancelledAt,
        status: nextStatus,
        finishedAt: nextStatus === "cancelled" ? cancelledAt : job.finishedAt ?? null,
        lifecycleState: nextStatus === "cancelled" ? IMPORT_LIFECYCLE_STATES.FAILED : IMPORT_LIFECYCLE_STATES.RUNNING,
        blockingReason: "user-cancelled",
        nextAction: "start-new-run",
        error: nextStatus === "cancelled" ? "用户取消了尚未启动的导入计划" : job.error,
      });
      if (nextStatus === "cancelled") markRunCancelled(state, "user-cancelled-before-plugin-start");
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, jobId: job.jobId, cancelRequested: true }));
    }
    if (url.pathname === "/progress" && request.method === "POST") {
      readJsonBody(request).then((payload) => {
        const state = readState();
        const job = releaseExpiredClaim(state);
        if (!job || payload.revision !== state.revision) throw new Error("progress revision does not match the current job");
        if (!['running', 'cancelling'].includes(job.status)) throw new Error("progress requires a started claim");
        const heartbeatAt = isoNow();
        const progress = payload.progress ?? payload;
        const resultReady = Boolean(payload.resultReady || progress?.resultReady || /result-ready|result-confirmation/i.test(String(progress?.phase ?? progress?.id ?? "")));
        const completedOperations = Number(progress?.completedOperations);
        const operationCount = Number(progress?.operationCount);
        const previousCompleted = Number(job.operationProgress?.completedOperations);
        const moduleChanged = Boolean(progress?.id && progress.id !== job.currentModuleId);
        const operationAdvanced = ["operation", "heartbeat", "operation-start", "layout-start"].includes(progress?.phase)
          && Number.isFinite(completedOperations)
          && (moduleChanged || !Number.isFinite(previousCompleted) || completedOperations > previousCompleted);
        const lastOperationProgressAt = operationAdvanced
          ? heartbeatAt
          : job.lastOperationProgressAt ?? job.startedAt ?? heartbeatAt;
        const operationProgress = Number.isFinite(completedOperations)
          ? {
              completedOperations,
              ...(Number.isFinite(operationCount) ? { operationCount } : {}),
              operationId: progress?.operationId ?? null,
              operation: progress?.operation ?? null,
            }
          : job.operationProgress ?? null;
        const activeOperationPhase = progress?.activePhase ?? progress?.phase;
        const sameActiveOperation = job.currentOperation?.operationId === progress.operationId
          && job.currentOperation?.phase === activeOperationPhase
          && !moduleChanged;
        const nextJob = {
          ...job,
          // A cancel request is sticky. Heartbeats from the still-open plugin
          // must not silently turn a cancelling job back into running.
          status: job.cancelRequested ? "cancelling" : "running",
          lastProgressAt: heartbeatAt,
          lastHeartbeatAt: heartbeatAt,
          lastOperationProgressAt,
          operationProgress,
          currentOperation: ["operation-start", "layout-start"].includes(activeOperationPhase)
            ? { operationId: progress.operationId, operation: progress.operation, name: progress.operationName, phase: activeOperationPhase, startedAt: sameActiveOperation ? job.currentOperation.startedAt : heartbeatAt }
            : activeOperationPhase === "operation" ? null : job.currentOperation ?? null,
          lastCompletedOperation: activeOperationPhase === "operation" ? operationProgress : job.lastCompletedOperation ?? null,
          progress,
          lifecycleState: resultReady ? IMPORT_LIFECYCLE_STATES.RUNNING : IMPORT_LIFECYCLE_STATES.RUNNING,
          phase: resultReady ? "result-confirmation" : "module",
          currentModuleId: progress?.id ?? job.currentModuleId ?? null,
          currentModuleLabel: progress?.label ?? job.currentModuleLabel ?? null,
          resultReadyAt: resultReady ? heartbeatAt : job.resultReadyAt ?? null,
          resultAckDeadlineAt: resultReady ? isoAfter(RESULT_ACK_DEADLINE_MS) : job.resultAckDeadlineAt ?? null,
          nextAction: resultReady ? "acknowledge-plugin-result" : job.cancelRequested ? "finish-cancelled-plugin" : "report-module-heartbeat",
        };
        writeJob(nextJob);
        updateImportRunLifecycle(state, IMPORT_LIFECYCLE_STATES.RUNNING, {
          at: heartbeatAt,
          stage: "execute",
          status: resultReady ? "result-ready" : "heartbeat",
          phase: resultReady ? "result-confirmation" : "module",
          lastHeartbeatAt: heartbeatAt,
          deadline: resultReady
            ? nextJob.resultAckDeadlineAt
            : isoAfter(MODULE_NO_PROGRESS_TIMEOUT_MS, Date.parse(lastOperationProgressAt)),
          blockingReason: null,
          nextAction: nextJob.nextAction,
          moduleId: nextJob.currentModuleId,
          moduleLabel: nextJob.currentModuleLabel,
          detail: resultReady ? "plugin result is ready for Bridge acknowledgement" : "plugin module heartbeat",
          telemetry: {
            lastHeartbeatAt: heartbeatAt,
            lastOperationProgressAt,
            operationProgress,
            currentModuleId: nextJob.currentModuleId,
            currentModuleLabel: nextJob.currentModuleLabel,
          },
        });
        response.writeHead(200, headers());
        response.end(JSON.stringify({ ok: true }));
      }).catch((error) => {
        response.writeHead(409, headers());
        response.end(JSON.stringify({ ok: false, error: error.message }));
      });
      return;
    }
    if (url.pathname === "/start" && request.method === "POST") {
      readJsonBody(request).then((payload) => {
        const state = readState();
        const job = releaseExpiredClaim(state);
        if (!job || payload.revision !== state.revision) throw new Error("start revision does not match the current job");
        if (job.status !== "claimed") throw new Error(`job is not awaiting start (${job.status})`);
        if (!payload.claimToken || payload.claimToken !== job.claimToken) throw new Error("start claim token does not match the current job");
        if (!payload.sessionId || payload.sessionId !== job.claimSessionId) throw new Error("start session does not own the current claim");
        const startedAt = new Date().toISOString();
        writeJob({
          ...job,
          status: "running",
          startedAt,
          lastProgressAt: startedAt,
          lastHeartbeatAt: startedAt,
          lastOperationProgressAt: startedAt,
          operationProgress: { completedOperations: 0, operationCount: null },
          claimExpiresAt: null,
          blockedReason: null,
          blockingReason: null,
          lifecycleState: IMPORT_LIFECYCLE_STATES.RUNNING,
          phase: "execute",
          attempt: Number(job.attempt ?? 0) + 1,
          nextAction: "run-module-and-report-heartbeat",
          error: null,
        });
        updateImportRunLifecycle(state, IMPORT_LIFECYCLE_STATES.RUNNING, {
          at: startedAt,
          stage: "execute",
          status: "started",
          phase: "execute",
          attempt: Number(job.attempt ?? 0) + 1,
          lastHeartbeatAt: startedAt,
          lastOperationProgressAt: startedAt,
          deadline: isoAfter(MODULE_HEARTBEAT_TIMEOUT_MS, Date.parse(startedAt)),
          blockingReason: null,
          nextAction: "run-module-and-report-heartbeat",
          detail: "plugin confirmed execution start",
          telemetry: { startConfirmationMs: elapsedMs(job.claimedAt, startedAt) ?? 0 },
        });
        response.writeHead(200, headers());
        response.end(JSON.stringify({ ok: true, jobId: job.jobId, revision: state.revision, startedAt }));
      }).catch((error) => {
        response.writeHead(409, headers());
        response.end(JSON.stringify({ ok: false, error: error.message }));
      });
      return;
    }
    if (url.pathname === "/session" && request.method === "POST") {
      readJsonBody(request).then((payload) => {
        const session = recordPluginSession(
          payload.sessionId,
          payload.revision ?? "",
          payload.runtimeVersion ?? payload.kernelVersion,
          payload.protocolVersion,
          payload,
        );
        const job = currentJob();
        response.writeHead(200, headers());
        response.end(JSON.stringify({ ok: true, ...session, ...pluginCompatibility(readState().plan, session), cancelRequested: Boolean(job?.cancelRequested) }));
      }).catch((error) => {
        response.writeHead(400, headers());
        response.end(JSON.stringify({ ok: false, error: error.message }));
      });
      return;
    }
    if (url.pathname === "/session") {
      const session = recordPluginSession(
        url.searchParams.get("session"),
        url.searchParams.get("revision") ?? "",
        url.searchParams.get("runtime") ?? url.searchParams.get("runtimeVersion"),
        url.searchParams.get("protocol"),
      );
      const job = currentJob();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, ...session, ...pluginCompatibility(readState().plan, session), cancelRequested: Boolean(job?.cancelRequested) }));
    }
    if (url.pathname === "/result" && request.method === "GET") {
      const result = currentResult();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, result }));
    }
    if (url.pathname === "/result" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        try {
          const payload = JSON.parse(body || "{}");
          const state = readState();
          if (!state.plan || payload.revision !== state.revision) throw new Error("result revision does not match the current publication");
          const expectedRunId = state.plan.execution?.importRun?.runId ?? state.plan.execution?.runId ?? null;
          if (expectedRunId && payload.runId !== expectedRunId) throw new Error("result runId does not match the current publication");
          const previousJob = currentJob(state);
          if (previousJob && terminalJobStatuses.has(previousJob.status)) {
            if (previousJob.status === "needs-attention") {
              if (payload.ok === false && payload.result?.cleanup) {
                const cleanup = { ...payload.result.cleanup, receivedAt: isoNow() };
                writeJob({ ...previousJob, cleanup });
                appendImportRunTelemetry(state, { cleanup }, "Plugin reported cleanup after timeout; failed run remains terminal");
                response.writeHead(200, headers());
                return response.end(JSON.stringify({ ok: true, cleanupAcknowledged: true, jobId: previousJob.jobId }));
              }
              throw new Error(`late result rejected after ${previousJob.blockingReason ?? "timeout"}; start a fresh run`);
            }
            if (currentResult(state)) {
              response.writeHead(200, headers());
              return response.end(JSON.stringify({ ok: true, duplicate: true, jobId: previousJob.jobId }));
            }
          }
          const receivedAt = isoNow();
          const record = {
            ...payload,
            receivedAt,
            bridgeTelemetry: previousJob ? {
              queueWaitMs: elapsedMs(previousJob.publishedAt ?? previousJob.createdAt, previousJob.claimedAt ?? receivedAt) ?? 0,
              claimMs: elapsedMs(previousJob.claimedAt, previousJob.startedAt ?? receivedAt) ?? 0,
              resultConfirmationMs: elapsedMs(previousJob.startedAt, receivedAt) ?? 0,
              recoveryAttempt: Number(previousJob.recoveryAttempt ?? 0),
              lastHeartbeatAt: previousJob.lastHeartbeatAt ?? null,
            } : null,
          };
          fs.mkdirSync(stateDirectory, { recursive: true });
          fs.writeFileSync(resultFile, `${JSON.stringify(record, null, 2)}\n`);
          const manifestPath = state.plan.execution?.importRun?.manifestPath;
          if (manifestPath && fs.existsSync(path.resolve(manifestPath))) {
            const runManifest = JSON.parse(fs.readFileSync(path.resolve(manifestPath), "utf8"));
            const target = runManifest.artifacts?.pluginResult;
            if (target) {
              fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
              fs.writeFileSync(path.resolve(target), `${JSON.stringify(record, null, 2)}\n`);
            }
          }
          const runSync = syncImportRunFromPluginResult(state, payload, record);
          if (previousJob && previousJob.revision === state.revision) {
            const cancelled = payload.result?.phase === "paused" || payload.cancelled === true;
            const iconFailures = Array.isArray(payload.result?.audit?.iconFailures)
              ? payload.result.audit.iconFailures.length
              : 0;
            const imageFailures = Array.isArray(payload.result?.audit?.imageFailures)
              ? payload.result.audit.imageFailures.length
              : 0;
            const assetFailures = iconFailures + imageFailures;
            writeJob({
              ...previousJob,
              status: cancelled ? "cancelled" : payload.ok ? assetFailures > 0 ? "completed-with-asset-warnings" : "completed" : "failed",
              finishedAt: record.receivedAt,
              lastHeartbeatAt: record.receivedAt,
              resultReceivedAt: record.receivedAt,
              resultReadyAt: previousJob.resultReadyAt ?? record.receivedAt,
              resultAckDeadlineAt: null,
              lifecycleState: payload.ok ? IMPORT_LIFECYCLE_STATES.RUNNING : IMPORT_LIFECYCLE_STATES.FAILED,
              phase: "result-confirmation",
              nextAction: payload.ok ? "run-visual-diff" : "start-new-run",
              blockingReason: payload.ok ? null : cancelled ? "user-cancelled" : "plugin-execution-failed",
              error: payload.ok
                ? assetFailures > 0 ? `${iconFailures} icon and ${imageFailures} image optimization item(s) remain deferred` : null
                : cancelled ? null : payload.error ?? "Pixso execution failed",
            });
          }
          response.writeHead(200, headers());
          response.end(JSON.stringify({ ok: true, runSync }));
        } catch (error) {
          response.writeHead(409, headers());
          response.end(JSON.stringify({ ok: false, error: error.message }));
        }
      });
      return;
    }
    if (url.pathname === "/next") {
      const state = readState();
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, changed: false, revision: state.revision, deprecated: true }));
    }
    if (url.pathname === "/claim") {
      const state = readState();
      const after = url.searchParams.get("after") ?? "";
      // Older installed plugin UIs do not send a session id yet, but their
      // active /claim poll is still reliable proof that the Pixso panel is
      // open. Keep that path compatible while the new delivery is reloaded.
      const session = recordPluginSession(
        url.searchParams.get("session") ?? "legacy-plugin",
        after,
        url.searchParams.get("runtime") ?? url.searchParams.get("runtimeVersion"),
        url.searchParams.get("protocol"),
        { capabilities: parseCapabilities(url.searchParams.get("capabilities")) },
      );
      if (state.stale) {
        clearCurrentPublication();
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          blocked: true,
          reason: "stale-publication",
          revision: state.staleRevision,
          cleared: true,
          error: "已清理旧 publication；请由当前 Text-to-UI import run 重新发布计划。",
        }));
      }
      if (state.plan?.kind === "pixso-operation-plan") {
        try {
          validateCurrentImportPublication(state.plan, state.planPath ?? "");
        } catch (error) {
          clearCurrentPublication();
          response.writeHead(200, headers());
          return response.end(JSON.stringify({ ok: true, changed: false, blocked: true, cleared: true, reason: "stale-publication", revision: state.revision, error: error.message }));
        }
      }
      // Delivery is scoped to the requesting plugin session. The plugin sends
      // its last consumed revision through `after`, so the same session cannot
      // loop. A newly opened plugin starts with an empty revision and must be
      // able to recover the latest plan even if an older session claimed it.
      let job = releaseExpiredClaim(state);
      if (job?.status === "needs-attention") {
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          blocked: true,
          reason: job.blockingReason ?? "plugin-start-timeout",
          revision: state.revision,
          status: job.status,
          nextAction: job.nextAction ?? "open-unified-plugin-and-start-new-run",
          error: job.error ?? "当前导入已停止等待；请打开统一 Pixso 插件并由 Text-to-UI 发布一份新计划。",
        }));
      }
      if (job?.status === "cancelled" || job?.cancelRequested) {
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          blocked: true,
          reason: "publication-cancelled",
          revision: state.revision,
          error: "当前导入计划已取消；请发布新的计划后再执行。",
        }));
      }
      if (job && terminalJobStatuses.has(job.status)) {
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          completed: true,
          status: job.status,
          revision: state.revision,
        }));
      }
      const changed = Boolean(state.plan && state.revision !== after);
      const compatibility = pluginCompatibility(state.plan, session);
      let lockedRoute = job?.executorRoute?.executor ?? null;
      // A transient plugin heartbeat gap must not permanently force a queued
      // publication onto the MCP fallback. Upgrade only before execution has
      // started and only when there is no result, so a reconnecting plugin can
      // safely claim the plan without racing an active MCP transaction.
      if (
        changed &&
        ["queued", "queued-awaiting-plugin", "blocked"].includes(job?.status) &&
        !job.startedAt &&
        !currentResult(state) &&
        lockedRoute &&
        lockedRoute !== "text-to-ui-native-plugin" &&
        compatibility.ready
      ) {
        const recoveredRoute = createPixsoOfficialAdapterPlan(state.plan, { ready: true }).route;
        if (recoveredRoute.executor === "text-to-ui-native-plugin") {
          job = {
            ...job,
            executorRoute: recoveredRoute,
            recoveredAt: new Date().toISOString(),
            recoveryReason: "plugin-reconnected-before-execution",
          };
          writeJob(job);
          lockedRoute = recoveredRoute.executor;
        }
      }
      // The executor is selected once, at publication time. Do not let a
      // plugin that reconnects after an MCP fallback publication steal the
      // same plan and execute it a second time. Without this lock, a delayed
      // plugin poll could race the MCP batches and leave a failed plugin
      // result beside a successful canvas import.
      if (changed && lockedRoute && lockedRoute !== "text-to-ui-native-plugin") {
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          blocked: true,
          reason: "executor-route-locked",
          revision: state.revision,
          executorRoute: job.executorRoute,
          error: "当前 publication 已锁定 MCP 执行，插件不会重复领取同一份导入计划。",
        }));
      }
      if (changed && !compatibility.ready) {
        const previousJob = readJob();
        if (previousJob?.revision === state.revision) {
          writeJob({
            ...previousJob,
            status: "blocked",
            blockedReason: compatibility.reason,
            blockingReason: compatibility.reason,
            lifecycleState: IMPORT_LIFECYCLE_STATES.WAITING_FOR_PLUGIN,
            phase: "wait-for-plugin",
            nextAction: compatibility.reason === "plugin-disconnected" ? "open-unified-plugin" : "reload-latest-plugin",
            pluginRuntimeVersion: session.runtimeVersion ?? null,
            pluginProtocolVersion: session.protocolVersion ?? null,
            error: compatibility.reason === "plugin-runtime-mismatch"
              ? `插件 Runtime v${session.runtimeVersion ?? "unknown"} 不满足固定执行器基线 v${compatibility.requiredRuntimeVersion}；请安装一次 Permanent Executor 包`
              : compatibility.reason === "plugin-protocol-mismatch"
                ? `插件协议 v${session.protocolVersion ?? "unknown"} 不满足服务协议 v${protocolVersion}，请重新加载最新插件`
                : compatibility.reason === "plugin-plan-schema-mismatch"
                  ? `插件不支持 Operation Plan v${compatibility.requiredPlanSchemaVersion}`
                  : compatibility.reason === "plugin-capability-mismatch"
                    ? `插件缺少能力：${compatibility.missingCapabilities.join("、")}`
                : "Pixso 插件未连接",
          });
        }
        const error = compatibility.reason === "plugin-runtime-mismatch"
          ? `需要固定执行器基线 v${compatibility.requiredRuntimeVersion}，当前为 v${session.runtimeVersion ?? "unknown"}。请安装一次 Permanent Executor 包。`
          : compatibility.reason === "plugin-protocol-mismatch"
            ? `需要 Pixso 插件协议 v${protocolVersion}，当前为 v${session.protocolVersion ?? "unknown"}。请重新加载最新插件。`
            : compatibility.reason === "plugin-plan-schema-mismatch"
              ? `需要 Operation Plan v${compatibility.requiredPlanSchemaVersion} 执行能力。`
              : compatibility.reason === "plugin-capability-mismatch"
                ? `插件缺少执行能力：${compatibility.missingCapabilities.join("、")}。`
            : "Pixso 插件未连接";
        response.writeHead(200, headers());
        return response.end(JSON.stringify({
          ok: true,
          changed: false,
          blocked: true,
          reason: compatibility.reason,
          revision: state.revision,
          requiredRuntimeVersion: compatibility.requiredRuntimeVersion,
          pluginRuntimeVersion: session.runtimeVersion ?? null,
          protocolVersion,
          pluginProtocolVersion: session.protocolVersion ?? null,
          missingCapabilities: compatibility.missingCapabilities,
          error,
        }));
      }
      if (changed && job?.status === "claimed" && job.claimSessionId !== session.sessionId) {
        response.writeHead(200, headers());
        return response.end(JSON.stringify({ ok: true, changed: false, claimed: true, revision: state.revision, retryAfterMs: claimLeaseTtlMs, error: "计划已由另一个插件会话领取，等待其开始或租约释放。" }));
      }
      if (changed) {
        const claimedAt = new Date().toISOString();
        const claimToken = crypto.randomBytes(18).toString("hex");
        job = {
          ...job,
          status: "claimed",
          claimToken,
          claimSessionId: session.sessionId,
          claimedAt,
          claimExpiresAt: new Date(Date.now() + claimLeaseTtlMs).toISOString(),
          blockedReason: null,
          blockingReason: null,
          lifecycleState: IMPORT_LIFECYCLE_STATES.CLAIMED,
          phase: "claim",
          nextAction: "confirm-plugin-start",
          cancelRequested: false,
          error: null,
        };
        writeJob(job);
        updateImportRunLifecycle(state, IMPORT_LIFECYCLE_STATES.CLAIMED, {
          at: claimedAt,
          stage: "execute",
          status: "claimed",
          phase: "claim",
          lastHeartbeatAt: claimedAt,
          deadline: job.waitDeadlineAt ?? isoAfter(WAITING_FOR_PLUGIN_DEADLINE_MS),
          blockingReason: null,
          nextAction: "confirm-plugin-start",
          detail: `plugin session ${session.sessionId} claimed the publication`,
        });
        response.writeHead(200, headers());
        return response.end(JSON.stringify({ ok: true, changed: true, revision: state.revision, claimToken, claimExpiresAt: job.claimExpiresAt, plan: state.plan }));
      }
      response.writeHead(200, headers());
      return response.end(JSON.stringify({ ok: true, changed: false, revision: state.revision }));
    }
    response.writeHead(404, headers());
    response.end(JSON.stringify({ ok: false, error: "not-found" }));
  });
  const watchdogTimer = setInterval(bridgeWatchdog, 1000);
  watchdogTimer.unref?.();
  server.listen(port, host);
}

const command = process.argv[2] ?? "serve";
if (command === "serve") serve();
else if (command === "publish") await publish(process.argv[3]);
else if (command === "status") process.stdout.write(`${JSON.stringify(await status(), null, 2)}\n`);
else throw new Error(`Unknown command: ${command}`);
