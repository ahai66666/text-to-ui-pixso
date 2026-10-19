#!/usr/bin/env node

// Build a Pixso component-library plan from the HTML component contract.
// The default target is the production NewComponents page. A review page can
// be selected explicitly (for example --library-page Components) so a human
// can inspect the generated components before they become reusable instances.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTokenResources,
  parseArgs,
  permanentAgentContract,
  PIXSO_PLUGIN_RUNTIME_VERSION,
  readJson,
  resolvePixsoIcon,
  writeJson,
} from "./pixso-native-scene-lib.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(skillRoot, "..");
const defaultContracts = path.join(repositoryRoot, "packages/component-contracts/src/components.json");
const defaultSpecs = path.join(skillRoot, "assets/design-system/pixso-component-specs.json");
const defaultRegistry = path.join(skillRoot, "assets/design-system/pixso-component-registry.json");

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: generate-pixso-component-library-plan.mjs --out <plan.json> [--library-page <NewComponents|Components>] [--exclude <logicalName[,logicalName...]>] [--components <components.json>] [--specs <pixso-component-specs.json>] [--registry <pixso-component-registry.json>] [--logical-name <name>]";
if (args.help || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const contractsPath = path.resolve(args.components || defaultContracts);
const specsPath = path.resolve(args.specs || defaultSpecs);
const registryPath = path.resolve(args.registry || defaultRegistry);
const libraryPage = String(args["library-page"] || "NewComponents").trim();
if (!libraryPage) throw new Error("--library-page cannot be empty");
if (!fs.existsSync(contractsPath)) throw new Error(`HTML component contract not found: ${contractsPath}`);
if (!fs.existsSync(specsPath)) throw new Error(`Pixso component specs not found: ${specsPath}`);
if (!fs.existsSync(registryPath)) throw new Error(`Pixso registry not found: ${registryPath}`);

const contracts = readJson(contractsPath).components ?? [];
const specs = readJson(specsPath).components ?? {};
const registry = readJson(registryPath);
const registryNames = new Set(Object.values(registry.categories ?? {}).flat());
const requested = args["logical-name"] ? String(args["logical-name"]) : null;
const requestedNames = requested
  ? [...new Set(requested.split(",").map((value) => value.trim()).filter(Boolean))]
  : null;
const PIXSO_COMPONENT_EXCLUSIONS = new Map([
  ["Dropdown Menu/Default", "compose directly from Token-bound native nodes; do not create or reference a reusable Pixso component"],
]);
const excluded = new Set([
  ...PIXSO_COMPONENT_EXCLUSIONS.keys(),
  ...String(args.exclude ?? "").split(",").map((value) => value.trim()).filter(Boolean),
]);
if (requested === "Search/White Surface/Advanced") {
  throw new Error("Search/White Surface/Advanced is not a Pixso component to create; reuse Search/White Surface/Default instead");
}
const COMPONENT_ALIAS_SOURCES = {
  "Input/Tag Entry/Default": { sourceId: "input", variants: ["tag-entry"], slots: ["label", "value", "tags", "suggestions"] },
  "Search/Scoped/Default": { sourceId: "search", variants: ["scoped-search", "scoped-advanced-search"] },
};
const resolveRequestedContract = (logicalName) => {
  const exact = contracts.find((contract) => contract.logicalName === logicalName);
  if (exact) return exact;
  const alias = COMPONENT_ALIAS_SOURCES[logicalName];
  if (!alias) return null;
  const source = contracts.find((contract) => contract.id === alias.sourceId);
  return source ? {
    ...source,
    logicalName,
    variants: alias.variants ?? source.variants,
    slots: alias.slots ?? source.slots,
  } : null;
};
const selectedCandidates = requestedNames
  ? requestedNames.map(resolveRequestedContract)
  : contracts;
const unknownNames = requestedNames?.filter((name, index) => !selectedCandidates[index]) ?? [];
if (unknownNames.length) throw new Error("Unknown HTML component logicalName: " + unknownNames.join(", "));
const selected = selectedCandidates.filter((contract) => !excluded.has(contract.logicalName));
const excludedRequested = requestedNames?.filter((name) => excluded.has(name)) ?? [];
if (excludedRequested.length) {
  const policies = excludedRequested.map((name) => `${name}: ${PIXSO_COMPONENT_EXCLUSIONS.get(name) ?? "excluded by request"}`);
  throw new Error("Requested component is excluded from the reusable Pixso library: " + policies.join("; "));
}
if (requestedNames && !selected.length) throw new Error("No requested components selected: " + requested);
if (!selected.length) throw new Error("HTML component contract has no components");

const tokens = loadTokenResources();
const usedVariables = new Map();
const usedStyles = new Map();
const usedIcons = new Map();
const missingIconAliases = new Set();

const addVariable = (value) => {
  if (!value || typeof value !== "object") return value;
  const ref = value.ref ?? value.variableRef ?? value.tokenRef;
  if (ref) usedVariables.set(String(ref).replace(/^\$variable\//, ""), value);
  return value;
};
const addStyle = (value) => {
  if (!value || typeof value !== "object") return value;
  if (value.ref) usedStyles.set(String(value.ref).replace(/^\$style\//, ""), value);
  return value;
};
const token = (name) => {
  if (!name) return null;
  const resolved = tokens.resolve(name);
  addVariable(resolved);
  return resolved;
};
const maybeToken = (name) => {
  if (!name) return null;
  try { return token(name); } catch (_) { return null; }
};
const textStyle = (role) => {
  const resolved = tokens.styleForText(role || "body-m");
  addStyle(resolved);
  return resolved;
};
const numericToken = (value) => {
  if (typeof value !== "number") return value;
  const candidates = [];
  for (const [name, definition] of tokens.values.entries()) {
    if (definition.value === value) candidates.push(name);
  }
  const preferred = candidates.find((name) => name.startsWith("size/"))
    ?? candidates.find((name) => name.startsWith("space/"))
    ?? candidates.find((name) => name.startsWith("radius/"))
    ?? candidates[0];
  return preferred ? token(preferred) : value;
};

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function rendererKey(contract) {
  return contract.id || slug(contract.logicalName);
}

function textRoleFor(contract, spec, slot) {
  const key = Object.keys(spec?.textRoles ?? {}).find((name) => name.toLowerCase() === slot.toLowerCase())
    ?? Object.keys(spec?.textRoles ?? {}).find((name) => name.toLowerCase().includes(slot.toLowerCase()))
    ?? (slot === "description" ? "Description" : slot === "title" ? "Title" : slot === "label" ? "Label" : "Value");
  const role = spec?.textRoles?.[key];
  return role ? role.replace(/_/g, "-").toLowerCase() : "body-m";
}

function contentTokenForSlot(slot) {
  const normalized = String(slot ?? "").toLowerCase();
  if (normalized === "placeholder") return "text/tertiary";
  if (["description", "supporting", "meta", "count", "secondary", "advanced-search"].includes(normalized)) return "text/secondary";
  return "text/primary";
}

function defaultText(slot, contract) {
  if (slot === "advanced-search") return "高级";
  if (slot === "placeholder") return contract.id === "search" ? "搜索邮件" : "请输入内容";
  if (slot === "value") return contract.id === "search" ? "搜索邮件" : "示例内容";
  if (slot === "label" || slot === "title") return "示例文字";
  if (slot === "description" || slot === "supporting" || slot === "content") return "示例说明";
  if (slot === "count") return "12";
  return "示例";
}

function propNameForSlot(slot) {
  const aliases = {
    "advanced-search": "advancedSearchLabel",
    placeholder: "placeholder",
    value: "value",
    label: "label",
    title: "title",
    description: "description",
    supporting: "supporting",
    content: "content",
    count: "count",
  };
  return aliases[slot] ?? slot.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isTextSlot(slot) {
  return ["label", "title", "description", "supporting", "content", "value", "placeholder", "advanced-search", "count", "meta", "message", "primary", "secondary"].includes(slot);
}

function isBooleanProp(name) {
  return /^(disabled|selected|checked|open|expanded|focused|unread|loading|indeterminate|multiple|advancedSearch)$/.test(name);
}

// HTML contracts describe the host surface in names such as
// `Search/White Surface/Default`; they do not say that the component itself
// must be white.  Form controls are deliberately inverted (white host =>
// neutral-dark/05 control, gray host => white control), while ordinary list
// and navigation items remain transparent until a state explicitly owns a
// surface.  Keeping this rule here prevents the component library from
// manufacturing a white card behind every slot.
function surfaceFor(logicalName) {
  if (/Button\/Primary/.test(logicalName)) return "surface/primary";
  if (/Button\/Secondary/.test(logicalName)) return "surface/subtle";
  if (/Input|Search|Textarea|Select|Combobox|Field|Native Select/.test(logicalName)) {
    if (/Gray Surface/.test(logicalName)) return "surface/default";
    if (/White Surface/.test(logicalName) || /Default/.test(logicalName)) return "surface/subtle";
  }
  if (/^Card\//.test(logicalName)) return "surface/default";
  if (/^Dialog\//.test(logicalName) || /^Alert Dialog\//.test(logicalName)) return "surface/default";
  if (/Gray Canvas/.test(logicalName)) return "surface/subtle";
  // White Canvas/White Surface is a placement context for list, navigation,
  // and content components. Their default root is transparent by design.
  return null;
}

function radiusFor(logicalName, spec) {
  if (spec?.radiusToken) return spec.radiusToken;
  if (/Card|List Item|List Container|Table|Dialog|Attachment/.test(logicalName)) return "radius/card";
  if (/Button|Search|Input|Select|Combobox|Badge|Sidebar/.test(logicalName)) return "radius/control";
  return null;
}

function iconAliasFor(contract, slot, index = 0) {
  const aliases = contract.iconAliases ?? [];
  if (slot === "leading" || slot === "icon" || slot === "menu-trigger" || slot === "trigger") return aliases[index] ?? aliases[0] ?? null;
  if (aliases.length && slot === "trailing") return aliases[Math.min(index + 1, aliases.length - 1)] ?? aliases[0];
  return null;
}

function resolveIconSafely(alias) {
  if (!alias) return null;
  try {
    const icon = resolvePixsoIcon(alias);
    usedIcons.set(alias, icon);
    return icon;
  } catch (_) {
    missingIconAliases.add(alias);
    return null;
  }
}

const SPEC_ALIASES = {
  "Accordion/Default": "Accordion/Collapsed",
  "Alert/Default": "Alert/Neutral",
  "Avatar/Default": "Avatar/40/Fallback",
  "Badge/Default": "Badge/Neutral",
  "Checkbox/Default": "Checkbox/Unchecked/Default",
  "Collapsible/Default": "Collapsible/Collapsed",
  "Combobox/Default": "Combobox/White Surface/Default",
  "Data Table/Default": "Table/Default",
  "Native Select/Default": "Select/White Surface/Default",
  "Radio Group/Default": "Radio/Unselected/Default",
  "Select/Default": "Select/White Surface/Default",
  "Switch/Default": "Switch/Off/Default",
  "Tabs/Default": "Tabs/Filled/Default",
  "Textarea/Default": "Textarea/White Surface/Default",
  "Titlebar/Default": "Titlebar/L/Normal",
};

function resolveSpec(logicalName, contract) {
  const requested = contract.sourceVariant === "advanced-search"
    ? "Search/White Surface/Default"
    : logicalName;
  if (specs[requested]) return { name: requested, value: specs[requested] };
  const alias = SPEC_ALIASES[logicalName];
  if (alias && specs[alias]) return { name: alias, value: specs[alias] };
  const family = logicalName.split("/")[0];
  const familyCandidate = Object.keys(specs).find((name) => name.startsWith(`${family}/`));
  return familyCandidate ? { name: familyCandidate, value: specs[familyCandidate] } : { name: null, value: {} };
}

function layoutForRoot(spec, logicalName = "") {
  const sizing = spec?.sizing ?? {};
  const width = sizing.masterWidth === "hug" ? "hug" : sizing.masterWidth === "fill" ? "fill" : numericToken(sizing.masterWidth ?? 280);
  const height = sizing.height === "hug" ? "hug" : numericToken(sizing.height ?? 40);
  const family = String(logicalName).split("/")[0];
  const gap = maybeToken(spec?.gapToken) ?? (spec?.gap !== undefined ? numericToken(spec.gap) : family === "Search" ? numericToken(0) : family === "Button" ? numericToken(8) : null);
  const paddingX = spec?.paddingX !== undefined
    ? numericToken(spec.paddingX)
    : family === "Titlebar" ? numericToken(24)
      : family === "Card" ? numericToken(16)
        : family === "List Item" ? numericToken(12)
          : /Input|Search|Textarea|Select|Combobox|Field|Native Select/.test(logicalName) ? numericToken(16)
            : family === "Button" ? numericToken(16)
              : null;
  const paddingY = spec?.paddingY !== undefined ? numericToken(spec.paddingY) : null;
  const padding = {};
  if (paddingX !== null && paddingX !== undefined) { padding.left = paddingX; padding.right = paddingX; }
  if (paddingY !== null && paddingY !== undefined) { padding.top = paddingY; padding.bottom = paddingY; }
  return {
    direction: String(spec?.direction ?? "horizontal").toUpperCase(),
    width,
    height,
    gap,
    align: "CENTER",
    distribution: String(logicalName).startsWith("Titlebar/") ? "SPACE_BETWEEN" : undefined,
    padding,
  };
}

function makeContractProperties(contract) {
  const properties = {};
  for (const prop of contract.props ?? []) {
    if (/^on[A-Z]/.test(prop) || prop.startsWith("aria")) continue;
    properties[prop] = { type: isBooleanProp(prop) ? "BOOLEAN" : "TEXT", defaultValue: isBooleanProp(prop) ? false : "" };
  }
  if (contract.id === "search") {
    properties.advancedSearchLabel = { type: "TEXT", defaultValue: "高级" };
  }
  return properties;
}

// Slider is not a generic row of textual slots. Its usable visual contract is
// a layered track, progress fill, and thumb. Keeping this explicit prevents a
// component-library import from degrading it to the old placeholder trio of
// `label/content/description` frames.
function sliderOperations(contract) {
  const logicalName = contract.logicalName;
  const rootId = `component-${slug(logicalName)}`;
  const controlWidth = 200;
  const value = 84;
  const trackX = 8;
  const trackWidth = controlWidth - 16;
  const fillWidth = trackWidth * (value / 100);
  const operations = [];
  const add = (operation) => operations.push({ phase: "library", region: contract.category ?? "component-library", ...operation });
  const addText = (nodeId, parentId, name, characters, role, propName = null) => add({
    nodeId,
    parentId,
    op: "create-text",
    name,
    layout: { direction: "HORIZONTAL", width: "hug", height: "hug", align: "CENTER", padding: {} },
    style: { fill: token(propName === "value" ? "text/secondary" : "text/primary"), textStyle: textStyle(role) },
    characters,
    ...(propName ? { propertyBinding: { propName, slotName: propName } } : {}),
    metadata: { source: "html-slider-visual-contract", namedSlot: propName, textRole: role },
  });
  const addRect = (nodeId, parentId, name, layout, fill, radiusToken) => add({
    nodeId,
    parentId,
    op: "create-rectangle",
    name,
    layout: { direction: "NONE", positioning: "ABSOLUTE", ...layout, padding: {} },
    style: { fill: token(fill), radius: token(radiusToken) },
    metadata: { source: "html-slider-visual-contract" },
  });
  const addEllipse = (nodeId, parentId, name, layout, fill) => add({
    nodeId,
    parentId,
    op: "create-ellipse",
    name,
    layout: { direction: "NONE", positioning: "ABSOLUTE", ...layout, padding: {} },
    style: { fill: token(fill) },
    metadata: { source: "html-slider-visual-contract" },
  });

  add({
    nodeId: rootId,
    parentId: null,
    op: "create-component",
    name: logicalName,
    layout: { direction: "HORIZONTAL", width: 280, height: 24, gap: token("space/3"), align: "CENTER", padding: {} },
    style: { fill: { kind: "transparent" } },
    componentContract: {
      logicalName,
      rendererKey: rendererKey(contract),
      sourceEvidence: {
        html: contract.implementations?.html ?? contract.frameworks?.html?.source ?? null,
        contractId: contract.id,
        contractPath: path.relative(repositoryRoot, contractsPath),
        pixsoSpec: logicalName,
      },
      props: contract.props ?? [],
      properties: {
        ...makeContractProperties(contract),
        // Component properties are the editable Pixso defaults; leaving them
        // empty overwrites the visible specimen text after binding.
        label: { type: "TEXT", defaultValue: "透明度" },
        value: { type: "TEXT", defaultValue: String(value) },
      },
      slots: ["label", "control", "value"],
      slotContracts: {
        label: { role: "body-m" },
        control: { role: "slider-visual", overlap: true },
        value: { role: "body-m" },
      },
      variants: contract.variants ?? ["style-1", "style-2"],
      states: contract.states ?? [],
      tokenRoles: ["brand/100", "neutral-dark/05", "neutral-light/100", "text/primary", "text/secondary"],
    },
  });
  const labelId = `${rootId}-slot-label`;
  add({ nodeId: labelId, parentId: rootId, op: "create-frame", name: "#label", layout: { direction: "HORIZONTAL", width: "hug", height: 24, align: "CENTER", padding: {} }, style: { fill: { kind: "transparent" } }, slotName: "label", metadata: { source: "html-slider-visual-contract", namedSlot: "label" } });
  addText(`${labelId}-text`, labelId, "label text", "透明度", "body-m", "label");
  const controlId = `${rootId}-slot-control`;
  add({ nodeId: controlId, parentId: rootId, op: "create-frame", name: "#control", layout: { direction: "NONE", width: controlWidth, height: 24, align: "CENTER", padding: {} }, style: { fill: { kind: "transparent" } }, slotName: "control", metadata: { source: "html-slider-visual-contract", namedSlot: "control", intentionalOverlap: true } });
  addRect(`${controlId}-track`, controlId, "Track · neutral-dark/05", { x: trackX, y: 10, width: trackWidth, height: 4 }, "neutral-dark/05", "radius/full");
  addRect(`${controlId}-fill`, controlId, "Fill · brand/100 · 84%", { x: trackX, y: 10, width: fillWidth, height: 4 }, "brand/100", "radius/full");
  addEllipse(`${controlId}-thumb`, controlId, "Thumb · brand/100 · 16px", { x: trackX + fillWidth - 8, y: 4, width: 16, height: 16 }, "brand/100");
  const valueId = `${rootId}-slot-value`;
  add({ nodeId: valueId, parentId: rootId, op: "create-frame", name: "#value", layout: { direction: "HORIZONTAL", width: "hug", height: 24, align: "CENTER", padding: {} }, style: { fill: { kind: "transparent" } }, slotName: "value", metadata: { source: "html-slider-visual-contract", namedSlot: "value" } });
  addText(`${valueId}-text`, valueId, "value text", String(value), "body-m", "value");
  return { operations, rootId, iconSlots: [] };
}

function componentLibraryRoot(contract, { layout, style, slots = contract.slots, variants = contract.variants, properties = {}, slotContracts = contract.slotContracts } = {}) {
  const logicalName = contract.logicalName;
  const resolvedSpec = resolveSpec(logicalName, contract);
  const rootId = "component-" + slug(logicalName);
  const operation = {
    nodeId: rootId,
    parentId: null,
    op: "create-component",
    phase: "library",
    name: logicalName,
    region: contract.category ?? "component-library",
    layout,
    style,
    componentContract: {
      logicalName,
      rendererKey: rendererKey(contract),
      sourceEvidence: {
        html: contract.implementations?.html ?? contract.frameworks?.html?.source ?? null,
        contractId: contract.id,
        contractPath: path.relative(repositoryRoot, contractsPath),
        pixsoSpec: resolvedSpec.name,
      },
      props: contract.props ?? [],
      properties: { ...makeContractProperties(contract), ...properties },
      slots,
      slotContracts: slotContracts ?? {},
      variants: variants ?? [],
      states: contract.states ?? [],
      tokenRoles: contract.tokenRoles ?? [],
    },
  };
  return { rootId, operations: [operation] };
}

function specializedComponentOperations(contract) {
  const logicalName = contract.logicalName;
  const region = contract.category ?? "component-library";
  const rootId = "component-" + slug(logicalName);
  const operations = [];
  const add = (operation) => operations.push({ phase: "library", region, ...operation });
  const addFrame = (nodeId, parentId, name, layout, options = {}) => add({
    nodeId,
    parentId,
    op: "create-frame",
    name,
    layout,
    style: options.style ?? { fill: { kind: "transparent" } },
    ...(options.slotName ? { slotName: options.slotName } : {}),
    metadata: { source: "html-component-contract", ...(options.metadata ?? {}) },
  });
  const addText = (nodeId, parentId, name, characters, role, colorRef = "text/primary", propName = null, slotName = null) => add({
    nodeId,
    parentId,
    op: "create-text",
    name,
    layout: { direction: "HORIZONTAL", width: "hug", height: "hug", align: "CENTER", padding: {} },
    style: { fill: token(colorRef), textStyle: textStyle(role) },
    characters,
    ...(propName ? { propertyBinding: { propName, ...(slotName ? { slotName } : {}) } } : {}),
    metadata: { source: "html-component-contract", ...(slotName ? { namedSlot: slotName } : {}), textRole: role, colorRole: colorRef },
  });
  const addIcon = (nodeId, parentId, name, alias, size = 16, colorRef = "neutral-dark/60") => {
    const icon = resolveIconSafely(alias);
    if (!icon) return;
    add({
      nodeId,
      parentId,
      op: "create-icon",
      name,
      layout: { direction: "NONE", width: numericToken(size), height: numericToken(size), align: "CENTER", padding: {} },
      style: { fill: token(colorRef) },
      iconRef: { alias, size, svg: icon.svg },
      metadata: { source: "html-component-contract", semanticIcon: alias },
    });
  };

  if (logicalName === "Input/Tag Entry/Default") {
    const built = componentLibraryRoot(contract, {
      layout: { direction: "HORIZONTAL", width: 360, height: 56, gap: token("space/4"), align: "CENTER", padding: {} },
      style: { fill: { kind: "transparent" } },
      slots: ["label", "value", "tags", "suggestions"],
      properties: {
        label: { type: "TEXT", defaultValue: "参与成员" },
        placeholder: { type: "TEXT", defaultValue: "输入姓名后按 Enter" },
        surface: { type: "TEXT", defaultValue: "white" },
        tags: { type: "TEXT", defaultValue: "林娜" },
        variant: { type: "TEXT", defaultValue: "tag-entry" },
      },
    });
    operations.push(...built.operations);
    const labelSlot = rootId + "-slot-label";
    const valueSlot = rootId + "-slot-value";
    const tagsSlot = rootId + "-slot-tags";
    const suggestionsSlot = rootId + "-slot-suggestions";
    addFrame(labelSlot, rootId, "#label", { direction: "HORIZONTAL", width: 88, height: 56, align: "CENTER", padding: {} }, { slotName: "label" });
    addText(rootId + "-label-text", labelSlot, "Label · 参与成员", "参与成员", "body-l", "text/secondary", "label", "label");
    addFrame(valueSlot, rootId, "#value", { direction: "HORIZONTAL", width: "fill", height: 40, gap: token("space/2"), align: "CENTER", padding: {} }, {
      slotName: "value",
      style: { fill: { kind: "transparent" }, stroke: token("neutral-dark/10"), strokeEdges: ["bottom"], strokeWeights: { bottom: 1 } },
    });
    addFrame(tagsSlot, valueSlot, "#tags", { direction: "HORIZONTAL", width: "hug", height: 32, gap: token("space/2"), align: "CENTER", padding: {} }, {
      slotName: "tags",
      metadata: { sharedComponent: "Chips/Default", hover: false, expandedHitArea: false },
    });
    add({
      nodeId: rootId + "-tag-member",
      parentId: tagsSlot,
      op: "create-instance",
      name: "Selected member · 林娜",
      layout: { direction: "HORIZONTAL", width: "hug", height: 32, align: "CENTER", padding: {} },
      style: { fill: { kind: "transparent" } },
      componentRef: { logicalName: "Chips/Default", pixsoName: "Chips", componentSetName: "Chips", variant: { "状态": "Default" } },
      props: { label: "林娜", closable: true },
      slots: { label: "林娜" },
      metadata: { source: "html-component-contract", sharedComponent: "Chips/Default" },
    });
    addFrame(suggestionsSlot, valueSlot, "#suggestions", {
      direction: "VERTICAL",
      positioning: "ABSOLUTE",
      x: 0,
      y: 40,
      width: "fill",
      height: 120,
      gap: token("space/1"),
      align: "MIN",
      padding: { top: token("space/2"), right: token("space/2"), bottom: token("space/2"), left: token("space/2") },
      clipsContent: false,
    }, {
      slotName: "suggestions",
      style: { fill: token("neutral-light/100"), stroke: token("neutral-dark/10"), strokeEdges: ["top", "right", "bottom", "left"], radius: maybeToken("radius/card") ?? numericToken(12), effectStyle: addStyle(tokens.styleForEffect("shadow-2")) },
      metadata: { semanticRole: "listbox", defaultVisibility: "hidden", optionRole: "option", compositionStrategy: "direct-native-nodes" },
    });
    for (const [index, label] of ["林娜", "王昊", "陈佳"].entries()) {
      const optionId = rootId + "-suggestion-" + (index + 1);
      addFrame(optionId, suggestionsSlot, "Option · " + label, { direction: "HORIZONTAL", width: "fill", height: 32, align: "CENTER", padding: { left: token("space/2"), right: token("space/2") } });
      addText(optionId + "-text", optionId, label + " option", label, "body-l", "text/primary");
    }
    return { operations, rootId, iconSlots: [] };
  }

  if (logicalName === "Search/Scoped/Default") {
    const built = componentLibraryRoot(contract, {
      layout: { direction: "HORIZONTAL", width: 360, height: 40, gap: token("space/0"), align: "CENTER", padding: { left: token("space/4"), right: token("space/3") } },
      style: { fill: token("neutral-dark/05"), radius: maybeToken("radius/control") ?? numericToken(8) },
      slots: ["scope-selector", "leading", "value", "clear", "advanced-search"],
      properties: {
        scope: { type: "TEXT", defaultValue: "全部" },
        defaultScope: { type: "TEXT", defaultValue: "全部" },
        scopeOptions: { type: "TEXT", defaultValue: "全部,标题,内容" },
        scopeLabel: { type: "TEXT", defaultValue: "搜索范围" },
        advancedSearch: { type: "BOOLEAN", defaultValue: true },
        advancedSearchLabel: { type: "TEXT", defaultValue: "高级" },
        surface: { type: "TEXT", defaultValue: "white" },
      },
    });
    operations.push(...built.operations);
    const scopeSlot = rootId + "-slot-scope-selector";
    const leadingSlot = rootId + "-slot-leading";
    const valueSlot = rootId + "-slot-value";
    addFrame(scopeSlot, rootId, "#scope-selector", { direction: "HORIZONTAL", width: 72, height: 40, gap: token("space/1"), align: "CENTER", padding: { right: token("space/3") } }, { slotName: "scope-selector", metadata: { compositionStrategy: "direct-native-nodes" } });
    addText(rootId + "-scope-value", scopeSlot, "Scope · 全部", "全部", "body-m", "text/secondary", "scope", "scope-selector");
    addIcon(rootId + "-scope-chevron", scopeSlot, "Scope chevron", "navigation/chevron-down", 16);
    add({ nodeId: rootId + "-scope-divider", parentId: scopeSlot, op: "create-rectangle", name: "Scope divider", layout: { direction: "NONE", width: 1, height: 16, align: "CENTER", padding: {} }, style: { fill: token("neutral-dark/10") }, metadata: { source: "html-component-contract", dividerToken: "color.border" } });
    addFrame(leadingSlot, rootId, "#leading", { direction: "HORIZONTAL", width: 16, height: 16, align: "CENTER", padding: {} }, { slotName: "leading" });
    addIcon(rootId + "-search-icon", leadingSlot, "Search icon", "field/search", 16);
    addFrame(valueSlot, rootId, "#value", { direction: "HORIZONTAL", width: "fill", height: 40, align: "CENTER", primaryAlign: "MIN", padding: {} }, { slotName: "value" });
    addText(rootId + "-placeholder", valueSlot, "Placeholder · 搜索项目", "搜索项目", "body-l", "text/tertiary", "placeholder", "value");
    addFrame(rootId + "-slot-clear", valueSlot, "#clear", { direction: "HORIZONTAL", positioning: "ABSOLUTE", x: 168, y: 4, width: 32, height: 32, align: "CENTER", padding: {} }, { slotName: "clear", metadata: { optional: true, defaultVisibility: "hidden" } });
    const advancedSlot = rootId + "-slot-advanced-search";
    addFrame(advancedSlot, rootId, "#advanced-search", { direction: "HORIZONTAL", width: "hug", height: 32, align: "CENTER", padding: {} }, { slotName: "advanced-search" });
    addText(rootId + "-advanced-label", advancedSlot, "Advanced search · 高级", "高级", "body-m", "text/secondary", "advancedSearchLabel", "advanced-search");
    return { operations, rootId, iconSlots: [] };
  }

  return null;
}

function componentOperations(contract) {
  const specialized = specializedComponentOperations(contract);
  if (specialized) return specialized;
  if (contract.logicalName === "Slider/Default") return sliderOperations(contract);
  const logicalName = contract.logicalName;
  const resolvedSpec = resolveSpec(logicalName, contract);
  const spec = resolvedSpec.value;
  const missingBefore = new Set(missingIconAliases);
  const rootId = `component-${slug(logicalName)}`;
  const operations = [];
  const slots = contract.slots ?? [];
  const rootStyle = {};
  const surface = surfaceFor(logicalName);
  if (surface) rootStyle.fill = maybeToken(surface);
  else rootStyle.fill = { kind: "transparent" };
  const radius = maybeToken(radiusFor(logicalName, spec));
  if (radius) rootStyle.radius = radius;
  operations.push({
    nodeId: rootId,
    parentId: null,
    op: "create-component",
    phase: "library",
    name: logicalName,
    region: contract.category ?? "component-library",
    layout: layoutForRoot(spec, logicalName),
    style: rootStyle,
    componentContract: {
      logicalName,
      rendererKey: rendererKey(contract),
      sourceEvidence: {
        html: contract.implementations?.html ?? contract.frameworks?.html?.source ?? null,
        contractId: contract.id,
        contractPath: path.relative(repositoryRoot, contractsPath),
        pixsoSpec: resolvedSpec.name,
      },
      props: contract.props ?? [],
      properties: makeContractProperties(contract),
      slots,
      slotContracts: contract.slotContracts ?? {},
      variants: contract.variants ?? [],
      states: contract.states ?? [],
      tokenRoles: contract.tokenRoles ?? [],
    },
  });

  if (contract.id === "titlebar") {
    const addFrame = (nodeId, parentId, name, layout, slotName = null) => {
      operations.push({
        nodeId,
        parentId,
        op: "create-frame",
        phase: "library",
        name,
        region: contract.category ?? "component-library",
        layout,
        style: { fill: { kind: "transparent" } },
        ...(slotName ? { slotName } : {}),
        metadata: { source: "html-component-contract", ...(slotName ? { namedSlot: slotName } : {}) },
      });
    };
    const addText = (nodeId, parentId, name, characters, role, propName = null) => {
      operations.push({
        nodeId,
        parentId,
        op: "create-text",
        phase: "library",
        name,
        region: contract.category ?? "component-library",
        layout: { direction: "HORIZONTAL", width: "hug", height: "hug", align: "CENTER", padding: {} },
        style: { fill: token(contentTokenForSlot(propName ?? "label")), textStyle: textStyle(role) },
        characters,
        ...(propName ? { propertyBinding: { propName } } : {}),
        metadata: { source: "html-component-contract", textRole: role },
      });
    };
    const addIcon = (nodeId, parentId, name, alias, size) => {
      if (!resolveIconSafely(alias)) return;
      operations.push({
        nodeId,
        parentId,
        op: "create-icon-slot",
        phase: "library",
        name,
        region: contract.category ?? "component-library",
        layout: { direction: "HORIZONTAL", width: numericToken(size), height: numericToken(size), align: "CENTER", padding: {} },
        style: { fill: { kind: "transparent" } },
        iconSlot: { alias, size, hotZone: { alignment: "CENTER", axes: "BOTH" } },
        metadata: { source: "html-component-contract", semanticIcon: alias },
      });
    };
    const titlebarGap = maybeToken("gap/titlebar-brand") ?? numericToken(8);
    const actionGap = maybeToken("gap/button-group") ?? numericToken(8);
    const leadingId = `${rootId}-slot-leading`;
    addFrame(leadingId, rootId, "#leading", { direction: "HORIZONTAL", width: numericToken(192), height: numericToken(24), gap: titlebarGap, align: "CENTER", padding: {} }, "leading");
    addIcon(`${leadingId}-icon`, leadingId, "Brand icon", "navigation/grid", 24);
    const labelId = `${rootId}-slot-label`;
    addFrame(labelId, leadingId, "#label", { direction: "HORIZONTAL", width: "fill", height: "hug", align: "CENTER", padding: {} }, "label");
    addText(`${labelId}-text`, labelId, "label text", "Coremail", "subtitle-m", "label");

    const titleId = `${rootId}-slot-main-content-title`;
    addFrame(titleId, rootId, "#main-content-title", { direction: "HORIZONTAL", width: "fill", height: "hug", align: "CENTER", padding: {} }, "main-content-title");
    addText(`${titleId}-text`, titleId, "main content title text", "项目内容", "title-s", "paneTitle");

    const detailActionsId = `${rootId}-slot-main-detail-actions`;
    addFrame(detailActionsId, rootId, "#main-detail-actions", { direction: "HORIZONTAL", width: "hug", height: numericToken(40), gap: actionGap, align: "CENTER", padding: {} }, "main-detail-actions");
    const replyActionId = `${detailActionsId}-reply`;
    addFrame(replyActionId, detailActionsId, "Action · 回复", { direction: "HORIZONTAL", width: numericToken(80), height: numericToken(40), gap: maybeToken("gap/button-icon-label") ?? numericToken(8), align: "CENTER", padding: { left: numericToken(12), right: numericToken(12) } });
    addIcon(`${replyActionId}-icon`, replyActionId, "Reply icon", "action/more", 20);
    addText(`${replyActionId}-label`, replyActionId, "Reply label", "回复", "body-m");

    const windowActionsId = `${rootId}-slot-actions`;
    addFrame(windowActionsId, rootId, "#actions", { direction: "HORIZONTAL", width: numericToken(120), height: numericToken(40), gap: null, distribution: "SPACE_BETWEEN", align: "CENTER", padding: {} }, "actions");
    for (const [index, [action, alias]] of [
      ["minimize", "window/minimize"],
      ["maximize", "window/maximize"],
      ["close", "window/close"],
    ].entries()) {
      const buttonId = `${windowActionsId}-${action}`;
      addFrame(buttonId, windowActionsId, `Window action · ${action}`, { direction: "HORIZONTAL", width: numericToken(40), height: numericToken(40), align: "CENTER", padding: {} });
      addIcon(`${buttonId}-icon`, buttonId, `${action} icon`, alias, 24);
    }
    const rootOperation = operations[0];
    rootOperation.componentContract.iconSourceGaps = [...missingIconAliases].filter((alias) => !missingBefore.has(alias));
    return { operations, rootId, iconSlots: operations.filter((operation) => operation.op === "create-icon-slot") };
  }

  const iconSlots = slots.filter((slot) => iconAliasFor(contract, slot));
  let iconIndex = 0;
  for (const slot of slots) {
    const slotId = `${rootId}-slot-${slug(slot)}`;
    const requestedAlias = iconAliasFor(contract, slot, iconIndex);
    const alias = resolveIconSafely(requestedAlias) ? requestedAlias : null;
    const slotLayout = { direction: "HORIZONTAL", width: slot === "value" ? "fill" : alias ? numericToken(Number(spec.iconSize ?? 20)) : "hug", height: alias ? numericToken(Number(spec.iconSize ?? 20)) : "hug", align: "CENTER", gap: null, padding: slot === "advanced-search" ? { right: token("space/2") } : {} };
    operations.push({
      nodeId: slotId,
      parentId: rootId,
      op: "create-frame",
      phase: "library",
      name: `#${slot}`,
      region: contract.category ?? "component-library",
      layout: slotLayout,
      style: { fill: { kind: "transparent" } },
      slotName: slot,
      metadata: { source: "html-component-contract", namedSlot: slot },
    });
    if (alias) {
      const iconId = `${slotId}-icon`;
      const size = Number(spec.iconSize ?? contract.iconSlots?.find((item) => item.slot === slot)?.displaySizes?.[0] ?? 20);
      operations.push({
        nodeId: iconId,
        parentId: slotId,
        op: "create-icon-slot",
        phase: "library",
        name: "Icon slot",
        region: contract.category ?? "component-library",
        layout: { direction: "HORIZONTAL", width: numericToken(size), height: numericToken(size), align: "CENTER", padding: {} },
        style: { fill: { kind: "transparent" } },
        iconSlot: { alias, size, hotZone: { alignment: "CENTER", axes: "BOTH" } },
        metadata: { source: "html-component-contract", namedSlot: slot },
      });
      iconIndex += 1;
    } else if (isTextSlot(slot)) {
      const textId = `${slotId}-text`;
      const role = textRoleFor(contract, spec, slot);
      operations.push({
        nodeId: textId,
        parentId: slotId,
        op: "create-text",
        phase: "library",
        name: `${slot} text`,
        region: contract.category ?? "component-library",
        layout: { direction: "HORIZONTAL", width: "hug", height: "hug", align: "CENTER", padding: {} },
        style: { fill: token(contentTokenForSlot(slot)), textStyle: textStyle(role) },
        characters: defaultText(slot, contract),
        propertyBinding: { propName: propNameForSlot(slot), slotName: slot },
        metadata: { source: "html-component-contract", namedSlot: slot, textRole: role },
      });
    }
  }
  const rootOperation = operations[0];
  rootOperation.componentContract.iconSourceGaps = [...missingIconAliases].filter((alias) => !missingBefore.has(alias));
  return { operations, rootId, iconSlots };
}

const allOperations = [];
const reviewGrid = {
  columns: 4,
  cellWidth: 360,
  cellHeight: 220,
  gapX: 48,
  gapY: 48,
  insetX: 64,
  insetY: 64,
};
for (const [index, contract] of selected.entries()) {
  if (!registryNames.has(contract.logicalName)) {
    // The HTML contract is authoritative. Keep the warning in the plan so the
    // registry gap is visible rather than silently dropping the component.
    process.stderr.write(`warning: HTML component is not in Pixso registry: ${contract.logicalName}\n`);
  }
  const componentOps = componentOperations(contract).operations;
  // Components are direct children of a Pixso Page, not children of an
  // auto-layout frame. Give every root a deterministic review-grid position;
  // without this, Pixso places all 52 roots at (0, 0), making the audit page
  // look like one giant component.
  const root = componentOps[0];
  root.layout = {
    ...(root.layout ?? {}),
    x: reviewGrid.insetX + (index % reviewGrid.columns) * (reviewGrid.cellWidth + reviewGrid.gapX),
    y: reviewGrid.insetY + Math.floor(index / reviewGrid.columns) * (reviewGrid.cellHeight + reviewGrid.gapY),
  };
  allOperations.push(...componentOps);
}

const resourceOperations = [
  { op: "create-page", phase: "resources", page: { name: libraryPage } },
  ...[...usedVariables.values()].map((value) => ({ op: "ensure-variable", phase: "resources", variableRef: value.ref, name: value.name, collection: value.collection, mode: value.mode, value: value.value })),
  ...[...usedStyles.values()].map((value) => ({ op: "ensure-style", phase: "resources", styleRef: value.ref, kind: String(value.ref).includes("Effect") ? "effect" : "text" })),
  ...[...usedIcons.values()].map((value) => ({ op: "ensure-icon", phase: "resources", iconRef: { alias: value.alias } })),
  { op: "ensure-font", phase: "resources", variableRef: "font/family/sans", family: "HarmonyOS Sans" },
];
const iconOperations = allOperations.flatMap((operation) => operation.op === "create-icon-slot" ? [{ op: "hydrate-icon", phase: "icon-hydration", targetNodeId: operation.nodeId, name: operation.name, region: operation.region, iconRef: { alias: operation.iconSlot.alias, size: operation.iconSlot.size, hotZone: operation.iconSlot.hotZone ?? { alignment: "CENTER", axes: "BOTH" } }, style: { fill: token("icon/default") } }] : []);

const plan = {
  schemaVersion: 1,
  kind: "pixso-component-library-plan",
  execution: {
    resolveGuidsAtRuntime: true,
    libraryPage,
    targetPage: libraryPage,
    canonicalKey: "text-to-ui-html-component-library",
    mode: "component-library",
    destructive: false,
    preserveExistingComponents: true,
    reviewOnly: libraryPage !== "NewComponents",
    reviewGrid,
    excludedComponents: [...excluded],
    minimumRuntimeVersion: PIXSO_PLUGIN_RUNTIME_VERSION,
    // A partial library import must not reuse the last publication for the
    // whole page.  Include the exact ordered component selection so a Slider
    // plan is independently idempotent from a previous navigation batch.
    // Include the plan grammar revision as well as the selection. A component
    // can keep the same logical name while its generated visual structure
    // changes (for example Slider's former generic slots became real track,
    // fill, and thumb geometry); that must publish a new bridge job.
    agentContract: permanentAgentContract(`component-library:v4:${libraryPage}:${selected.map((contract) => contract.logicalName).join("|")}`),
  },
  page: { name: libraryPage, targetPage: libraryPage, reviewOnly: libraryPage !== "NewComponents", excludedComponents: [...excluded] },
  resources: {
    componentLibraryPage: libraryPage,
    variableAliases: {},
    variables: [...usedVariables.values()],
    styles: [...usedStyles.values()],
    icons: [...usedIcons.values()],
    font: "font/family/sans",
  },
  phases: [
    { id: "resources", label: "资源预检", operationCount: resourceOperations.length },
    { id: "library", label: "创建 HTML 组件", operationCount: allOperations.length },
    { id: "icon-hydration", label: "图标填充", operationCount: iconOperations.length },
  ],
  operations: [...resourceOperations, ...allOperations, ...iconOperations],
  summary: {
    componentCount: selected.length,
    operationCount: resourceOperations.length + allOperations.length + iconOperations.length,
    componentNodeCount: allOperations.filter((operation) => operation.op === "create-component").length,
    namedSlotCount: allOperations.filter((operation) => operation.slotName).length,
    iconSlotCount: allOperations.filter((operation) => operation.op === "create-icon-slot").length,
    hydratedIconCount: iconOperations.length,
    tokenBindingCount: allOperations.filter((operation) => operation.style && Object.keys(operation.style).length).length,
    registryGapCount: selected.filter((contract) => !registryNames.has(contract.logicalName)).length,
    specBackedCount: selected.filter((contract) => Boolean(resolveSpec(contract.logicalName, contract).name)).length,
    specGapCount: selected.filter((contract) => !resolveSpec(contract.logicalName, contract).name).length,
    excludedComponents: [...excluded],
  },
};

writeJson(args.out, plan);
if (missingIconAliases.size) {
  process.stderr.write(`warning: unresolved semantic icon aliases (component slots kept, icon fill deferred): ${[...missingIconAliases].join(", ")}\n`);
}
console.log(JSON.stringify({ ok: true, plan: path.resolve(args.out), ...plan.summary }, null, 2));
