#!/usr/bin/env node

import fs from "node:fs";
import { resolveComponentBindings } from "./component-mapping-resolver.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isMappingRegistryFile,
  readMappingRegistry,
  registryTargetDocument,
  registryTargetLibrary,
  resolveRegistryPath,
  selectMappingProfile,
  styleAliasesForProfile,
  tokenAliasesForProfile,
  iconColorSourceForMapping,
} from "./mapping-registry-lib.mjs";

const DEFAULT_TOKEN_DIR = path.resolve(fileURLToPath(new URL("../assets/design-system/", import.meta.url)));
const SKILL_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ICON_ALIAS_PATH = path.join(SKILL_ROOT, "assets/icons/icon-aliases.json");
const LUCIDE_ICON_DIR = path.join(SKILL_ROOT, "node_modules/lucide/dist/esm/icons");

// The plan carries this requirement so the local service can refuse stale
// plugin runtimes before they interpret any operation.
export const PIXSO_PLUGIN_RUNTIME_VERSION = "5.0.0";
export const PIXSO_AGENT_PROTOCOL_VERSION = 4;
export const PIXSO_OPERATION_PLAN_VERSION = 5;
// Permanent Executor v1 is intentionally broad and stable. Compiler and
// mapping releases may change plan data, but must continue expressing work in
// this fixed operation vocabulary. That makes a shared Pixso plugin usable
// without a matching local Bridge or a code hot-update.
export const PIXSO_PERMANENT_EXECUTOR_PROTOCOL = 1;
export const PIXSO_PERMANENT_EXECUTOR_CAPABILITIES = Object.freeze([
  "executor.data-plan.v1",
  "executor.transaction.v1",
  "executor.assets.deferred.v1",
  "executor.readback.v1",
]);
export const PIXSO_PAGE_IMPORT_CAPABILITIES = Object.freeze([
  "node.create", "node.move", "node.replace", "node.delete",
  "layout.auto", "layout.absolute", "layout.stroke-edges",
  "text.resize-modes", "variable.bind", "style.bind",
  "component.instance", "component.properties", "asset.svg", "asset.icon.deferred", "asset.image", "asset.image.deferred",
  "asset.svg.stroke-by-display-size",
  "transaction.draft", "transaction.rollback", "transaction.commit",
  "execution.progress", "execution.operation-progress", "execution.cancel", "readback.structure", "readback.bindings",
]);

export function permanentAgentContract(idempotencyKey) {
  return {
    protocolVersion: PIXSO_AGENT_PROTOCOL_VERSION,
    planSchemaVersion: PIXSO_OPERATION_PLAN_VERSION,
    executorProtocol: PIXSO_PERMANENT_EXECUTOR_PROTOCOL,
    minimumKernelVersion: PIXSO_PLUGIN_RUNTIME_VERSION,
    requiredCapabilities: [...PIXSO_PERMANENT_EXECUTOR_CAPABILITIES],
    idempotencyKey: String(idempotencyKey),
  };
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

export function writeJson(file, value) {
  const output = path.resolve(file);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
}

export function repoRelativePath(file) {
  const repository = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const absolute = path.resolve(file);
  const relative = path.relative(repository, absolute);
  return relative && !relative.startsWith("..") ? relative : `<external>/${path.basename(absolute)}`;
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "help") result.help = true;
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[key] = argv[++index];
    else result[key] = true;
  }
  return result;
}

function tokenDirFrom(options = {}) {
  return path.resolve(options.tokenDir || DEFAULT_TOKEN_DIR);
}

const TOKEN_ALIASES = {
  "surface/canvas": "neutral-light/100",
  "surface/default": "neutral-light/100",
  "surface/subtle": "neutral-dark/05",
  "surface/muted": "neutral-dark/05",
  "surface/selected": "brand/10",
  "surface/primary": "brand/100",
  "surface/success": "function/success/10",
  "text/primary": "neutral-dark/90",
  "text/secondary": "neutral-dark/60",
  "text/tertiary": "neutral-dark/40",
  "text/muted": "neutral-dark/40",
  "text/subtle": "neutral-dark/40",
  "text/on-primary": "neutral-light/100",
  "text/success": "function/success/100",
  "text/danger": "function/danger/100",
  "icon/default": "neutral-dark/90",
  "icon/muted": "neutral-dark/60",
  "icon/subtle": "neutral-dark/40",
  "icon/primary": "brand/100",
  "border/default": "neutral-dark/10",
  "border/subtle": "neutral-dark/05",
  "divider/default": "neutral-dark/20",
  "state/unread": "brand/100",
  "state/success": "function/success/100",
  "state/danger": "function/danger/100",
  "state/ai": "multi/01",
  "space/pane": "space/6",
  "space/section": "space/5",
  "space/control": "space/3",
  "size/titlebar": "size/64",
  "size/control": "size/40",
  "size/icon": "size/20",
  "radius/window": "radius/16",
  "radius/card": "radius/12",
  "radius/control": "radius/08",
  "layout/viewport-width": "layout/width/1728",
  "layout/viewport-height": "layout/height/1152",
  "layout/primary-width": "layout/width/240",
  "layout/secondary-width": "layout/width/360",
};

const TYPE_STYLE_ALIASES = {
  "display-l": "Display_L",
  "display-m": "Display_M",
  "display-s": "Display_S",
  "title-l": "Title_L",
  "title-m": "Title_M",
  "title-s": "Title_S",
  "subtitle-l": "Subtitle_L",
  "subtitle-m": "Subtitle_M",
  "subtitle-s": "Subtitle_S",
  "body-l": "Body_L",
  "body-m": "Body_M",
  "body-s": "Body_S",
};

function allTokenNames(manifest) {
  const names = new Set();
  for (const collection of manifest.collections ?? []) {
    for (const name of Object.keys(collection.variables ?? {})) names.add(name);
  }
  return names;
}

export function loadTokenResources(options = {}) {
  const tokenDir = tokenDirFrom(options);
  const defaultRegistryFile = path.join(tokenDir, "mapping-registry.json");
  const mappingRegistryFile = path.resolve(options.mappingRegistry || defaultRegistryFile);
  const mappingRegistry = fs.existsSync(mappingRegistryFile)
    ? readMappingRegistry(mappingRegistryFile).value
    : null;
  const mappingProfile = mappingRegistry
    ? selectMappingProfile(mappingRegistry, options.mappingProfile || null)
    : null;
  const targetDocument = mappingRegistry && mappingProfile
    ? registryTargetDocument(mappingRegistry, mappingProfile)
    : null;
  const manifestPath = targetDocument?.variables
    ? resolveRegistryPath(mappingRegistryFile, targetDocument.variables)
    : path.join(tokenDir, "pixso-variables.json");
  const manifest = readJson(manifestPath);
  const dualOutput = readJson(path.join(tokenDir, "dual-output-token-map.json"));
  const typography = readJson(path.join(tokenDir, "typography-style-map.json"));
  const effects = readJson(path.join(tokenDir, "effect-style-map.json"));
  const collectionByToken = new Map();
  const values = new Map();
  for (const collection of manifest.collections ?? []) {
    for (const [name, definition] of Object.entries(collection.variables ?? {})) {
      const ref = { collection: collection.name, mode: collection.modes?.[0] ?? null, name };
      collectionByToken.set(name, ref);
      values.set(name, { ...ref, type: definition.type, value: definition.value });
    }
  }
  const aliases = new Map(Object.entries(TOKEN_ALIASES));
  for (const mapping of dualOutput.variableMappings ?? []) {
    if (mapping.pixsoVariable && mapping.webCssVariable) {
      aliases.set(mapping.webCssVariable.replace(/^--/, ""), mapping.pixsoVariable);
    }
  }
  for (const [cssVariable, pixsoVariable] of tokenAliasesForProfile(mappingProfile || {}) ) {
    aliases.set(cssVariable, pixsoVariable);
  }
  const names = allTokenNames(manifest);
  const resolve = (requested) => {
    const raw = String(requested ?? "");
    const name = names.has(raw) ? raw : aliases.get(raw) ?? TOKEN_ALIASES[raw];
    if (!name || !names.has(name)) {
      throw new Error(`Unknown Pixso primitive Token: ${raw}`);
    }
    return { ...collectionByToken.get(name), ref: `$variable/${name}`, value: values.get(name)?.value };
  };
  const profileStyles = styleAliasesForProfile(mappingProfile || {});
  const styleByRole = new Map([
    ...(typography.formalStyles ?? []).map((item) => [item.htmlToken, item.pixsoStyle]),
    ...profileStyles.text,
  ]);
  const effectByRole = new Map([
    ...(effects.publicPixsoStyles ?? []).map((item) => [item.htmlToken, item.pixsoStyle]),
    ...profileStyles.effect,
  ]);
  return {
    tokenDir,
    mappingRegistry,
    mappingProfile,
    manifest,
    dualOutput,
    typography,
    effects,
    values,
    resolve,
    styleForText(role = "body-m") {
      const styleName = styleByRole.get(role) ?? `$style/Typography/${TYPE_STYLE_ALIASES[role] ?? "Body_M"}`;
      return { ref: styleName, role };
    },
    styleForEffect(role = "shadow-1") {
      return { ref: effectByRole.get(role) ?? `$style/Effect/Foundation/${role}`, role };
    },
  };
}

export function loadComponentMap(file, options = {}) {
  const inputFile = path.resolve(file);
  const input = readJson(inputFile);
  const mappingRegistryFile = options.mappingRegistry
    ? path.resolve(options.mappingRegistry)
    : isMappingRegistryFile(inputFile)
      ? inputFile
      : null;
  if (!mappingRegistryFile) {
    const mappings = input.mappings ?? input.components ?? {};
    const map = new Map();
    const enrich = (entry) => {
      const iconColorSource = iconColorSourceForMapping(entry);
      return iconColorSource ? { ...entry, iconColorSource } : entry;
    };
    if (Array.isArray(mappings)) {
      for (const entry of mappings) map.set(entry.logicalName, enrich(entry));
    } else {
      for (const [logicalName, entry] of Object.entries(mappings)) map.set(logicalName, enrich({ logicalName, ...entry }));
    }
    return { ...input, map };
  }

  const mappingRegistry = readMappingRegistry(mappingRegistryFile).value;
  const mappingProfile = selectMappingProfile(mappingRegistry, options.mappingProfile || null);
  const targetLibrary = registryTargetLibrary(mappingRegistry, mappingProfile);
  const { map, selectorMap, mappings } = resolveComponentBindings(mappingProfile);
  return { libraryPage: targetLibrary?.page || "NewComponents", mappings, mappingRegistry, mappingProfile, map, selectorMap };
}

function escapeSvgAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function lucideSvg(name) {
  const source = fs.readFileSync(path.join(LUCIDE_ICON_DIR, `${name}.mjs`), "utf8");
  const match = source.match(/const\s+[^=]+\s+=\s+(\[[\s\S]*?\]);/);
  if (!match) throw new Error(`Cannot parse Lucide icon: ${name}`);
  const nodes = Function(`return ${match[1]}`)();
  const body = nodes.map(([tag, attributes]) => {
    const attrs = Object.entries(attributes ?? {}).map(([key, value]) => `${key}="${escapeSvgAttribute(value)}"`).join(" ");
    return `<${tag}${attrs ? ` ${attrs}` : ""}/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function resolvePixsoIcon(alias) {
  const aliases = readJson(ICON_ALIAS_PATH).aliases ?? {};
  const entry = aliases[alias];
  if (!entry) {
    const normalize = (value) => String(value ?? "")
      .trim()
      .replace(/^lucide(?::|\/)/i, "")
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .replace(/[\s_]+/g, "-")
      .toLowerCase();
    const requested = normalize(alias);
    const flatAliasMatches = Object.keys(aliases).filter((candidateAlias) => normalize(candidateAlias.replaceAll("/", "-")) === requested);
    const compatibilityAliasNames = {
      "disclosure-down": "navigation/chevron-down",
      "disclosure-right": "navigation/chevron-right",
      "disclosure-up": "navigation/chevron-up",
      "window-minimize": "window/minimize",
      "window-maximize": "window/maximize",
      "window-close": "window/close",
      close: "action/close",
      trash: "action/delete",
      document: "object/file",
      download: "action/download",
      refresh: "action/refresh",
      add: "action/add",
      settings: "action/settings",
      search: "field/search",
      more: "action/more",
      grid: "navigation/grid",
      history: "navigation/recent",
      user: "object/avatar",
      "panel-left": "navigation/panel-left",
      device: "object/device",
      calendar: "field/calendar",
      clock: "field/clock",
      info: "status/info",
      success: "status/success",
      warning: "status/warning",
      danger: "status/danger",
      neutral: "status/neutral",
      sync: "action/refresh"
    };
    const compatibilityAlias = compatibilityAliasNames[requested];
    const compatibilityResolvedAlias = compatibilityAlias && aliases[compatibilityAlias]
      ? compatibilityAlias
      : flatAliasMatches.length === 1
        ? flatAliasMatches[0]
        : null;
    if (compatibilityResolvedAlias) {
      const resolved = aliases[compatibilityResolvedAlias];
      return { alias, resolvedAlias: compatibilityResolvedAlias, source: resolved.source, name: resolved.name, resolution: compatibilityAlias ? "compatibility-alias" : "flat-alias", svg: resolved.source === "lucide" ? lucideSvg(resolved.name) : fs.readFileSync(path.join(SKILL_ROOT, resolved.path), "utf8") };
    }
    const sourceNameMatches = Object.entries(aliases)
      .filter(([, candidate]) => candidate.source === "lucide" && normalize(candidate.name) === requested)
      .map(([candidateAlias]) => candidateAlias);
    const requestedSuffix = requested.split("/").at(-1);
    const suffixMatches = Object.keys(aliases).filter((candidateAlias) => normalize(candidateAlias.split("/").at(-1)) === requestedSuffix);
    const resolvedAlias = sourceNameMatches.length === 1
      ? sourceNameMatches[0]
      : suffixMatches.length === 1
        ? suffixMatches[0]
        : null;
    if (resolvedAlias) {
      const resolved = aliases[resolvedAlias];
      return { alias, resolvedAlias, source: resolved.source, name: resolved.name, resolution: sourceNameMatches.length === 1 ? "source-name" : "semantic-suffix", svg: resolved.source === "lucide" ? lucideSvg(resolved.name) : fs.readFileSync(path.join(SKILL_ROOT, resolved.path), "utf8") };
    }
    const directName = requested.replace(/^.*\//, "");
    const directPath = path.join(LUCIDE_ICON_DIR, `${directName}.mjs`);
    if (fs.existsSync(directPath)) return { alias, source: "lucide", name: directName, resolution: "source-name", svg: lucideSvg(directName) };
    return {
      alias,
      source: "unresolved-fallback",
      resolution: "unresolved-fallback",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    };
  }
  if (entry.source === "asset") {
    return { alias, source: entry.source, path: entry.path, resolution: "canonical", svg: fs.readFileSync(path.join(SKILL_ROOT, entry.path), "utf8") };
  }
  if (entry.source === "lucide") return { alias, source: entry.source, name: entry.name, resolution: "canonical", svg: lucideSvg(entry.name) };
  throw new Error(`Unsupported icon source for ${alias}: ${entry.source}`);
}

// Product-specific construction lives in coremail-semantic-adapter.mjs.

function operationForNode(node, parentId, layoutOperations, iconOperations, imageOperations) {
  const metadata = { ...(node.metadata ?? {}) };
  const common = { nodeId: node.id, parentId: parentId ?? null, name: node.name, region: node.region, layout: node.layout, style: node.style, metadata };
  if (node.type === "component" && node.renderMode === "instance") {
    const componentRef = {
      logicalName: node.component.logicalName,
      pixsoName: node.component.pixsoName,
      componentSetName: node.component.componentSetName,
      variant: node.component.variant,
      ...(node.component.iconColorSource ? { iconColorSource: node.component.iconColorSource } : {}),
      ...(node.component.allowContentColorOverride === true && node.component.contentColor
        ? { contentColor: node.component.contentColor, allowContentColorOverride: true }
        : {}),
    };
    // Component props are semantic HTML values. Carry the exact live Pixso
    // variant value in the plan so the plugin does not invent or inherit a
    // historical variant naming convention at runtime.
    const props = { ...(node.component.props ?? {}) };
    const runtimeVariant = componentRef.variant ?? {};
    if (props.variant !== undefined && runtimeVariant.type !== undefined) props.variant = runtimeVariant.type;
    if (props.type !== undefined && runtimeVariant.type !== undefined) props.type = runtimeVariant.type;
    if (props.size !== undefined && runtimeVariant.size !== undefined) props.size = runtimeVariant.size;
    if (props.state !== undefined && runtimeVariant.state !== undefined && typeof props.state !== "boolean") props.state = runtimeVariant.state;
    layoutOperations.push({ op: "create-instance", phase: "layout", ...common, componentRef, props, slots: node.component.slots });
    return;
  }
  if (node.type === "component") {
    layoutOperations.push({ op: "create-frame", phase: "layout", ...common, source: "native-composition", componentRef: { logicalName: node.component.logicalName, rendererKey: node.component.rendererKey, availability: node.component.availability }, fallbackRecipe: node.component.fallbackRecipe });
  } else if (node.type === "frame") layoutOperations.push({ op: "create-frame", phase: "layout", ...common });
  else if (node.type === "text") layoutOperations.push({ op: "create-text", phase: "layout", ...common, characters: node.content });
  else if (node.type === "icon") {
    const size = node.icon.size ?? 20;
    const hotZone = node.icon.hotZone ?? { alignment: "CENTER", axes: "BOTH" };
    const strokeWeight = Math.round((1.5 * size / 24) * 1000) / 1000;
    layoutOperations.push({ op: "create-icon-slot", phase: "layout", ...common, iconSlot: { alias: node.icon.alias, size, strokeWeight, hotZone } });
    iconOperations.push({ op: "hydrate-icon", phase: "icon-hydration", targetNodeId: node.id, name: node.name, region: node.region, iconRef: { alias: node.icon.alias, size, strokeWeight, hotZone }, style: node.style, metadata: node.metadata });
  } else if (node.type === "image") imageOperations.push({ op: "create-image", phase: "image-optimization", ...common, imageRef: node.image });
  else layoutOperations.push({ op: `create-${node.type}`, phase: "layout", ...common });
  for (const child of node.children ?? []) operationForNode(child, node.id, layoutOperations, iconOperations, imageOperations);
}

const IMPORT_MODULES = [
  { id: "shell", label: "画板壳层与全局标题栏", dependsOn: [] },
  { id: "primary-navigation", label: "左侧一级导航与账号菜单", dependsOn: ["shell"] },
  { id: "secondary-list", label: "搜索、收件箱与邮件列表", dependsOn: ["shell"] },
  { id: "main-detail", label: "邮件详情、会议卡片与正文", dependsOn: ["shell"] },
  { id: "icon-hydration", label: "组件图标填充", dependsOn: ["primary-navigation", "secondary-list", "main-detail"] },
  { id: "image-optimization", label: "图片资源优化", dependsOn: ["icon-hydration"] },
];

function importModuleForOperation(operation, byId) {
  if (operation.op === "hydrate-icon") return "icon-hydration";
  if (operation.op === "create-image") return "image-optimization";
  if (!operation.nodeId) return "shell";

  const shellIds = new Set([
    "coremail-native-root",
    "mail-shell",
    "global-title-layer",
    "content-row",
    "pane-primary-navigation",
    "pane-secondary-list",
    "pane-main-detail",
    "main-detail-shell",
  ]);
  if (shellIds.has(operation.nodeId)) return "shell";

  let parentId = operation.parentId ?? null;
  while (parentId) {
    if (parentId === "mail-shell" || parentId === "global-title-layer" || parentId === "content-row") return "shell";
    if (parentId === "pane-primary-navigation") return "primary-navigation";
    if (parentId === "pane-secondary-list") return "secondary-list";
    if (parentId === "main-detail-shell") return "main-detail";
    parentId = byId.get(parentId)?.parentId ?? null;
  }

  if (operation.region === "primary-navigation") return "primary-navigation";
  if (operation.region === "secondary-list") return "secondary-list";
  if (operation.region === "main-detail") return "main-detail";
  return "shell";
}

export function derivePixsoImportModules(operations = []) {
  const byId = new Map(operations.filter((operation) => operation.nodeId).map((operation) => [operation.nodeId, operation]));
  const grouped = new Map(IMPORT_MODULES.map((module) => [module.id, []]));
  for (const [operationIndex, operation] of operations.entries()) {
    const moduleId = importModuleForOperation(operation, byId);
    grouped.get(moduleId)?.push({ operation, operationIndex });
  }
  return IMPORT_MODULES
    .map((module) => ({
      ...module,
      operationIds: (grouped.get(module.id) ?? []).map(({ operation }) => operation.nodeId).filter(Boolean),
      operationIndexes: (grouped.get(module.id) ?? []).map(({ operationIndex }) => operationIndex),
    }))
    .filter((module) => module.operationIndexes.length > 0);
}

export function compileOperationPlan(scene, { tokens = loadTokenResources(), componentMap } = {}) {
  const resourceOperations = [{ op: "create-page", phase: "resources", page: scene.page }];
  for (const variable of scene.resources.variables ?? []) resourceOperations.push({ op: "ensure-variable", phase: "resources", variableRef: variable.ref, collection: variable.collection, mode: variable.mode, name: variable.name, value: variable.value });
  for (const style of scene.resources.styles ?? []) resourceOperations.push({ op: "ensure-style", phase: "resources", styleRef: style.ref, kind: style.ref.includes("Typography") ? "text" : "effect" });
  for (const icon of scene.resources.icons ?? []) resourceOperations.push({ op: "ensure-icon", phase: "resources", iconRef: { alias: icon.alias } });
  for (const image of scene.resources.images ?? []) resourceOperations.push({ op: "ensure-image", phase: "resources", imageRef: { ref: image.ref, mimeType: image.mimeType } });
  resourceOperations.push({ op: "ensure-font", phase: "resources", variableRef: "font/family/sans", family: "HarmonyOS Sans" });
  const layoutOperations = [];
  const iconOperations = [];
  const imageOperations = [];
  for (const root of scene.nodes ?? []) operationForNode(root, null, layoutOperations, iconOperations, imageOperations);
  const operations = [...resourceOperations, ...layoutOperations, ...iconOperations, ...imageOperations];
  const modules = derivePixsoImportModules(operations);
  return {
    schemaVersion: 1,
    kind: "pixso-operation-plan",
    execution: {
      resolveGuidsAtRuntime: true,
      libraryPage: componentMap?.libraryPage ?? "NewComponents",
      targetPage: scene.page?.targetPage ?? null,
      canonicalKey: scene.page?.name ?? "text-to-ui-page",
      pipeline: imageOperations.length
        ? "layout-then-icon-hydration-then-image-optimization"
        : "layout-then-icon-hydration",
      fallback: "native-composition",
      destructive: false,
      // Old canonical roots remain only until this plan passes final readback;
      // they are then removed as one replacement transaction.
      preserveExistingFrames: true,
      cleanupPolicy: "single-canonical-output-after-readback",
      outputPolicy: "single-managed-artboard",
      preserveFailedDraft: false,
      sourcePolicy: scene.source?.sourcePolicy ?? "fresh-build-current-html",
      sourceFingerprint: scene.page?.sourceFingerprint ?? scene.source?.sourceFingerprint ?? null,
      structureSignature: scene.page?.structureSignature ?? null,
      minimumRuntimeVersion: PIXSO_PLUGIN_RUNTIME_VERSION,
      agentContract: permanentAgentContract(scene.page?.sourceFingerprint ?? scene.page?.name ?? "pixso-page"),
    },
    page: scene.page,
    resources: scene.resources,
    phases: [
      { id: "resources", label: "资源预检", operationCount: resourceOperations.length },
      { id: "layout", label: "布局与内容", operationCount: layoutOperations.length },
      { id: "icon-hydration", label: "图标填充", operationCount: iconOperations.length },
      ...(imageOperations.length ? [{ id: "image-optimization", label: "图片资源优化", operationCount: imageOperations.length }] : []),
    ],
    modules,
    operations,
    summary: {
      operationCount: operations.length,
      nodeCount: [...layoutOperations, ...imageOperations].filter((operation) => operation.nodeId).length,
      instanceCount: operations.filter((operation) => operation.op === "create-instance").length,
      nativeCompositionCount: operations.filter((operation) => operation.source === "native-composition").length,
      tokenBindingCount: operations.filter((operation) => operation.style && Object.keys(operation.style).length > 0).length,
      iconSlotCount: layoutOperations.filter((operation) => operation.op === "create-icon-slot").length,
      hydratedIconCount: iconOperations.length,
    },
  };
}

export function collectSceneStats(scene) {
  const stats = { frames: 0, texts: 0, icons: 0, components: 0, mappedInstances: 0, nativeFallbacks: 0, regions: {} };
  const walk = (node) => {
    if (node.type === "frame") stats.frames += 1;
    if (node.type === "text") stats.texts += 1;
    if (node.type === "icon") stats.icons += 1;
    if (node.type === "component") {
      stats.components += 1;
      if (node.renderMode === "instance") stats.mappedInstances += 1;
      else stats.nativeFallbacks += 1;
    }
    if (node.region) stats.regions[node.region] = (stats.regions[node.region] ?? 0) + 1;
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of scene.nodes ?? []) walk(root);
  return stats;
}
