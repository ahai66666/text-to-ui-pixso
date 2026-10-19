import fs from "node:fs";
import path from "node:path";
import { iconColorSourceForMapping } from "./mapping-registry-lib.mjs";
import { loadTokenResources, resolvePixsoIcon } from "./pixso-native-scene-lib.mjs";
import { tokenBoxForCssPadding, tokenNameForCssColor, tokenNameForCssLength, validateFreshHtmlVisualSnapshot } from "./html-visual-contract.mjs";
export { collectSceneStats } from "./pixso-native-scene-lib.mjs";
export const COREMAIL_SEMANTIC_ADAPTER_STATUS = "legacy-diagnostic-only";

function tokenRef(tokens, name) {
  return tokens.resolve(name);
}

function styleObject(tokens, {
  fill,
  stroke,
  strokeEdges,
  textRole,
  textAlignHorizontal,
  radius,
  effect,
  opacity,
} = {}) {
  const style = {};
  if (fill === "transparent" || fill?.kind === "transparent") style.fill = { kind: "transparent" };
  else if (fill?.kind === "linear-gradient") {
    style.fill = {
      kind: "linear-gradient",
      angle: fill.angle ?? 0,
      stops: (fill.stops ?? []).map((stop) => ({
        position: stop.position,
        color: tokenRef(tokens, stop.color ?? stop.token ?? stop.ref),
      })),
      ...(fill.handles ? { handles: fill.handles } : {}),
    };
  }
  else if (fill) style.fill = tokenRef(tokens, fill);
  if (stroke) style.stroke = tokenRef(tokens, stroke);
  if (Array.isArray(strokeEdges) && strokeEdges.length) style.strokeEdges = strokeEdges;
  if (textRole) style.textStyle = tokens.styleForText(textRole);
  if (["LEFT", "CENTER", "RIGHT", "JUSTIFIED"].includes(textAlignHorizontal)) style.textAlignHorizontal = textAlignHorizontal;
  if (radius) style.radius = tokenRef(tokens, radius);
  if (effect) style.effectStyle = tokens.styleForEffect(effect);
  if (opacity !== undefined) style.opacity = tokenRef(tokens, opacity);
  return style;
}

function layoutObject({
  direction = "VERTICAL",
  width = "fill",
  height = "hug",
  padding = {},
  gap = null,
  align = "MIN",
  primaryAlign = null,
  counterAlign = null,
  distribution = "MIN",
  clipsContent = false,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
} = {}) {
  return {
    direction,
    width,
    height,
    padding,
    gap,
    align,
    ...(primaryAlign ? { primaryAlign } : {}),
    ...(counterAlign ? { counterAlign } : {}),
    distribution,
    clipsContent,
    ...(minWidth !== undefined ? { minWidth } : {}),
    ...(maxWidth !== undefined ? { maxWidth } : {}),
    ...(minHeight !== undefined ? { minHeight } : {}),
    ...(maxHeight !== undefined ? { maxHeight } : {}),
  };
}

function normalizeLayoutToken(value, tokens) {
  if (typeof value === "string") {
    if (!/^(space|size|radius|layout)\//.test(value)) return value;
    const resolved = tokens.resolve(value);
    return { tokenRef: value, variableRef: resolved.ref, name: resolved.name };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.tokenRef) {
    const resolved = tokens.resolve(value.tokenRef);
    return { ...value, variableRef: value.variableRef ?? resolved.ref, name: value.name ?? resolved.name };
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeLayoutToken(nested, tokens)]));
}

function normalizeSceneLayoutTokens(node, tokens) {
  node.layout = normalizeLayoutToken(node.layout, tokens);
  for (const child of node.children ?? []) normalizeSceneLayoutTokens(child, tokens);
}

function fillIdentity(fill) {
  return fill?.ref ?? fill?.name ?? null;
}

function normalizeInheritedSurfaces(node, inheritedFill = null) {
  const fill = node.style?.fill;
  const identity = fillIdentity(fill);
  const ownsSurface = node.metadata?.surfaceOwner === true;
  const canInheritSurface = node.type === "frame" || node.type === "component";
  if (canInheritSurface && identity && inheritedFill && identity === inheritedFill && !ownsSurface) {
    node.style.fill = { kind: "transparent", inheritedFrom: inheritedFill };
  }
  const effectiveFill = !canInheritSurface
    ? inheritedFill
    : ownsSurface && identity
    ? identity
    : fill?.kind === "transparent" || !identity
      ? inheritedFill
      : identity;
  for (const child of node.children ?? []) normalizeInheritedSurfaces(child, effectiveFill);
}

function makeId(prefix, index = 0) {
  return `${prefix}-${String(index).padStart(3, "0")}`;
}

function frame(id, name, region, children = [], options = {}) {
  return {
    id,
    name,
    type: "frame",
    region,
    layout: layoutObject(options.layout),
    style: styleObject(options.tokens, options.style),
    metadata: { source: "text-to-ui-native-scene", region, ...(options.metadata ?? {}) },
    children,
  };
}

function textNode(id, name, value, region, tokens, role = "body-m", options = {}) {
  return {
    id,
    name,
    type: "text",
    region,
    content: String(value ?? ""),
    layout: layoutObject({ width: options.width ?? "fill", height: options.height ?? "hug", align: options.align ?? "MIN" }),
    style: styleObject(tokens, { fill: options.color ?? "text/primary", textRole: role, textAlignHorizontal: options.textAlignHorizontal }),
    metadata: { source: "page-data", textRole: role },
  };
}

function iconNode(id, name, alias, region, tokens, options = {}) {
  // An icon's visual size is part of the layout contract, not just metadata
  // for the SVG hydrator.  The old full-page path emitted `fixed` here, which
  // has no numeric value in Pixso and leaves the slot at the host default.
  // Resolve the common icon sizes to the canonical Size & Layout variables so
  // the slot, the hydrated vector and the surrounding auto-layout all agree.
  const iconSize = options.size ?? 20;
  const sizeToken = options.sizeToken ?? (iconSize === 20 ? "size/icon" : `size/${String(iconSize).padStart(2, "0")}`);
  return {
    id,
    name,
    type: "icon",
    region,
    icon: { alias, size: options.size ?? 20, source: "assets/icons/icon-aliases.json" },
    layout: layoutObject({ width: options.width ?? { tokenRef: sizeToken }, height: options.height ?? { tokenRef: sizeToken }, align: "CENTER" }),
    style: styleObject(tokens, { fill: options.color ?? "icon/default" }),
    metadata: { source: "semantic-icon", alias },
  };
}

function imageNode(id, name, image, region, tokens, options = {}) {
  return {
    id,
    name,
    type: "image",
    region,
    image: { ref: image.ref, fit: image.fit ?? "FILL" },
    layout: layoutObject({ width: options.width ?? "fixed", height: options.height ?? "fixed", align: "CENTER" }),
    style: styleObject(tokens, { radius: options.radius, effect: options.effect }),
    metadata: { source: "raster-asset", imageRef: image.ref },
  };
}

function shapeNode(id, name, shape, region, tokens, style = {}, layout = {}) {
  return {
    id,
    name,
    type: shape,
    region,
    layout: layoutObject(layout),
    style: styleObject(tokens, style),
    metadata: { source: "native-scene-shape" },
  };
}

function componentNode(id, name, logicalName, rendererKey, region, tokens, componentMap, options = {}) {
  const mapping = componentMap.map.get(logicalName) ?? null;
  const isMapped = mapping?.availability === "mapped" || mapping?.status === "mapped";
  return {
    id,
    name,
    type: "component",
    region,
    renderMode: isMapped ? "instance" : "native-composition",
    component: {
      logicalName,
      rendererKey,
      pixsoName: mapping?.pixsoName ?? null,
      componentSetName: mapping?.componentSetName ?? mapping?.pixsoName ?? null,
      variant: mapping?.variant ?? null,
      ...(iconColorSourceForMapping(mapping) ? { iconColorSource: iconColorSourceForMapping(mapping) } : {}),
      ...(options.allowContentColorOverride === true && mapping?.contentColor
        ? { contentColor: mapping.contentColor, allowContentColorOverride: true }
        : {}),
      availability: isMapped ? "mapped" : "native-fallback",
      props: options.props ?? {},
      slots: options.slots ?? {},
      fallbackRecipe: options.fallbackRecipe ?? "generic-content",
    },
    layout: layoutObject(options.layout),
    style: styleObject(tokens, options.style),
    metadata: { source: isMapped ? "pixso-component-map" : "declared-native-fallback", ...(options.metadata ?? {}) },
    children: options.children ?? [],
  };
}

function mapFolders(account) {
  return (account.folders ?? []).map((folder, index) => ({
    id: folder.id ?? `${account.id}-folder-${index + 1}`,
    label: folder.label ?? folder[0] ?? "",
    icon: folder.icon ?? folder[1] ?? "navigation/inbox",
    count: folder.count ?? folder[2] ?? null,
    selected: Boolean(folder.selected ?? folder[3]),
  }));
}

function mapMessages(pageData) {
  if (Array.isArray(pageData.mailList?.items)) return pageData.mailList.items;
  if (Array.isArray(pageData.messages)) return pageData.messages;
  const result = [];
  for (const group of pageData.mailList?.groups ?? []) {
    for (const item of group.items ?? []) result.push({ ...item, group: item.group ?? group.label });
  }
  return result;
}

function addButton(children, id, label, region, tokens, componentMap, options = {}) {
  const logicalName = options.logicalName ?? (
    options.mode === "icon"
      ? "Icon Button/Ghost/Default"
      : options.variant === "primary" && options.icon
        ? "Icon Text Button/Primary/Default"
        : options.variant === "primary"
          ? "Button/Primary/Default"
          : "Icon Text Button/Ghost/Default"
  );
  const fallbackChildren = [];
  if (options.icon) fallbackChildren.push(iconNode(`${id}-icon`, `${label} icon`, options.icon, region, tokens, { size: options.iconSize ?? 20, color: options.iconColor ?? "text/on-primary" }));
  if (options.mode !== "icon") fallbackChildren.push(textNode(`${id}-label`, `${label} label`, label, region, tokens, "body-l", { color: options.labelColor ?? (options.variant === "primary" ? "text/on-primary" : "text/primary"), width: "hug" }));
  children.push(componentNode(id, label, logicalName, "button", region, tokens, componentMap, {
    props: { label, variant: options.variant ?? "ghost", mode: options.mode ?? "text", size: options.size ?? "standard" },
    slots: options.mode === "icon"
      ? { icon: options.icon ?? null }
      : { icon: options.icon ?? null, label },
    fallbackRecipe: "button",
    layout: { direction: "HORIZONTAL", width: options.mode === "icon" ? { tokenRef: "size/control" } : "hug", height: { tokenRef: "size/control" }, gap: options.icon ? (options.layoutGap ?? "space/3") : null, align: "CENTER", padding: options.layoutPadding ?? { left: "space/4", right: "space/4", top: "space/3", bottom: "space/3" } },
    // HTML buttons in the canonical component contract use border: 0. A
    // ghost/icon button must not inherit a default Pixso stroke merely
    // because it is represented by a mapped component instance.
    style: { fill: options.variant === "primary" ? "surface/primary" : "surface/canvas", stroke: options.stroke !== undefined ? options.stroke : null, radius: options.radius ?? "radius/control" },
    metadata: {
      iconColor: options.iconColor ?? (options.variant === "primary" ? "text/on-primary" : "icon/default"),
      renderedMode: options.mode ?? "text",
      visualSource: options.visualSource ?? "semantic-contract",
      ...(options.labelVisible === undefined ? {} : { labelVisible: options.labelVisible }),
    },
    children: fallbackChildren,
  }));
}

function resolveVisualButtonState(action, visualSnapshot, region, tokens) {
  const semanticMode = action.buttonType === "icon" ? "icon" : "icon-text";
  const record = visualSnapshot?.regions?.[region]?.actions?.[action.id];
  if (!record) return { visible: true, mode: semanticMode, labelVisible: semanticMode !== "icon", visualSource: "semantic-contract" };
  // Color is visual evidence, not action semantics: `delete` may intentionally
  // use the normal icon color or an explicitly supplied danger Token. Never
  // infer a danger color from the action id alone.
  const foregroundColor = record.color ? tokenNameForCssColor(tokens, record.color, null) : null;
  if (record.visible && !foregroundColor) {
    throw new Error(`HTML visual color for action ${action.id} is not represented by the shared Token map: ${record.color}`);
  }
  const layoutGap = record.gap ? tokenNameForCssLength(tokens, record.gap, ["space/"], null) : null;
  const layoutPadding = record.padding ? tokenBoxForCssPadding(tokens, record.padding, null) : null;
  const border = String(record.border ?? "");
  const stroke = /^0(?:px)?\b/i.test(border) || /\bnone\b/i.test(border)
    ? null
    : tokenNameForCssColor(tokens, border, "border/default");
  if (record.visible && record.gap && !layoutGap) throw new Error(`HTML visual gap for action ${action.id} is not represented by the shared spacing Token map: ${record.gap}`);
  if (record.visible && record.padding && !layoutPadding) throw new Error(`HTML visual padding for action ${action.id} is not represented by the shared spacing Token map: ${record.padding}`);
  if (record.visible === false) return { visible: false, mode: semanticMode, labelVisible: false, foregroundColor, layoutGap, layoutPadding, stroke, visualSource: visualSnapshot.source ?? "html-live-computed-style" };
  const mode = record.mode === "icon" || record.mode === "icon-text"
    ? record.mode
    : record.labelVisible === false
      ? "icon"
      : record.labelVisible === true
        ? "icon-text"
        : semanticMode;
  return {
    visible: true,
    mode,
    labelVisible: record.labelVisible ?? mode !== "icon",
    foregroundColor,
    layoutGap,
    layoutPadding,
    stroke,
    visualSource: visualSnapshot.source ?? "html-live-computed-style",
  };
}

function buildGlobalTitleLayer(pageData, tokens, componentMap, { visualSnapshot = null } = {}) {
  // Keep the HTML contract's three title-segment boundaries as the native
  // source of truth.  Titlebar/Default remains an HTML component contract,
  // but the Pixso scene must not depend on an opaque whole-titlebar instance:
  // each segment has different content and different alignment rules.
  const brandContent = frame("brand-titlebar-content", "Brand titlebar content", "primary-navigation", [
    imageNode("brand-logo", "Coremail logo", pageData.brand?.logo ?? { ref: "brand/coremail-logo", fit: "FILL" }, "primary-navigation", tokens, {
      width: { tokenRef: "size/32" },
      height: { tokenRef: "size/32" },
      radius: "radius/card",
    }),
    textNode("brand-label", "Brand label", pageData.brand?.name ?? "Coremail", "primary-navigation", tokens, "subtitle-m", { width: "hug" }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "hug", height: "hug", gap: "space/4", align: "CENTER" } });
  const brandControls = [];
  addButton(brandControls, "collapse-navigation", "收起侧边栏", "primary-navigation", tokens, componentMap, {
    variant: "ghost",
    mode: "icon",
    icon: "navigation/panel-left",
    iconColor: "icon/default",
    iconSize: 20,
  });
  const primary = frame("global-primary-title-segment", "Brand title segment", "primary-navigation", [brandContent, ...brandControls], {
    tokens,
    layout: { direction: "HORIZONTAL", width: { tokenRef: "layout/primary-width" }, height: { tokenRef: "size/titlebar" }, gap: 0, align: "CENTER", distribution: "SPACE_BETWEEN", padding: { left: "space/6", right: "space/4" } },
    style: { fill: "surface/subtle", stroke: "border/subtle", strokeEdges: ["right"] },
    metadata: { surfaceOwner: true, htmlSelector: ".brand-segment", htmlComponent: "Titlebar/Default", layoutPaddingSource: "component-contract", structure: "brand-content-plus-collapse-control" },
  });

  const scope = componentNode("mail-scope", "Mail scope", "Selection Dropdown/Default", "selection-dropdown", "secondary-list", tokens, componentMap, {
    props: { label: "全部", variant: "secondary", size: "standard", mode: "selection-dropdown", menuItems: ["全部"], disabled: false },
    slots: { label: "全部", trigger: "navigation/chevron-down" },
    fallbackRecipe: "selection-dropdown",
    layout: { direction: "HORIZONTAL", width: "hug", height: { tokenRef: "size/40" }, align: "CENTER" },
  });
  const search = componentNode("mail-search", "Mail search", "Search/White Surface/Default", "search", "secondary-list", tokens, componentMap, {
    props: { placeholder: "搜索邮件", surface: "white", advancedSearch: true, advancedSearchLabel: "高级", disabled: false },
    slots: { leading: "field/search", value: "搜索邮件", clear: null, "advanced-search": "高级" },
    fallbackRecipe: "search",
    layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/40" }, gap: "space/2", align: "CENTER" },
  });
  const secondary = frame("global-secondary-title-segment", "Search title segment", "secondary-list", [scope, search], {
    tokens,
    layout: { direction: "HORIZONTAL", width: { tokenRef: "layout/secondary-width" }, height: { tokenRef: "size/titlebar" }, gap: "space/2", align: "CENTER", padding: { left: "space/5", right: "space/5" } },
    style: { fill: "surface/canvas", stroke: "border/subtle", strokeEdges: ["right"] },
    metadata: { surfaceOwner: true, htmlSelector: ".search-segment", htmlComponent: "Titlebar/Default", layoutPaddingSource: "component-contract", structure: "search-row" },
  });

  const detailActionChildren = [];
  const actionRecords = new Map((pageData.detailActions ?? []).map((action) => [action.id, action]));
  const htmlActionOrder = visualSnapshot?.regions?.detailTitlebarActions?.order ?? [];
  const orderedDetailActions = htmlActionOrder.length
    ? htmlActionOrder.map((id) => actionRecords.get(id)).filter(Boolean)
    : (pageData.detailActions ?? []);
  for (const action of orderedDetailActions) {
    const visualState = resolveVisualButtonState(action, visualSnapshot, "detailTitlebarActions", tokens);
    if (!visualState.visible) continue;
    addButton(detailActionChildren, `detail-titlebar-${action.id}`, action.label, "main-detail", tokens, componentMap, {
      variant: "ghost",
      mode: visualState.mode,
      icon: action.icon,
      iconColor: visualState.foregroundColor ?? "icon/default",
      labelColor: visualState.foregroundColor ?? "text/primary",
      iconSize: 20,
      layoutGap: visualState.layoutGap ?? undefined,
      layoutPadding: visualState.layoutPadding ?? undefined,
      stroke: visualState.stroke,
      labelVisible: visualState.labelVisible,
      visualSource: visualState.visualSource,
    });
  }
  const detailActions = frame("detail-titlebar-actions", "Detail titlebar actions", "main-detail", detailActionChildren, {
    tokens,
    layout: { direction: "HORIZONTAL", width: "hug", height: { tokenRef: "size/40" }, gap: "space/3", align: "CENTER" },
    metadata: { htmlSelector: ".tui-titlebar__pane-actions", slot: "main-detail-actions" },
  });
  const windowActionChildren = [];
  for (const action of [
    ["minimize", "最小化", "window/minimize"],
    ["maximize", "最大化", "window/maximize"],
    ["close", "关闭", "window/close"],
  ]) {
    addButton(windowActionChildren, `window-${action[0]}`, action[1], "main-detail", tokens, componentMap, {
      variant: "ghost",
      mode: "icon",
      icon: action[2],
      iconColor: "icon/default",
      iconSize: 24,
    });
  }
  const windowActions = frame("detail-titlebar-window-actions", "Window actions", "main-detail", windowActionChildren, {
    tokens,
    layout: { direction: "HORIZONTAL", width: "hug", height: { tokenRef: "size/40" }, gap: 0, align: "CENTER" },
    metadata: { htmlSelector: ".tui-titlebar__actions", slot: "actions" },
  });
  const detail = frame("global-detail-title-segment", "Detail title segment", "main-detail", [detailActions, windowActions], {
    tokens,
    layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/titlebar" }, gap: 0, align: "CENTER", distribution: "SPACE_BETWEEN", padding: { left: "space/5", right: "space/2" } },
    style: { fill: "surface/canvas", stroke: "border/subtle", strokeEdges: ["bottom"] },
    metadata: { surfaceOwner: true, htmlSelector: ".detail-segment", htmlComponent: "Titlebar/Default", layoutPaddingSource: "component-contract", structure: "detail-actions-plus-window-controls" },
  });
  return frame("global-title-layer", "Global title layer", "global", [
    primary,
    secondary,
    detail,
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/titlebar" }, gap: 0, align: "CENTER" }, style: { fill: "surface/canvas" }, metadata: { htmlSelector: ".global-title-layer", structure: "three-html-title-segments" } });
}

function buildPrimaryPane(pageData, tokens, componentMap) {
  const children = [];
  const actionChildren = [];
  addButton(actionChildren, "compose-button", pageData.primaryAction?.label ?? "写邮件", "primary-navigation", tokens, componentMap, { variant: "primary", mode: "icon-text", icon: "action/add", iconColor: "text/on-primary" });
  children.push(frame("primary-action-slot", "Global primary action", "primary-navigation", actionChildren, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", padding: { left: "space/6", right: "space/6", top: "space/4", bottom: "space/4" } }, metadata: { htmlSelector: ".global-primary-slot" } }));
  const accountChildren = [];
  for (const account of pageData.accounts ?? []) {
    const accountHeading = frame(`${account.id}-heading`, `${account.email} account heading`, "primary-navigation", [
      shapeNode(`${account.id}-status`, "Account status", "ellipse", "primary-navigation", tokens, { fill: "state/success", radius: "radius/full" }, { width: { tokenRef: "size/08" }, height: { tokenRef: "size/08" }, align: "CENTER" }),
      textNode(`${account.id}-label`, `${account.email} account`, account.email, "primary-navigation", tokens, "body-s", { color: "text/secondary" }),
      iconNode(`${account.id}-chevron`, "Account collapse chevron", "navigation/chevron-down", "primary-navigation", tokens, { size: 16, color: "icon/default", width: { tokenRef: "size/16" }, height: { tokenRef: "size/16" } }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/44" }, gap: "space/2", align: "CENTER", distribution: "SPACE_BETWEEN", padding: { left: "space/2", right: "space/2" } } });
    const folderChildren = [accountHeading];
    for (const [index, folder] of mapFolders(account).entries()) {
      const itemChildren = [iconNode(`${account.id}-folder-${index}-icon`, folder.label, folder.icon, "primary-navigation", tokens, { size: 20, color: folder.selected ? "icon/primary" : "icon/default" }), textNode(`${account.id}-folder-${index}-label`, folder.label, folder.label, "primary-navigation", tokens, "body-l", { color: folder.selected ? "icon/primary" : "text/primary" })];
      if (folder.count !== null && folder.count !== undefined && folder.count !== "") itemChildren.push(textNode(`${account.id}-folder-${index}-count`, `${folder.label} count`, folder.count, "primary-navigation", tokens, "body-m", { color: "text/secondary", width: "hug", align: "MAX" }));
      folderChildren.push(componentNode(`${account.id}-folder-${index}`, `Sidebar ${folder.label}`, "Sidebar Item/Default", "sidebar", "primary-navigation", tokens, componentMap, {
        props: { label: folder.label, icon: folder.icon, count: folder.count, selected: folder.selected },
        slots: { leading: folder.icon, label: folder.label, trailing: folder.count }, fallbackRecipe: "sidebar-item",
        // Sidebar Item/Default is native-only in the current Pixso map.  Its
        // children therefore need the same explicit icon→label→count gap as
        // the HTML component (space/3 = 8px); Pixso cannot infer it from the
        // logical component name.
        layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/control" }, gap: "space/3", align: "CENTER", padding: { left: "space/3", right: "space/3" } },
        style: { fill: folder.selected ? "surface/selected" : "transparent", radius: "radius/control" }, metadata: { iconColor: folder.selected ? "icon/primary" : "icon/default" }, children: itemChildren,
      }));
    }
    accountChildren.push(frame(`${account.id}-account`, `${account.email} folders`, "primary-navigation", folderChildren, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/2", padding: { top: "space/3", bottom: "space/3" } } }));
  }
  children.push(frame("account-navigation", "Account navigation", "primary-navigation", accountChildren, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "fill", gap: "space/4", clipsContent: true, padding: { left: "space/4", right: "space/4", bottom: "space/4" } }, metadata: { htmlSelector: ".account-navigation" } }));
  const appChildren = [];
  for (const [index, app] of (pageData.primaryApps ?? []).entries()) {
    const entry = typeof app === "string" ? { label: app } : app;
    const logical = "Primary Navigation Item/Level 1";
    const mapping = componentMap.map.get(logical);
    const mapped = mapping?.availability === "mapped";
    const fallback = [iconNode(`app-${index}-icon`, entry.label, entry.icon ?? "navigation/grid", "primary-navigation", tokens, { size: 20 }), textNode(`app-${index}-label`, `${entry.label} label`, entry.label, "primary-navigation", tokens, "body-s", { color: entry.selected ? "icon/primary" : "text/secondary", textAlignHorizontal: "CENTER" })];
    appChildren.push(componentNode(`app-${index}`, `Primary app ${entry.label}`, logical, "primary-navigation-item", "primary-navigation", tokens, componentMap, {
      props: { label: entry.label, iconName: entry.icon, selected: Boolean(entry.selected) }, slots: { icon: entry.icon, label: entry.label }, fallbackRecipe: "primary-navigation-item",
      // The bottom level-one navigation item is a vertical icon+label
      // composition.  Keep its 2px HTML gap as a Token reference; leaving it
      // null makes the icon and label collapse together in Pixso.
      layout: { direction: "VERTICAL", width: "fill", height: { tokenRef: "size/48" }, gap: "space/1", align: "CENTER", padding: { top: "space/3", bottom: "space/3" } }, style: { fill: entry.selected ? "surface/selected" : "transparent", radius: "radius/control" }, children: fallback,
      metadata: { mapped },
    }));
  }
  children.push(frame("primary-apps", "Primary level navigation", "primary-navigation", appChildren, { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/1", align: "CENTER", padding: { left: "space/4", right: "space/4", top: "space/3", bottom: "space/4" } }, metadata: { htmlSelector: ".primary-level-navigation" } }));
  return frame("pane-primary-navigation", "Primary navigation pane", "primary-navigation", children, { tokens, layout: { direction: "VERTICAL", width: { tokenRef: "layout/primary-width" }, height: "fill", gap: "space/3", clipsContent: true }, style: { fill: "surface/subtle", stroke: "border/subtle", strokeEdges: ["right"] }, metadata: { surfaceOwner: true, dividerOwner: "right", htmlSelector: ".primary-navigation" } });
}

function buildSecondaryPane(pageData, tokens, componentMap, { staticSnapshot = true } = {}) {
  // Keep the actual HTML wrapper. It owns the 8/16/16 insets and prevents
  // the secondary-list module from collapsing back to the legacy full-width
  // heading/meta structure.
  const headingActions = [];
  addButton(headingActions, "refresh-mail", "刷新", "secondary-list", tokens, componentMap, { variant: "ghost", mode: "icon", icon: "action/refresh", iconColor: "icon/default" });
  addButton(headingActions, "multi-select-mail", "多选", "secondary-list", tokens, componentMap, { variant: "ghost", mode: "icon", icon: "action/multi-select", iconColor: "icon/default" });
  addButton(headingActions, "filter-sort", "筛选和排序", "secondary-list", tokens, componentMap, { variant: "ghost", mode: "icon", icon: "action/filter", iconColor: "icon/default" });
  const listHeading = frame("secondary-list-heading", "List heading", "secondary-list", [
    textNode("inbox-title", "Inbox title", pageData.mailList?.title ?? "收件箱", "secondary-list", tokens, "title-s", { width: "hug" }),
    frame("secondary-list-heading-actions", "Heading actions", "secondary-list", headingActions, { tokens, layout: { direction: "HORIZONTAL", width: "hug", height: { tokenRef: "size/40" }, gap: "space/1", align: "CENTER" } }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/40" }, gap: 0, align: "CENTER", distribution: "SPACE_BETWEEN", padding: { left: "space/3", right: "space/3" } }, metadata: { htmlSelector: ".list-heading", structure: "title-plus-heading-actions" } });
  const mailChildren = [];
  const messages = mapMessages(pageData);
  let previousGroup = null;
  let currentGroup = null;
  let currentGroupIndex = -1;
  for (const [index, mail] of messages.entries()) {
    if (mail.group !== previousGroup) {
      previousGroup = mail.group;
      currentGroupIndex += 1;
      currentGroup = frame(`mail-group-${currentGroupIndex}`, `Mail group ${mail.group}`, "secondary-list", [
        frame(`mail-group-${currentGroupIndex}-heading`, "Date group heading", "secondary-list", [textNode(`mail-group-${currentGroupIndex}-label`, `Mail group ${mail.group}`, mail.group ?? "", "secondary-list", tokens, "body-s", { color: "text/secondary", width: "fill" })], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/36" }, align: "CENTER", padding: { left: "space/3", right: "space/3" } }, metadata: { collapsible: true, expanded: true, htmlSelector: ".date-group > h3" } }),
      ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: 0 }, metadata: { collapsible: true, expanded: true, group: mail.group } });
      mailChildren.push(currentGroup);
    }
    const rowChildren = [];
    // The native page is a static default-visible snapshot. Per-row selection
    // checkboxes are an interaction affordance in the HTML workbench (and are
    // commonly revealed by hover/selection), not part of the approved resting
    // visual. Do not materialize them in the default list row, so an
    // interaction-only column cannot change the measured content width in
    // Pixso. A future explicitly interactive/state-board path can pass
    // staticSnapshot=false without changing the business data model.
    if (!staticSnapshot) {
      rowChildren.push(componentNode(`mail-${index}-checkbox`, `Mail ${index + 1} checkbox`, "Checkbox/Unchecked/Default", "checkbox", "secondary-list", tokens, componentMap, { props: { checked: false, ariaLabel: `选择 ${mail.subject}` }, slots: { label: "" }, fallbackRecipe: "checkbox", layout: { direction: "HORIZONTAL", width: "fixed", height: "fixed", align: "CENTER" }, children: [shapeNode(`mail-${index}-checkbox-box`, "Checkbox box", "rectangle", "secondary-list", tokens, { stroke: "border/default", radius: "radius/control" }, { width: "fixed", height: "fixed" })] }));
    }
    const leading = frame(`mail-${index}-leading`, "Mail leading status", "secondary-list", [
      shapeNode(`mail-${index}-unread-dot`, "Unread dot", "ellipse", "secondary-list", tokens, { fill: mail.unread ? "state/unread" : "transparent", radius: "radius/full" }, { width: { tokenRef: "size/08" }, height: { tokenRef: "size/08" }, align: "CENTER" }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: { tokenRef: "size/20" }, height: { tokenRef: "size/20" }, align: "CENTER" } });
    const mailMeta = frame(`mail-${index}-meta`, "Mail time and signals", "secondary-list", [
      textNode(`mail-${index}-time`, "Mail time", mail.time ?? "", "secondary-list", tokens, "body-s", { color: "text/secondary", width: "hug", align: "MAX" }),
      frame(`mail-${index}-signals`, "Mail signals", "secondary-list", [], { tokens, layout: { direction: "HORIZONTAL", width: "hug", height: "hug", gap: "space/2", align: "CENTER" } }),
    ], { tokens, layout: { direction: "VERTICAL", width: { tokenRef: "size/56" }, height: "fill", gap: "space/2", align: "MAX", distribution: "SPACE_BETWEEN" } });
    const mailCopy = frame(`mail-${index}-copy`, "Mail copy", "secondary-list", [
      textNode(`mail-${index}-sender`, "Sender", mail.sender ?? "", "secondary-list", tokens, "body-m"),
      textNode(`mail-${index}-subject`, "Subject", mail.subject, "secondary-list", tokens, "body-m"),
      // body-s is compatibility-only in the Pixso typography map; Body_S
      // is the canonical 12/16 style matching the HTML summary metrics.
      textNode(`mail-${index}-summary`, "Summary", mail.summary, "secondary-list", tokens, "body-s", { color: "text/secondary" }),
    ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/1" } });
    rowChildren.unshift(leading);
    rowChildren.push(mailCopy);
    const signals = [];
    if (mail.flagged) signals.push(iconNode(`mail-${index}-flag`, "Flag", "action/mark-important", "secondary-list", tokens, { size: 16, color: "state/danger" }));
    if (mail.attachments) signals.push(textNode(`mail-${index}-attachments`, "Attachments", `附件 ${mail.attachments}`, "secondary-list", tokens, "body-s", { color: "text/secondary", width: "hug" }));
    if (mail.safe || mail.done) signals.push(iconNode(`mail-${index}-status`, "Status", mail.safe ? "status/success" : "action/check", "secondary-list", tokens, { size: 16, color: "state/success" }));
    mailMeta.children[1].children = signals;
    rowChildren.push(mailMeta);
    currentGroup.children.push(componentNode(`mail-${index}`, `Mail item ${index + 1}`, "List Item/White Surface/Default", "item", "secondary-list", tokens, componentMap, {
      props: { title: mail.subject, description: mail.summary, leading: mail.sender, trailing: mail.time, state: index === 0 ? "selected" : mail.unread ? "unread" : "default" }, slots: { leading: mail.sender, title: mail.subject, description: mail.summary, trailing: mail.time }, fallbackRecipe: "mail-list-item",
      layout: { direction: "HORIZONTAL", width: "fill", height: "hug", minHeight: { tokenRef: "size/80" }, gap: "space/2", align: "MIN", padding: { left: "space/3", right: "space/3", top: "space/4", bottom: "space/4" } }, style: { fill: index === 0 ? "surface/selected" : "surface/canvas", radius: "radius/control" }, children: rowChildren,
    }));
  }
  const mailList = frame("mail-list-content", "Mail list", "secondary-list", mailChildren, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "fill", gap: 0, clipsContent: true }, metadata: { htmlSelector: "#mailList.mail-list", scrollOwner: true } });
  const secondaryShell = frame("secondary-list-shell", "Secondary list shell", "secondary-list", [listHeading, mailList], {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "fill", gap: 0, clipsContent: true, padding: { top: "space/3", right: "space/5", bottom: "space/5", left: "space/5" } },
    metadata: { htmlSelector: ".secondary-list-shell", insetOwner: "secondary-list", scrollOwner: true, structure: "list-heading-plus-mail-list" },
  });
  return frame("pane-secondary-list", "Secondary list pane", "secondary-list", [secondaryShell], { tokens, layout: { direction: "VERTICAL", width: { tokenRef: "layout/secondary-width" }, height: "fill", clipsContent: true }, style: { fill: "surface/canvas", stroke: "border/subtle", strokeEdges: ["right"] }, metadata: { surfaceOwner: true, dividerOwner: "right", htmlSelector: ".secondary-list" } });
}

function buildDetailPane(pageData, tokens, componentMap, { staticSnapshot = true } = {}) {
  const detail = pageData.detail ?? {};
  // Optional business sections may be retained for a later state without
  // being present in the resting HTML page. A default-visible Pixso snapshot
  // requires an explicit opt-in on each such section; interactive/state-board
  // builds keep the legacy behavior and can materialize supplied sections.
  const includeOptionalSection = (section) => Boolean(section) && (!staticSnapshot || section.defaultVisible === true);
  const children = [];
  const subjectActions = [];
  addButton(subjectActions, "detail-flag", detail.flagged === false ? "标记旗标" : "取消红色旗标", "main-detail", tokens, componentMap, {
    variant: "ghost", mode: "icon", icon: "action/mark-important", iconColor: detail.flagged === false ? "icon/default" : "state/danger",
    logicalName: "Icon Button/Ghost/Default",
  });
  const subjectRow = frame("detail-subject-row", "Subject row", "main-detail", [
    textNode("detail-subject", "Detail subject", detail.subject ?? "Q2 路线评审会：材料更新与会前确认", "main-detail", tokens, "title-m", { width: "fill" }),
    ...subjectActions,
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/3", align: "CENTER", distribution: "SPACE_BETWEEN" } });
  const senderCopy = frame("detail-sender-copy", "Sender identity", "main-detail", [
    textNode("detail-sender", "Sender name", detail.sender?.name ?? "林简", "main-detail", tokens, "subtitle-m"),
    textNode("detail-sender-email", "Sender email", detail.sender?.email ?? "linjian@calendarpro.io", "main-detail", tokens, "body-m", { color: "text/secondary" }),
  ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/2" } });
  const senderRow = frame("detail-sender-row", "Sender row", "main-detail", [
    componentNode("detail-avatar", "Sender avatar", "Avatar/40/Fallback", "avatar", "main-detail", tokens, componentMap, { props: { initials: detail.sender?.initials ?? "林", name: detail.sender?.name ?? "林简", size: 40 }, slots: { content: detail.sender?.name ?? "林简" }, fallbackRecipe: "avatar", layout: { direction: "HORIZONTAL", width: { tokenRef: "size/control" }, height: { tokenRef: "size/control" }, align: "CENTER" }, style: { fill: "surface/selected", radius: "radius/full" }, children: [textNode("avatar-label", "Avatar label", detail.sender?.initials ?? "林", "main-detail", tokens, "subtitle-m", { color: "icon/primary", width: "hug" })] }),
    senderCopy,
    textNode("detail-time", "Received time", detail.time ?? "2026-01-09 10:42", "main-detail", tokens, "body-m", { color: "text/secondary", width: "hug" }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/3", align: "CENTER" } });
  const recipientValue = frame("recipient-value", "Recipient value", "main-detail", [
    shapeNode("recipient-presence", "Recipient presence", "ellipse", "main-detail", tokens, { fill: "state/success", radius: "radius/full" }, { width: { tokenRef: "size/08" }, height: { tokenRef: "size/08" }, align: "CENTER" }),
    textNode("recipient-copy", "Recipient copy", detail.recipients ?? "赵博海 <me@calendarpro.io>、产品设计中心", "main-detail", tokens, "body-s", { color: "text/secondary", width: "fill" }),
    frame("recipient-more", "More recipients", "main-detail", [textNode("recipient-more-label", "More recipients label", detail.recipientMore ?? "+其他 101 人", "main-detail", tokens, "body-s", { color: "icon/primary", width: "hug" })], { tokens, layout: { direction: "HORIZONTAL", width: "hug", height: "hug", padding: { left: "space/2", right: "space/2" }, align: "CENTER" }, style: { fill: "brand/10", radius: "radius/full" } }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/2", align: "CENTER" } });
  const recipientGrid = frame("recipient-grid", "Recipients", "main-detail", [
    frame("recipient-row", "Recipient row", "main-detail", [
      textNode("recipient-label", "Recipient label", "收件人", "main-detail", tokens, "body-s", { color: "text/muted", width: { tokenRef: "size/48" } }),
      recipientValue,
      textNode("message-size", "Message size", detail.size ?? "4.8 MB", "main-detail", tokens, "body-s", { color: "text/secondary", width: "hug" }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/2", align: "CENTER" } }),
    frame("cc-row", "CC row", "main-detail", [
      textNode("cc-label", "CC label", "抄送人", "main-detail", tokens, "body-s", { color: "text/muted", width: { tokenRef: "size/48" } }),
      textNode("cc-copy", "CC copy", detail.cc ?? "周亦航、林晓薇、CalendarPro 项目组", "main-detail", tokens, "body-s", { color: "text/secondary", width: "fill" }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/2", align: "CENTER" } }),
  ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/1", padding: { left: { tokenRef: "size/48" } } } });
  const quickActionChildren = [];
  for (const action of (pageData.detailActions ?? []).filter((item) => item.buttonType === "icon-text-ghost")) {
    addButton(quickActionChildren, `quick-action-${action.id}`, action.label, "main-detail", tokens, componentMap, { variant: "ghost", mode: "icon-text", icon: action.icon, iconColor: "icon/default", logicalName: "Icon Text Button/Ghost/Default" });
  }
  const quickActions = frame("quick-actions", "Quick actions", "main-detail", quickActionChildren, { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/1", padding: { left: { tokenRef: "size/48" } }, align: "CENTER" } });
  const header = [
    subjectRow,
    senderRow,
    recipientGrid,
    quickActions,
  ];
  children.push(frame("detail-message-header", "Message header", "main-detail", header, {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3", padding: { bottom: "space/5" } },
    style: { stroke: "border/default", strokeEdges: ["bottom"] },
    metadata: { htmlSelector: ".message-header", structure: "subject-sender-recipient-actions" },
  }));
  const meeting = detail.meeting ?? {};
  const dateParts = String(meeting.dateLabel ?? "JAN 09").split(/\s+/);
  const meetingDate = frame("meeting-date-badge", "Meeting date badge", "main-detail", [
    textNode("meeting-date-month", "Meeting month", dateParts[0] ?? "JAN", "main-detail", tokens, "body-s", { color: "text/on-primary", width: "hug" }),
    textNode("meeting-date-day", "Meeting day", dateParts[1] ?? "09", "main-detail", tokens, "title-m", { color: "text/on-primary", width: "hug" }),
  ], { tokens, layout: { direction: "VERTICAL", width: { tokenRef: "size/64" }, height: { tokenRef: "size/64" }, gap: "space/1", align: "CENTER", padding: { top: "space/2", bottom: "space/2" } }, style: { fill: "surface/primary", radius: "radius/card" } });
  const meetingTitleRow = frame("meeting-title-row", "Meeting title and status", "main-detail", [
    textNode("meeting-title", "Meeting title", meeting.title ?? "Q2 路线评审会", "main-detail", tokens, "subtitle-m"),
    componentNode("meeting-status", "Meeting status", "Badge/Success/Default", "badge", "main-detail", tokens, componentMap, { props: { label: meeting.status ?? "已接受", tone: "success" }, slots: { label: meeting.status ?? "已接受" }, fallbackRecipe: "badge", layout: { direction: "HORIZONTAL", width: "hug", height: "hug", align: "CENTER", padding: { left: "space/3", right: "space/3", top: "space/2", bottom: "space/2" } }, style: { fill: "surface/success", radius: "radius/full" }, children: [textNode("meeting-status-label", "Meeting status label", meeting.status ?? "已接受", "main-detail", tokens, "body-s", { color: "text/success", width: "hug" })] }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/3", align: "CENTER" } });
  const meetingLocation = frame("meeting-location-row", "Meeting location", "main-detail", [
    iconNode("meeting-location-icon", "Meeting location icon", meeting.locationIcon ?? "object/device", "main-detail", tokens, { size: 16, color: "icon/default" }),
    textNode("meeting-location", "Meeting location label", meeting.location ?? "线上会议", "main-detail", tokens, "body-m", { color: "text/secondary", width: "hug" }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/2", align: "CENTER" } });
  const meetingCopy = frame("meeting-copy", "Meeting information", "main-detail", [
    meetingTitleRow,
    textNode("meeting-time", "Meeting time", meeting.time ?? "2026-01-09 · 15:00–17:00", "main-detail", tokens, "body-m", { color: "text/secondary" }),
    meetingLocation,
  ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/2" } });
  const meetingAction = []; addButton(meetingAction, "join-meeting", meeting.actionLabel ?? "加入会议", "main-detail", tokens, componentMap, { variant: "primary", mode: "icon-text", icon: "field/calendar" });
  const meetingCard = frame("meeting-card", "Meeting invitation", "main-detail", [meetingDate, meetingCopy, ...meetingAction], {
    tokens,
    layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/4", align: "CENTER", padding: { left: "space/5", right: "space/5", top: "space/5", bottom: "space/5" } },
    style: {
      fill: {
        kind: "linear-gradient",
        angle: 135,
        stops: [
          { position: 0, color: "brand/05" },
          { position: 1, color: "surface/canvas" },
        ],
      },
      stroke: "brand/20",
      strokeEdges: ["top", "right", "bottom", "left"],
      radius: "radius/card",
    },
    metadata: {
      htmlSelector: ".meeting-card",
      htmlBackground: "linear-gradient(135deg, var(--color-brand-05), var(--color-surface))",
      structure: "date-copy-action-grid",
    },
  });
  children.push(frame("meeting-card-slot", "Meeting card spacing", "main-detail", [meetingCard], {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "hug", padding: { top: "space/5" } },
    metadata: {
      visualEvidenceExempt: true,
      visualEvidenceExemptReason: "Pixso-only wrapper used to model the CSS margin around .meeting-card",
      cssMarginTop: "var(--space-5)",
      visualWrapperFor: ".meeting-card"
    },
  }));
  const attachments = detail.attachments ?? [];
  const attachmentNodes = [];
  for (const [index, attachment] of attachments.entries()) {
    const attachmentType = frame(`attachment-${index}-type-badge`, "Attachment type badge", "main-detail", [textNode(`attachment-${index}-type`, "Attachment type", attachment.type ?? "PPTX", "main-detail", tokens, "body-s", { color: "state/danger", width: "hug" })], { tokens, layout: { direction: "VERTICAL", width: { tokenRef: "size/control" }, height: { tokenRef: "size/control" }, align: "CENTER" }, style: { fill: "function/danger/10", radius: "radius/full" } });
    const attachmentCopy = frame(`attachment-${index}-copy`, "Attachment copy", "main-detail", [
      textNode(`attachment-${index}-name`, "Attachment name", attachment.name ?? "Q2_路线评审_v4.pptx", "main-detail", tokens, "subtitle-s"),
      textNode(`attachment-${index}-meta`, "Attachment metadata", attachment.meta ?? "8.2 MB · 安全", "main-detail", tokens, "body-m", { color: "text/secondary" }),
    ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: 0 } });
    const attachmentActions = [frame(`attachment-${index}-preview`, "Attachment preview", "main-detail", [textNode(`attachment-${index}-preview-label`, "Preview", attachment.previewLabel ?? "预览", "main-detail", tokens, "subtitle-s", { color: "icon/primary", width: "hug" })], {
      tokens,
      layout: { direction: "HORIZONTAL", width: "hug", height: { tokenRef: "size/32" }, padding: { left: "space/3", right: "space/3" }, align: "CENTER" },
      style: { fill: "transparent", radius: "radius/control" },
      metadata: { htmlSelector: ".attachment-preview" },
    })];
    addButton(attachmentActions, `attachment-${index}-download`, attachment.downloadLabel ?? "下载", "main-detail", tokens, componentMap, { variant: "ghost", mode: "icon", icon: "action/download", iconColor: "icon/default", logicalName: "Icon Button/Ghost/Default" });
    const attachmentActionGroup = frame(`attachment-${index}-actions`, "Attachment actions", "main-detail", attachmentActions, {
      tokens,
      layout: { direction: "HORIZONTAL", width: "hug", height: "hug", gap: "space/1", align: "CENTER" },
      metadata: { htmlSelector: ".attachment-actions", slot: "actions" },
    });
    const attachmentInstance = componentNode(`attachment-${index}`, `Attachment ${index + 1}`, "Attachment/Default", "attachment", "main-detail", tokens, componentMap, {
      props: { type: attachment.type, name: attachment.name, meta: attachment.meta },
      slots: { leading: attachment.type, title: attachment.name, description: attachment.meta, actions: ["preview", "download"] },
      fallbackRecipe: "attachment",
      layout: {
        direction: "HORIZONTAL", width: "fill", height: "hug", minWidth: 260, gap: "space/3", align: "CENTER",
        padding: { left: "space/4", right: "space/4", top: "space/3", bottom: "space/3" },
      },
      style: { fill: "surface/subtle", radius: "radius/card" },
      metadata: { htmlSelector: ".tui-attachment", structure: "type-content-actions" },
      children: [attachmentType, attachmentCopy, attachmentActionGroup],
    });
    attachmentNodes.push(attachmentInstance);
  }
  if (attachmentNodes.length) {
    const attachmentHeadingCopy = frame("attachments-heading-copy", "Attachments heading", "main-detail", [
      textNode("attachments-heading", "Attachments title", "附件", "main-detail", tokens, "subtitle-s"),
      textNode("attachments-summary", "Attachments summary", `${attachments.length} 个附件，共 ${detail.attachmentTotalSize ?? "8.2 MB"}`, "main-detail", tokens, "body-m", { color: "text/secondary" }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/2", align: "CENTER" } });
    const safeBadge = componentNode("attachments-safe", "Attachment safe badge", "Badge/Success/Default", "badge", "main-detail", tokens, componentMap, { props: { label: detail.attachmentSafeLabel ?? "安全", tone: "success" }, slots: { label: detail.attachmentSafeLabel ?? "安全" }, fallbackRecipe: "badge", layout: { direction: "HORIZONTAL", width: "hug", height: "hug", padding: { left: "space/3", right: "space/3", top: "space/2", bottom: "space/2" }, align: "CENTER" }, style: { fill: "surface/success", radius: "radius/full" }, children: [textNode("attachments-safe-label", "Attachment safe label", detail.attachmentSafeLabel ?? "安全", "main-detail", tokens, "body-s", { color: "text/success", width: "hug" })] });
    children.push(frame("attachments-section", "Attachments", "main-detail", [frame("attachments-section-heading", "Attachments section heading", "main-detail", [attachmentHeadingCopy, safeBadge], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/3", align: "CENTER", distribution: "SPACE_BETWEEN" } }), ...attachmentNodes], {
      tokens,
      layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3", padding: { top: "space/5" } },
      metadata: { htmlSelector: ".attachment-section", structure: "heading-plus-attachment" },
    }));
  }
  const bodyChildren = [];
  for (const [index, paragraph] of (detail.paragraphs ?? []).entries()) bodyChildren.push(textNode(`body-paragraph-${index}`, `Body paragraph ${index + 1}`, paragraph, "main-detail", tokens, "body-l"));
  if (detail.orderedItems?.length) {
    const ordered = detail.orderedItems.map((item, index) => textNode(`body-ordered-${index}`, `Ordered item ${index + 1}`, `${index + 1}. ${item}`, "main-detail", tokens, "body-l"));
    bodyChildren.push(frame("body-ordered-list", "Review checklist", "main-detail", ordered, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3", padding: { left: "space/4" } } }));
  }
  if (detail.focusTitle) bodyChildren.push(textNode("body-focus-title", "Focus heading", detail.focusTitle, "main-detail", tokens, "subtitle-m", { color: "text/primary" }));
  if (includeOptionalSection(detail.roadmap)) {
    const steps = (detail.roadmap.steps ?? []).map((step, index) => frame(`roadmap-${index}`, `Roadmap step ${index + 1}`, "main-detail", [textNode(`roadmap-${index}-copy`, `Roadmap step ${index + 1} copy`, `${String(index + 1).padStart(2, "0")}  ${step}`, "main-detail", tokens, "subtitle-m", { color: "text/on-primary" })], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", padding: { left: "space/4", right: "space/4", top: "space/4", bottom: "space/4" } }, style: { fill: "neutral-light/80", radius: "radius/control" } }));
    const roadmapRow = frame("roadmap-steps", "Roadmap steps", "main-detail", steps, { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/5", align: "CENTER" } });
    bodyChildren.push(frame("roadmap-illustration", detail.roadmap.title ?? "Q2 产品路线图", "main-detail", [textNode("roadmap-title", "Roadmap title", detail.roadmap.title ?? "Q2 产品路线图", "main-detail", tokens, "title-s", { color: "text/on-primary" }), roadmapRow], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/4", padding: { left: "space/5", right: "space/5", top: "space/5", bottom: "space/5" } }, style: { fill: "multi/01", radius: "radius/card" } }));
  }
  if (detail.bullets?.length) bodyChildren.push(frame("body-bullets", "Key points", "main-detail", detail.bullets.map((item, index) => textNode(`body-bullet-${index}`, `Bullet ${index + 1}`, `• ${item}`, "main-detail", tokens, "body-l")), { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3" } }));
  if (detail.table?.rows?.length) {
    const cells = [frame("table-header", "Table header", "main-detail", (detail.table.columns ?? []).map((item, index) => textNode(`table-header-${index}`, `Table column ${index + 1}`, item, "main-detail", tokens, "subtitle-s", { width: "fill" })), { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/4" }, style: { fill: "surface/subtle" } })];
    for (const [rowIndex, row] of detail.table.rows.entries()) cells.push(frame(`table-row-${rowIndex}`, `Table row ${rowIndex + 1}`, "main-detail", row.map((item, index) => textNode(`table-${rowIndex}-${index}`, `Table cell ${rowIndex + 1}-${index + 1}`, item, "main-detail", tokens, "body-m", { width: "fill" })), { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "hug", gap: "space/4", padding: { top: "space/3", bottom: "space/3" } }, style: { stroke: "border/subtle", strokeEdges: ["bottom"] } }));
    bodyChildren.push(frame("detail-table", detail.table.title ?? "Detail table", "main-detail", cells, { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: 0 }, style: { radius: "radius/card" } }));
  }
  if (detail.conclusion) bodyChildren.push(textNode("body-conclusion", "Conclusion", detail.conclusion, "main-detail", tokens, "body-l"));
  if (detail.history) {
    const history = detail.history;
    const historyToggle = frame("history-toggle", "History toggle", "main-detail", [
      iconNode("history-chevron", "History chevron", history.icon ?? "navigation/chevron-right", "main-detail", tokens, { size: 16, color: "icon/default" }),
      textNode("history-label", "History label", history.title ?? "展开历史邮件（3 封）", "main-detail", tokens, "body-m", { color: "text/secondary", width: "fill" }),
    ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: { tokenRef: "size/44" }, gap: "space/2", align: "CENTER" }, metadata: { collapsible: true, expanded: Boolean(history.expanded) } });
    const historyContent = frame("history-content", "History content", "main-detail", [
      textNode("history-date", "History date", history.date ?? "2026-01-07 · 产品路线初审", "main-detail", tokens, "subtitle-s"),
      textNode("history-copy", "History copy", history.copy ?? "初版材料已完成，请各模块负责人补充范围和风险。", "main-detail", tokens, "body-m", { color: "text/secondary" }),
    ], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/2", padding: { left: "space/4", right: "space/4", top: "space/3", bottom: "space/3" } }, style: { fill: "surface/subtle", radius: "radius/card" } });
    bodyChildren.push(frame("history-mail", "History mail", "main-detail", [historyToggle, ...(history.expanded ? [historyContent] : [])], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: 0, padding: { top: "space/3" } }, style: { stroke: "border/subtle", strokeEdges: ["top"] }, metadata: { collapsible: true, expanded: Boolean(history.expanded) } }));
  }
  if (includeOptionalSection(detail.quote)) bodyChildren.push(frame("quoted-mail", "Quoted mail", "main-detail", [textNode("quote-copy", "Quote", detail.quote.text, "main-detail", tokens, "body-l", { color: "text/secondary" }), textNode("quote-byline", "Quote byline", detail.quote.byline ?? "", "main-detail", tokens, "body-s", { color: "text/muted" })], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3", padding: { left: "space/4", right: "space/4", top: "space/3", bottom: "space/3" } }, style: { fill: "surface/subtle", stroke: "border/subtle", radius: "radius/card" } }));
  children.push(frame("message-body", "Message body", "main-detail", bodyChildren, {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/4", padding: { left: "space/2", right: "space/2", top: "space/6", bottom: "space/6" } },
    metadata: { htmlSelector: ".message-body" },
  }));
  if (includeOptionalSection(detail.ai) && detail.ai.todos?.length) children.push(frame("ai-assistant", "AI Mail Assistant", "main-detail", [textNode("ai-title", "AI title", detail.ai.title ?? "AI 邮件助手", "main-detail", tokens, "subtitle-m", { color: "text/on-primary" }), textNode("ai-description", "AI description", detail.ai.description ?? "根据当前邮件生成 · 内容仅供参考", "main-detail", tokens, "body-m", { color: "neutral-light/80" }), ...detail.ai.todos.map((item, index) => textNode(`ai-todo-${index}`, `AI todo ${index + 1}`, item, "main-detail", tokens, "body-l", { color: "text/on-primary" }))], { tokens, layout: { direction: "VERTICAL", width: "fill", height: "hug", gap: "space/3", padding: { left: "space/5", right: "space/5", top: "space/5", bottom: "space/5" } }, style: { fill: "multi/01", radius: "radius/card" } }));
  const mailMessage = frame("mail-message", "Mail message", "main-detail", children, {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", maxWidth: 920, height: "hug", gap: 0, align: "MIN", counterAlign: "CENTER" },
    metadata: {
      htmlSelector: ".mail-message",
      layoutContractParameter: "--layout-frame-content-max",
      maxWidth: "920px",
      structure: "message-header-content-body",
    },
  });
  const shell = frame("main-detail-shell", "Main detail scroll shell", "main-detail", [mailMessage], {
    tokens,
    layout: {
      direction: "VERTICAL", width: "fill", height: "fill", gap: 0, align: "MIN", counterAlign: "CENTER", clipsContent: true,
      padding: { top: "space/5", right: "space/6", bottom: "size/titlebar", left: "space/6" },
    },
    metadata: { htmlSelector: ".main-detail-shell", insetOwner: "main-detail", scrollOwner: true },
  });
  return frame("pane-main-detail", "Main detail pane", "main-detail", [shell], {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "fill", clipsContent: true },
    style: { fill: "surface/canvas" },
    metadata: { surfaceOwner: true, htmlSelector: ".main-detail" },
  });
}

const COREMAIL_SECONDARY_STRUCTURE_SIGNATURE = "coremail-secondary-list-v2";

function findSceneNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findSceneNode(child, id);
    if (match) return match;
  }
  return null;
}

function tokenName(value) {
  return value?.name ?? value?.tokenRef ?? null;
}

export function validateCoremailSecondaryListScene(scene) {
  const root = (scene?.nodes ?? []).find((node) => node.id === "coremail-native-root") ?? scene?.nodes?.[0];
  const secondaryPane = findSceneNode(root, "pane-secondary-list");
  const secondaryShell = findSceneNode(root, "secondary-list-shell");
  const listHeading = findSceneNode(root, "secondary-list-heading");
  const mailList = findSceneNode(root, "mail-list-content");
  const firstDateHeading = findSceneNode(root, "mail-group-0-heading");
  const firstMail = findSceneNode(root, "mail-0");
  const firstLeading = findSceneNode(root, "mail-0-leading");
  const fail = (message) => {
    throw new Error(`Scene contract violation: ${message}`);
  };
  if (!secondaryPane) fail("missing pane-secondary-list");
  if (!secondaryShell) fail("missing secondary-list-shell");
  if (!listHeading) fail("missing secondary-list-heading");
  if (!mailList) fail("missing mail-list-content");
  if (secondaryPane.children?.map((node) => node.id).join(",") !== "secondary-list-shell") fail("secondary pane must contain only secondary-list-shell");
  if (secondaryShell.children?.map((node) => node.id).join(",") !== "secondary-list-heading,mail-list-content") fail("secondary-list-shell must contain list heading and mail list only");
  const shellPadding = secondaryShell.layout?.padding ?? {};
  for (const [edge, expected] of Object.entries({ top: "space/3", right: "space/5", bottom: "space/5", left: "space/5" })) {
    if (tokenName(shellPadding[edge]) !== expected) fail(`secondary-list-shell ${edge} padding must be ${expected}`);
  }
  if (tokenName(listHeading.layout?.height) !== "size/40") fail("list heading must use the 40px HTML height token");
  for (const edge of ["left", "right"]) if (tokenName(listHeading.layout?.padding?.[edge]) !== "space/3") fail(`list heading ${edge} padding must be space/3`);
  const headingActions = findSceneNode(root, "secondary-list-heading-actions");
  if (!headingActions || headingActions.children?.length !== 3) fail("heading actions must contain exactly three icon buttons");
  if (headingActions.children.some((node) => node.component?.props?.mode !== "icon")) fail("heading actions cannot contain visible text buttons");
  if (findSceneNode(root, "secondary-list-meta") || findSceneNode(root, "list-count") || findSceneNode(root, "select-all")) fail("legacy secondary list meta/select-all structure is forbidden");
  if (mailList.layout?.width !== "fill" || mailList.layout?.height !== "fill") fail("mail list must fill the secondary-list-shell content area");
  if (firstDateHeading) {
    if (tokenName(firstDateHeading.layout?.height) !== "size/36") fail("date group heading must use the 36px HTML height token");
    for (const edge of ["left", "right"]) if (tokenName(firstDateHeading.layout?.padding?.[edge]) !== "space/3") fail(`date group ${edge} padding must be space/3`);
  }
  if (firstMail) {
    for (const edge of ["left", "right"]) if (tokenName(firstMail.layout?.padding?.[edge]) !== "space/3") fail(`mail row ${edge} padding must be space/3`);
    if (tokenName(firstMail.layout?.minHeight) !== "size/80") fail("mail row must retain the triple-line minimum-height token");
  }
  if (firstLeading && tokenName(firstLeading.layout?.width) !== "size/20") fail("mail leading slot must use the 20px HTML column token");
  return { ok: true, signature: COREMAIL_SECONDARY_STRUCTURE_SIGNATURE };
}

export function buildCoremailScene({ pageSpec, layoutContract, pageData, componentMap, visualSnapshot = null, sourceFingerprint = null, htmlSourceFingerprint = null, tokens = loadTokenResources(), assetBaseDir = process.cwd() }) {
  const staticSnapshot = (pageSpec.pixso?.stateScope ?? "default-visible") === "default-visible";
  if (pageSpec.pixso?.visualSnapshot || visualSnapshot) {
    validateFreshHtmlVisualSnapshot({
      snapshot: visualSnapshot,
      htmlSourceFingerprint,
      viewport: pageSpec.viewport ?? layoutContract.viewport ?? null,
      requiredActions: (pageData.detailActions ?? []).map((action) => action.id),
      sourcePath: pageSpec.pixso?.visualSnapshot ?? "inline visual snapshot",
    });
  }
  // A previous bridge publication could leak its execution prefix into
  // page-spec.targetFrame. It is runtime identity, not the design's name;
  // strip it before compiling the next canonical output.
  const targetFrame = String(pageSpec.pixso?.targetFrame ?? "Coremail Mail Workbench / v6 Native").replace(/^(?:\[text-to-ui:[^\]]+\]\s*)+/, "");
  const contentRow = frame("content-row", "Content row", "global", [
    buildPrimaryPane(pageData, tokens, componentMap),
    buildSecondaryPane(pageData, tokens, componentMap, { staticSnapshot }),
    buildDetailPane(pageData, tokens, componentMap, { staticSnapshot }),
  ], { tokens, layout: { direction: "HORIZONTAL", width: "fill", height: "fill", gap: 0, align: "MIN" }, metadata: { htmlSelector: ".mail-shell > .pane-row", structure: "three-pane-content" } });
  const mailShell = frame("mail-shell", "Mail shell", "global", [buildGlobalTitleLayer(pageData, tokens, componentMap, { visualSnapshot }), contentRow], {
    tokens,
    layout: { direction: "VERTICAL", width: "fill", height: "fill", gap: 0, align: "MIN", clipsContent: true },
    style: { fill: "surface/canvas", stroke: "border/default", strokeEdges: ["top", "right", "bottom", "left"], radius: "radius/window" },
    metadata: { htmlSelector: ".mail-shell", surfaceOwner: true, structure: "titlebar-row-plus-three-pane-content" },
  });
  const rootChildren = [mailShell];
  const usedVariables = new Map();
  const usedStyles = new Map();
  const usedIcons = new Map();
  const usedImages = new Map();
  const variableAliases = {};
  const collectLayoutTokens = (value) => {
    if (value && typeof value === "object") {
      if (value.tokenRef) {
        const resolved = tokens.resolve(value.tokenRef);
        usedVariables.set(resolved.name, resolved);
        if (value.tokenRef !== resolved.name) variableAliases[value.tokenRef] = resolved.name;
      } else {
        for (const nested of Object.values(value)) collectLayoutTokens(nested);
      }
    } else if (typeof value === "string" && (value.startsWith("space/") || value.startsWith("size/") || value.startsWith("radius/") || value.startsWith("layout/"))) {
      const resolved = tokens.resolve(value);
      usedVariables.set(resolved.name, resolved);
      if (value !== resolved.name) variableAliases[value] = resolved.name;
    }
  };
  const collectStyleTokens = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.ref?.startsWith("$variable/") && value.name) usedVariables.set(value.name, value);
    if (value.ref?.startsWith("$style/")) usedStyles.set(value.ref, value);
    for (const nested of Object.values(value)) collectStyleTokens(nested);
  };
  const walk = (node) => {
    collectLayoutTokens(node.layout);
    collectStyleTokens(node.style);
    if (node.icon?.alias) usedIcons.set(node.icon.alias, node.icon);
    if (node.image?.ref) usedImages.set(node.image.ref, node.image);
    for (const child of node.children ?? []) walk(child);
  };
  const root = frame("coremail-native-root", targetFrame, "global", rootChildren, {
    tokens,
    layout: {
      direction: "VERTICAL",
      width: { tokenRef: "layout/viewport-width" },
      height: { tokenRef: "layout/viewport-height" },
      padding: { top: "space/6", right: "space/6", bottom: "space/6", left: "space/6" },
      clipsContent: true,
    },
    style: {
      fill: {
        kind: "linear-gradient",
        angle: 145,
        stops: [
          { position: 0, color: "surface/canvas" },
          { position: 1, color: "surface/subtle" },
        ],
      },
    },
    metadata: {
      targetFrame,
      stateId: pageSpec.pixso?.stateScope ?? "default-visible",
      surfaceOwner: true,
      htmlSelector: ".desktop-stage",
      structure: "desktop-stage-with-mail-shell",
    },
  });
  normalizeInheritedSurfaces(root);
  normalizeSceneLayoutTokens(root, tokens);
  const structureValidation = validateCoremailSecondaryListScene({ nodes: [root] });
  walk(root);
  const images = [...usedImages.values()].map((image) => {
    const sourcePath = pageData.brand?.logo?.ref === image.ref ? pageData.brand.logo.path : image.path;
    if (!sourcePath) throw new Error(`Missing raster asset path for ${image.ref}`);
    const resolvedPath = path.resolve(assetBaseDir, sourcePath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`Missing raster asset for ${image.ref}: ${resolvedPath}`);
    return { ref: image.ref, mimeType: pageData.brand?.logo?.mimeType ?? "image/png", dataBase64: fs.readFileSync(resolvedPath).toString("base64") };
  });
  return {
    schemaVersion: 1,
    source: {
      kind: "page-data",
      page: pageData.page ?? "Coremail Mail Workbench",
      workflow: pageSpec.workflow ?? "html-first",
      sourcePolicy: pageSpec.sourcePolicy ?? "fresh-build-current-html",
      sourceFingerprint,
    },
    page: {
      name: targetFrame,
      targetPage: pageSpec.pixso?.targetPage ?? null,
      viewport: pageSpec.viewport ?? layoutContract.viewport ?? { width: 1728, height: 1152 },
      pattern: layoutContract.pattern,
      stateScope: pageSpec.pixso?.stateScope ?? "default-visible",
      structureSignature: structureValidation.signature,
      sourceFingerprint,
      htmlSourceFingerprint,
      visualSnapshot: visualSnapshot ? {
        schemaVersion: visualSnapshot.schemaVersion ?? null,
        source: visualSnapshot.source ?? "html-live-computed-style",
        htmlSourceFingerprint: visualSnapshot.htmlSourceFingerprint ?? null,
        viewport: visualSnapshot.viewport ?? null,
        stateScope: visualSnapshot.stateScope ?? pageSpec.pixso?.stateScope ?? "default-visible",
      } : null,
    },
    resources: { componentLibraryPage: componentMap.libraryPage ?? "NewComponents", variableAliases, variables: [...usedVariables.values()], styles: [...usedStyles.values()], icons: [...usedIcons.values()].map((icon) => resolvePixsoIcon(icon.alias)), images, font: "font/family/sans" },
    nodes: [root],
  };
}
