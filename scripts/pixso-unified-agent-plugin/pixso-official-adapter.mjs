#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const pixsoOfficialAdapterVersion = 1;
export const pixsoApplyDesignOperationLimit = 100;

const OFFICIAL_TOOLS = Object.freeze({
  context: "fetch_context",
  variables: "read_variables",
  styles: "read_styles",
  components: "read_components",
  componentLookup: "query_nodes",
  structuredPatch: "apply_design",
  exactVisualDiagnostic: "code_to_design",
  layoutAudit: "check_layout",
  propertyAudit: "query_all_unique_props",
  screenshot: "take_screenshot",
});

function operationCount(plan) {
  if (Array.isArray(plan?.operations)) return plan.operations.length;
  if (Array.isArray(plan?.modules)) {
    return plan.modules.reduce((total, module) => total + (Array.isArray(module?.operations) ? module.operations.length : 0), 0);
  }
  return Number(plan?.execution?.operationCount ?? 0) || 0;
}

function modeOf(plan, options) {
  return String(options.mode ?? plan?.execution?.importRun?.mode ?? plan?.execution?.mode ?? "normal");
}

function intentOf(plan, options) {
  return String(options.intent ?? plan?.execution?.intent ?? "full-structured-import");
}

export function buildResourcePreflight(plan = {}) {
  const componentNames = [...new Set([
    ...(plan.resources?.components ?? []),
    ...(plan.execution?.requiredComponents ?? []),
  ].map((item) => typeof item === "string" ? item : item?.name).filter(Boolean))];
  return {
    kind: "pixso-official-resource-preflight",
    adapterVersion: pixsoOfficialAdapterVersion,
    readOnly: true,
    calls: [
      { tool: OFFICIAL_TOOLS.context, purpose: "resolve-current-file-and-selection" },
      { tool: OFFICIAL_TOOLS.variables, purpose: "resolve-current-variable-ids-and-modes" },
      { tool: OFFICIAL_TOOLS.styles, purpose: "resolve-current-style-ids" },
      { tool: OFFICIAL_TOOLS.components, purpose: "resolve-current-components-and-variants" },
      ...(componentNames.length ? [{
        tool: OFFICIAL_TOOLS.componentLookup,
        purpose: "resolve-required-components-by-current-file-facts",
        names: componentNames,
        batching: "single-batched-query",
      }] : []),
    ],
    policy: {
      currentFileOnly: true,
      cachedNodeIdsForbidden: true,
      guessedComponentRefsForbidden: true,
      mutationsAllowed: false,
    },
  };
}

export function buildAcceptancePlan(plan = {}) {
  return {
    kind: "pixso-official-acceptance-plan",
    adapterVersion: pixsoOfficialAdapterVersion,
    calls: [
      { tool: OFFICIAL_TOOLS.layoutAudit, purpose: "detect-overflow-overlap-and-invalid-bounds" },
      { tool: OFFICIAL_TOOLS.propertyAudit, purpose: "audit-literal-versus-bound-fills-strokes-spacing-and-radius" },
      { tool: OFFICIAL_TOOLS.screenshot, purpose: "compare-structured-board-with-current-html-reference" },
    ],
    readback: {
      requireCanonicalFrameVisible: true,
      requireNoTemporaryBaseline: modeOf(plan, {}) === "normal",
      requireVariableBindings: true,
      requireRealComponentInstances: true,
      requireExplicitStrokeEdges: true,
    },
  };
}

export function selectPixsoExecutor(plan = {}, plugin = {}, options = {}) {
  const mode = modeOf(plan, options);
  const intent = intentOf(plan, options);
  const count = Number(options.operationCount ?? operationCount(plan));
  const diagnosticBaseline = mode === "diagnostic" && intent === "exact-visual-baseline";
  const targetedRepair = intent === "targeted-repair";
  const allowMcpFallback = options.allowMcpFallback === true || plan?.execution?.allowMcpFallback === true;

  if (diagnosticBaseline) {
    return {
      executor: "pixso-code-to-design",
      transport: "official-pixso-plugin",
      reason: "explicit-diagnostic-visual-baseline",
      allowed: true,
      temporaryOutput: true,
    };
  }

  if (intent === "exact-visual-baseline") {
    return {
      executor: null,
      transport: null,
      reason: "code-to-design-forbidden-in-normal-mode",
      allowed: false,
      temporaryOutput: false,
    };
  }

  if (targetedRepair && count <= pixsoApplyDesignOperationLimit) {
    return {
      executor: "pixso-apply-design",
      transport: "official-pixso-plugin",
      reason: "bounded-targeted-repair",
      allowed: true,
      operationCount: count,
      operationLimit: pixsoApplyDesignOperationLimit,
    };
  }

  if (targetedRepair && count > pixsoApplyDesignOperationLimit) {
    if (!plugin.ready && !allowMcpFallback) {
      return {
        executor: null,
        transport: null,
        reason: "native-plugin-required",
        allowed: false,
        operationCount: count,
        operationLimit: pixsoApplyDesignOperationLimit,
      };
    }
    return {
      executor: plugin.ready ? "text-to-ui-native-plugin" : "pixso-mcp-eval-script",
      transport: plugin.ready ? "text-to-ui-plugin-bridge" : "pixso-desktop-mcp",
      reason: plugin.ready ? "targeted-repair-exceeds-apply-design-limit" : "explicit-mcp-fallback",
      allowed: true,
      operationCount: count,
      operationLimit: pixsoApplyDesignOperationLimit,
    };
  }

  if (!plugin.ready && !allowMcpFallback) {
    return {
      executor: null,
      transport: null,
      reason: "native-plugin-required",
      allowed: false,
      operationCount: count,
    };
  }

  return {
    executor: plugin.ready ? "text-to-ui-native-plugin" : "pixso-mcp-eval-script",
    transport: plugin.ready ? "text-to-ui-plugin-bridge" : "pixso-desktop-mcp",
    reason: plugin.ready ? "full-page-bulk-structured-execution" : "explicit-mcp-fallback",
    allowed: true,
    operationCount: count,
  };
}

export function createPixsoOfficialAdapterPlan(plan = {}, plugin = {}, options = {}) {
  return {
    kind: "text-to-ui-pixso-official-adapter-plan",
    adapterVersion: pixsoOfficialAdapterVersion,
    route: selectPixsoExecutor(plan, plugin, options),
    resourcePreflight: buildResourcePreflight(plan),
    acceptance: buildAcceptancePlan(plan),
    constraints: {
      oneExecutorPerRun: true,
      codeToDesignNormalMode: "forbidden",
      codeToDesignOutput: "diagnostic-temporary-only",
      evalScript: "explicit-diagnostic-or-user-approved-only",
      operationPlanIsSourceOfTruth: true,
    },
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[name] = true;
    else { args[name] = next; index += 1; }
  }
  return args;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.plan) throw new Error("Usage: pixso-official-adapter.mjs --plan <operation-plan.json> [--plugin-ready] [--allow-mcp-fallback] [--mode normal|diagnostic] [--intent full-structured-import|targeted-repair|exact-visual-baseline]");
  const plan = JSON.parse(fs.readFileSync(path.resolve(String(args.plan)), "utf8"));
  const output = createPixsoOfficialAdapterPlan(plan, { ready: Boolean(args["plugin-ready"]) }, { mode: args.mode, intent: args.intent, allowMcpFallback: Boolean(args["allow-mcp-fallback"]) });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
