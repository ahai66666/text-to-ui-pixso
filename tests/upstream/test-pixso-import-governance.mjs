#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeHtmlSourceFingerprint } from "../../scripts/html-visual-contract.mjs";
import { PIXSO_PERMANENT_EXECUTOR_CAPABILITIES } from "../../scripts/pixso-native-scene-lib.mjs";

const scripts = fileURLToPath(new URL("../../scripts/",import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "text-to-ui-import-governance-"));
const htmlRoot = path.join(temporary, "html");
fs.mkdirSync(htmlRoot, { recursive: true });
fs.writeFileSync(path.join(htmlRoot, "index.html"), "<!doctype html><main id=app><img id=logo src=missing-logo.png></main>\n");

function writePngHeader(file, width, height) {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  fs.writeFileSync(file, png);
}

function createRun(name) {
  const runsRoot = path.join(temporary, name, "runs");
  const result = spawnSync(process.execPath, [
    path.join(scripts, "create-pixso-import-run.mjs"),
    "--html-root", htmlRoot,
    "--url", "http://127.0.0.1:43173/fixture/",
    "--runs-root", runsRoot,
    "--mode", "normal",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const created = JSON.parse(result.stdout);
  const manifest = JSON.parse(fs.readFileSync(created.manifest, "utf8"));
  const fingerprint = computeHtmlSourceFingerprint(htmlRoot);
  assert.equal(manifest.source.htmlSourceFingerprint, fingerprint);
  return { runsRoot, created, manifest };
}

function writeVisualArtifacts(run, { includeCapture = true } = {}) {
  const { manifest } = run;
  const visualManifest = {
    schemaVersion: 4,
    kind: "text-to-ui-html-visual-manifest",
    source: "browser-computed-visual-manifest",
    runId: manifest.runId,
    htmlSourceFingerprint: manifest.source.htmlSourceFingerprint,
    stateId: manifest.viewport.stateId,
    viewport: { width: manifest.viewport.width, height: manifest.viewport.height, devicePixelRatio: 1, zoom: 1 },
    nodeCount: 2,
    nodes: [
      { selector: "#app", rect: { x: 0, y: 0, width: manifest.viewport.width, height: manifest.viewport.height }, style: { display: "grid" } },
      { selector: "#logo", rect: { x: 8, y: 8, width: 32, height: 32 }, style: { display: "block" }, asset: { kind: "image", src: "missing-logo.png" } },
    ],
  };
  fs.writeFileSync(manifest.artifacts.visualManifest, `${JSON.stringify(visualManifest, null, 2)}\n`);
  writePngHeader(manifest.artifacts.htmlScreenshot, manifest.viewport.width, manifest.viewport.height);
  if (includeCapture) {
    const capture = spawnSync(process.execPath, [path.join(scripts, "pixso-capture-bundle.mjs"), "--run-manifest", run.created.manifest], { encoding: "utf8" });
    assert.equal(capture.status, 0, capture.stderr);
  }
  return visualManifest;
}

function writePlan(run, visualManifest, { invalidComponent = false, componentRepairItems = [] } = {}) {
  const { manifest } = run;
  const operations = [
    {
      op: "create-frame",
      phase: "layout",
      nodeId: "root",
      parentId: null,
      name: "Governance fixture",
      layout: { direction: "VERTICAL", width: "fill", height: "fill", gap: 0 },
      style: { fill: "surface/canvas" },
      metadata: { htmlSelector: "#app", htmlRect: visualManifest.nodes[0].rect, visualEvidenceSource: "browser-computed-visual-manifest" },
    },
  ];
  if (invalidComponent) {
    operations.push({
      op: "create-instance",
      phase: "layout",
      nodeId: "invalid-component",
      parentId: "root",
      name: "Invalid component",
      layout: { width: 40, height: 40 },
      style: {},
      metadata: { htmlSelector: "#logo", htmlRect: visualManifest.nodes[1].rect, visualEvidenceSource: "browser-computed-visual-manifest" },
      componentRef: null,
    });
  }
  const plan = {
    kind: "pixso-operation-plan",
    schemaVersion: 1,
    page: {
      name: "Governance fixture",
      viewport: { width: manifest.viewport.width, height: manifest.viewport.height },
      htmlSourceFingerprint: manifest.source.htmlSourceFingerprint,
      visualSnapshot: { source: "html-live-computed-style", htmlSourceFingerprint: manifest.source.htmlSourceFingerprint, viewport: visualManifest.viewport },
    },
    execution: {
      sourcePolicy: "fresh-build-current-html-no-history",
      visualReconciliation: { source: "browser-computed-visual-manifest", staleSceneFallback: "forbidden", reconciledNodeCount: visualManifest.nodeCount },
      importRun: {
        runId: manifest.runId,
        manifestPath: run.created.manifest,
        htmlSourceFingerprint: manifest.source.htmlSourceFingerprint,
        visualManifestPath: manifest.artifacts.visualManifest,
        visualManifestSource: visualManifest.source,
        minimumSelectorCoverage: 0.8,
        minimumVisualEvidenceCoverage: 0.95,
      },
    },
    summary: { mappedInstanceCount: invalidComponent ? 1 : 0, componentRepairCount: componentRepairItems.length, componentRepairItems },
    operations,
  };
  fs.writeFileSync(manifest.artifacts.operationPlan, `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

function runPreflight(run) {
  return spawnSync(process.execPath, [
    path.join(scripts, "preflight-pixso-import.mjs"),
    "--run-manifest", run.created.manifest,
    "--visual-manifest", run.manifest.artifacts.visualManifest,
    "--operation-plan", run.manifest.artifacts.operationPlan,
  ], { encoding: "utf8" });
}

function runOrchestratorPublish(run, bridgeStateDirectory) {
  return spawnSync(process.execPath, [
    path.join(scripts, "pixso-import-orchestrator.mjs"),
    "publish",
    "--run-manifest", run.created.manifest,
  ], {
    env: { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: bridgeStateDirectory },
    encoding: "utf8",
  });
}

function bridgeEnvironment(port, stateDirectory) {
  return {
    ...process.env,
    TEXT_TO_UI_PIXSO_BRIDGE_PORT: String(port),
    TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: stateDirectory,
    TEXT_TO_UI_PLUGIN_RECOVERY_AFTER_MS: "1000",
    TEXT_TO_UI_PLUGIN_START_DEADLINE_MS: "3000",
    TEXT_TO_UI_PLUGIN_CONNECTION_DEADLINE_MS: "3000",
    TEXT_TO_UI_MODULE_HEARTBEAT_TIMEOUT_MS: "90",
    TEXT_TO_UI_MODULE_NO_PROGRESS_TIMEOUT_MS: "300",
    TEXT_TO_UI_RESULT_ACK_DEADLINE_MS: "80",
    TEXT_TO_UI_PLUGIN_CLAIM_LEASE_MS: "1000",
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return { response, payload: await response.json().catch(() => ({})) };
}

async function waitFor(predicate, attempts = 1000, intervalMs = 10) {
  for (let index = 0; index < attempts; index += 1) {
    let result = null;
    try { result = await predicate(); } catch (_) {}
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

function permanentPlan(runId, manifestPath, idempotencyKey, name) {
  return {
    kind: "pixso-component-library-plan",
    page: { name },
    execution: {
      mode: "component-library",
      minimumRuntimeVersion: "5.0.0",
      agentContract: {
        protocolVersion: 4,
        planSchemaVersion: 5,
        minimumKernelVersion: "5.0.0",
        requiredCapabilities: PIXSO_PERMANENT_EXECUTOR_CAPABILITIES,
        executorProtocol: 1,
        idempotencyKey,
      },
      importRun: { runId, manifestPath },
    },
    operations: [],
  };
}

async function testBridgeTimeouts() {
  const stateDirectory = path.join(temporary, "bridge");
  const port = 47000 + Math.floor(Math.random() * 800);
  const env = bridgeEnvironment(port, stateDirectory);
  const bridge = spawn(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "serve"], { env, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    assert.equal(await waitFor(async () => (await fetch(`${base}/health`)).ok), true, "governed bridge did not start");
    const noClaimPlanPath = path.join(temporary, "no-claim-plan.json");
    fs.writeFileSync(noClaimPlanPath, `${JSON.stringify(permanentPlan("no-claim-run", path.join(temporary, "no-claim-manifest.json"), "no-claim-key", "No claim"), null, 2)}\n`);
    const shadowDirectory = path.join(temporary, "different-worktree-queue");
    const published = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", noClaimPlanPath], { env: { ...env, TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: shadowDirectory }, encoding: "utf8" });
    assert.equal(published.status, 0, published.stderr);
    assert.equal(fs.existsSync(path.join(shadowDirectory, "current-job.json")), false, "CLI must not create a shadow queue");
    assert.equal(JSON.parse(fs.readFileSync(path.join(stateDirectory, "current-job.json"))).jobId, JSON.parse(published.stdout).jobId);
    const recoveredThenStopped = await waitFor(async () => {
      const { payload } = await fetchJson(`${base}/job`);
      return payload.job?.status === "needs-attention" ? payload.job : null;
    });
    assert.ok(recoveredThenStopped, "a never-claimed job must reach needs-attention");
    assert.equal(recoveredThenStopped.blockingReason, "plugin-start-timeout");
    assert.equal(recoveredThenStopped.recoveryAttempt, 1, "connection recovery must happen exactly once");
    assert.equal(recoveredThenStopped.deliveryAttempt, 1);
    const blockedClaim = await fetchJson(`${base}/claim?after=&session=governance-plugin&runtime=5.0.0&protocol=4`);
    assert.equal(blockedClaim.payload.blocked, true);
    assert.equal(blockedClaim.payload.reason, "plugin-start-timeout");

    const runId = "heartbeat-timeout-run";
    const runsRoot = path.join(temporary, "heartbeat-runs");
    const runDirectory = path.join(runsRoot, runId);
    const manifestPath = path.join(runDirectory, "run-manifest.json");
    fs.mkdirSync(runDirectory, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      schemaVersion: 2,
      kind: "text-to-ui-pixso-import-run",
      runId,
      status: "running",
      createdAt: now,
      artifacts: {},
      timing: { startedAt: now, wallStartedAt: now, stages: { execute: { status: "in_progress", attempts: 1, startedAt: now, executor: "plugin" } }, events: [] },
      lifecycle: { state: "WAITING_FOR_PLUGIN", phase: "execute", attempt: 0, lastHeartbeatAt: now, deadline: null, blockingReason: null, nextAction: "wait-for-unified-plugin", recoveryAttempt: 0 },
      telemetry: {},
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runsRoot, "active-run.lock.json"), `${JSON.stringify({ schemaVersion: 1, kind: "text-to-ui-pixso-active-run-lock", runId, manifest: manifestPath }, null, 2)}\n`);
    const heartbeatPlanPath = path.join(temporary, "heartbeat-timeout-plan.json");
    fs.writeFileSync(heartbeatPlanPath, `${JSON.stringify(permanentPlan(runId, manifestPath, "heartbeat-timeout-key", "Heartbeat timeout"), null, 2)}\n`);
    await fetchJson(`${base}/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "governance-ready", runtimeVersion: "5.0.0", kernelVersion: "5.0.0", protocolVersion: 4, operationPlanVersions: [1, 5], capabilities: PIXSO_PERMANENT_EXECUTOR_CAPABILITIES }),
    });
    const secondPublish = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", heartbeatPlanPath], { env, encoding: "utf8" });
    assert.equal(secondPublish.status, 0, secondPublish.stderr);
    const claimed = await fetchJson(`${base}/claim?after=&session=governance-ready&runtime=5.0.0&protocol=4&capabilities=${encodeURIComponent(JSON.stringify(PIXSO_PERMANENT_EXECUTOR_CAPABILITIES))}`);
    assert.equal(claimed.payload.changed, true);
    const started = await fetchJson(`${base}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: claimed.payload.revision, claimToken: claimed.payload.claimToken, sessionId: "governance-ready" }),
    });
    assert.equal(started.payload.ok, true);
    const timedOut = await waitFor(async () => {
      const { payload } = await fetchJson(`${base}/job`);
      return payload.job?.status === "needs-attention" ? payload.job : null;
    });
    assert.ok(timedOut, "a running module without heartbeats must reach needs-attention");
    assert.equal(timedOut.blockingReason, "module-heartbeat-timeout");
    assert.equal(timedOut.cancelRequested, true);
    assert.equal(fs.existsSync(path.join(runsRoot, "active-run.lock.json")), false, "heartbeat timeout must release the run lock");
    const timedOutManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(timedOutManifest.status, "needs-attention");
    assert.equal(timedOutManifest.timing.stages.execute.status, "attention");
    assert.equal(timedOutManifest.lifecycle.blockingReason, "module-heartbeat-timeout");

    const noProgressStateDirectory = path.join(temporary, "bridge-no-progress");
    const noProgressPort = port + 1;
    const noProgressEnv = {
      ...env,
      TEXT_TO_UI_PIXSO_BRIDGE_PORT: String(noProgressPort),
      TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: noProgressStateDirectory,
      TEXT_TO_UI_MODULE_HEARTBEAT_TIMEOUT_MS: "300",
      TEXT_TO_UI_MODULE_NO_PROGRESS_TIMEOUT_MS: "90",
    };
    const noProgressBridge = spawn(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "serve"], { env: noProgressEnv, stdio: "ignore" });
    const noProgressBase = `http://127.0.0.1:${noProgressPort}`;
    try {
      assert.equal(await waitFor(async () => (await fetch(`${noProgressBase}/health`)).ok), true, "no-progress bridge did not start");
      await fetchJson(`${noProgressBase}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "governance-ready", runtimeVersion: "5.0.0", kernelVersion: "5.0.0", protocolVersion: 4, operationPlanVersions: [1, 5], capabilities: PIXSO_PERMANENT_EXECUTOR_CAPABILITIES }),
      });
    const noProgressRunId = "no-progress-timeout-run";
    const noProgressRunsRoot = path.join(temporary, "no-progress-runs");
    const noProgressDirectory = path.join(noProgressRunsRoot, noProgressRunId);
    const noProgressManifestPath = path.join(noProgressDirectory, "run-manifest.json");
    fs.mkdirSync(noProgressDirectory, { recursive: true });
    const noProgressNow = new Date().toISOString();
    fs.writeFileSync(noProgressManifestPath, `${JSON.stringify({
      schemaVersion: 2,
      kind: "text-to-ui-pixso-import-run",
      runId: noProgressRunId,
      status: "running",
      createdAt: noProgressNow,
      artifacts: {},
      timing: { startedAt: noProgressNow, wallStartedAt: noProgressNow, stages: { execute: { status: "in_progress", attempts: 1, startedAt: noProgressNow, executor: "plugin" } }, events: [] },
      lifecycle: { state: "WAITING_FOR_PLUGIN", phase: "execute", attempt: 0, lastHeartbeatAt: noProgressNow, deadline: null, blockingReason: null, nextAction: "wait-for-unified-plugin", recoveryAttempt: 0 },
      telemetry: {},
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(noProgressRunsRoot, "active-run.lock.json"), `${JSON.stringify({ schemaVersion: 1, kind: "text-to-ui-pixso-active-run-lock", runId: noProgressRunId, manifest: noProgressManifestPath }, null, 2)}\n`);
    const noProgressPlanPath = path.join(temporary, "no-progress-timeout-plan.json");
    fs.writeFileSync(noProgressPlanPath, `${JSON.stringify(permanentPlan(noProgressRunId, noProgressManifestPath, "no-progress-timeout-key", "No progress timeout"), null, 2)}\n`);
    const thirdPublish = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", noProgressPlanPath], { env: noProgressEnv, encoding: "utf8" });
    assert.equal(thirdPublish.status, 0, thirdPublish.stderr);
    const noProgressClaim = await fetchJson(`${noProgressBase}/claim?after=&session=governance-ready&runtime=5.0.0&protocol=4&capabilities=${encodeURIComponent(JSON.stringify(PIXSO_PERMANENT_EXECUTOR_CAPABILITIES))}`);
    assert.equal(noProgressClaim.payload.changed, true);
    const noProgressStart = await fetchJson(`${noProgressBase}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: noProgressClaim.payload.revision, claimToken: noProgressClaim.payload.claimToken, sessionId: "governance-ready" }),
    });
    assert.equal(noProgressStart.payload.ok, true);
    const reportHeartbeat = (progress) => fetchJson(`${noProgressBase}/progress`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: noProgressClaim.payload.revision, progress }),
    });
    await reportHeartbeat({ id: "shell", label: "No progress fixture", phase: "module", completedOperations: 0, operationCount: 4 });
    const heartbeatUntil = Date.now() + 130;
    while (Date.now() < heartbeatUntil) {
      await reportHeartbeat({ id: "shell", label: "No progress fixture", phase: "heartbeat", completedOperations: 0, operationCount: 4 });
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const noProgressTimedOut = await waitFor(async () => {
      const { payload } = await fetchJson(`${noProgressBase}/job`);
      return payload.job?.status === "needs-attention" ? payload.job : null;
    });
    assert.ok(noProgressTimedOut, "a module with heartbeats but no operation progress must reach needs-attention");
    assert.equal(noProgressTimedOut.blockingReason, "module-no-progress-timeout");
    assert.equal(noProgressTimedOut.cancelRequested, true);
    assert.equal(fs.existsSync(path.join(noProgressRunsRoot, "active-run.lock.json")), false, "no-progress timeout must release the run lock");
    const noProgressManifest = JSON.parse(fs.readFileSync(noProgressManifestPath, "utf8"));
    assert.equal(noProgressManifest.status, "needs-attention");
    assert.equal(noProgressManifest.lifecycle.blockingReason, "module-no-progress-timeout");
    const cleanupAck = await fetchJson(`${noProgressBase}/result`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: noProgressClaim.payload.revision, runId: noProgressManifest.runId, ok: false, result: { cleanup: { status: "removed", draftId: "fixture-draft" } } }),
    });
    assert.equal(cleanupAck.payload.cleanupAcknowledged, true);
    const afterCleanup = (await fetchJson(`${noProgressBase}/job`)).payload.job;
    assert.equal(afterCleanup.status, "needs-attention", "cleanup confirmation must not revive a timed-out run");
    assert.equal(afterCleanup.cleanup.status, "removed");
    } finally {
      noProgressBridge.kill("SIGTERM");
    }
  } finally {
    bridge.kill("SIGTERM");
  }
}

try {
  const resourceRun = createRun("resource-repair");
  const resourceVisualManifest = writeVisualArtifacts(resourceRun);
  writePlan(resourceRun, resourceVisualManifest);
  const resourcePreflight = runPreflight(resourceRun);
  assert.equal(resourcePreflight.status, 0, resourcePreflight.stderr);
  const resourceReport = JSON.parse(resourcePreflight.stdout);
  assert.equal(resourceReport.ok, true);
  assert.equal(resourceReport.metrics.assetRepairCount, 1, "a missing logo must become a repair item");
  assert.equal(resourceReport.assetRepairItems[0].placeholderPolicy, "retain-measured-box");
  assert.equal(resourceReport.assetRepairItems[0].rect.width, 32);
  assert.equal(fs.existsSync(path.join(resourceRun.runsRoot, "active-run.lock.json")), true, "a warning-only preflight keeps the current run auditable");
  assert.equal(fs.existsSync(path.join(resourceRun.runsRoot, "current-job.json")), false, "preflight must not create a Bridge queue job");

  const componentFallbackRun = createRun("component-fallback");
  const componentFallbackVisualManifest = writeVisualArtifacts(componentFallbackRun);
  writePlan(componentFallbackRun, componentFallbackVisualManifest, {
    componentRepairItems: [{ sourceIndex: 9, selector: ".tui-component.tui-item", logicalName: "List Item/White Surface/Default", reason: "mapping-unavailable", fallback: "native-composition", blocksImport: false }],
  });
  const componentFallbackPreflight = runPreflight(componentFallbackRun);
  assert.equal(componentFallbackPreflight.status, 0, componentFallbackPreflight.stderr);
  const componentFallbackReport = JSON.parse(componentFallbackPreflight.stdout);
  assert.equal(componentFallbackReport.ok, true, "a repairable Item mapping must not block structure import");
  assert.equal(componentFallbackReport.metrics.componentRepairCount, 1);
  assert.equal(componentFallbackReport.componentRepairItems[0].fallback, "native-composition");
  assert.match(componentFallbackReport.nextAction, /publish-structure/);

  const captureRun = createRun("missing-capture");
  const captureVisualManifest = writeVisualArtifacts(captureRun, { includeCapture: false });
  writePlan(captureRun, captureVisualManifest);
  const missingCapture = runPreflight(captureRun);
  assert.notEqual(missingCapture.status, 0);
  const missingCaptureReport = JSON.parse(missingCapture.stdout);
  assert.equal(missingCaptureReport.ok, false);
  assert.equal(missingCaptureReport.blockingIssues.some((issue) => issue.classification === "capture-bundle"), true);
  const captureManifest = JSON.parse(fs.readFileSync(captureRun.created.manifest, "utf8"));
  assert.equal(captureManifest.status, "initialized", "the standalone preflight command must not mutate the run before orchestration records the failure");
  const captureBridgeState = path.join(temporary, "missing-capture-bridge");
  const orchestratedMissingCapture = runOrchestratorPublish(captureRun, captureBridgeState);
  assert.notEqual(orchestratedMissingCapture.status, 0, "missing capture must fail before publication");
  assert.match(orchestratedMissingCapture.stderr, /no Bridge job was published/);
  const orchestratedCaptureManifest = JSON.parse(fs.readFileSync(captureRun.created.manifest, "utf8"));
  assert.equal(orchestratedCaptureManifest.status, "failed");
  assert.equal(orchestratedCaptureManifest.lifecycle.blockingReason, "preflight-capture-bundle");
  assert.equal(fs.existsSync(path.join(captureRun.runsRoot, "active-run.lock.json")), false, "deterministic preflight failure must release the run lock");
  assert.equal(fs.existsSync(path.join(captureBridgeState, "current-job.json")), false, "deterministic preflight failure must not create a Bridge job");

  const contractRun = createRun("component-contract");
  const contractVisualManifest = writeVisualArtifacts(contractRun);
  writePlan(contractRun, contractVisualManifest, { invalidComponent: true });
  const contractPreflight = runPreflight(contractRun);
  assert.notEqual(contractPreflight.status, 0);
  const contractReport = JSON.parse(contractPreflight.stdout);
  assert.equal(contractReport.blockingIssues.some((issue) => issue.classification === "component-contract"), true);
  assert.equal(fs.existsSync(path.join(contractRun.runsRoot, "current-job.json")), false);
  const contractBridgeState = path.join(temporary, "component-contract-bridge");
  const orchestratedContract = runOrchestratorPublish(contractRun, contractBridgeState);
  assert.notEqual(orchestratedContract.status, 0, "component contract failure must fail before publication");
  assert.match(orchestratedContract.stderr, /no Bridge job was published/);
  const orchestratedContractManifest = JSON.parse(fs.readFileSync(contractRun.created.manifest, "utf8"));
  assert.equal(orchestratedContractManifest.status, "failed");
  assert.equal(orchestratedContractManifest.lifecycle.blockingReason, "preflight-component-contract");
  assert.equal(fs.existsSync(path.join(contractBridgeState, "current-job.json")), false);

  await testBridgeTimeouts();
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log("Pixso import governance tests passed: resource repair, deterministic preflight blocking, bounded reconnect, startup timeout, module heartbeat timeout, module no-progress timeout, and lock release are deterministic.");
