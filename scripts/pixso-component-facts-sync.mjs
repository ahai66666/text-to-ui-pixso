#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  componentFactsNames,
  refreshMappingProfileSummary,
} from "./mapping-registry-lib.mjs";

export const COMPONENT_FACTS_SCHEMA_VERSION = 1;
export const COMPONENT_FACTS_KIND = "text-to-ui.pixso-component-facts";
export const COMPONENT_SYNC_KIND = "text-to-ui.pixso-component-sync-proposal";

export const DEFAULT_SYNC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const SYNC_TARGET_FILES = {
  facts: "assets/design-system/pixso-component-facts.json",
  registry: "assets/design-system/mapping-registry.json",
  specs: "assets/design-system/pixso-component-specs.json",
  nativeMap: "assets/design-system/pixso-native-component-map.json",
};

const IDENTITY_KEYS = new Set([
  "id",
  "guid",
  "nodeId",
  "node_id",
  "fileKey",
  "file_key",
  "componentKey",
  "component_key",
  "key",
  "mainComponent",
  "main_component",
  "publishFile",
  "publish_file",
  "version",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function roundNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 1000) / 1000;
}

function stripIdentity(value) {
  if (Array.isArray(value)) return value.map(stripIdentity);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !IDENTITY_KEYS.has(key))
      .map(([key, child]) => [key, stripIdentity(child)]),
  );
}

function normalizedString(value) {
  return String(value ?? "").trim();
}

function normalizeVariantProperties(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, child]) => [normalizedString(key), normalizedString(child)])
      .filter(([key, child]) => key && child)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function parseVariantName(value, allowedAxes = null) {
  const result = {};
  for (const segment of String(value ?? "").split(/\s*,\s*/)) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const axis = segment.slice(0, separator).trim();
    const option = segment.slice(separator + 1).trim();
    if (!axis || !option) continue;
    if (allowedAxes && !allowedAxes.has(axis)) continue;
    result[axis] = option;
  }
  return normalizeVariantProperties(result);
}

function variantName(variantProperties) {
  return Object.entries(normalizeVariantProperties(variantProperties))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function normalizeAxes(value) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([axis, values]) => [
        normalizedString(axis),
        [...new Set((Array.isArray(values) ? values : []).map(normalizedString).filter(Boolean))]
          .sort((left, right) => left.localeCompare(right)),
      ])
      .filter(([axis, values]) => axis && values.length)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mergeVariantAxes(existing, variants) {
  const axes = new Map(
    Object.entries(normalizeAxes(existing)).map(([axis, values]) => [axis, new Set(values)]),
  );
  for (const item of variants) {
    for (const [axis, value] of Object.entries(item.variantProperties ?? {})) {
      if (!axes.has(axis)) axes.set(axis, new Set());
      axes.get(axis).add(value);
    }
  }
  return Object.fromEntries(
    [...axes.entries()]
      .map(([axis, values]) => [axis, [...values].sort((left, right) => left.localeCompare(right))])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizePadding(value) {
  if (!isRecord(value)) return undefined;
  const padding = {};
  for (const key of ["top", "right", "bottom", "left"]) {
    const number = roundNumber(value[key]);
    if (number !== null) padding[key] = number;
  }
  return Object.keys(padding).length ? padding : undefined;
}

function normalizeGeometry(value) {
  if (!isRecord(value)) return undefined;
  const geometry = {};
  for (const key of ["width", "height", "itemSpacing", "cornerRadius"]) {
    const number = roundNumber(value[key]);
    if (number !== null) geometry[key] = number;
  }
  const padding = normalizePadding(value.padding);
  if (padding) geometry.padding = padding;
  for (const key of [
    "layoutMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "layoutSizingHorizontal",
    "layoutSizingVertical",
  ]) {
    const string = normalizedString(value[key]);
    if (string) geometry[key] = string;
  }
  return Object.keys(geometry).length ? geometry : undefined;
}

function normalizeComponent(raw) {
  const name = normalizedString(raw?.name);
  if (!name) throw new Error("Pixso component facts contain a component without a name.");
  const classification = ["business", "helper", "supporting"].includes(raw?.classification)
    ? raw.classification
    : name.startsWith(".") ? "helper" : "business";
  const rawAxes = normalizeAxes(raw?.variantAxes);
  const allowedAxes = new Set(Object.keys(rawAxes));
  const variants = [];
  const seenVariants = new Set();
  for (const rawVariant of Array.isArray(raw?.variants) ? raw.variants : []) {
    const fromProperties = normalizeVariantProperties(
      rawVariant?.variantProperties ?? rawVariant?.properties,
    );
    const properties = Object.keys(fromProperties).length
      ? fromProperties
      : parseVariantName(rawVariant?.name, allowedAxes.size ? allowedAxes : null);
    if (!Object.keys(properties).length) continue;
    const fingerprint = JSON.stringify(properties);
    if (seenVariants.has(fingerprint)) continue;
    seenVariants.add(fingerprint);
    const item = {
      name: variantName(properties),
      variantProperties: properties,
    };
    const geometry = normalizeGeometry(rawVariant?.geometry);
    if (geometry) item.geometry = geometry;
    variants.push(item);
  }
  variants.sort((left, right) => left.name.localeCompare(right.name));
  const normalized = {
    name,
    classification,
    // When the capture contains concrete variants, their real
    // `variantProperties` are authoritative. This deliberately drops stale
    // axes that survive only in a display/config snapshot, such as
    // `density=Default` after the dimension was deleted in Pixso. Sparse
    // name-only baselines retain their declared axes until a real capture
    // replaces them.
    variantAxes: variants.length ? mergeVariantAxes({}, variants) : rawAxes,
  };
  if (variants.length) normalized.variants = variants;
  if (typeof raw?.notes === "string" && raw.notes.trim()) normalized.notes = raw.notes.trim();
  return normalized;
}

export function normalizeFacts(input) {
  if (!isRecord(input)) throw new Error("Pixso component facts must be a JSON object.");
  const stripped = stripIdentity(input);
  const facts = {
    $schema: normalizedString(stripped.$schema) || "./pixso-component-facts.schema.json",
    schemaVersion: COMPONENT_FACTS_SCHEMA_VERSION,
    kind: COMPONENT_FACTS_KIND,
    document: normalizedString(stripped.document) || "Pixso document",
    page: normalizedString(stripped.page) || "NewComponents",
    source: normalizedString(stripped.source) || "Pixso Plugin API read-only component facts",
    capturedAt: normalizedString(stripped.capturedAt) || new Date().toISOString(),
    scope: normalizedString(stripped.scope) || "main-component-inventory-with-geometry",
  };
  if (isRecord(stripped.policy)) facts.policy = clone(stripped.policy);
  facts.componentSets = [...new Set((Array.isArray(stripped.componentSets) ? stripped.componentSets : [])
    .map((item) => normalizeComponent(typeof item === "string" ? { name: item } : item))
    .map((item) => JSON.stringify(item)))].map((item) => JSON.parse(item))
    .sort((left, right) => left.name.localeCompare(right.name));
  facts.standaloneComponents = [...new Set((Array.isArray(stripped.standaloneComponents) ? stripped.standaloneComponents : [])
    .map((item) => normalizeComponent(typeof item === "string" ? { name: item } : item))
    .map((item) => JSON.stringify(item)))].map((item) => JSON.parse(item))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (isRecord(stripped.supportingComponents)) facts.supportingComponents = clone(stripped.supportingComponents);
  if (Array.isArray(stripped.warnings) && stripped.warnings.length) facts.warnings = clone(stripped.warnings);
  return facts;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function stable(value) {
  return JSON.stringify(canonicalize(value));
}

function same(value, other) {
  return stable(value) === stable(other);
}

function comparableFacts(facts) {
  if (!facts) return null;
  const result = clone(facts);
  // A Pixso capture gets a fresh timestamp on every click. It is provenance,
  // not a component-fact change, so it must not trigger a rebuild by itself.
  delete result.capturedAt;
  return result;
}

function componentMap(facts) {
  return new Map([
    ...(facts.componentSets ?? []).map((item) => [item.name, item]),
    ...(facts.standaloneComponents ?? []).map((item) => [item.name, item]),
  ]);
}

function hasCompleteComponentInventory(facts) {
  // A pre-v6 plugin only inspected direct PAGE children. That is incomplete
  // whenever a design library uses SECTION/FRAME organization, and must never
  // be allowed to remove canonical facts or invalidate component mappings.
  return facts?.policy?.captureTraversal === "page-descendant-top-level";
}

function registeredTargetNames(profile) {
  return new Set([
    ...(profile?.componentMappings ?? [])
      .filter((mapping) => mapping?.pixsoTargetStatus === "registered")
      .map((mapping) => mapping.pixsoTarget),
    ...(profile?.endpointComponentMappings ?? [])
      .filter((mapping) => mapping?.pixsoTargetStatus === "registered")
      .map((mapping) => mapping.pixsoTarget),
  ].filter(Boolean));
}

function componentSummary(item) {
  if (!item) return null;
  return {
    classification: item.classification,
    variantAxes: item.variantAxes ?? {},
    variantCount: (item.variants ?? []).length,
    geometryVariantCount: (item.variants ?? []).filter((variant) => variant.geometry).length,
    variantFingerprint: crypto.createHash("sha256")
      .update(stable(item.variants ?? []))
      .digest("hex")
      .slice(0, 12),
  };
}

function valuesEqual(left, right) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function variantFor(set, requested) {
  if (!set) return { variant: null, unsupportedAxes: [], ambiguousAxes: [] };
  const desired = normalizeVariantProperties(requested);
  const axes = new Set(Object.keys(set.variantAxes ?? {}));
  const unsupportedAxes = Object.keys(desired).filter((axis) => !axes.has(axis));
  const supported = Object.fromEntries(
    Object.entries(desired).filter(([axis]) => axes.has(axis)),
  );
  const variants = Array.isArray(set.variants) ? set.variants : [];
  const matches = variants.filter((candidate) => Object.entries(supported)
    .every(([axis, value]) => valuesEqual(candidate.variantProperties?.[axis], value)));
  const ambiguousAxes = Object.entries(set.variantAxes ?? {})
    .filter(([axis, values]) => !(axis in supported) && values.length > 1)
    .map(([axis]) => axis);
  if (!variants.length && !ambiguousAxes.length && Object.entries(supported).every(
    ([axis, value]) => (set.variantAxes?.[axis] ?? []).some((candidate) => valuesEqual(candidate, value)),
  )) {
    return {
      variant: {
        name: variantName(supported),
        variantProperties: supported,
      },
      unsupportedAxes,
      ambiguousAxes,
      matchCount: 1,
    };
  }
  return {
    variant: matches.length === 1 ? matches[0] : null,
    unsupportedAxes,
    ambiguousAxes,
    matchCount: matches.length,
  };
}

function relativeRootPath(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function readJson(file, fallback = null) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parsePixelValue(value) {
  const match = String(value ?? "").trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? roundNumber(match[1]) : roundNumber(value);
}

function tokenValueMap(resource, section) {
  const values = resource?.[section];
  if (!isRecord(values)) return new Map();
  return new Map(
    Object.entries(values)
      .map(([key, value]) => [parsePixelValue(value), key])
      .filter(([value]) => value !== null),
  );
}

function tokenForValue(map, value, prefix, formatKey = (key) => key) {
  const number = roundNumber(value);
  if (number === null) return null;
  for (const [candidate, key] of map.entries()) {
    if (Math.abs(candidate - number) < 0.001) return `${prefix}/${formatKey(key, number)}`;
  }
  return null;
}

function loadDesignTokenMaps(root) {
  const spacing = readJson(path.join(root, "assets/design-system/tokens.spacing.json"), {});
  const size = readJson(path.join(root, "assets/design-system/tokens.size.json"), {});
  const radius = readJson(path.join(root, "assets/design-system/tokens.radius.json"), {});
  return {
    spacing: tokenValueMap(spacing, "space"),
    size: tokenValueMap(size, "size"),
    radius: tokenValueMap(radius, "radius"),
  };
}

function geometryValue(geometry, key) {
  const padding = geometry?.padding;
  if (key === "paddingTop") return { value: padding?.top ?? null };
  if (key === "paddingRight") return { value: padding?.right ?? null };
  if (key === "paddingBottom") return { value: padding?.bottom ?? null };
  if (key === "paddingLeft") return { value: padding?.left ?? null };
  if (key === "paddingX") {
    if (padding?.left === undefined || padding?.right === undefined) return { value: null };
    if (Math.abs(padding.left - padding.right) >= 0.001) return { value: null, asymmetric: true };
    return { value: padding.left };
  }
  if (key === "paddingY") {
    if (padding?.top === undefined || padding?.bottom === undefined) return { value: null };
    if (Math.abs(padding.top - padding.bottom) >= 0.001) return { value: null, asymmetric: true };
    return { value: padding.top };
  }
  if (key === "gap") return { value: geometry?.itemSpacing ?? null };
  if (key === "height") return { value: geometry?.height ?? null };
  if (key === "width") return { value: geometry?.width ?? null };
  if (key === "radius") return { value: geometry?.cornerRadius ?? null };
  return { value: null };
}

function mappedTokenFor(key, value, tokenMaps) {
  if (key === "height" || key === "width") {
    return tokenForValue(tokenMaps.size, value, "size", (_key, number) => String(number));
  }
  if (key === "radius") {
    return tokenForValue(tokenMaps.radius, value, "radius", (_key, number) => (
      number === 0 ? "0" : String(number).padStart(2, "0")
    ));
  }
  return tokenForValue(tokenMaps.spacing, value, "space");
}

function pushChange(changes, operations, change) {
  const normalized = {
    kind: change.kind,
    path: change.path,
    selector: change.selector ?? null,
    before: change.before ?? null,
    after: change.after ?? null,
    safe: Boolean(change.safe),
    blocking: Boolean(change.blocking),
    reason: change.reason ?? null,
  };
  changes.push(normalized);
  if (normalized.safe && !normalized.blocking && change.operation) operations.push(change.operation);
}

function endpointTargetMap(profile) {
  return new Map((profile?.endpointComponentMappings ?? [])
    .filter((item) => item?.htmlLogicalName && item?.pixsoTarget)
    .map((item) => [item.htmlLogicalName, item.pixsoTarget]));
}

function targetCandidateNames(mapping, logicalToTarget) {
  const logicalName = mapping?.htmlLogicalName ?? mapping?.targetHtmlLogicalName ?? mapping?.target;
  return [...new Set([
    mapping?.pixsoTarget,
    mapping?.source?.componentSet,
    logicalToTarget.get(logicalName),
  ].filter(Boolean))];
}

function resolveTargetSet(mapping, factsByName, logicalToTarget) {
  const candidates = targetCandidateNames(mapping, logicalToTarget);
  const exact = candidates.find((name) => factsByName.has(name));
  return exact ? { name: exact, set: factsByName.get(exact), candidates } : { name: null, set: null, candidates };
}

function applyVariantChanges({
  changes,
  operations,
  mapping,
  collection,
  selector,
  logicalName,
  targetSet,
  requestedVariant,
  pathPrefix,
}) {
  const resolved = variantFor(targetSet, requestedVariant);
  if (!resolved.variant) {
    pushChange(changes, operations, {
      kind: resolved.matchCount === 0 ? "variant-not-found" : "variant-ambiguous",
      path: pathPrefix,
      selector,
      before: requestedVariant,
      after: null,
      safe: false,
      blocking: true,
      reason: resolved.matchCount === 0
        ? `未找到 ${targetSet?.name ?? "目标组件"} 的对应 Variant。`
        : `Variant 缺少明确匹配；未映射轴：${resolved.ambiguousAxes.join(", ") || "unknown"}。`,
    });
    return null;
  }
  const actual = resolved.variant.variantProperties;
  const unsupported = resolved.unsupportedAxes;
  const safe = same(requestedVariant ?? {}, actual);
  if (!safe) {
    pushChange(changes, operations, {
      kind: unsupported.length ? "remove-unsupported-variant-axis" : "normalize-variant-values",
      path: pathPrefix,
      selector,
      before: requestedVariant,
      after: actual,
      safe: true,
      blocking: false,
      reason: unsupported.length
        ? `当前组件轴不包含 ${unsupported.join(", ")}；按真实 variantProperties 移除。`
        : "按当前 Pixso Variant 的精确轴和值同步。",
      operation: { collection, selector, path: pathPrefix.split(".").slice(1).join("."), value: actual },
    });
  }
  return resolved.variant;
}

function addGeometryTokenChanges({
  changes,
  operations,
  mapping,
  collection,
  selector,
  variant,
  tokenMaps,
}) {
  const geometry = variant?.geometry;
  if (!geometry || !isRecord(mapping?.tokens)) return;
  const selectorLabel = typeof selector === "string"
    ? selector
    : selector?.targetHtmlLogicalName ?? selector?.endpointComponentId ?? JSON.stringify(selector);
  for (const [key, before] of Object.entries(mapping.tokens)) {
    const supported = [
      "paddingX",
      "paddingY",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "gap",
      "height",
      "width",
      "radius",
    ].includes(key);
    if (!supported) continue;
    const resolved = geometryValue(geometry, key);
    if (resolved.asymmetric) {
      pushChange(changes, operations, {
        kind: "asymmetric-geometry",
        path: `${collection}[${selectorLabel}].tokens.${key}`,
        selector,
        before,
        after: null,
        safe: false,
        blocking: false,
        reason: `当前 Variant 的 ${key} 不是对称值；请使用对应的左右或上下 Token，不自动折叠。`,
      });
      continue;
    }
    if (resolved.value === null) continue;
    const token = mappedTokenFor(key, resolved.value, tokenMaps);
    if (!token) {
      pushChange(changes, operations, {
        kind: "unmapped-geometry-token",
        path: `${collection}[${selectorLabel}].tokens.${key}`,
        selector,
        before,
        after: resolved.value,
        safe: false,
        blocking: false,
        reason: `${key}=${resolved.value}px 未找到对应的设计 Token，保留旧映射并等待确认。`,
      });
      continue;
    }
    if (before !== token) {
      pushChange(changes, operations, {
        kind: "sync-geometry-token",
        path: `${collection}[${selectorLabel}].tokens.${key}`,
        selector,
        before,
        after: token,
        safe: true,
        blocking: false,
        reason: `按当前 Pixso Variant 几何同步 ${key}。`,
        operation: {
          collection,
          selector,
          path: `tokens.${key}`,
          value: token,
        },
      });
    }
  }
}

export function createComponentFactsSyncProposal({
  incomingFacts,
  currentFacts,
  registry,
  root = DEFAULT_SYNC_ROOT,
}) {
  const incoming = normalizeFacts(incomingFacts);
  const current = currentFacts ? normalizeFacts(currentFacts) : null;
  const profile = (registry?.profiles ?? []).find((item) => item.id === registry?.defaultProfile)
    ?? registry?.profiles?.[0]
    ?? null;
  const incomingByName = componentMap(incoming);
  const currentByName = current ? componentMap(current) : new Map();
  const changes = [];
  const operations = [];
  const factsChanged = !current || !same(comparableFacts(current), comparableFacts(incoming));
  const completeInventory = hasCompleteComponentInventory(incoming);
  const registeredNames = registeredTargetNames(profile);
  const missingRegisteredTargets = completeInventory ? [...registeredNames]
    .filter((name) => !incomingByName.has(name))
    .sort((left, right) => left.localeCompare(right)) : [];

  if (!completeInventory) {
    pushChange(changes, operations, {
      kind: "incomplete-component-inventory",
      path: "facts",
      selector: null,
      before: currentByName.size,
      after: incomingByName.size,
      safe: false,
      blocking: true,
      reason: "该插件快照未声明全页递归组件采集；为避免误删事实或误报映射缺失，本次未使用它校验组件目标。请更新并重新加载 Text-to-UI Pixso 插件。",
    });
  }

  for (const name of new Set([...currentByName.keys(), ...incomingByName.keys()])) {
    const before = componentSummary(currentByName.get(name));
    const after = componentSummary(incomingByName.get(name));
    if (!same(before, after)) {
      if (!completeInventory && before && !after) continue;
      pushChange(changes, operations, {
        kind: before && after ? "refresh-component-facts" : after ? "component-added" : "component-removed",
        path: `facts.${name}`,
        selector: { name },
        before,
        after,
        safe: true,
        blocking: false,
        reason: "当前事实来自 Pixso 插件的只读组件快照。",
      });
    }
  }

  const logicalToTarget = endpointTargetMap(profile);
  const tokenMaps = loadDesignTokenMaps(root);
  // Formal component mappings are the import contract. If a complete Pixso
  // snapshot no longer contains one, preserve the symbolic target as a repair
  // record and make the mapping non-instantiable instead of holding the whole
  // facts transaction hostage.
  for (const mapping of profile?.componentMappings ?? []) {
    if (!completeInventory) continue;
    const selector = { htmlLogicalName: mapping.htmlLogicalName };
    const target = resolveTargetSet(mapping, incomingByName, logicalToTarget);
    if (!target.set) {
      if (mapping.pixsoTargetStatus === "registered") {
        const reason = "Current complete Pixso snapshot does not contain the registered target.";
        pushChange(changes, operations, {
          kind: "component-target-pending-review",
          path: `componentMappings[${mapping.htmlLogicalName}].pixsoTargetStatus`,
          selector,
          before: mapping.pixsoTargetStatus,
          after: "pending-review",
          safe: true,
          blocking: false,
          reason: `当前 Pixso 未找到映射目标：${target.candidates.join(" / ") || "(未声明)"}。此组件会降级为原生组合，等待复核。`,
          operation: { collection: "componentMappings", selector, path: "pixsoTargetStatus", value: "pending-review" },
        });
        pushChange(changes, operations, {
          kind: "record-component-target-review-reason",
          path: `componentMappings[${mapping.htmlLogicalName}].pixsoMappingReason`,
          selector,
          before: mapping.pixsoMappingReason ?? null,
          after: reason,
          safe: true,
          blocking: false,
          reason: "记录待复核原因，组件库修复后可由下一次快照自动恢复映射。",
          operation: { collection: "componentMappings", selector, path: "pixsoMappingReason", value: reason },
        });
      }
      continue;
    }
    if (mapping.pixsoTargetStatus === "pending-review") {
      pushChange(changes, operations, {
        kind: "restore-registered-component-target-status",
        path: `componentMappings[${mapping.htmlLogicalName}].pixsoTargetStatus`,
        selector,
        before: mapping.pixsoTargetStatus,
        after: "registered",
        safe: true,
        blocking: false,
        reason: "当前 Pixso 组件集已被实时事实确认存在，恢复自动实例化。",
        operation: { collection: "componentMappings", selector, path: "pixsoTargetStatus", value: "registered" },
      });
    }
  }
  const endpointMappings = profile?.endpointComponentMappings ?? [];
  for (const mapping of endpointMappings) {
    if (!completeInventory) continue;
    const selector = { endpointComponentId: mapping.endpointComponentId };
    const target = resolveTargetSet(mapping, incomingByName, logicalToTarget);
    if (!target.set) {
      pushChange(changes, operations, {
        kind: "endpoint-target-pending-review",
        path: `endpointComponentMappings[${mapping.endpointComponentId}]`,
        selector,
        before: mapping.pixsoTarget,
        after: null,
        safe: mapping.pixsoTargetStatus === "registered",
        blocking: false,
        reason: `当前 Pixso 未找到映射目标：${target.candidates.join(" / ") || "(未声明)"}。该端点会降级为原生组合，等待复核。`,
        operation: mapping.pixsoTargetStatus === "registered"
          ? { collection: "endpointComponentMappings", selector, path: "pixsoTargetStatus", value: "pending-review" }
          : null,
      });
      continue;
    }
    applyVariantChanges({
      changes,
      operations,
      mapping,
      collection: "endpointComponentMappings",
      selector,
      logicalName: mapping.htmlLogicalName,
      targetSet: target.set,
      requestedVariant: mapping.pixsoVariant ?? {},
      pathPrefix: `endpointComponentMappings[${mapping.endpointComponentId}].pixsoVariant`,
    });
    if (mapping.pixsoTargetStatus !== "registered") {
      pushChange(changes, operations, {
        kind: "restore-registered-target-status",
        path: `endpointComponentMappings[${mapping.endpointComponentId}].pixsoTargetStatus`,
        selector,
        before: mapping.pixsoTargetStatus,
        after: "registered",
        safe: true,
        blocking: false,
        reason: "当前 Pixso 组件集已被实时事实确认存在。",
        operation: {
          collection: "endpointComponentMappings",
          selector,
          path: "pixsoTargetStatus",
          value: "registered",
        },
      });
    }
  }

  for (const mapping of profile?.nativeSourceMappings ?? []) {
    if (!completeInventory) continue;
    const logicalName = mapping.targetHtmlLogicalName ?? mapping.target;
    const selector = { targetHtmlLogicalName: logicalName };
    const target = resolveTargetSet(mapping, incomingByName, logicalToTarget);
    if (!target.set) {
      pushChange(changes, operations, {
        kind: "native-target-component-missing",
        path: `nativeSourceMappings[${logicalName}]`,
        selector,
        before: target.candidates,
        after: null,
        safe: false,
        blocking: false,
        reason: `当前 Pixso 未找到 Native Source 目标：${target.candidates.join(" / ") || "(未声明)"}。保留为历史来源待复核，不阻断当前框架组件与页面导入。`,
      });
      continue;
    }
    const requestedVariant = mapping.pixsoVariant ?? mapping.source?.variant ?? {};
    const variant = applyVariantChanges({
      changes,
      operations,
      mapping,
      collection: "nativeSourceMappings",
      selector,
      logicalName,
      targetSet: target.set,
      requestedVariant,
      pathPrefix: `nativeSourceMappings[${logicalName}].pixsoVariant`,
    });
    if (!variant) continue;
    if (mapping.source?.componentSet !== target.name) {
      pushChange(changes, operations, {
        kind: "normalize-native-component-set",
        path: `nativeSourceMappings[${logicalName}].source.componentSet`,
        selector,
        before: mapping.source?.componentSet,
        after: target.name,
        safe: true,
        blocking: false,
        reason: "按当前 Pixso 组件集名称同步 Native Source 身份。",
        operation: {
          collection: "nativeSourceMappings",
          selector,
          path: "source.componentSet",
          value: target.name,
        },
      });
    }
    // `source.variant` describes the native source taxonomy. Once an explicit
    // `pixsoVariant` is present, it is the sole Pixso-facing identity and the
    // source taxonomy must not be rewritten just to match Pixso's axis values.
    if (!mapping.pixsoVariant && !same(mapping.source?.variant ?? {}, variant.variantProperties)) {
      pushChange(changes, operations, {
        kind: "normalize-native-source-variant",
        path: `nativeSourceMappings[${logicalName}].source.variant`,
        selector,
        before: mapping.source?.variant ?? {},
        after: variant.variantProperties,
        safe: true,
        blocking: false,
        reason: "按当前 Pixso Variant 的精确轴和值同步 Native Source 映射。",
        operation: {
          collection: "nativeSourceMappings",
          selector,
          path: "source.variant",
          value: variant.variantProperties,
        },
      });
    }
    if (mapping.pixsoVariant && !same(mapping.pixsoVariant, variant.variantProperties)) {
      pushChange(changes, operations, {
        kind: "normalize-native-pixso-variant",
        path: `nativeSourceMappings[${logicalName}].pixsoVariant`,
        selector,
        before: mapping.pixsoVariant,
        after: variant.variantProperties,
        safe: true,
        blocking: false,
        reason: "按当前 Pixso Variant 的精确轴和值同步运行时映射。",
        operation: {
          collection: "nativeSourceMappings",
          selector,
          path: "pixsoVariant",
          value: variant.variantProperties,
        },
      });
    }
    addGeometryTokenChanges({
      changes,
      operations,
      mapping,
      collection: "nativeSourceMappings",
      selector,
      variant,
      tokenMaps,
    });
  }

  const blockingChangeCount = changes.filter((item) => item.blocking).length;
  const reviewChangeCount = changes.filter((item) => !item.safe).length;
  const safeChangeCount = changes.filter((item) => item.safe).length;
  // A complete snapshot is authoritative. Missing registered targets are
  // converted to explicit pending-review mappings above, so they cannot block
  // the fresh facts snapshot or unrelated component imports.
  const factsWriteAllowed = completeInventory;
  const hasSafeWork = operations.length > 0 || (factsWriteAllowed && factsChanged);
  return {
    schemaVersion: COMPONENT_FACTS_SCHEMA_VERSION,
    kind: COMPONENT_SYNC_KIND,
    status: blockingChangeCount
      ? hasSafeWork ? "partial-review" : "blocked"
      : changes.length ? "changes-pending" : "up-to-date",
    source: {
      document: incoming.document,
      page: incoming.page,
      capturedAt: incoming.capturedAt,
    },
    safeChangeCount,
    reviewChangeCount,
    blockingChangeCount,
    factsChanged,
    completeInventory,
    factsWriteAllowed,
    missingRegisteredTargets,
    hasSafeWork,
    specRebuildNeeded: factsChanged || operations.length > 0,
    targetFiles: clone(SYNC_TARGET_FILES),
    changes,
    operations,
  };
}

function findBySelector(collection, selector) {
  if (!Array.isArray(collection)) return -1;
  if (selector?.endpointComponentId) {
    return collection.findIndex((item) => item.endpointComponentId === selector.endpointComponentId);
  }
  if (selector?.targetHtmlLogicalName) {
    return collection.findIndex((item) => (
      (item.targetHtmlLogicalName ?? item.target) === selector.targetHtmlLogicalName
    ));
  }
  if (selector?.htmlLogicalName) {
    return collection.findIndex((item) => item.htmlLogicalName === selector.htmlLogicalName);
  }
  return -1;
}

function setPath(target, dottedPath, value) {
  const parts = String(dottedPath).split(".").filter(Boolean);
  if (!parts.length) throw new Error("Cannot apply an empty mapping path.");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(cursor[part])) cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = clone(value);
}

function applyOperations(registry, operations) {
  const next = clone(registry);
  const profile = next.profiles?.find((item) => item.id === next.defaultProfile) ?? next.profiles?.[0];
  if (!profile) throw new Error("Mapping registry has no profile to synchronize.");
  for (const operation of operations) {
    const collection = profile[operation.collection];
    const index = findBySelector(collection, operation.selector);
    if (index < 0) {
      throw new Error(`Cannot apply mapping operation: ${operation.collection} ${JSON.stringify(operation.selector)}`);
    }
    setPath(collection[index], operation.path, operation.value);
  }
  return next;
}

function refreshDerivedProfileSummary(registry, facts) {
  const profile = (registry?.profiles ?? []).find((item) => item.id === registry?.defaultProfile)
    ?? registry?.profiles?.[0]
    ?? null;
  if (!profile || !facts) return;
  refreshMappingProfileSummary(profile, componentFactsNames(facts));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function snapshotFiles(files) {
  return new Map([...new Set(files.filter(Boolean))].map((file) => [
    file,
    fs.existsSync(file) ? fs.readFileSync(file) : null,
  ]));
}

function restoreFiles(snapshot) {
  for (const [file, bytes] of snapshot.entries()) {
    if (bytes === null) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}

function runCommand(root, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    throw new Error(`${args.at(-1)} failed (${result.status}): ${output.slice(-2000)}`);
  }
  return output.slice(-4000);
}

function derivedFiles(root, registry) {
  const projectionPaths = [
    ...(Object.values(registry?.projections ?? {})),
    ...(registry?.profiles ?? []).flatMap((profile) => Object.values(profile.projections ?? {})),
  ];
  return [
    path.join(root, SYNC_TARGET_FILES.facts),
    path.join(root, SYNC_TARGET_FILES.registry),
    path.join(root, SYNC_TARGET_FILES.specs),
    ...projectionPaths.map((value) => relativeRootPath(root, value)),
  ];
}

function rebuildDerivedFiles(root) {
  const commands = [];
  const buildSpecs = path.join(root, "scripts/build-pixso-component-specs.mjs");
  const syncMappings = path.join(root, "scripts/sync-mapping-registry.mjs");
  const validateSpecs = path.join(root, "scripts/validate-pixso-component-specs.mjs");
  const validateMappings = path.join(root, "scripts/validate-mapping-registry.mjs");
  commands.push({ command: "build-pixso-component-specs", output: runCommand(root, [buildSpecs]) });
  commands.push({ command: "sync-mapping-registry", output: runCommand(root, [syncMappings, "--write"]) });
  commands.push({ command: "validate-pixso-component-specs", output: runCommand(root, [validateSpecs]) });
  commands.push({ command: "validate-mapping-registry", output: runCommand(root, [validateMappings, "--check-projections"]) });
  return commands;
}

export function applyComponentFactsSync({
  root = DEFAULT_SYNC_ROOT,
  stateDirectory,
  incomingFacts,
  currentFacts,
  registry,
  proposal,
  writeFacts = true,
  runDerived = true,
}) {
  const normalized = normalizeFacts(incomingFacts);
  const nextRegistry = applyOperations(registry, proposal.operations ?? []);
  const factsFile = path.join(root, SYNC_TARGET_FILES.facts);
  const registryFile = path.join(root, SYNC_TARGET_FILES.registry);
  const snapshot = snapshotFiles(runDerived
    ? derivedFiles(root, registry)
    : [registryFile, ...(writeFacts ? [factsFile] : [])]);
  try {
    if (writeFacts) writeJsonAtomic(factsFile, normalized);
    // The facts snapshot and its diagnostic summary are one transaction. If
    // the live Pixso library grows (for example 19 -> 23 targets), update the
    // summary before validation so --check-projections cannot reject an
    // otherwise valid sync and roll the whole operation back.
    refreshDerivedProfileSummary(
      nextRegistry,
      writeFacts ? normalized : currentFacts ? normalizeFacts(currentFacts) : normalized,
    );
    writeJsonAtomic(registryFile, nextRegistry);
    const commands = runDerived ? rebuildDerivedFiles(root) : [];
    return {
      ok: true,
      applied: true,
      rolledBack: false,
      appliedFacts: writeFacts,
      appliedOperationCount: (proposal.operations ?? []).length,
      commands,
    };
  } catch (error) {
    restoreFiles(snapshot);
    return {
      ok: false,
      applied: false,
      rolledBack: true,
      appliedFacts: false,
      error: error.message,
    };
  }
}

export function syncPixsoComponentFacts({
  root = DEFAULT_SYNC_ROOT,
  stateDirectory = path.join(root, ".text-to-ui/pixso-component-sync"),
  incomingFacts,
  mode = "apply-safe",
  runDerived = true,
}) {
  if (!["propose", "apply-safe"].includes(mode)) {
    throw new Error(`Unsupported component sync mode: ${mode}`);
  }
  const normalized = normalizeFacts(incomingFacts);
  const factsFile = path.join(root, SYNC_TARGET_FILES.facts);
  const registryFile = path.join(root, SYNC_TARGET_FILES.registry);
  const currentFacts = readJson(factsFile, null);
  const registry = readJson(registryFile, null);
  if (!registry) throw new Error(`Missing mapping registry: ${registryFile}`);
  const proposal = createComponentFactsSyncProposal({
    incomingFacts: normalized,
    currentFacts,
    registry,
    root,
  });
  const proposalId = crypto.createHash("sha256").update(stable(proposal)).digest("hex").slice(0, 16);
  const stateRoot = path.resolve(stateDirectory, "component-sync");
  fs.mkdirSync(stateRoot, { recursive: true });
  writeJsonAtomic(path.join(stateRoot, "latest-facts.json"), normalized);
  writeJsonAtomic(path.join(stateRoot, "latest-proposal.json"), { proposalId, ...proposal });

  if (mode === "propose" || proposal.status === "up-to-date") {
    return {
      ok: true,
      mode,
      proposalId,
      proposal,
      applied: false,
      reason: proposal.status === "up-to-date" ? "already-current" : "proposal-only",
    };
  }
  if (!proposal.hasSafeWork) {
    return {
      ok: true,
      mode,
      proposalId,
      proposal,
      applied: false,
      blocked: true,
      reason: proposal.blockingChangeCount ? "review-required" : "no-safe-change",
    };
  }
  const applied = applyComponentFactsSync({
    root,
    stateDirectory,
    incomingFacts: normalized,
    currentFacts,
    registry,
    proposal,
    // A complete snapshot is always written. Missing registered targets are
    // transformed into pending-review mappings before this transaction.
    writeFacts: proposal.factsWriteAllowed,
    runDerived,
  });
  return {
    ...applied,
    mode,
    proposalId,
    proposal,
    pendingReviewCount: proposal.reviewChangeCount,
    pendingBlockingCount: proposal.blockingChangeCount,
  };
}

function cliArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    result[key] = next && !next.startsWith("--") ? next : true;
    if (result[key] !== true) index += 1;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const args = cliArgs(process.argv);
    const root = path.resolve(args.root || DEFAULT_SYNC_ROOT);
    const factsFile = path.resolve(args.facts || path.join(root, SYNC_TARGET_FILES.facts));
    const result = syncPixsoComponentFacts({
      root,
      stateDirectory: args.state ? path.resolve(args.state) : undefined,
      incomingFacts: readJson(factsFile),
      mode: args.mode || "propose",
      runDerived: args["no-derived"] !== true,
    });
    console.log(JSON.stringify({
      ok: result.ok,
      mode: result.mode,
      proposalId: result.proposalId,
      status: result.proposal?.status,
      applied: result.applied,
      safeChangeCount: result.proposal?.safeChangeCount,
      reviewChangeCount: result.proposal?.reviewChangeCount,
      blockingChangeCount: result.proposal?.blockingChangeCount,
    }, null, 2));
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
