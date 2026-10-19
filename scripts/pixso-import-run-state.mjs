import fs from "node:fs";
import path from "node:path";
import {
  IMPORT_LIFECYCLE_STATES,
  TERMINAL_RUN_STATUSES as GOVERNED_TERMINAL_RUN_STATUSES,
  transitionRunLifecycle,
} from "./pixso-import-governance.mjs";

export const TERMINAL_RUN_STATUSES = new Set(GOVERNED_TERMINAL_RUN_STATUSES);
export const ACTIVE_RUN_LOCK = "active-run.lock.json";

function readJsonIfPresent(file) {
  if (!file || !fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_) { return null; }
}

export function describeActiveRun(runsRoot) {
  const root = path.resolve(runsRoot);
  const lockPath = path.join(root, ACTIVE_RUN_LOCK);
  const currentPath = path.join(root, "current-run.json");
  const lock = readJsonIfPresent(lockPath);
  const current = readJsonIfPresent(currentPath);
  const manifestPath = lock?.manifest || current?.manifest || null;
  const manifest = readJsonIfPresent(manifestPath);
  const runId = lock?.runId || current?.runId || manifest?.runId || null;
  const status = manifest?.status || (lock ? "unknown" : null);
  return {
    active: Boolean(runId && !TERMINAL_RUN_STATUSES.has(status)),
    runId,
    status,
    manifestPath,
    lockPath,
    currentPath,
    lock,
    manifest,
  };
}

export function acquireActiveRunLock({ runsRoot, runId, manifestPath }) {
  const root = path.resolve(runsRoot);
  fs.mkdirSync(root, { recursive: true });
  const existing = describeActiveRun(root);
  if (existing.active && existing.runId !== runId) {
    throw new Error(`Another Pixso import run is active: ${existing.runId} (${existing.status}). Finish or explicitly cancel it before starting a new run.`);
  }
  if (fs.existsSync(existing.lockPath)) {
    if (existing.runId === runId) return existing.lockPath;
    fs.unlinkSync(existing.lockPath);
  }
  const payload = {
    schemaVersion: 1,
    kind: "text-to-ui-pixso-active-run-lock",
    runId,
    manifest: path.resolve(manifestPath),
    acquiredAt: new Date().toISOString(),
  };
  const descriptor = fs.openSync(existing.lockPath, "wx");
  try { fs.writeFileSync(descriptor, `${JSON.stringify(payload, null, 2)}\n`); }
  finally { fs.closeSync(descriptor); }
  return existing.lockPath;
}

export function releaseActiveRunLock({ runsRoot, runId }) {
  const root = path.resolve(runsRoot);
  const lockPath = path.join(root, ACTIVE_RUN_LOCK);
  const lock = readJsonIfPresent(lockPath);
  if (!lock || lock.runId !== runId) return false;
  fs.unlinkSync(lockPath);
  return true;
}

export function cancelActiveRun({ runsRoot, reason = "explicitly cancelled before a fresh import" }) {
  const state = describeActiveRun(runsRoot);
  if (!state.active || !state.manifestPath || !state.manifest) throw new Error("No active Pixso import run is available to cancel");
  const now = new Date().toISOString();
  state.manifest.status = "cancelled";
  state.manifest.cancelledAt = now;
  state.manifest.cancellationReason = reason;
  state.manifest.timing = state.manifest.timing ?? { stages: {}, events: [] };
  state.manifest.timing.events = state.manifest.timing.events ?? [];
  transitionRunLifecycle(state.manifest, IMPORT_LIFECYCLE_STATES.FAILED, {
    at: now,
    stage: "lifecycle",
    status: "cancelled",
    phase: state.manifest.lifecycle?.phase ?? "lifecycle",
    blockingReason: "user-cancelled",
    retryClassification: "cancelled",
    nextAction: "start-new-run",
    deadline: null,
    lastHeartbeatAt: now,
    detail: reason,
  });
  const wallStarted = Date.parse(state.manifest.timing.wallStartedAt ?? state.manifest.createdAt ?? now);
  const wallEnded = Date.parse(now);
  state.manifest.timing.wallElapsedMs = Number.isFinite(wallStarted) && Number.isFinite(wallEnded)
    ? Math.max(0, wallEnded - wallStarted)
    : null;
  state.manifest.timing.elapsedMs = Object.values(state.manifest.timing.stages ?? {})
    .reduce((sum, entry) => sum + (Number(entry?.workElapsedMs) || 0), 0);
  fs.writeFileSync(state.manifestPath, `${JSON.stringify(state.manifest, null, 2)}\n`);
  releaseActiveRunLock({ runsRoot, runId: state.runId });
  return { runId: state.runId, manifest: state.manifestPath, status: "cancelled", reason };
}
