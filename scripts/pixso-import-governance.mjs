// Shared lifecycle, timeout, retry, and telemetry policy for Text-to-UI Pixso
// imports. Keep the values here in sync with the installed plugin UI and the
// Bridge watchdog; this file contains policy only and never executes Pixso JS.

export const IMPORT_LIFECYCLE_STATES = Object.freeze({
  PRECHECKING: "PRECHECKING",
  READY: "READY",
  WAITING_FOR_PLUGIN: "WAITING_FOR_PLUGIN",
  CLAIMED: "CLAIMED",
  RUNNING: "RUNNING",
  RECOVERING: "RECOVERING",
  COMPLETED: "COMPLETED",
  NEEDS_ATTENTION: "NEEDS_ATTENTION",
  FAILED: "FAILED",
});

function configuredDuration(environmentKey, fallback) {
  const configured = Number(globalThis.process?.env?.[environmentKey]);
  return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
}

// The environment overrides are intentionally test/service-diagnostics only.
// An unopened plugin gets a longer window for the user to open its panel;
// a connected plugin still has only 45 seconds to confirm execution startup.
export const WAITING_FOR_PLUGIN_RETRY_AFTER_MS = configuredDuration("TEXT_TO_UI_PLUGIN_RECOVERY_AFTER_MS", 15000);
export const WAITING_FOR_PLUGIN_DEADLINE_MS = configuredDuration("TEXT_TO_UI_PLUGIN_START_DEADLINE_MS", 45000);
export const WAITING_FOR_PLUGIN_CONNECTION_DEADLINE_MS = configuredDuration("TEXT_TO_UI_PLUGIN_CONNECTION_DEADLINE_MS", 600000);
export const MODULE_HEARTBEAT_INTERVAL_MS = configuredDuration("TEXT_TO_UI_MODULE_HEARTBEAT_INTERVAL_MS", 5000);
export const MODULE_HEARTBEAT_TIMEOUT_MS = configuredDuration("TEXT_TO_UI_MODULE_HEARTBEAT_TIMEOUT_MS", 60000);
// A timer heartbeat only proves that the plugin UI is alive. Keep a separate
// deadline for operation progress so a Pixso API call that never returns does
// not remain "running" forever while the heartbeat timer continues to tick.
export const MODULE_NO_PROGRESS_TIMEOUT_MS = configuredDuration("TEXT_TO_UI_MODULE_NO_PROGRESS_TIMEOUT_MS", 60000);
export const RESULT_ACK_DEADLINE_MS = configuredDuration("TEXT_TO_UI_RESULT_ACK_DEADLINE_MS", 15000);
export const CLAIM_LEASE_MS = configuredDuration("TEXT_TO_UI_PLUGIN_CLAIM_LEASE_MS", 15000);
export const MAX_CONNECTION_RECOVERY_ATTEMPTS = 1;
export const MAX_RESOURCE_RETRIES = 1;

export const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "needs-attention",
]);

export const TERMINAL_JOB_STATUSES = new Set([
  "completed",
  "completed-with-asset-warnings",
  "completed-with-image-warnings",
  "failed",
  "cancelled",
  "needs-attention",
]);

export function isoNow() {
  return new Date().toISOString();
}

export function isoAfter(milliseconds, from = Date.now()) {
  return new Date(Number(from) + Math.max(0, Number(milliseconds) || 0)).toISOString();
}

export function timestampMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function elapsedMs(start, end = Date.now()) {
  const started = timestampMs(start);
  const finished = typeof end === "number" ? end : timestampMs(end);
  if (started === null || finished === null) return null;
  return Math.max(0, finished - started);
}

export function retryPolicyFor(kind) {
  switch (String(kind)) {
    case "resource-transient":
      return { classification: "resource-transient", maxAttempts: MAX_RESOURCE_RETRIES + 1, retryable: true };
    case "plugin-disconnect":
      return { classification: "plugin-disconnect", maxAttempts: MAX_CONNECTION_RECOVERY_ATTEMPTS + 1, retryable: true };
    case "component-contract":
    case "capture-bundle":
    case "fingerprint":
    case "schema":
    case "old-plan":
    case "module-heartbeat-timeout":
    default:
      return { classification: String(kind || "deterministic"), maxAttempts: 1, retryable: false };
  }
}

export function classifyPreflightFailure(message) {
  const text = String(message ?? "").toLowerCase();
  if (/capture bundle|visual manifest|screenshot|capture/.test(text)) return "capture-bundle";
  if (/component|variant|mapped|geometry compatibility|contract/.test(text)) return "component-contract";
  if (/fingerprint|stale|current-run|old import|changed during import/.test(text)) return "fingerprint";
  if (/schema|operation plan|provenance|viewport|selector coverage|visual evidence/.test(text)) return "schema";
  return "deterministic";
}

export function lifecycleForRunStatus(status) {
  switch (String(status)) {
    case "completed": return IMPORT_LIFECYCLE_STATES.COMPLETED;
    case "failed": return IMPORT_LIFECYCLE_STATES.FAILED;
    case "needs-attention": return IMPORT_LIFECYCLE_STATES.NEEDS_ATTENTION;
    default: return null;
  }
}

export function ensureRunControl(manifest, defaults = {}) {
  const current = manifest.lifecycle ?? {};
  manifest.lifecycle = {
    state: current.state ?? defaults.state ?? IMPORT_LIFECYCLE_STATES.PRECHECKING,
    phase: current.phase ?? defaults.phase ?? "preflight",
    attempt: Number(current.attempt ?? defaults.attempt ?? 0),
    lastHeartbeatAt: current.lastHeartbeatAt ?? defaults.lastHeartbeatAt ?? manifest.createdAt ?? isoNow(),
    deadline: current.deadline ?? defaults.deadline ?? null,
    blockingReason: current.blockingReason ?? defaults.blockingReason ?? null,
    nextAction: current.nextAction ?? defaults.nextAction ?? "capture-current-browser-state",
    recoveryAttempt: Number(current.recoveryAttempt ?? defaults.recoveryAttempt ?? 0),
    retryClassification: current.retryClassification ?? defaults.retryClassification ?? null,
    ...current,
  };
  return manifest.lifecycle;
}

export function appendLifecycleEvent(manifest, event = {}) {
  manifest.timing = manifest.timing ?? { startedAt: null, wallStartedAt: manifest.createdAt ?? isoNow(), stages: {}, events: [] };
  manifest.timing.events = manifest.timing.events ?? [];
  manifest.timing.events.push({
    at: event.at ?? isoNow(),
    stage: event.stage ?? "lifecycle",
    status: event.status ?? "transition",
    lifecycleState: event.lifecycleState ?? manifest.lifecycle?.state ?? null,
    attempt: Number(event.attempt ?? manifest.lifecycle?.attempt ?? 0),
    detail: event.detail ?? null,
    ...event,
  });
}

export function transitionRunLifecycle(manifest, state, details = {}) {
  const lifecycle = ensureRunControl(manifest);
  const at = details.at ?? isoNow();
  manifest.lifecycle = {
    ...lifecycle,
    state,
    phase: details.phase ?? lifecycle.phase,
    attempt: Number(details.attempt ?? lifecycle.attempt ?? 0),
    lastHeartbeatAt: details.lastHeartbeatAt ?? lifecycle.lastHeartbeatAt ?? at,
    deadline: Object.prototype.hasOwnProperty.call(details, "deadline") ? details.deadline : lifecycle.deadline ?? null,
    blockingReason: Object.prototype.hasOwnProperty.call(details, "blockingReason") ? details.blockingReason : lifecycle.blockingReason ?? null,
    nextAction: Object.prototype.hasOwnProperty.call(details, "nextAction") ? details.nextAction : lifecycle.nextAction ?? null,
    recoveryAttempt: Number(details.recoveryAttempt ?? lifecycle.recoveryAttempt ?? 0),
    retryClassification: Object.prototype.hasOwnProperty.call(details, "retryClassification") ? details.retryClassification : lifecycle.retryClassification ?? null,
    ...(details.moduleId ? { moduleId: details.moduleId } : {}),
    ...(details.moduleLabel ? { moduleLabel: details.moduleLabel } : {}),
  };
  appendLifecycleEvent(manifest, {
    at,
    stage: details.stage ?? lifecycle.phase ?? "lifecycle",
    status: details.status ?? "transition",
    lifecycleState: state,
    attempt: manifest.lifecycle.attempt,
    detail: details.detail ?? null,
    ...(details.metrics ? { metrics: details.metrics } : {}),
  });
  return manifest.lifecycle;
}
