import { tokenNameForCssColor, tokenNameForCssLength } from "./html-visual-contract.mjs";
import { derivePixsoImportModules } from "./pixso-native-scene-lib.mjs";

const EDGES = ["top", "right", "bottom", "left"];
const cap = (value) => value[0].toUpperCase() + value.slice(1);
const px = (value) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function lengthValue(tokens, cssValue, prefixes, fallback = 0) {
  const numeric = px(cssValue);
  if (numeric === null) return fallback;
  if (Math.abs(numeric) < 0.001) return 0;
  const name = tokenNameForCssLength(tokens, cssValue, prefixes, null);
  return name ? tokens.resolve(name) : numeric;
}

function colorValue(tokens, cssValue) {
  const normalized = String(cssValue ?? "").replace(/\s+/g, "").toLowerCase();
  if (!normalized || normalized === "transparent" || normalized === "rgba(0,0,0,0)") return null;
  const name = tokenNameForCssColor(tokens, cssValue, null);
  return name ? tokens.resolve(name) : null;
}

function selectorIndex(visualManifest) {
  const result = new Map();
  for (const node of visualManifest?.nodes ?? []) {
    for (const selector of [node.selector, ...(node.selectorAliases ?? [])]) {
      if (selector && !result.has(selector)) result.set(selector, node);
    }
  }
  return result;
}

function reconcileLayout(operation, node, tokens, warnings) {
  const style = node.style ?? {};
  const layout = { ...(operation.layout ?? {}) };
  const plannedPadding = { ...(layout.padding ?? {}) };
  if (style.display === "flex") layout.direction = style.flexDirection?.startsWith("row") ? "HORIZONTAL" : "VERTICAL";
  const gapValue = layout.direction === "HORIZONTAL" ? (style.columnGap || style.gap) : (style.rowGap || style.gap);
  if (gapValue && gapValue !== "normal") layout.gap = lengthValue(tokens, gapValue, ["space/", "size/"], layout.gap ?? 0);
  const computedPadding = Object.fromEntries(EDGES.map((edge) => [edge, lengthValue(tokens, style[`padding${cap(edge)}`], ["space/", "size/"], 0)]));
  // A semantic component can own the layout contract while the matched HTML
  // selector is only its outer wrapper. Titlebar segments are the canonical
  // example: `.brand-segment` has zero padding, while its nested Titlebar or
  // search row owns the visible horizontal rail. Do not replace an explicit
  // Token contract with the wrapper's zero padding.
  const preservePlannedPadding = operation.metadata?.layoutPaddingSource === "component-contract";
  layout.padding = Object.fromEntries(EDGES.map((edge) => [
    edge,
    preservePlannedPadding && Object.prototype.hasOwnProperty.call(plannedPadding, edge)
      ? plannedPadding[edge]
      : computedPadding[edge],
  ]));
  const align = { "flex-start": "MIN", start: "MIN", center: "CENTER", "flex-end": "MAX", end: "MAX", stretch: "STRETCH" }[style.alignItems];
  if (align) layout.align = align;
  const distribution = { "flex-start": "MIN", start: "MIN", center: "CENTER", "flex-end": "MAX", end: "MAX", "space-between": "SPACE_BETWEEN", "space-around": "SPACE_AROUND", "space-evenly": "SPACE_EVENLY" }[style.justifyContent];
  if (distribution) layout.distribution = distribution;
  for (const dimension of ["width", "height"]) {
    if (layout[dimension] && typeof layout[dimension] === "object" && Number.isFinite(node.rect?.[dimension])) {
      const resolved = lengthValue(tokens, `${node.rect[dimension]}px`, ["layout/", "size/"], node.rect[dimension]);
      layout[dimension] = resolved;
    }
  }
  if (Object.values(layout.padding).some((value) => typeof value === "number" && value !== 0)) {
    warnings.push(`unbound-computed-padding:${operation.nodeId}`);
  }
  operation.layout = layout;
}

function reconcileStyle(operation, node, tokens) {
  const computed = node.style ?? {};
  const style = { ...(operation.style ?? {}) };
  const strokeEdges = EDGES.filter((edge) => px(computed[`border${cap(edge)}Width`]) > 0 && computed[`border${cap(edge)}Style`] !== "none");
  style.strokeEdges = strokeEdges;
  if (strokeEdges.length) {
    const stroke = colorValue(tokens, computed[`border${cap(strokeEdges[0])}Color`]);
    if (stroke) style.stroke = stroke;
  } else {
    delete style.stroke;
  }
  const background = colorValue(tokens, computed.backgroundColor);
  if (computed.backgroundImage && computed.backgroundImage !== "none") {
    operation.metadata = { ...(operation.metadata ?? {}), htmlComputedBackgroundImage: computed.backgroundImage };
  } else if (background) {
    style.fill = background;
  } else if (operation.metadata?.surfaceOwner !== true) {
    delete style.fill;
  }
  const radii = [computed.borderTopLeftRadius, computed.borderTopRightRadius, computed.borderBottomRightRadius, computed.borderBottomLeftRadius];
  if (radii.every((value) => value === radii[0]) && px(radii[0]) !== null) {
    style.radius = lengthValue(tokens, radii[0], ["radius/"], px(radii[0]));
  }
  if (operation.op === "create-text") {
    const align = { left: "LEFT", start: "LEFT", center: "CENTER", right: "RIGHT", end: "RIGHT", justify: "JUSTIFIED" }[computed.textAlign];
    if (align) style.textAlignHorizontal = align;
  }
  operation.style = style;
}

function reorderLayoutOperations(plan) {
  const resources = plan.operations.filter((operation) => operation.phase === "resources");
  const layout = plan.operations.filter((operation) => operation.phase === "layout");
  const hydration = plan.operations.filter((operation) => operation.phase === "icon-hydration");
  const originalIndex = new Map(layout.map((operation, index) => [operation.nodeId, index]));
  const children = new Map();
  for (const operation of layout) {
    const key = operation.parentId ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(operation);
  }
  const ordered = [];
  const visit = (operation) => {
    ordered.push(operation);
    const descendants = children.get(operation.nodeId) ?? [];
    descendants.sort((left, right) => {
      const a = Number(left.metadata?.htmlChildIndex);
      const b = Number(right.metadata?.htmlChildIndex);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
      return originalIndex.get(left.nodeId) - originalIndex.get(right.nodeId);
    });
    descendants.forEach(visit);
  };
  (children.get(null) ?? []).sort((a, b) => originalIndex.get(a.nodeId) - originalIndex.get(b.nodeId)).forEach(visit);
  plan.operations = [...resources, ...ordered, ...hydration];
  plan.modules = derivePixsoImportModules(plan.operations);
}

export function reconcileOperationPlanWithVisualManifest(plan, visualManifest, tokens) {
  const bySelector = selectorIndex(visualManifest);
  const visualChildren = new Map();
  for (const node of visualManifest?.nodes ?? []) {
    if (!visualChildren.has(node.parentIndex)) visualChildren.set(node.parentIndex, []);
    visualChildren.get(node.parentIndex).push(node);
  }
  const warnings = [];
  let reconciledNodeCount = 0;
  const layoutOperations = (plan.operations ?? []).filter((operation) => operation.phase === "layout");
  const operationById = new Map(layoutOperations.map((operation) => [operation.nodeId, operation]));
  const matchedVisualByOperation = new Map();
  for (const operation of layoutOperations) {
    if (!operation.metadata?.htmlSelector) continue;
    const node = bySelector.get(operation.metadata.htmlSelector);
    if (node) matchedVisualByOperation.set(operation.nodeId, node);
  }
  // Resolve component children from the live parent order when the Scene does
  // not own a selector for each item. This is what keeps titlebar actions such
  // as Help and More in the exact rendered HTML order instead of page-data order.
  for (let pass = 0; pass < 4; pass += 1) {
    for (const operation of layoutOperations) {
      if (matchedVisualByOperation.has(operation.nodeId) || !operation.parentId) continue;
      const parentVisual = matchedVisualByOperation.get(operation.parentId);
      if (!parentVisual) continue;
      const candidates = visualChildren.get(parentVisual.index) ?? [];
      const label = String(operation.props?.label ?? operation.slots?.label ?? operation.name ?? "").trim();
      const actionId = String(operation.metadata?.actionId ?? operation.props?.actionId ?? "").trim();
      const matches = candidates.filter((candidate) => {
        const datasetValues = Object.values(candidate.semantic?.dataset ?? {}).map(String);
        if (actionId && datasetValues.includes(actionId)) return true;
        return label && [candidate.semantic?.ariaLabel, candidate.semantic?.accessibleText, candidate.text].map((value) => String(value ?? "").trim()).includes(label);
      });
      if (matches.length === 1) matchedVisualByOperation.set(operation.nodeId, matches[0]);
    }
  }
  for (const operation of layoutOperations) {
    const node = matchedVisualByOperation.get(operation.nodeId);
    if (!node) continue;
    operation.metadata = {
      ...operation.metadata,
      htmlSelector: operation.metadata?.htmlSelector ?? node.selector,
      htmlSelectorSource: operation.metadata?.htmlSelector ? "scene-contract" : "semantic-browser-match",
      htmlVisualIndex: node.index,
      htmlChildIndex: node.childIndex,
      htmlRect: node.rect,
      visualEvidenceSource: "browser-computed-visual-manifest"
    };
    reconcileLayout(operation, node, tokens, warnings);
    reconcileStyle(operation, node, tokens);
    reconciledNodeCount += 1;
  }
  reorderLayoutOperations(plan);
  plan.execution.visualReconciliation = {
    source: "browser-computed-visual-manifest",
    reconciledNodeCount,
    semanticChildMatchCount: [...matchedVisualByOperation.entries()].filter(([operationId]) => !operationById.get(operationId)?.metadata?.htmlSelector).length,
    warningCount: warnings.length,
    staleSceneFallback: "forbidden"
  };
  plan.summary = { ...(plan.summary ?? {}), visualReconciledNodeCount: reconciledNodeCount, visualReconciliationWarningCount: warnings.length };
  plan.warnings = [...(plan.warnings ?? []), ...warnings];
  return plan;
}
