import { tokenNameForCssColor, tokenNameForCssLength } from "./html-visual-contract.mjs";
import { derivePixsoImportModules, permanentAgentContract, PIXSO_PLUGIN_RUNTIME_VERSION } from "./pixso-native-scene-lib.mjs";
import { iconColorSourceForMapping } from "./mapping-registry-lib.mjs";
import { resolveComponentVariant } from "./component-mapping-resolver.mjs";

const EDGES = ["top", "right", "bottom", "left"];
const cap = (value) => value[0].toUpperCase() + value.slice(1);
const numeric = (value, fallback = 0) => {
  const result = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(result) ? result : fallback;
};
const rounded = (value) => Math.round(Number(value) * 1000) / 1000;

// Pixso persists stroke weights as single-precision values. Keeping the plan
// at that representation avoids false readback failures such as
// 0.44200000166893005 versus 0.442 while preserving the browser-computed
// visual value.
const pixsoStrokeWeight = (value) => Math.fround(rounded(value));

function exactColorToken(tokens, cssColor) {
  const name = tokenNameForCssColor(tokens, cssColor, null);
  if (!name) return null;
  const resolved = tokens.resolve(name);
  const match = String(cssColor ?? "").match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const hex = (value) => Math.round(value).toString(16).padStart(2, "0").toUpperCase();
  const target = `#${hex(Number(match[1]))}${hex(Number(match[2]))}${hex(Number(match[3]))}${hex(alpha * 255)}`;
  const source = String(resolved.value ?? "").toUpperCase();
  if (source === target || (source.length === 7 && `${source}FF` === target)) return resolved;
  return null;
}

function lengthToken(tokens, value, prefixes, tolerance = 0.55) {
  const number = numeric(value, NaN);
  if (!Number.isFinite(number)) return null;
  const exact = tokenNameForCssLength(tokens, value, prefixes, null);
  if (exact) return tokens.resolve(exact);
  for (const [name, definition] of tokens.values ?? []) {
    if (definition?.type !== "number" || !prefixes.some((prefix) => name.startsWith(prefix))) continue;
    if (Math.abs(Number(definition.value) - number) <= tolerance) return tokens.resolve(name);
  }
  return null;
}

function visualLength(tokens, value, prefixes = ["size/", "layout/"], tolerance = 0.55) {
  const token = lengthToken(tokens, value, prefixes, tolerance);
  return token ?? rounded(numeric(value, 0));
}

function cssNumber(value) {
  const result = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(result) ? result : null;
}

function nativeFlexLayout(node, directChildren, tokens) {
  const computed = node.style ?? {};
  const display = String(computed.display ?? "").toLowerCase();
  const isFlex = display === "flex" || display === "inline-flex";
  const rawDirection = String(computed.flexDirection ?? "row").toLowerCase();
  const axisDirection = rawDirection === "column" || rawDirection === "column-reverse"
    ? "VERTICAL"
    : rawDirection === "row" || rawDirection === "row-reverse"
      ? "HORIZONTAL"
      : "NONE";
  const reversed = rawDirection.endsWith("-reverse");
  const wrapped = String(computed.flexWrap ?? "nowrap").toLowerCase() !== "nowrap";
  const justify = String(computed.justifyContent ?? "normal").toLowerCase();
  const align = String(computed.alignItems ?? "normal").toLowerCase();
  const primaryAlign = {
    normal: "MIN",
    "flex-start": "MIN",
    start: "MIN",
    center: "CENTER",
    "flex-end": "MAX",
    end: "MAX",
    "space-between": "SPACE_BETWEEN",
  }[justify] ?? null;
  const counterAlign = {
    "flex-start": "MIN",
    start: "MIN",
    center: "CENTER",
    "flex-end": "MAX",
    end: "MAX",
    baseline: "MIN",
  }[align] ?? null;
  const hasUnsupportedChildLayout = directChildren.some((child) => {
    const childStyle = child?.style ?? {};
    const position = String(childStyle.position ?? "static").toLowerCase();
    const alignSelf = String(childStyle.alignSelf ?? "auto").toLowerCase();
    const hasMargin = EDGES.some((edge) => (cssNumber(childStyle[`margin${cap(edge)}`]) ?? 0) !== 0);
    const hasRelativeOffset = position === "relative" && ["top", "right", "bottom", "left"].some((edge) => (cssNumber(childStyle[edge]) ?? 0) !== 0);
    const hasTransform = childStyle.transform && childStyle.transform !== "none";
    const positionedOutOfFlow = ["absolute", "fixed", "sticky"].includes(position);
    return positionedOutOfFlow || hasRelativeOffset || hasTransform || hasMargin || !["auto", "normal"].includes(alignSelf);
  });
  // Only promote a CSS flex container to Pixso Auto Layout when the captured
  // child order can be represented without changing the browser geometry.
  // Absolute/offset relative children, margins, reverse order, wrapping, and
  // stretch alignment need the browser-absolute fallback until their dedicated
  // mapping exists. Their measured positions are still retained as evidence.
  const native = isFlex && axisDirection !== "NONE" && !reversed && !wrapped
    && primaryAlign !== null && counterAlign !== null && !hasUnsupportedChildLayout;
  const gapValue = axisDirection === "HORIZONTAL" ? cssNumber(computed.columnGap) : cssNumber(computed.rowGap);
  const fallbackGap = cssNumber(computed.gap);
  const gapNumber = gapValue ?? fallbackGap;
  const gapValues = [computed.columnGap, computed.rowGap, computed.gap]
    .map((value) => String(value ?? "").trim().toLowerCase());
  // Browsers expose the initial flex gap as `normal`, which means zero. It is
  // still a resolved value and must be represented by the existing
  // `space/0` token; leaving it null makes the import gate treat an ordinary
  // space-between row as an unresolved gap.
  const gap = gapNumber === null && isFlex && gapValues.every((value) => !value || value === "normal")
    ? visualLength(tokens, "0px", ["space/", "size/"])
    : gapNumber === null
      ? null
      : visualLength(tokens, `${gapNumber}px`, ["space/", "size/"]);
  return {
    direction: native ? axisDirection : "NONE",
    positioning: ["absolute", "fixed"].includes(String(computed.position ?? "static").toLowerCase()) ? "ABSOLUTE" : "FLOW",
    gap,
    primaryAlign: native ? primaryAlign : "MIN",
    counterAlign: native ? counterAlign : "MIN",
    distribution: native && primaryAlign === "SPACE_BETWEEN" ? "SPACE_BETWEEN" : "PACKED",
  };
}

function typographyStyle(tokens, style) {
  const size = numeric(style?.fontSize, NaN);
  const weight = numeric(style?.fontWeight, 400);
  const lineHeight = numeric(style?.lineHeight, NaN);
  const entries = tokens.typography?.formalStyles ?? [];
  // A same-size but different-weight style is not visually interchangeable:
  // the Pixso library may use a heavier face for a nominal 500 style. Keep
  // unmatched weights on the computed-typography fallback instead of
  // silently changing regular supporting copy into a Medium/Bold style.
  // The same rule applies to leading. A 14px paragraph with 28px leading
  // cannot use the formal 14/20 Body_M style even though its size and weight
  // match; preserve the browser-computed line-height through the fallback.
  const exact = entries.find((entry) => Number(entry.fontSize) === size
    && Number(entry.fontWeight) === weight
    && Number(entry.lineHeight) === lineHeight);
  return exact ? { ref: exact.pixsoStyle, role: exact.htmlToken } : null;
}

function firstFontFamily(value) {
  const first = String(value ?? "").split(",", 1)[0].trim().replace(/^['"]|['"]$/g, "");
  return first && !/^(?:sans-serif|serif|monospace|system-ui)$/i.test(first) ? first : "HarmonyOS Sans";
}

function fontStyleFor(style) {
  const weight = numeric(style?.fontWeight, 400);
  const italic = String(style?.fontStyle ?? "").toLowerCase() === "italic";
  const family = weight >= 650 ? "Bold" : weight >= 500 ? "Medium" : "Regular";
  return italic ? `${family} Italic` : family;
}

function typographyFallback(tokens, style) {
  const fontSize = lengthToken(tokens, style?.fontSize, ["font/size/"], 0.55) ?? rounded(numeric(style?.fontSize, 0));
  const rawLineHeight = String(style?.lineHeight ?? "normal").trim().toLowerCase();
  const lineHeight = ["normal", "auto"].includes(rawLineHeight)
    ? { unit: "AUTO" }
    : lengthToken(tokens, style?.lineHeight, ["font/line-height/"], 0.55) ?? rounded(numeric(style?.lineHeight, 0));
  const letterSpacing = lengthToken(tokens, style?.letterSpacing, ["font/letter-spacing/"], 0.01) ?? rounded(numeric(style?.letterSpacing, 0));
  const fontWeight = lengthToken(tokens, style?.fontWeight, ["font/weight/"], 0.5) ?? numeric(style?.fontWeight, 400);
  return {
    fontFamily: firstFontFamily(style?.fontFamily),
    fontStyle: fontStyleFor(style),
    fontSize,
    lineHeight,
    fontWeight,
    letterSpacing,
  };
}

function parseGradient(tokens, value) {
  const source = String(value ?? "");
  if (!source.startsWith("linear-gradient(")) return null;
  const colors = [...source.matchAll(/rgba?\([^)]*\)/gi)].map((match) => exactColorToken(tokens, match[0])).filter(Boolean);
  if (colors.length < 2) return null;
  const angle = Number(source.match(/linear-gradient\(\s*([\d.-]+)deg/i)?.[1] ?? 180);
  return {
    kind: "linear-gradient",
    angle,
    stops: colors.map((color, index) => ({ position: colors.length === 1 ? 0 : index / (colors.length - 1), color })),
  };
}

function componentGeometryCompatibility(node, descendants, spec, tokens) {
  if (!spec) return { ok: false, reasons: ["missing-component-spec"] };
  const reasons = [];
  const tolerance = 0.55;
  const tokenNumber = (name) => {
    if (!name) return null;
    const aliases = tokens.manifest?.aliasGraph ?? {};
    const rawCandidates = [name, `component/spacing/${name}`, `component/radius/${name}`, aliases[name], aliases[`component/spacing/${name}`], aliases[`component/radius/${name}`]].filter(Boolean);
    const candidates = [...new Set(rawCandidates.flatMap((candidate) => [candidate, String(candidate).replace(/\./g, "/")]))];
    for (const candidate of candidates) {
      try {
        const value = Number(tokens.resolve(candidate).value);
        if (Number.isFinite(value)) return value;
      } catch (_) {}
    }
    return null;
  };
  const expectedHeight = Number(spec.sizing?.height);
  if (Number.isFinite(expectedHeight) && Math.abs(Number(node.rect?.height) - expectedHeight) > tolerance) reasons.push(`height:${node.rect?.height}/${expectedHeight}`);
  if (spec.sizing?.placementWidth === "fixed" && Number.isFinite(Number(spec.sizing?.masterWidth)) && Math.abs(Number(node.rect?.width) - Number(spec.sizing.masterWidth)) > tolerance) {
    reasons.push(`width:${node.rect?.width}/${spec.sizing.masterWidth}`);
  }
  if (spec.autoLayout) {
    const display = String(node.style?.display ?? "").toLowerCase();
    if (!display.includes("flex")) reasons.push(`display:${display || "missing"}/flex`);
    const expectedDirection = spec.direction === "vertical" ? "column" : "row";
    const actualDirection = String(node.style?.flexDirection ?? "row").toLowerCase();
    if (actualDirection !== expectedDirection) reasons.push(`direction:${actualDirection}/${expectedDirection}`);
  }
  const expectedPaddingX = tokenNumber(spec.paddingXToken);
  if (expectedPaddingX !== null) {
    for (const edge of ["Left", "Right"]) {
      const actual = numeric(node.style?.[`padding${edge}`], 0);
      if (Math.abs(actual - expectedPaddingX) > tolerance) reasons.push(`padding${edge}:${actual}/${expectedPaddingX}`);
    }
  }
  const expectedGap = tokenNumber(spec.gapToken);
  if (expectedGap !== null) {
    const actual = numeric(node.style?.columnGap ?? node.style?.gap, 0);
    if (Math.abs(actual - expectedGap) > tolerance) reasons.push(`gap:${actual}/${expectedGap}`);
  }
  const expectedRadius = tokenNumber(spec.radiusToken);
  if (expectedRadius !== null) {
    const actual = numeric(node.style?.borderTopLeftRadius, 0);
    if (Math.abs(actual - expectedRadius) > tolerance) reasons.push(`radius:${actual}/${expectedRadius}`);
  }
  if (Number.isFinite(Number(spec.iconSize))) {
    const icon = descendants.find((entry) => entry.asset?.kind === "svg");
    if (icon && (Math.abs(Number(icon.rect?.width) - Number(spec.iconSize)) > tolerance || Math.abs(Number(icon.rect?.height) - Number(spec.iconSize)) > tolerance)) {
      reasons.push(`icon-size:${icon.rect?.width}x${icon.rect?.height}/${spec.iconSize}`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

function nativeComponentFallback(logicalName, rendererKey, mapping, reason, details = []) {
  return {
    nativeFallback: true,
    logicalName: logicalName ?? rendererKey ?? "component",
    rendererKey: rendererKey ?? null,
    availability: mapping?.availability ?? "unmapped",
    reason,
    details: [...new Set(details.map((detail) => String(detail)).filter(Boolean))],
    fallback: "native-composition",
    blocksImport: false,
  };
}

function logicalComponent(node, descendants, componentMap, tokens, componentSpecs = null) {
  const rendererKey = node.semantic?.component;
  const explicitLogicalName = node.semantic?.logicalName ?? node.semantic?.dataset?.logicalComponent ?? null;
  const selectorCandidates = [node.selector, ...(node.selectorAliases ?? [])];
  const selectorLogicalName = selectorCandidates.map((selector) => componentMap.selectorMap?.get(selector)).find(Boolean) ?? null;
  const sidebarItemChild = node.isSidebarItemChild === true || selectorCandidates.some((selector) => String(selector).trim() === ".tui-sidebar-item");
  const deterministicRenderer = ["button", "checkbox", "input", "search"].includes(rendererKey);
  if (!explicitLogicalName && !selectorLogicalName && !sidebarItemChild && !deterministicRenderer) return null;
  const variant = String(node.semantic?.variant ?? node.semantic?.dataset?.variant ?? "default").toLowerCase();
  const surface = String(node.semantic?.surface ?? node.semantic?.dataset?.surface ?? "white").toLowerCase();
  const surfaceName = ["gray", "grey", "gb-gray", "gb-grey"].includes(surface) ? "Gray" : "White";
  const icon = descendants.find((entry) => entry.asset?.kind === "svg" && entry.asset?.alias)?.asset?.alias ?? null;
  const input = descendants.find((entry) => entry.tag === "input");
  const searchValue = rendererKey === "search"
    ? String(input?.semantic?.value || input?.semantic?.placeholder || input?.semantic?.ariaLabel || "").trim()
    : "";
  const inputValue = rendererKey === "input" ? String(input?.semantic?.value || "").trim() : "";
  const inputPlaceholder = rendererKey === "input"
    ? String(input?.semantic?.placeholder || input?.semantic?.ariaLabel || "").trim()
    : "";
  const advancedLabel = rendererKey === "search"
    ? String(descendants.find((entry) => entry.selector?.includes(".tui-search__advanced") && entry.semantic?.accessibleText)?.semantic?.accessibleText || node.semantic?.accessibleText || "").trim()
    : "";
  const sidebarLabel = sidebarItemChild
    ? String(descendants.find((entry) => entry.semantic?.dataset?.slot === "label" && entry.text)?.text || "").trim()
    : "";
  const sidebarCount = sidebarItemChild
    ? String(descendants.find((entry) => entry.semantic?.dataset?.slot === "trailing" && entry.text)?.text || "").trim()
    : "";
  const label = String((sidebarItemChild ? sidebarLabel : rendererKey === "search" ? advancedLabel : node.semantic?.accessibleText) || descendants.find((entry) => entry.text)?.text || node.semantic?.ariaLabel || "").trim();
  const iconOnly = !label || (node.semantic?.ariaLabel && !node.semantic?.accessibleText);
  // A legacy page can annotate the whole sidebar container with the item
  // identity. Keep the container as a layout frame; only its direct items may
  // resolve to the Sidebar Item component.
  if (rendererKey === "sidebar" && explicitLogicalName === "Sidebar Item/Default") return null;
  // Prefer an authored identity only when it is registered. Older exported
  // pages may carry a legacy alias (for example Button/Icon Text/Default); in
  // that case retain the deterministic renderer inference below instead of
  // letting a stale annotation suppress a valid current mapping.
  let logicalName = explicitLogicalName && componentMap.map.has(explicitLogicalName) ? explicitLogicalName : selectorLogicalName;
  if (rendererKey === "input") logicalName = `Input/${surfaceName} Surface/Default`;
  if (rendererKey === "search") logicalName = `Search/${surfaceName} Surface/Default`;
  if (rendererKey === "checkbox") logicalName = "Checkbox/Unchecked/Default";
  if (sidebarItemChild) logicalName = "Sidebar Item/Default";
  if (rendererKey === "button") {
    if (variant === "primary") logicalName = icon ? "Icon Text Button/Primary/Default" : "Button/Primary/Default";
    else logicalName = iconOnly ? "Icon Button/Ghost/Default" : "Icon Text Button/Ghost/Default";
  }
  const mapping = logicalName ? componentMap.map.get(logicalName) : null;
  if (!mapping || mapping.availability !== "mapped") {
    return nativeComponentFallback(
      logicalName,
      rendererKey,
      mapping,
      "mapping-unavailable",
      [mapping ? `availability:${mapping.availability}` : "mapping-not-registered"],
    );
  }
  const iconSlot = sidebarItemChild && mapping.supportedSlots?.includes("leading")
    ? "leading"
    : mapping.supportedSlots?.includes("icon") || mapping.supportedSlots?.includes("leading")
      ? "icon"
      : null;
  const componentIcon = iconSlot ? icon : null;
  const sidebarState = sidebarItemChild ? String(node.semantic?.dataset?.state ?? variant ?? "default").toLowerCase() : null;
  const resolvedVariant = resolveComponentVariant(mapping, {
    htmlVariant: variant,
    state: node.semantic?.state ?? node.semantic?.dataset?.state,
    surface,
  });
  if (sidebarState) resolvedVariant.state = sidebarState;
  const requestedSize = String(node.semantic?.dataset?.size ?? "").toLowerCase();
  const compactSmallIconText = requestedSize === "small" && logicalName === "Icon Text Button/Ghost/Default";
  const compactGeometry = compactSmallIconText
    ? {
        paddingXToken: "padding/button-sm-x",
        ...(compactSmallIconText ? { sizing: { height: 28 } } : {}),
      }
    : null;
  const specificationKey = mapping.pixsoSpecKey ?? logicalName;
  const specification = componentSpecs?.components?.[specificationKey]
    ? { ...componentSpecs.components[specificationKey], ...(compactGeometry ?? {}) }
    : null;
  const geometryCompatibility = componentSpecs ? componentGeometryCompatibility(node, descendants, specification, tokens) : { ok: true, reasons: [] };
  if (!geometryCompatibility.ok) {
    return nativeComponentFallback(logicalName, rendererKey, mapping, "geometry-incompatible", geometryCompatibility.reasons);
  }
  return {
    logicalName,
    rendererKey,
    pixsoName: mapping.pixsoName,
    componentSetName: mapping.componentSetName ?? mapping.pixsoName,
    // Icon-text resolution is fixed to type + size + state. A Small HTML
    // control keeps the mapped Medium source variant until a native Small
    // variant is available; its measured outer bounds remain browser evidence.
    variant: resolvedVariant,
    ...(iconColorSourceForMapping(mapping) ? { iconColorSource: iconColorSourceForMapping(mapping) } : {}),
    ...(node.semantic?.allowContentColorOverride === true && node.semantic?.contentColor
      ? { contentColor: node.semantic.contentColor, allowContentColorOverride: true }
      : {}),
    props: {
      label,
      ...(rendererKey === "search" && searchValue ? { placeholder: searchValue } : {}),
      ...(rendererKey === "input" && inputPlaceholder ? { placeholder: inputPlaceholder } : {}),
      ...(rendererKey === "input" && inputValue ? { value: inputValue } : {}),
      ...(rendererKey === "input" ? { surface: mapping.variant?.surface ?? surface } : {}),
      ...(rendererKey === "search" ? { surface: mapping.variant?.surface ?? surface } : {}),
      variant,
      mode: iconOnly ? "icon" : componentIcon ? "icon-text" : "text",
      ...(sidebarItemChild ? { selected: sidebarState === "selected", ...(sidebarCount ? { count: sidebarCount } : {}) } : {}),
      size: "standard"
    },
    slots: {
      ...(componentIcon ? { [iconSlot]: componentIcon } : {}),
      ...(sidebarItemChild && sidebarCount ? { trailing: sidebarCount } : {}),
      ...(rendererKey === "search"
        ? { ...(searchValue ? { value: searchValue } : {}), ...(label ? { label } : {}) }
        : rendererKey === "input"
          ? { ...(inputValue ? { value: inputValue } : {}) }
          : (label && !iconOnly ? { label, value: label } : {}))
    },
    // Component roots collapse their SVG descendants from the retained IR
    // tree. Preserve the browser-owned SVG payload alongside the semantic
    // slot so the Pixso runtime can create/resolve the exact icon component
    // without falling back to a guessed master icon.
    iconResource: componentIcon && descendants.find((entry) => entry.asset?.kind === "svg" && entry.asset?.alias === componentIcon)?.asset
      ? {
          alias: icon,
          source: "browser-svg",
          svg: descendants.find((entry) => entry.asset?.kind === "svg" && entry.asset?.alias === icon).asset.html,
          size: Math.min(
            Number(descendants.find((entry) => entry.asset?.kind === "svg" && entry.asset?.alias === icon).rect?.width ?? 20),
            Number(descendants.find((entry) => entry.asset?.kind === "svg" && entry.asset?.alias === icon).rect?.height ?? 20),
          ),
        }
      : null,
    geometryCompatibility: specification ? geometryCompatibility : { ok: true, reasons: [] },
  };
}

function styleForNode(node, tokens, isText) {
  const computed = node.style ?? {};
  const style = { strokeEdges: EDGES.filter((edge) => numeric(computed[`border${cap(edge)}Width`]) > 0 && computed[`border${cap(edge)}Style`] !== "none") };
  style.strokeWeights = Object.fromEntries(EDGES.map((edge) => [edge, pixsoStrokeWeight(numeric(computed[`border${cap(edge)}Width`], 0))]));
  const foreground = exactColorToken(tokens, computed.color);
  const background = exactColorToken(tokens, computed.backgroundColor);
  const gradient = parseGradient(tokens, computed.backgroundImage);
  if (isText && foreground) style.fill = foreground;
  else if (gradient) style.fill = gradient;
  else if (background) style.fill = background;
  else style.fill = { kind: "transparent" };
  if (style.strokeEdges.length) {
    const edge = style.strokeEdges[0];
    const stroke = exactColorToken(tokens, computed[`border${cap(edge)}Color`]);
    if (stroke) style.stroke = stroke;
  }
  const radii = [computed.borderTopLeftRadius, computed.borderTopRightRadius, computed.borderBottomRightRadius, computed.borderBottomLeftRadius];
  if (radii.every((value) => value === radii[0]) && numeric(radii[0]) > 0) style.radius = lengthToken(tokens, radii[0], ["radius/"], 0.55) ?? numeric(radii[0]);
  if (isText) {
    const textStyle = typographyStyle(tokens, computed);
    if (textStyle) style.textStyle = textStyle;
    else style.typography = typographyFallback(tokens, computed);
    style.textAlignHorizontal = ({ left: "LEFT", start: "LEFT", center: "CENTER", right: "RIGHT", end: "RIGHT", justify: "JUSTIFIED" })[computed.textAlign] ?? "LEFT";
  }
  const opacity = numeric(computed.opacity, 1);
  if (opacity < 1) style.opacity = lengthToken(tokens, opacity, ["opacity/"], 0.01) ?? opacity;
  if (computed.boxShadow && computed.boxShadow !== "none") style.effectStyle = tokens.styleForEffect("shadow-1");
  return style;
}

function descendantsFor(index, children, byIndex) {
  const result = [];
  const visit = (parent) => {
    for (const childIndex of children.get(parent) ?? []) {
      const child = byIndex.get(childIndex);
      if (child) result.push(child);
      visit(childIndex);
    }
  };
  visit(index);
  return result;
}

function resolvedTextAutoResize(node) {
  const explicit = String(node?.textAutoResize ?? "").toUpperCase();
  if (["WIDTH_AND_HEIGHT", "HEIGHT", "NONE", "TRUNCATE"].includes(explicit)) {
    if (explicit === "TRUNCATE") {
      // A capture from the old collector may have marked every CSS ellipsis
      // node as truncated. When measured text evidence is available, undo
      // that classification if the current content fits its HTML box.
      const inlineWidth = numeric(node?.textMetrics?.inlineWidth, NaN);
      const boxWidth = numeric(node?.textMetrics?.boxWidth ?? node?.rect?.width, NaN);
      const lineCount = numeric(node?.textMetrics?.lineCount, NaN);
      if (Number.isFinite(inlineWidth) && Number.isFinite(boxWidth) && inlineWidth <= boxWidth + 0.5
        && (!Number.isFinite(lineCount) || lineCount <= 1)) return "WIDTH_AND_HEIGHT";
    }
    return explicit;
  }
  const style = node?.style ?? {};
  if (String(style.textOverflow).toLowerCase() === "ellipsis") {
    const inlineWidth = numeric(node?.textMetrics?.inlineWidth, NaN);
    const boxWidth = numeric(node?.textMetrics?.boxWidth ?? node?.rect?.width, NaN);
    if (Number.isFinite(inlineWidth) && Number.isFinite(boxWidth) && inlineWidth <= boxWidth + 0.5) return "WIDTH_AND_HEIGHT";
    return "TRUNCATE";
  }
  const ownsBox = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].some((value) => numeric(value) > 0)
    || ["Top", "Right", "Bottom", "Left"].some((edge) => numeric(style[`border${edge}Width`]) > 0 && style[`border${edge}Style`] !== "none")
    || ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].some((corner) => numeric(style[`border${corner}Radius`]) > 0)
    || (style.backgroundImage && style.backgroundImage !== "none")
    || !["", "transparent", "rgba(0, 0, 0, 0)", "rgb(0, 0, 0, 0)"].includes(String(style.backgroundColor ?? "").toLowerCase());
  if (ownsBox) return "NONE";
  const lineHeight = numeric(style.lineHeight);
  const renderedHeight = numeric(node?.rect?.height);
  if (String(node?.text ?? "").includes("\n") || (lineHeight > 0 && renderedHeight > lineHeight + 0.5)) return "HEIGHT";
  // Browser manifests normally carry the measured mode. For older manifests
  // without it, use the safe default: ordinary text hugs its content; only
  // explicit ellipsis above is fixed and truncated.
  return "WIDTH_AND_HEIGHT";
}

export function buildDomVisualIr(visualManifest, { tokens, componentMap, componentSpecs = null, pageName = null, targetPage = null } = {}) {
  if (visualManifest?.kind !== "text-to-ui-html-visual-manifest") throw new Error("DOM Visual IR requires a browser-computed visual manifest");
  const byIndex = new Map(visualManifest.nodes.map((node) => [node.index, node]));
  const children = new Map();
  for (const node of visualManifest.nodes) {
    if (!children.has(node.parentIndex)) children.set(node.parentIndex, []);
    children.get(node.parentIndex).push(node.index);
  }
  const root = visualManifest.nodes[0];
  const scaleX = Number(visualManifest.viewport.width) / Number(root.rect.width || visualManifest.viewport.width);
  const scaleY = Number(visualManifest.viewport.height) / Number(root.rect.height || visualManifest.viewport.height);
  const normalizedRect = (node) => ({ x: rounded(node.rect.x * scaleX), y: rounded(node.rect.y * scaleY), width: rounded(node.rect.width * scaleX), height: rounded(node.rect.height * scaleY) });
  const sidebarContainerIndices = new Set(visualManifest.nodes
    .filter((node) => node.semantic?.component === "sidebar" && (node.semantic?.logicalName ?? node.semantic?.dataset?.logicalComponent) === "Sidebar Item/Default")
    .map((node) => node.index));
  const componentRoots = new Map();
  const componentFallbacks = new Map();
  for (const node of visualManifest.nodes) {
    const descendants = descendantsFor(node.index, children, byIndex);
    const component = logicalComponent({ ...node, rect: normalizedRect(node), isSidebarItemChild: sidebarContainerIndices.has(node.parentIndex) }, descendants, componentMap, tokens, componentSpecs);
    if (component?.nativeFallback) componentFallbacks.set(node.index, component);
    else if (component) componentRoots.set(node.index, component);
  }
  const skipped = new Set();
  for (const node of visualManifest.nodes) {
    if (componentRoots.has(node.index) || node.asset?.kind === "svg") {
      for (const descendant of descendantsFor(node.index, children, byIndex)) skipped.add(descendant.index);
    }
  }
  const retained = visualManifest.nodes.filter((node) => !skipped.has(node.index));
  const retainedSet = new Set(retained.map((node) => node.index));
  const nearestRetainedParent = (node) => {
    let parentIndex = node.parentIndex;
    while (parentIndex !== null && parentIndex !== undefined && !retainedSet.has(parentIndex)) parentIndex = byIndex.get(parentIndex)?.parentIndex ?? null;
    return (parentIndex === null || parentIndex === undefined) && node.index !== root.index ? root.index : parentIndex;
  };
  const regionFor = (node) => {
    let current = node;
    while (current) {
      const role = current.semantic?.dataset?.tuiPaneRole;
      if (role) return role;
      current = byIndex.get(current.parentIndex);
    }
    return "page";
  };
  const componentRepairItems = [...componentFallbacks.entries()].map(([sourceIndex, fallback]) => ({
    ...fallback,
    sourceIndex,
    selector: byIndex.get(sourceIndex)?.selector ?? null,
  }));
  const irNodes = retained.map((node) => {
    const rect = normalizedRect(node);
    const parentIndex = nearestRetainedParent(node);
    const parentRect = parentIndex === null || parentIndex === undefined ? { x: 0, y: 0 } : normalizedRect(byIndex.get(parentIndex));
    const component = componentRoots.get(node.index) ?? null;
    const componentFallback = componentFallbacks.get(node.index) ?? null;
    const isSvg = node.asset?.kind === "svg";
    const isImage = node.asset?.kind === "image";
    const isText = Boolean(node.text) && !component && !isSvg && !isImage;
    const nativeLayout = nativeFlexLayout(node, (children.get(node.index) ?? []).map((index) => byIndex.get(index)).filter(Boolean), tokens);
    const textAutoResize = isText ? resolvedTextAutoResize(node) : null;
    // Pixso exposes TRUNCATE as a native TextNode.textAutoResize value. Keep
    // it in the operation plan so the executor applies the same fixed-width
    // ending ellipsis behavior as the HTML source.
    const pixsoTextAutoResize = textAutoResize;
    const intrinsicText = isText && textAutoResize === "WIDTH_AND_HEIGHT";
    return {
      id: `dom-${node.index}`,
      parentId: parentIndex === null || parentIndex === undefined ? null : `dom-${parentIndex}`,
      sourceIndex: node.index,
      selector: node.selector,
      selectorAliases: node.selectorAliases ?? [],
      region: regionFor(node),
      kind: component ? "component" : isSvg ? "svg" : isImage ? "image" : isText ? "text" : "frame",
      component,
      text: isText ? node.text : null,
      textAutoResize,
      asset: node.asset,
      rect,
      relativeRect: { x: rounded(rect.x - parentRect.x), y: rounded(rect.y - parentRect.y), width: rect.width, height: rect.height },
      layout: {
        direction: nativeLayout.direction,
        positioning: nativeLayout.positioning,
        x: rounded(rect.x - parentRect.x),
        y: rounded(rect.y - parentRect.y),
        width: intrinsicText ? "hug" : visualLength(tokens, rect.width),
        height: intrinsicText ? "hug" : visualLength(tokens, rect.height),
        padding: Object.fromEntries(EDGES.map((edge) => [edge, visualLength(tokens, node.style?.[`padding${cap(edge)}`] ?? 0, ["space/", "size/"])])),
        gap: nativeLayout.gap,
        primaryAlign: nativeLayout.primaryAlign,
        counterAlign: nativeLayout.counterAlign,
        distribution: nativeLayout.distribution,
        clipsContent: ["hidden", "clip"].includes(node.style?.overflow) || ["hidden", "clip"].includes(node.style?.overflowX) || ["hidden", "clip"].includes(node.style?.overflowY),
        ...(isText && textAutoResize === "TRUNCATE" ? { overflow: "truncate", maxLines: 1 } : {}),
        ...(isText && pixsoTextAutoResize ? { textAutoResize: pixsoTextAutoResize } : {}),
      },
      style: styleForNode(node, tokens, isText || isSvg),
      metadata: {
        htmlSelector: node.selector,
        htmlRect: rect,
        visualEvidenceSource: "browser-computed-visual-manifest",
        domVisualIr: true,
        htmlTag: node.tag,
        htmlChildIndex: node.childIndex,
        componentGeometryLocked: Boolean(component),
        ...(component ? { componentGeometryCompatibility: component.geometryCompatibility } : {}),
        ...(componentFallback ? { componentFallback } : {}),
        ...(isText ? { textSizingMode: textAutoResize } : {}),
      },
    };
  });
  return {
    schemaVersion: 1,
    kind: "text-to-ui-dom-visual-ir",
    source: { runId: visualManifest.runId, htmlSourceFingerprint: visualManifest.htmlSourceFingerprint, visualManifestSource: visualManifest.source },
    page: { name: pageName ?? `HTML Import / ${visualManifest.htmlSourceFingerprint}`, targetPage, viewport: { width: visualManifest.viewport.width, height: visualManifest.viewport.height }, stateId: visualManifest.stateId },
    geometryPolicy: "browser-absolute-bounds-only",
    componentPolicy: "mapping-first-component-instance-with-repairable-native-fallback",
    nodes: irNodes,
    componentRepairItems,
    summary: {
      sourceNodeCount: visualManifest.nodes.length,
      retainedNodeCount: irNodes.length,
      collapsedNodeCount: skipped.size,
      componentCandidateCount: irNodes.filter((node) => node.kind === "component").length,
      mappedInstanceCount: irNodes.filter((node) => node.kind === "component").length,
      mappedConformanceIssueCount: irNodes.filter((node) => node.kind === "component" && !node.component.geometryCompatibility.ok).length,
      componentFallbackCount: componentRepairItems.length,
      componentRepairCount: componentRepairItems.length,
      componentRepairItems,
      selectorCoverage: 1,
      geometryCoverage: 1,
    },
  };
}

export function compileDomVisualIrPlan(ir, { tokens, componentMap, images = [] } = {}) {
  const usedVariables = new Map();
  const usedStyles = new Map();
  const icons = new Map();
  const rememberRefs = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.ref?.startsWith?.("$variable/")) {
      const name = value.ref.slice("$variable/".length);
      const resolved = tokens.resolve(name);
      usedVariables.set(name, { ref: resolved.ref, collection: resolved.collection, mode: resolved.mode, name: resolved.name, value: resolved.value });
    }
    if (value.ref?.startsWith?.("$style/")) usedStyles.set(value.ref, { ref: value.ref });
    for (const child of Object.values(value)) rememberRefs(child);
  };
  const layoutOperations = [];
  const hydrationOperations = [];
  const imageOperations = [];
  for (const node of ir.nodes) {
    rememberRefs(node.layout);
    rememberRefs(node.style);
    rememberRefs(node.component);
    const componentLayout = node.kind === "component"
      ? Object.fromEntries(Object.entries(node.layout).filter(([key]) => !["padding", "gap", "primaryAlign", "counterAlign", "distribution"].includes(key)))
      : node.layout;
    const common = { phase: node.kind === "component" ? "component-enrichment" : "layout", nodeId: node.id, parentId: node.parentId, name: node.selector, region: node.region, layout: componentLayout, style: node.style, metadata: node.metadata };
    if (node.kind === "component") {
      if (node.component.iconResource?.alias && node.component.iconResource.svg) {
        icons.set(node.component.iconResource.alias, node.component.iconResource);
      }
      layoutOperations.push({ op: "create-instance", ...common, componentRef: {
        logicalName: node.component.logicalName,
        pixsoName: node.component.pixsoName,
        componentSetName: node.component.componentSetName,
        variant: node.component.variant,
        ...(node.component.iconColorSource ? { iconColorSource: node.component.iconColorSource } : {}),
        ...(node.component.allowContentColorOverride === true && node.component.contentColor
          ? { contentColor: node.component.contentColor, allowContentColorOverride: true }
          : {}),
      }, props: node.component.props, slots: node.component.slots });
      continue;
    }
    if (node.kind === "text") layoutOperations.push({ op: "create-text", ...common, characters: node.text });
    else if (node.kind === "image") imageOperations.push({ op: "create-image", ...common, phase: "image-optimization", imageRef: { ref: `dom-image-${node.sourceIndex}`, fit: String(node.asset?.fit ?? "FILL").toUpperCase() } });
    else if (node.kind === "svg") {
      const alias = node.asset?.alias || `dom-svg-${node.sourceIndex}`;
      const size = Math.min(node.rect.width, node.rect.height);
      const hotZone = { alignment: "CENTER", axes: "BOTH" };
      icons.set(alias, { alias, source: "browser-svg", svg: node.asset?.html });
      const literalStrokeWeight = Math.round((1.5 * size / 24) * 1000) / 1000;
      const strokeTokenName = ({ 16: "icon/stroke/16", 20: "icon/stroke/20", 24: "icon/stroke/24" })[size];
      const strokeWeight = strokeTokenName
        ? { ref: `$variable/${strokeTokenName}`, value: literalStrokeWeight }
        : literalStrokeWeight;
      rememberRefs(strokeWeight);
      layoutOperations.push({ op: "create-icon-slot", ...common, iconSlot: { alias, size, strokeWeight, hotZone } });
      hydrationOperations.push({ op: "hydrate-icon", phase: "icon-hydration", targetNodeId: node.id, name: node.selector, region: node.region, iconRef: { alias, size, strokeWeight, hotZone }, style: node.style, metadata: node.metadata });
    } else layoutOperations.push({ op: "create-frame", ...common });
  }
  const resourceOperations = [{ op: "create-page", phase: "resources", page: ir.page }];
  for (const variable of usedVariables.values()) resourceOperations.push({ op: "ensure-variable", phase: "resources", variableRef: variable.ref, collection: variable.collection, mode: variable.mode, name: variable.name, value: variable.value });
  for (const style of usedStyles.values()) resourceOperations.push({ op: "ensure-style", phase: "resources", styleRef: style.ref, kind: style.ref.includes("Typography") ? "text" : "effect" });
  for (const icon of icons.values()) resourceOperations.push({ op: "ensure-icon", phase: "resources", iconRef: { alias: icon.alias } });
  for (const image of images) resourceOperations.push({ op: "ensure-image", phase: "resources", imageRef: { ref: image.ref, mimeType: image.mimeType } });
  resourceOperations.push({ op: "ensure-font", phase: "resources", variableRef: "font/family/sans", family: "HarmonyOS Sans" });
  const operations = [...resourceOperations, ...layoutOperations.filter((operation) => operation.phase === "layout"), ...layoutOperations.filter((operation) => operation.phase === "component-enrichment"), ...hydrationOperations, ...imageOperations];
  const modules = imageOperations.length ? derivePixsoImportModules(operations) : null;
  return {
    schemaVersion: 1,
    kind: "pixso-operation-plan",
    execution: {
      resolveGuidsAtRuntime: true,
      libraryPage: componentMap.libraryPage ?? "NewComponents",
      targetPage: ir.page.targetPage,
      canonicalKey: ir.page.name,
      pipeline: imageOperations.length
        ? "dom-visual-ir-geometry-lock-then-component-enrichment-then-image-optimization"
        : "dom-visual-ir-geometry-lock-then-component-enrichment",
      geometryAuthority: "browser-computed-visual-manifest",
      componentReplacement: "mapping-first-with-repairable-native-fallback",
      fallback: "native-composition-for-repairable-components",
      destructive: false,
      preserveExistingFrames: true,
      cleanupPolicy: "single-canonical-output-after-readback",
      outputPolicy: "single-managed-artboard",
      preserveFailedDraft: false,
      minimumRuntimeVersion: PIXSO_PLUGIN_RUNTIME_VERSION,
      agentContract: permanentAgentContract(ir.page?.sourceFingerprint ?? ir.page?.name ?? "dom-visual-page"),
      sourcePolicy: "current-html-only-no-history",
    },
    page: ir.page,
    resources: { componentLibraryPage: componentMap.libraryPage ?? "NewComponents", variables: [...usedVariables.values()], styles: [...usedStyles.values()], icons: [...icons.values()], images, font: "font/family/sans" },
    phases: [
      { id: "resources", label: "资源预检", operationCount: resourceOperations.length },
      { id: "layout", label: "DOM 几何锁定", operationCount: layoutOperations.filter((operation) => operation.phase === "layout").length },
      { id: "component-enrichment", label: "兼容组件替换", operationCount: layoutOperations.filter((operation) => operation.phase === "component-enrichment").length },
      { id: "icon-hydration", label: "图标填充", operationCount: hydrationOperations.length },
      ...(imageOperations.length ? [{ id: "image-optimization", label: "图片资源优化", operationCount: imageOperations.length }] : []),
    ],
    ...(modules ? { modules } : {}),
    operations,
    summary: { ...ir.summary, operationCount: operations.length, nodeCount: layoutOperations.length + imageOperations.length, instanceCount: layoutOperations.filter((operation) => operation.op === "create-instance").length, tokenBindingCount: usedVariables.size, styleBindingCount: usedStyles.size, iconSlotCount: hydrationOperations.length },
  };
}
