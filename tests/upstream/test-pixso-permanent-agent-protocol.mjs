#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PIXSO_PERMANENT_EXECUTOR_CAPABILITIES } from "../../scripts/pixso-native-scene-lib.mjs";

const scripts = fileURLToPath(new URL("../../scripts/",import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "text-to-ui-agent-v5-"));
const stateDirectory = path.join(temporary, "bridge");
const planPath = path.join(temporary, "plan.json");
const runsRoot = path.join(temporary, "runs");
const runId = "agent-v5-fixture-run";
const runDirectory = path.join(runsRoot, runId);
const runManifestPath = path.join(runDirectory, "run-manifest.json");
const pluginResultPath = path.join(runDirectory, "pixso-plugin-result.json");
fs.mkdirSync(runDirectory, { recursive: true });
fs.writeFileSync(runManifestPath, `${JSON.stringify({
  schemaVersion: 2,
  kind: "text-to-ui-pixso-import-run",
  runId,
  status: "running",
  createdAt: new Date().toISOString(),
  artifacts: { pluginResult: pluginResultPath },
  executionPolicy: { mode: "normal" },
  timing: {
    startedAt: new Date().toISOString(),
    wallStartedAt: new Date().toISOString(),
    stages: { execute: { status: "in_progress", attempts: 1, startedAt: new Date().toISOString(), executor: "plugin" } },
    events: [],
  },
  gates: { pluginReadback: "pending", componentAndVariableParity: "pending" },
}, null, 2)}\n`);
fs.writeFileSync(path.join(runsRoot, "active-run.lock.json"), `${JSON.stringify({ schemaVersion: 1, kind: "text-to-ui-pixso-active-run-lock", runId, manifest: runManifestPath }, null, 2)}\n`);
const port = 47500 + Math.floor(Math.random() * 400);
const env = { ...process.env, TEXT_TO_UI_PIXSO_BRIDGE_PORT: String(port), TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR: stateDirectory };
const plan = {
  kind: "pixso-component-library-plan",
  page: { name: "AgentV5Fixture" },
  execution: {
    mode: "component-library",
    minimumRuntimeVersion: "5.0.0",
    agentContract: {
      protocolVersion: 4,
      planSchemaVersion: 5,
      minimumKernelVersion: "5.0.0",
      requiredCapabilities: PIXSO_PERMANENT_EXECUTOR_CAPABILITIES,
      executorProtocol: 1,
      idempotencyKey: "agent-v5-fixture",
    },
    importRun: { runId, manifestPath: runManifestPath },
  },
  operations: [],
};
fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
const bridge = spawn(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "serve"], { env, stdio: "ignore" });
const waitForBridge = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return true; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
};
const hello = (capabilities) => fetch(`http://127.0.0.1:${port}/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: "agent-v5", runtimeVersion: "5.0.0", kernelVersion: "5.0.0", protocolVersion: 4, operationPlanVersions: [1, 5], capabilities }),
});

try {
  assert.equal(await waitForBridge(), true);
  const unsupportedPlanPath = path.join(temporary, "unsupported-permanent-executor-plan.json");
  fs.writeFileSync(unsupportedPlanPath, `${JSON.stringify({
    ...plan,
    execution: { ...plan.execution, agentContract: { ...plan.execution.agentContract, idempotencyKey: "agent-v5-unsupported-operation" } },
    operations: [{ op: "future-plugin-only-operation", nodeId: "future" }],
  }, null, 2)}\n`);
  const unsupported = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", unsupportedPlanPath], { env, encoding: "utf8" });
  assert.notEqual(unsupported.status, 0, "a compiler must not publish an operation outside the installed executor vocabulary");
  assert.match(unsupported.stderr, /Permanent Executor v1 does not support operation/);
  const publish = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", planPath], { env, encoding: "utf8" });
  assert.equal(publish.status, 0, publish.stderr);
  assert.equal(JSON.parse(publish.stdout).queued, true);

  await hello(["node.create"]);
  const blocked = await (await fetch(`http://127.0.0.1:${port}/claim?after=&session=agent-v5&runtime=5.0.0&protocol=4`)).json();
  assert.equal(blocked.reason, "plugin-capability-mismatch");
  assert.ok(blocked.missingCapabilities.includes("executor.data-plan.v1"));

  await hello(PIXSO_PERMANENT_EXECUTOR_CAPABILITIES);
  const recovered = await (await fetch(`http://127.0.0.1:${port}/claim?after=&session=agent-v5&runtime=5.0.0&protocol=4`)).json();
  assert.equal(recovered.changed, true);
  assert.equal(recovered.plan.execution.agentContract.planSchemaVersion, 5);
  assert.ok(recovered.claimToken, "claim must return a short-lived start token");
  const claimedJob = await (await fetch(`http://127.0.0.1:${port}/job`)).json();
  assert.equal(claimedJob.job.status, "claimed", "polling alone must not mark an import as running");
  const invalidStart = await (await fetch(`http://127.0.0.1:${port}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision: recovered.revision, claimToken: "wrong", sessionId: "agent-v5" }),
  })).json();
  assert.equal(invalidStart.ok, false, "a stale poll must not be able to start an import");
  const started = await (await fetch(`http://127.0.0.1:${port}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision: recovered.revision, claimToken: recovered.claimToken, sessionId: "agent-v5" }),
  })).json();
  assert.equal(started.ok, true);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/job`)).json()).job.status, "running");

  const resultPosted = await (await fetch(`http://127.0.0.1:${port}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      revision: recovered.revision,
      runId,
      ok: true,
      result: { phase: "modular-readback", timing: { totalMs: 25 }, audit: { issues: [], iconFailures: [], imageFailures: [] } },
    }),
  })).json();
  assert.equal(resultPosted.ok, true);
  assert.equal(resultPosted.runSync.runStatus, "running");
  const syncedRun = JSON.parse(fs.readFileSync(runManifestPath, "utf8"));
  assert.equal(syncedRun.timing.stages.execute.status, "passed", "plugin result must close the execute stage automatically");
  assert.equal(syncedRun.timing.stages.readback.status, "passed", "plugin readback must be persisted automatically");
  assert.equal(syncedRun.gates.pluginReadback, "passed");
  assert.equal(syncedRun.gates.componentAndVariableParity, "passed");
  assert.ok(Number.isFinite(syncedRun.timing.wallElapsedMs), "wall-clock timing must be persisted separately from plugin work");
  assert.equal(syncedRun.timing.breakdownMs.executeWork, 25, "execute work timing must use plugin-reported work");
  assert.ok(Number.isFinite(syncedRun.timing.breakdownMs.executeOrchestration), "orchestration timing must be persisted separately");

  const terminalReplay = await (await fetch(`http://127.0.0.1:${port}/claim?after=&session=agent-v5-reloaded&runtime=5.0.0&protocol=4`)).json();
  assert.equal(terminalReplay.changed, false, "a reloaded plugin must not replay a completed publication");
  assert.equal(terminalReplay.completed, true);

  const duplicate = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", planPath], { env, encoding: "utf8" });
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(JSON.parse(duplicate.stdout).reused, true);

  const cancelPlanPath = path.join(temporary, "cancel-plan.json");
  fs.writeFileSync(cancelPlanPath, `${JSON.stringify({
    ...plan,
    page: { name: "AgentV5CancelledFixture" },
    execution: {
      ...plan.execution,
      importRun: undefined,
      agentContract: { ...plan.execution.agentContract, idempotencyKey: "agent-v5-cancel-fixture" },
    },
  }, null, 2)}\n`);
  const cancelPublish = spawnSync(process.execPath, [path.join(scripts, "pixso-plugin-bridge.mjs"), "publish", cancelPlanPath], { env, encoding: "utf8" });
  assert.equal(cancelPublish.status, 0, cancelPublish.stderr);
  const cancel = await (await fetch(`http://127.0.0.1:${port}/cancel`, { method: "POST" })).json();
  assert.equal(cancel.cancelRequested, true);
  const heartbeat = await (await hello(PIXSO_PERMANENT_EXECUTOR_CAPABILITIES)).json();
  assert.equal(heartbeat.cancelRequested, true);
  const cancelledClaim = await (await fetch(`http://127.0.0.1:${port}/claim?after=&session=agent-v5&runtime=5.0.0&protocol=4`)).json();
  assert.equal(cancelledClaim.changed, false, "a cancelled queued publication must never execute after reconnect");
  assert.equal(cancelledClaim.reason, "publication-cancelled");
} finally {
  bridge.kill("SIGTERM");
  fs.rmSync(temporary, { recursive: true, force: true });
}

console.log("Pixso Permanent Agent protocol tests passed: queue, capability negotiation, reconnect, durable result sync, terminal replay protection, idempotency, and cancellation are deterministic.");
