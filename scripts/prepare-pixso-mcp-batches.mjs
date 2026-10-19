#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { derivePixsoImportModules, parseArgs, readJson, repoRelativePath, writeJson } from "./pixso-native-scene-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: prepare-pixso-mcp-batches.mjs --plan <pixso-operation-plan.json> --out <mcp-call-plan.json> [--out-script <mcp-script-note.js>] [--max-script-bytes <150000>]";
if (args.help || !args.plan || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const sourcePlan = readJson(args.plan);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const runtimePath = path.join(scripts, "pixso-native-execution-runtime.min.js");
const runtime = fs.readFileSync(fs.existsSync(runtimePath) ? runtimePath : path.join(scripts, "pixso-native-execution-runtime.js"), "utf8").trim();
const maximumBytes = Number(args["max-script-bytes"] ?? 150000);
if (!Number.isFinite(maximumBytes) || maximumBytes < 30000) throw new Error("--max-script-bytes must be at least 30000");
// The final call adds module-part metadata after a candidate chunk has been
// sized. Keep headroom for that envelope and for small serializer differences
// between the planning process and the actual MCP request.
const planningLimit = maximumBytes - 4096;

const sourceOperations = sourcePlan.operations ?? [];
const rootNodeId = sourceOperations.find((operation) => operation.op === "create-frame" && !operation.parentId)?.nodeId;
if (!rootNodeId) throw new Error("Operation plan has no top-level root frame");
// Keep the MCP batch identity aligned with the isolated import run. A
// renderer-generated hash is only a fallback for plans that do not carry
// import provenance; mixing a second batch run id makes cross-call hydration
// and final run validation look like stale history.
const runId = sourcePlan.execution?.importRun?.runId
  ?? sourcePlan.execution?.runId
  ?? crypto.createHash("sha256").update(`${JSON.stringify(sourcePlan)}\n${runtime}`).digest("hex").slice(0, 16);
const sharedExecution = {
  ...sourcePlan.execution,
  rootNodeId,
  rootName: sourceOperations.find((operation) => operation.nodeId === rootNodeId)?.name,
  runId,
  mcpBatching: true,
};
const modules = Array.isArray(sourcePlan.modules) && sourcePlan.modules.length
  ? sourcePlan.modules
  : derivePixsoImportModules(sourceOperations);

function operationIndexesFor(module) {
  if (Array.isArray(module.operationIndexes)) return module.operationIndexes;
  const wanted = new Set(module.operationIds ?? []);
  return sourceOperations.flatMap((operation, index) => wanted.has(operation.nodeId) ? [index] : []);
}

function resourcesFor(operations, { includeBinary = true } = {}) {
  const source = sourcePlan.resources ?? {};
  const variableNames = new Set();
  const styleRefs = new Set();
  const collectRefs = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("$variable/")) variableNames.add(value.slice("$variable/".length));
      if (value.startsWith("$style/")) styleRefs.add(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const nested of Object.values(value)) collectRefs(nested);
  };
  for (const operation of operations) collectRefs(operation);
  const iconAliases = new Set(operations
    .filter((operation) => operation.op === "hydrate-icon")
    .map((operation) => operation.iconRef?.alias)
    .filter(Boolean));
  const imageRefs = new Set(operations
    .filter((operation) => operation.op === "create-image")
    .map((operation) => operation.imageRef?.ref)
    .filter(Boolean));
  return {
    componentLibraryPage: source.componentLibraryPage,
    variableAliases: source.variableAliases ?? {},
    // The shared runtime is intentionally kept close to Pixso MCP's 150 KB
    // eval_script limit. A module only needs the Variables and Styles
    // referenced by its own operations; shipping the complete token catalog
    // in every call made otherwise-valid modules overflow the limit.
    variables: (source.variables ?? [])
      .filter((variable) => variableNames.has(variable.name) || variableNames.has(String(variable.ref ?? "").replace(/^\$variable\//, "")))
      .map((variable) => ({ name: variable.name, ref: variable.ref })),
    styles: (source.styles ?? [])
      .filter((style) => styleRefs.has(style.ref))
      .map((style) => ({ ref: style.ref, role: style.role })),
    // The icon-hydration batch is also the safe repair point for semantic icon
    // masters referenced by create-instance operations. Include the complete
    // icon catalog in that one bounded batch so an upgrade can repair old
    // generated Text-to-UI Icon/* components in place without inflating every
    // layout batch or losing component references.
    icons: includeBinary
      ? (operations.some((operation) => operation.op === "hydrate-icon")
        ? (source.icons ?? [])
        : (source.icons ?? []).filter((icon) => iconAliases.has(icon.alias)))
      : [],
    images: includeBinary ? (source.images ?? []).filter((image) => imageRefs.has(image.ref)) : [],
    font: source.font,
  };
}

const base = {
  schemaVersion: sourcePlan.schemaVersion,
  kind: sourcePlan.kind,
  execution: sharedExecution,
  page: sourcePlan.page,
};

function planFor(operations, metadata = {}, options = {}) {
  return {
    ...base,
    execution: { ...sharedExecution, ...metadata },
    resources: resourcesFor(operations, options),
    operations,
  };
}

function serialize(plan, method = "execute", commitReplacement = true) {
  const payload = JSON.stringify(plan);
  const invocation = method === "execute"
    ? `return await executor.execute(plan, { replaceExisting: true, commitReplacement: ${commitReplacement ? "true" : "false"} });`
    : "return await executor.verify(plan);";
  return `${runtime}\n\nconst plan = JSON.parse(${JSON.stringify(payload)});\nconst executor = globalThis.TextToUiPixsoRuntime.create(pixso);\n${invocation}\n`;
}

function splitModule(module, operations, isLastModule) {
  const chunks = [];
  let current = [];
  for (const operation of operations) {
    const candidate = [...current, operation];
    const isFinalCandidate = operation === operations.at(-1);
    const bytes = Buffer.byteLength(serialize(
      planFor(candidate, { moduleId: module.id, structureSignature: null }, { includeBinary: true }),
      "execute",
      isLastModule && isFinalCandidate,
    ));
    if (current.length > 0 && bytes > planningLimit) {
      chunks.push(current);
      current = [operation];
      const singleBytes = Buffer.byteLength(serialize(
        planFor(current, { moduleId: module.id, structureSignature: null }, { includeBinary: true }),
        "execute",
        isLastModule && isFinalCandidate,
      ));
      // The planning headroom is only needed when deciding whether another
      // operation can join the current chunk. A single operation may consume
      // that headroom as long as the final serialized MCP call still respects
      // the hard user-configured maximum; otherwise valid near-limit calls
      // would be rejected before the final byte check below.
      if (singleBytes > maximumBytes) throw new Error(`MCP module ${module.id} has one operation larger than ${maximumBytes} bytes (${singleBytes})`);
    } else {
      current = candidate;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const moduleGroups = modules.map((module) => ({
  module,
  operations: operationIndexesFor(module)
    .map((index) => sourceOperations[index])
    .filter(Boolean),
})).filter(({ operations }) => operations.length > 0);

const moduleChunks = [];
for (const [moduleIndex, { module, operations }] of moduleGroups.entries()) {
  const chunks = splitModule(module, operations, moduleIndex === moduleGroups.length - 1);
  chunks.forEach((chunk, chunkIndex) => moduleChunks.push({
    module,
    moduleIndex,
    chunk,
    chunkIndex,
    chunkCount: chunks.length,
  }));
}

const calls = moduleChunks.map(({ module, moduleIndex, chunk, chunkIndex, chunkCount }, index) => {
  const isFinal = moduleIndex === moduleGroups.length - 1 && chunkIndex === chunkCount - 1;
  const metadata = {
    moduleId: module.id,
    moduleLabel: module.label,
    moduleIndex,
    modulePart: chunkIndex + 1,
    modulePartCount: chunkCount,
  };
  const script = serialize(planFor(chunk, { ...metadata, structureSignature: null }, { includeBinary: true }), "execute", isFinal);
  const bytes = Buffer.byteLength(script);
  if (bytes > maximumBytes) throw new Error(`MCP module ${module.id} part ${chunkIndex + 1} exceeds ${maximumBytes} bytes (${bytes})`);
  return {
    callIndex: index + 1,
    phase: module.id === "icon-hydration" ? "icon-hydration" : "create",
    moduleId: module.id,
    moduleLabel: module.label,
    modulePart: chunkIndex + 1,
    modulePartCount: chunkCount,
    commitReplacement: isFinal,
    operationCount: chunk.filter((operation) => String(operation.op).startsWith("create-") || operation.op === "hydrate-icon").length,
    bytes,
    tool: "eval_script",
    arguments: { script },
  };
});

if (!calls.length) throw new Error("Operation plan produced no import modules");

function auditOperationsFor(operations) {
  return operations.flatMap((operation) => {
    if (String(operation.op).startsWith("create-") && operation.op !== "create-page") {
      return [{
        nodeId: operation.nodeId,
        op: operation.op,
        style: compactAuditStyle(operation.style),
        // Image read-back compares the symbolic ref stored on the node. Keep
        // that ref in the compact audit plan; the image bytes themselves still
        // stay out of the verification batch.
        ...(operation.op === "create-image" ? { imageRef: operation.imageRef } : {}),
      }];
    }
    if (operation.op === "hydrate-icon") {
      return [{ op: operation.op, targetNodeId: operation.targetNodeId, iconRef: operation.iconRef, style: compactAuditStyle(operation.style) }];
    }
    return [];
  });
}

// A full-page verification payload is larger than Pixso MCP's script limit.
// Verify each already-created module independently after all writes. The
// secondary-list module retains the structure signature so its exact-child
// and four-side inset contract is checked; other modules use their own node
// audits and avoid falsely reporting structure-missing for partial plans.
for (const { module, operations } of moduleGroups) {
  const auditOperations = auditOperationsFor(operations);
  if (!auditOperations.length) continue;
  const auditPlan = planFor(auditOperations, {
    moduleId: `readback-${module.id}`,
    structureSignature: module.id === "secondary-list" ? sourcePlan.execution?.structureSignature ?? null : null,
  }, { includeBinary: false });
  const auditScript = serialize(auditPlan, "verify");
  if (Buffer.byteLength(auditScript) > maximumBytes) throw new Error(`MCP readback batch exceeds script size limit for ${module.id}`);
  calls.push({
    callIndex: calls.length + 1,
    phase: "readback",
    moduleId: `readback-${module.id}`,
    moduleLabel: `回读：${module.label}`,
    modulePart: 1,
    modulePartCount: 1,
    commitReplacement: false,
    operationCount: auditOperations.length,
    bytes: Buffer.byteLength(auditScript),
    tool: "eval_script",
    arguments: { script: auditScript },
  });
}

if (args["out-script"]) {
  const note = [
    "// This plan exceeds Pixso MCP's one-call script size limit.",
    "// Execute calls in the adjacent pixso-mcp-call-plan.json sequentially.",
    `// runId: ${runId}; calls: ${calls.length}; modules: ${modules.map((module) => module.id).join(", ")}; final call is readback.`,
    "",
  ].join("\n");
  fs.writeFileSync(path.resolve(args["out-script"]), note);
}

const output = {
  schemaVersion: 4,
  kind: "pixso-mcp-eval-call-plan",
  sourcePlan: repoRelativePath(args.plan),
  executor: { kind: "shared-pixso-plugin-api-runtime", version: "4", fallbackOnly: true },
  runId,
  rootNodeId,
  maximumScriptBytes: maximumBytes,
  modules: modules.map((module) => ({
    id: module.id,
    label: module.label,
    dependsOn: module.dependsOn,
    operationCount: operationIndexesFor(module).length,
  })),
  callCount: calls.length,
  calls,
};
writeJson(args.out, output);
console.log(JSON.stringify({ ok: true, output: path.resolve(args.out), script: args["out-script"] ? path.resolve(args["out-script"]) : null, callCount: calls.length, moduleCount: modules.length, operationCount: sourceOperations.length, runId }, null, 2));

function compactAuditStyle(style = {}) {
  return {
    ...(style.fill?.ref ? { fill: { ref: style.fill.ref } } : {}),
    ...(style.textStyle?.ref ? { textStyle: { ref: style.textStyle.ref } } : {}),
  };
}
