#!/usr/bin/env node


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {verifyHandoff} from "./html-handoff.mjs";
import crypto from "node:crypto";
import { computeHtmlSourceFingerprint } from "./html-visual-contract.mjs";
import { parseArgs, readJson, writeJson } from "./pixso-native-scene-lib.mjs";
import { validateCaptureBundle } from "./pixso-capture-bundle.mjs";

const digestFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 24);

export function validateImportRun({ runManifest, visualManifest, operationPlan = null, pluginResult = null, captureBundle = null, captureBundlePath = null }) {
  const failures = [];
  const warnings = [];
  if (runManifest?.kind !== "text-to-ui-pixso-import-run" || Number(runManifest.schemaVersion ?? 0) < 1) failures.push("invalid run manifest");
  const expectedRunId = runManifest?.runId;
  const expectedFingerprint = runManifest?.source?.htmlSourceFingerprint;
  const expectedViewport = runManifest?.viewport ?? {};
  if (!expectedRunId) failures.push("run manifest has no runId");
  if (!expectedFingerprint) failures.push("run manifest has no HTML source fingerprint");
  const mode = runManifest?.executionPolicy?.mode ?? "normal";
  if (mode === "normal" && runManifest?.executionPolicy) {
    if (runManifest?.executionPolicy?.visualBaseline !== "disabled-use-current-browser-screenshot") failures.push("normal import must disable the code-to-design baseline");
    if (Number(runManifest?.telemetry?.codeToDesignCalls ?? 0) !== 0) failures.push("normal import must not call code_to_design");
    if (runManifest?.pixsoArtifacts?.diagnosticVisualBaselineNodeId) failures.push("normal import contains a diagnostic baseline node");
  }
  if(runManifest?.source?.handoff){
    try{const ref=runManifest.source.handoff;const bytes=fs.readFileSync(ref.path);if(crypto.createHash("sha256").update(bytes).digest("hex")!==ref.sha256)throw new Error("accepted handoff changed");verifyHandoff({projectRoot:runManifest.source.htmlRoot,handoffPath:ref.path});}
    catch(error){failures.push("Handoff integrity failed: "+error.message);}
  }
  if (runManifest?.source?.htmlRoot && fs.existsSync(runManifest.source.htmlRoot)) {
    const currentFingerprint = computeHtmlSourceFingerprint(runManifest.source.htmlRoot,{entry:runManifest.source.entry||"index.html",observedLocalFiles:runManifest.source.observedLocalFiles||[]});
    if (currentFingerprint !== expectedFingerprint) failures.push("HTML source changed after import run initialization; start a new run");
  }
  for (const [label, input] of Object.entries(runManifest?.inputs ?? {})) {
    if (!input?.path || !input?.sha256) continue;
    if (!fs.existsSync(input.path)) {
      failures.push(`${label} input is missing after import run initialization`);
      continue;
    }
    if (digestFile(input.path) !== input.sha256) failures.push(`${label} changed during import; stop this run and start a new one`);
  }
  if (visualManifest?.kind !== "text-to-ui-html-visual-manifest" || Number(visualManifest?.schemaVersion || 0) < 3) failures.push("visual manifest must use schemaVersion 3");
  if (visualManifest?.source !== "browser-computed-visual-manifest") failures.push("visual manifest is not browser computed");
  if (visualManifest?.runId !== expectedRunId) failures.push("visual manifest runId mismatch");
  if (visualManifest?.htmlSourceFingerprint !== expectedFingerprint) failures.push("visual manifest HTML fingerprint mismatch");
  if (visualManifest?.viewport?.width !== expectedViewport.width || visualManifest?.viewport?.height !== expectedViewport.height) failures.push("visual manifest viewport mismatch");
  if (Math.abs(Number(visualManifest?.viewport?.zoom || 0) - 1) > 0.01) failures.push("browser zoom must be 1.0");
  if (!Array.isArray(visualManifest?.nodes) || visualManifest.nodes.length === 0) failures.push("visual manifest has no visible nodes");
  if (visualManifest?.nodeCount !== visualManifest?.nodes?.length) failures.push("visual manifest nodeCount mismatch");
  const selectors = new Set();
  for (const [index, node] of (visualManifest?.nodes ?? []).entries()) {
    if (!node?.selector || node.selector.includes("undefined")) failures.push(`visual node ${index} has no stable selector`);
    if (!node?.rect || !Number.isFinite(node.rect.width) || !Number.isFinite(node.rect.height) || node.rect.width <= 0 || node.rect.height <= 0) failures.push(`visual node ${index} has invalid geometry`);
    if (!node?.style || typeof node.style !== "object") failures.push(`visual node ${index} has no computed style`);
    for (const selector of [node?.selector, ...(Array.isArray(node?.selectorAliases) ? node.selectorAliases : [])]) {
      if (selector) selectors.add(selector);
    }
  }
  if (runManifest?.executionPolicy?.captureBundle === "required") {
    const capture = validateCaptureBundle({ runManifest, visualManifest, bundle: captureBundle, bundlePath: captureBundlePath });
    if (!capture.ok) failures.push(...capture.failures.map((failure) => `capture bundle: ${failure}`));
    warnings.push(...capture.warnings.map((warning) => `capture bundle: ${warning}`));
  }
  if (operationPlan) {
    if (operationPlan.kind !== "pixso-operation-plan") failures.push("invalid operation plan");
    const provenance = operationPlan.execution?.importRun;
    if (!provenance) failures.push("operation plan has no importRun provenance");
    if (provenance?.runId !== expectedRunId) failures.push("operation plan runId mismatch");
    if (provenance?.htmlSourceFingerprint !== expectedFingerprint) failures.push("operation plan HTML fingerprint mismatch");
    if (operationPlan.page?.htmlSourceFingerprint !== expectedFingerprint) failures.push("operation plan page HTML fingerprint mismatch");
    if (operationPlan.page?.visualSnapshot?.htmlSourceFingerprint !== expectedFingerprint) failures.push("operation plan visual snapshot fingerprint mismatch");
    if (provenance?.visualManifestSource !== "browser-computed-visual-manifest") failures.push("operation plan is not based on the browser visual manifest");
    const planViewport = operationPlan.page?.viewport ?? {};
    if (planViewport.width !== expectedViewport.width || planViewport.height !== expectedViewport.height) failures.push("operation plan viewport mismatch");
    if (mode === "normal" && runManifest?.executionPolicy) {
      if (operationPlan.execution?.visualReconciliation?.source !== "browser-computed-visual-manifest") failures.push("normal operation plan did not reconcile browser-computed layout and style");
      if (operationPlan.execution?.visualReconciliation?.staleSceneFallback !== "forbidden") failures.push("normal operation plan allows stale Scene fallback");
      if (Number(operationPlan.execution?.visualReconciliation?.reconciledNodeCount ?? 0) <= 0) failures.push("normal operation plan reconciled no browser nodes");
    }
    const layoutOperations = (operationPlan.operations ?? []).filter((operation) => ["layout", "component-enrichment"].includes(operation.phase) && operation.nodeId);
    if (layoutOperations.length === 0) failures.push("operation plan has no layout nodes");
    const invalidLegacyOptional = layoutOperations.filter((operation) => operation.metadata?.selectorOptional === true);
    if (invalidLegacyOptional.length) failures.push(`selectorOptional is deprecated and cannot remove ${invalidLegacyOptional.length} layout nodes from fidelity coverage`);
    const exemptOperations = layoutOperations.filter((operation) => operation.metadata?.visualEvidenceExempt === true && String(operation.metadata?.visualEvidenceExemptReason ?? "").trim());
    const invalidExemptions = layoutOperations.filter((operation) => operation.metadata?.visualEvidenceExempt === true && !String(operation.metadata?.visualEvidenceExemptReason ?? "").trim());
    if (invalidExemptions.length) failures.push(`${invalidExemptions.length} visual evidence exemptions have no explicit reason`);
    const requiredSelectorOperations = layoutOperations.filter((operation) => operation.metadata?.visualEvidenceExempt !== true);
    const sourced = requiredSelectorOperations.filter((operation) => operation.metadata?.htmlSelector && selectors.has(operation.metadata.htmlSelector));
    const coverage = requiredSelectorOperations.length ? sourced.length / requiredSelectorOperations.length : 0;
    const minimumCoverage = Number(operationPlan.execution?.importRun?.minimumSelectorCoverage ?? 0.8);
    const visuallyBacked = requiredSelectorOperations.filter((operation) => {
      const rect = operation.metadata?.htmlRect;
      return operation.metadata?.visualEvidenceSource === "browser-computed-visual-manifest"
        && rect && Number.isFinite(rect.width) && rect.width > 0 && Number.isFinite(rect.height) && rect.height > 0;
    });
    const visualEvidenceCoverage = requiredSelectorOperations.length ? visuallyBacked.length / requiredSelectorOperations.length : 0;
    const minimumVisualEvidenceCoverage = Number(operationPlan.execution?.importRun?.minimumVisualEvidenceCoverage ?? 0.95);
    if (exemptOperations.length > 0) warnings.push(`${exemptOperations.length} layout operations have explicit visual-evidence exemptions`);
    if (requiredSelectorOperations.length === 0) failures.push("operation plan has no selector-backed layout nodes");
    if (coverage < minimumCoverage) failures.push(`operation plan selector coverage ${(coverage * 100).toFixed(1)}% is below ${(minimumCoverage * 100).toFixed(1)}%`);
    if (visualEvidenceCoverage < minimumVisualEvidenceCoverage) failures.push(`operation plan browser geometry coverage ${(visualEvidenceCoverage * 100).toFixed(1)}% is below ${(minimumVisualEvidenceCoverage * 100).toFixed(1)}%`);
    for (const operation of layoutOperations) {
      if (operation.layout?.gap === null && ["HORIZONTAL", "VERTICAL"].includes(operation.layout?.direction) && (operationPlan.operations ?? []).filter((candidate) => candidate.parentId === operation.nodeId).length > 1) failures.push(`layout gap is unresolved: ${operation.nodeId}`);
      if (operation.style?.stroke && !Array.isArray(operation.style.strokeEdges)) failures.push(`stroke edges are not explicit: ${operation.nodeId}`);
    }
    const mappedInstances = layoutOperations.filter((operation) => operation.op === "create-instance");
    const mappedConformanceIssues = mappedInstances.filter((operation) => operation.metadata?.componentGeometryCompatibility?.ok === false);
    const repairableMappedConformanceIssues = mappedConformanceIssues.filter((operation) => operation.componentRef?.fallbackPolicy === "native-composition" || operation.metadata?.componentFallback?.fallback === "native-composition");
    const hardMappedConformanceIssues = mappedConformanceIssues.filter((operation) => !repairableMappedConformanceIssues.includes(operation));
    if (Number(operationPlan.summary?.mappedInstanceCount ?? mappedInstances.length) !== mappedInstances.length) failures.push("mapped component instance summary mismatch");
    if (repairableMappedConformanceIssues.length) warnings.push(`${repairableMappedConformanceIssues.length} mapped components will use native composition until their Pixso contract is repaired`);
    if (hardMappedConformanceIssues.length) failures.push(`${hardMappedConformanceIssues.length} mapped components require component-contract repair and have no safe native fallback`);
    if (Number(operationPlan.summary?.componentRepairCount ?? 0) > 0) warnings.push(`${operationPlan.summary.componentRepairCount} component mapping issue(s) recorded as post-import repair items`);
  }
  if (pluginResult) {
    if (pluginResult.runId !== expectedRunId) failures.push("plugin result runId mismatch");
    if (pluginResult.ok !== true) failures.push("plugin execution/readback did not pass");
    if ((pluginResult.result?.audit?.issues ?? pluginResult.audit?.issues ?? []).length) failures.push("plugin readback contains issues");
    const timing = pluginResult.result?.timing ?? pluginResult.timing;
    if (!timing || !Number.isFinite(Number(timing.totalMs))) warnings.push("plugin result has no total execution timing");
  }
  return { ok: failures.length === 0, runId: expectedRunId, failures, warnings };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const usage = "Usage: validate-pixso-import-run.mjs --run-manifest <json> --visual-manifest <json> [--capture-bundle <json>] [--operation-plan <json>] [--plugin-result <json>] [--out <json>]";
  if (args.help || !args["run-manifest"] || !args["visual-manifest"]) {
    if (!args.help) console.error(usage);
    process.exit(args.help ? 0 : 2);
  }
  const report = validateImportRun({
    runManifest: readJson(args["run-manifest"]),
    visualManifest: readJson(args["visual-manifest"]),
    captureBundle: args["capture-bundle"] ? readJson(args["capture-bundle"]) : null,
    captureBundlePath: args["capture-bundle"] ? args["capture-bundle"] : null,
    operationPlan: args["operation-plan"] ? readJson(args["operation-plan"]) : null,
    pluginResult: args["plugin-result"] ? readJson(args["plugin-result"]) : null
  });
  if (args.out) writeJson(args.out, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
