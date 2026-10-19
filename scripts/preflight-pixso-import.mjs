#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, readJson, writeJson } from "./pixso-native-scene-lib.mjs";
import { validateImportRun } from "./validate-pixso-import-run.mjs";
import {
  MAX_RESOURCE_RETRIES,
  classifyPreflightFailure,
  retryPolicyFor,
} from "./pixso-import-governance.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: preflight-pixso-import.mjs --run-manifest <json> --visual-manifest <json> --operation-plan <json> [--out <json>]";
if (args.help || !args["run-manifest"] || !args["visual-manifest"] || !args["operation-plan"]) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const startedAt = Date.now();
const manifestPath = path.resolve(args["run-manifest"]);
const visualManifestPath = path.resolve(args["visual-manifest"]);
const operationPlanPath = path.resolve(args["operation-plan"]);
const runManifest = readJson(manifestPath);
const visualManifest = readJson(visualManifestPath);
const operationPlan = readJson(operationPlanPath);
const captureBundlePath = runManifest.artifacts?.captureBundle ? path.resolve(runManifest.artifacts.captureBundle) : null;

function dedupe(items, key = (item) => JSON.stringify(item)) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function componentContractFailures(plan) {
  if (plan?.kind !== "pixso-operation-plan") return [];
  const failures = [];
  for (const operation of plan.operations ?? []) {
    if (operation.op !== "create-instance") continue;
    const ref = operation.componentRef;
    const label = operation.nodeId ?? operation.metadata?.htmlSelector ?? "unknown-instance";
    if (!ref?.logicalName || !ref?.pixsoName || !ref?.componentSetName || !ref?.variant || typeof ref.variant !== "object" || Object.keys(ref.variant).length === 0) {
      failures.push(`component contract missing for ${label}`);
    }
    if (operation.metadata?.componentGeometryCompatibility?.ok === false) {
      failures.push(`component contract geometry mismatch for ${label}: ${(operation.metadata.componentGeometryCompatibility.reasons ?? []).join(", ")}`);
    }
  }
  return failures;
}

function componentFactFailures(plan, runManifest) {
  if (plan?.kind !== "pixso-operation-plan") return { failures: [], repairItems: [] };
  const mappedOperations = (plan.operations ?? []).filter((operation) => operation.op === "create-instance" && operation.componentRef?.availability !== "native-only");
  // Pages made entirely from browser-preserving native fallbacks do not need
  // a Pixso component-facts snapshot in order to publish their structure.
  if (!mappedOperations.length) return { failures: [], repairItems: [] };
  const factsPath = runManifest.inputs?.componentFacts?.path;
  if (!factsPath || !fs.existsSync(factsPath)) return { failures: ["Pixso component facts snapshot is missing; sync component facts before publishing"], repairItems: [] };
  let facts;
  try { facts = readJson(factsPath); }
  catch (error) { return { failures: [`Pixso component facts snapshot is invalid: ${error.message}`], repairItems: [] }; }
  const targets = new Map();
  for (const item of [...(facts.componentSets ?? []), ...(facts.standaloneComponents ?? [])]) {
    const name = typeof item === "string" ? item : item?.name;
    if (name) targets.set(String(name), typeof item === "string" ? { name } : item);
  }
  const failures = [];
  const repairItems = [];
  for (const operation of mappedOperations) {
    const ref = operation.componentRef;
    const label = operation.nodeId ?? operation.metadata?.htmlSelector ?? "unknown-instance";
    const targetName = ref?.componentSetName ?? ref?.pixsoName;
    if (!targetName) continue;
    const target = targets.get(String(targetName));
    if (!target) {
      const message = `component facts target missing for ${label}: ${targetName}`;
      if (operation.componentRef?.fallbackPolicy === "native-composition") {
        repairItems.push({ kind: "component-facts", nodeId: label, logicalName: ref.logicalName, targetName, requestedVariant: ref.variant ?? {}, reason: "target-missing", message, fallback: "native-composition", blocksImport: false });
      } else failures.push(message);
      continue;
    }
    const requestedVariant = ref.variant && typeof ref.variant === "object" ? ref.variant : {};
    const variants = Array.isArray(target.variants) ? target.variants : [];
    const exactVariant = variants.find((variant) => Object.entries(requestedVariant).every(([key, value]) => String(variant.variantProperties?.[key]) === String(value)));
    if (Object.keys(requestedVariant).length > 0 && !exactVariant) {
      const message = `component facts variant missing for ${label}: ${targetName} ${JSON.stringify(requestedVariant)}`;
      if (operation.componentRef?.fallbackPolicy === "native-composition") {
        repairItems.push({ kind: "component-facts", nodeId: label, logicalName: ref.logicalName, targetName, requestedVariant, reason: "variant-missing", message, fallback: "native-composition", blocksImport: false });
      } else failures.push(message);
    }
  }
  return { failures, repairItems };
}

function localResourcePath(src, htmlRoot) {
  const value = String(src ?? "").trim();
  if (!value || value.startsWith("data:") || value.startsWith("blob:")) return null;
  if (value.startsWith("file://")) {
    try { return path.resolve(fileURLToPath(new URL(value))); } catch (_) { return null; }
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  return path.resolve(htmlRoot, value.split(/[?#]/, 1)[0]);
}

async function fetchResource(src) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    let response = await fetch(src, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(src, { method: "GET", redirect: "follow", signal: controller.signal, headers: { range: "bytes=0-0" } });
    }
    return { ok: response.ok, status: response.status, statusText: response.statusText, finalUrl: response.url || src };
  } catch (error) {
    return { ok: false, status: null, statusText: error?.name === "AbortError" ? "timeout" : String(error?.message ?? error), finalUrl: src };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectAsset(node, htmlRoot) {
  const asset = node.asset;
  const src = asset?.kind === "image" ? asset.src : null;
  if (!src || String(src).startsWith("data:")) return null;
  const localPath = localResourcePath(src, htmlRoot);
  if (localPath) {
    if (fs.existsSync(localPath)) return null;
    return {
      selector: node.selector,
      nodeIndex: node.index,
      rect: node.rect,
      source: src,
      status: "missing-local-file",
      attempts: 1,
      retryCount: 0,
      error: `resource does not exist: ${localPath}`,
      recovery: "restore-resource-then-run-resource-repair",
      placeholderPolicy: "retain-measured-box",
    };
  }
  const first = await fetchResource(src);
  let result = first;
  let retryCount = 0;
  const transient = first.status === null || first.status >= 500;
  if (!first.ok && transient && MAX_RESOURCE_RETRIES > 0) {
    retryCount = 1;
    await new Promise((resolve) => setTimeout(resolve, 120));
    result = await fetchResource(src);
  }
  if (result.ok) return null;
  return {
    selector: node.selector,
    nodeIndex: node.index,
    rect: node.rect,
    source: src,
    status: result.status ?? "network-error",
    attempts: 1 + retryCount,
    retryCount,
    error: result.status ? `HTTP ${result.status} ${result.statusText ?? ""}`.trim() : result.statusText,
    recovery: "restore-resource-then-run-resource-repair",
    placeholderPolicy: "retain-measured-box",
  };
}

async function main() {
  const failures = [];
  const warnings = [];
  if (!fs.existsSync(runManifest.source?.htmlRoot ?? "")) failures.push("HTML source root is missing");
  const validation = validateImportRun({
    runManifest,
    visualManifest,
    operationPlan,
    captureBundlePath,
  });
  failures.push(...validation.failures);
  warnings.push(...validation.warnings);
  failures.push(...componentContractFailures(operationPlan));
  const componentFactCheck = componentFactFailures(operationPlan, runManifest);
  failures.push(...componentFactCheck.failures);
  const componentRepairItems = dedupe([
    ...(operationPlan.summary?.componentRepairItems ?? []),
    ...componentFactCheck.repairItems,
  ], (item) => `${item.sourceIndex ?? item.nodeId ?? "unknown"}|${item.reason}|${item.logicalName ?? ""}`);
  warnings.push(...componentRepairItems.map((item) => `component repair queued for ${item.logicalName ?? item.nodeId ?? "unknown"}: ${item.reason}; native composition retained`));

  const imageNodes = (visualManifest.nodes ?? []).filter((node) => node?.asset?.kind === "image" && node.asset.src);
  const assetResults = await Promise.all(imageNodes.map((node) => inspectAsset(node, runManifest.source?.htmlRoot ?? process.cwd())));
  const assetRepairItems = dedupe(assetResults.filter(Boolean), (item) => `${item.selector}|${item.source}`);
  const failureClasses = dedupe(failures.map((failure) => ({ message: failure, classification: classifyPreflightFailure(failure), retry: retryPolicyFor(classifyPreflightFailure(failure)) })), (item) => item.message);
  const elapsed = Date.now() - startedAt;
  const report = {
    schemaVersion: 1,
    kind: "text-to-ui-pixso-import-preflight-report",
    runId: runManifest.runId ?? null,
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    blockingIssues: failureClasses,
    warnings,
    assetRepairItems,
    componentRepairItems,
    retryPolicy: {
      deterministic: retryPolicyFor("deterministic"),
      resourceTransient: retryPolicyFor("resource-transient"),
    },
    metrics: {
      actualWorkMs: elapsed,
      browserNodeCount: Number(visualManifest.nodeCount ?? visualManifest.nodes?.length ?? 0),
      imageAssetCount: imageNodes.length,
      assetRepairCount: assetRepairItems.length,
      componentRepairCount: componentRepairItems.length,
      blockingIssueCount: failures.length,
    },
    nextAction: failures.length
      ? "repair-blocking-input-and-start-new-run"
      : assetRepairItems.length || componentRepairItems.length ? "publish-structure-and-repair-components-and-assets-afterward" : "publish-to-unified-pixso-plugin",
  };
  const reportPath = path.resolve(args.out ?? runManifest.artifacts?.preflightReport ?? path.join(path.dirname(manifestPath), "preflight-report.json"));
  const repairPath = path.resolve(runManifest.artifacts?.resourceRepair ?? path.join(path.dirname(manifestPath), "resource-repair.json"));
  writeJson(reportPath, report);
  writeJson(repairPath, {
    schemaVersion: 1,
    kind: "text-to-ui-pixso-resource-repair-list",
    runId: runManifest.runId ?? null,
    generatedAt: report.generatedAt,
    placeholderPolicy: "retain-measured-box",
    items: assetRepairItems,
  });
  process.stdout.write(`${JSON.stringify({ ...report, reportPath, repairPath }, null, 2)}\n`);
  if (!report.ok) process.exit(1);
}

await main();
