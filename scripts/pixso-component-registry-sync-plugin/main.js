// Text-to-UI Component Registry Sync
//
// This development plugin keeps the current Pixso library as the source of
// truth. It never detaches instances and never deletes native components.

// BEGIN EMBEDDABLE_COMPONENT_SYNC_CORE
const COREMAIL_TARGETS = [
  {
    logicalName: "Titlebar/L/Normal",
    componentSet: "Titlebar",
    variant: { size: "L", state: "Normal" },
    slots: ["App name"],
  },
  {
    logicalName: "Sidebar Item/Default",
    componentSet: "Sidebar Item",
    variant: { state: "Default" },
    slots: ["Label", "Count"],
  },
  {
    logicalName: "List Item/White Surface/Default",
    componentSet: "List Item",
    variant: { surface: "white", state: "Default" },
    slots: ["Sender", "Subject", "Preview", "Time"],
  },
  {
    logicalName: "Icon Text Button/Ghost/Default",
    componentSet: "icon-text",
    variant: { type: "ghost", size: "Medium", state: "Default" },
    slots: ["Label", "Leading"],
  },
  {
    logicalName: "Icon Button/Ghost/Default",
    componentSet: "Icon Button",
    variant: { type: "Ghost", size: "Medium", state: "Default" },
    slots: ["Icon"],
  },
];

const SLOT_REPAIRS = [
  {
    componentSet: "Button",
    variants: [
      { type: "Primary", size: "Medium", state: "Default" },
      { type: "Secondary", size: "Medium", state: "Default" },
      { type: "Ghost", size: "Medium", state: "Default" },
    ],
    slot: "Label",
  },
  {
    componentSet: "icon-text",
    variants: [
      { type: "primary", size: "Medium", state: "Default" },
      { type: "ghost", size: "Medium", state: "Default" },
    ],
    slot: "Label",
  },
  {
    componentSet: "Selection Dropdown",
    variants: [{ size: "Medium", state: "Default" }],
    slot: "Label",
  },
  {
    componentSet: "Search",
    variants: [{ surface: "white", state: "Default" }],
    slot: "Placeholder",
  },
];

// Exact source geometry from the Skill's icon registry (lucide@1.24.0).
// These are the only aliases needed by the five Coremail priority targets.
const SEMANTIC_ICONS = {
  "action/add": {
    viewBox: "0 0 24 24",
    geometry: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  },
  "action/more": {
    viewBox: "0 0 24 24",
    geometry: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  },
  "navigation/chevron-down": {
    viewBox: "0 0 24 24",
    geometry: '<path d="m6 9 6 6 6-6"/>',
  },
  "field/search": {
    viewBox: "0 0 24 24",
    geometry: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
  },
};

const ICON_REPAIRS = [
  { componentSet: "icon-text", variant: { type: "primary", size: "Medium", state: "Default" }, slot: "Leading", alias: "action/add" },
  { componentSet: "icon-text", variant: { type: "ghost", size: "Medium", state: "Default" }, slot: "Leading", alias: "action/add" },
  { componentSet: "Icon Button", variant: { type: "Ghost", size: "Medium", state: "Default" }, slot: "Icon", alias: "action/more" },
  { componentSet: "Selection Dropdown", variant: { size: "Medium", state: "Default" }, slot: "Trailing", alias: "navigation/chevron-down" },
  { componentSet: "Search", variant: { surface: "white", state: "Default" }, slot: "Leading", alias: "field/search" },
];

const COREMAIL_TEXT_COLOR_TOKENS = new Map([
  ["#0A59F7", "brand/100"],
  ["#FFFFFF", "neutral-light/100"],
  ["#000000", "neutral-dark/90"],
  ["#000000E5", "neutral-dark/90"],
  ["#000000E6", "neutral-dark/90"],
  ["#00000099", "neutral-dark/60"],
  ["#00000066", "neutral-dark/40"],
]);

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

async function libraryPage() {
  const page = pixso.root.children.find(
    (node) => node.type === "PAGE" && node.name === "NewComponents",
  );
  if (!page) throw new Error("未找到 NewComponents 页面；已停止写入以保护旧页面。");
  return page;
}

async function componentSets() {
  const page = await libraryPage();
  if (typeof page.findAllAsync !== "function") {
    throw new Error("当前 Pixso API 不支持 findAllAsync；请更新 Pixso 后重试。");
  }
  return page.findAllAsync((node) => node.type === "COMPONENT_SET");
}

const COMPONENT_FACTS_POLICY = {
  identity: "组件名称必须与当前 Pixso Component Set 或 COMPONENT 的 name 完全一致，区分大小写。",
  ids: "不保存 GUID、node ID、file key；执行时必须从当前 Pixso 文件重新解析。",
  variantSource: "Variant 轴和值只读取 variantProperties；不从 Variant 显示名称推断已删除的轴。",
  geometrySource: "几何事实只读取当前 COMPONENT 的 Plugin API 属性，用于同步 Token 映射。",
};

function safeValue(node, key) {
  try { return node?.[key]; } catch (_) { return undefined; }
}

function safeNumber(value) {
  try {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 1000) / 1000;
  } catch (_) {
    // Pixso may expose some mixed/automatic geometry values as Symbols on
    // older document runtimes. An unreadable optional field must not abort
    // the complete component snapshot; the remaining facts stay usable.
    return null;
  }
}

function safeString(value) {
  const result = String(value ?? "").trim();
  return result || null;
}

function variantPropertiesFromNode(node, allowedAxes) {
  const direct = safeValue(node, "variantProperties");
  if (direct && typeof direct === "object") {
    return Object.fromEntries(
      Object.entries(direct)
        .map(([key, value]) => [safeString(key), safeString(value)])
        .filter(([key, value]) => key && value)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  }
  const parsed = {};
  for (const segment of String(safeValue(node, "name") ?? "").split(/\s*,\s*/)) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const axis = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (axis && value && (!allowedAxes || allowedAxes.has(axis))) parsed[axis] = value;
  }
  return Object.fromEntries(Object.entries(parsed).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizedVariantName(properties) {
  return Object.entries(properties).map(([key, value]) => `${key}=${value}`).join(", ");
}

function componentClassification(name) {
  if (name.startsWith("Text-to-UI Icon/")) return "supporting";
  if (name.startsWith(".")) return "helper";
  return "business";
}

function captureGeometry(component) {
  const geometry = {};
  for (const key of ["width", "height", "itemSpacing", "cornerRadius"]) {
    const number = safeNumber(safeValue(component, key));
    if (number !== null) geometry[key] = number;
  }
  const padding = {};
  for (const key of ["top", "right", "bottom", "left"]) {
    const number = safeNumber(safeValue(component, `padding${key[0].toUpperCase()}${key.slice(1)}`));
    if (number !== null) padding[key] = number;
  }
  if (Object.keys(padding).length) geometry.padding = padding;
  for (const key of [
    "layoutMode",
    "primaryAxisAlignItems",
    "counterAxisAlignItems",
    "layoutSizingHorizontal",
    "layoutSizingVertical",
  ]) {
    const value = safeString(safeValue(component, key));
    if (value) geometry[key] = value;
  }
  return Object.keys(geometry).length ? geometry : undefined;
}

function captureVariant(component, allowedAxes) {
  const variantProperties = variantPropertiesFromNode(component, allowedAxes);
  if (!Object.keys(variantProperties).length) return null;
  const result = {
    // This is intentionally regenerated from variantProperties. A stale
    // display name such as `density=Default` must never re-enter the facts.
    name: normalizedVariantName(variantProperties),
    variantProperties,
  };
  const geometry = captureGeometry(component);
  if (geometry) result.geometry = geometry;
  return result;
}

function variantAxisName(key, definition) {
  return safeString(safeValue(definition, "name"))
    || safeString(key)?.split("#")[0]
    || null;
}

function variantAxesFromSet(componentSet, variants) {
  const axes = new Map();
  const definitions = safeValue(componentSet, "componentPropertyDefinitions") || {};
  for (const [key, definition] of Object.entries(definitions)) {
    if (!definition || String(definition.type).toUpperCase() !== "VARIANT") continue;
    const axis = variantAxisName(key, definition);
    if (!axis) continue;
    axes.set(axis, new Set((definition.variantOptions || []).map(safeString).filter(Boolean)));
  }
  for (const variant of variants) {
    for (const [axis, value] of Object.entries(variant.variantProperties)) {
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

function captureComponentSet(componentSet, warnings) {
  const name = safeString(safeValue(componentSet, "name"));
  if (!name) return null;
  const children = Array.isArray(safeValue(componentSet, "children"))
    ? safeValue(componentSet, "children").filter((node) => node.type === "COMPONENT")
    : [];
  const definitions = safeValue(componentSet, "componentPropertyDefinitions") || {};
  const allowedAxes = new Set(Object.entries(definitions)
    .filter(([, definition]) => String(definition?.type).toUpperCase() === "VARIANT")
    .map(([key, definition]) => variantAxisName(key, definition))
    .filter(Boolean));
  const variants = [];
  const seen = new Set();
  for (const child of children) {
    const variant = captureVariant(child, allowedAxes);
    if (!variant) continue;
    const fingerprint = JSON.stringify(variant.variantProperties);
    if (seen.has(fingerprint)) {
      warnings.push({
        kind: "duplicate-variant-properties",
        componentSet: name,
        variantProperties: variant.variantProperties,
        count: 2,
        message: "多个 Variant 解析为同一组真实 variantProperties；已只保留一份事实。",
      });
      continue;
    }
    seen.add(fingerprint);
    variants.push(variant);
  }
  variants.sort((left, right) => left.name.localeCompare(right.name));
  return {
    name,
    classification: componentClassification(name),
    variantAxes: variantAxesFromSet(componentSet, variants),
    ...(variants.length ? { variants } : {}),
  };
}

async function readComponentFacts() {
  const page = await libraryPage();
  if (typeof page.findAllAsync !== "function") {
    throw new Error("当前 Pixso API 不支持全页组件扫描；为避免误删组件事实，已停止同步。");
  }
  // Library authors commonly organize component sets inside SECTION or FRAME
  // containers. `page.children` only sees those containers, so treating it as
  // the inventory silently turns a valid library into an empty snapshot. Scan
  // the whole NewComponents page, while excluding variants and helper
  // components nested inside a component definition.
  const allCandidates = await page.findAllAsync(
    (node) => node.type === "COMPONENT_SET" || node.type === "COMPONENT",
  );
  const direct = allCandidates.filter((node) => {
    let parent = safeValue(node, "parent");
    const visited = new Set();
    while (parent && parent !== page && parent.id !== page.id && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (parent.type === "COMPONENT_SET" || parent.type === "COMPONENT") return false;
      parent = safeValue(parent, "parent");
    }
    return true;
  });
  const warnings = [];
  const componentSets = direct
    .filter((node) => node.type === "COMPONENT_SET")
    .map((node) => captureComponentSet(node, warnings))
    .filter((item) => item && item.name);
  const standaloneComponents = direct
    .filter((node) => node.type === "COMPONENT")
    .map((node) => {
      const name = safeString(safeValue(node, "name"));
      return name ? { name, classification: componentClassification(name), variantAxes: {} } : null;
    })
    .filter((item) => item && item.classification !== "supporting");
  const inventoryCount = direct.filter((node) => node.type === "COMPONENT_SET" || node.type === "COMPONENT").length;
  return {
    $schema: "./pixso-component-facts.schema.json",
    schemaVersion: 1,
    kind: "text-to-ui.pixso-component-facts",
    document: safeString(safeValue(pixso.root, "name")) || "Pixso document",
    page: safeString(safeValue(page, "name")) || "NewComponents",
    source: "Pixso Plugin API read-only component facts; Variant 轴来自 variantProperties，几何来自当前 COMPONENT",
    capturedAt: new Date().toISOString(),
    scope: "page-wide-top-level-component-inventory-with-geometry",
    policy: {
      ...COMPONENT_FACTS_POLICY,
      captureTraversal: "page-descendant-top-level",
    },
    componentSets: componentSets.sort((left, right) => left.name.localeCompare(right.name)),
    standaloneComponents: standaloneComponents.sort((left, right) => left.name.localeCompare(right.name)),
    supportingComponents: {
      description: "语义图标和局部辅助 COMPONENT 不进入业务组件映射身份，但会在同步提案中作为事实来源统计。",
      inventoryCountFromPixso: inventoryCount,
      supportingStandaloneCount: direct.filter((node) => node.type === "COMPONENT" && componentClassification(String(safeValue(node, "name") || "")) === "supporting").length,
    },
    ...(warnings.length ? { warnings } : {}),
  };
}

function localVariablesAsync() {
  if (pixso.variables && typeof pixso.variables.getLocalVariablesAsync === "function") {
    return pixso.variables.getLocalVariablesAsync();
  }
  if (typeof pixso.getLocalVariablesAsync === "function") {
    return pixso.getLocalVariablesAsync();
  }
  throw new Error("当前 Pixso API 不支持读取本地变量。");
}

async function findSet(name) {
  return (await componentSets()).find((node) => node.name === name) || null;
}

function matchesVariant(component, required) {
  const values = component.variantProperties || {};
  return Object.entries(required).every(([key, value]) => normalize(values[key]) === normalize(value));
}

function findVariant(componentSet, required) {
  if (!componentSet) return null;
  return componentSet.children.find(
    (node) => node.type === "COMPONENT" && matchesVariant(node, required),
  ) || null;
}

async function textDescendants(node) {
  if (typeof node.findAllAsync !== "function") {
    throw new Error("当前 Pixso API 不支持 findAllAsync；无法读取文字槽位。");
  }
  return node.findAllAsync((child) => child.type === "TEXT");
}

async function iconFontDescendants(node) {
  if (typeof node.findAllAsync !== "function") {
    throw new Error("当前 Pixso API 不支持 findAllAsync；无法读取图标槽位。");
  }
  return node.findAllAsync((child) => child.type === "ICON_FONT");
}

function propertyKey(component, logicalSlot) {
  const definitions = component.componentPropertyDefinitions || {};
  return Object.keys(definitions).find((key) => key === logicalSlot || key.startsWith(logicalSlot + "#"));
}

async function attachTextSlot(component, logicalSlot) {
  const textLayer = (await textDescendants(component))[0];
  if (!textLayer) return { status: "blocked", reason: "缺少文字图层" };

  let key = propertyKey(component, logicalSlot);
  let changed = false;
  if (!key) {
    key = component.addComponentProperty(logicalSlot, "TEXT", textLayer.characters);
    changed = true;
  }
  const references = textLayer.componentPropertyReferences || {};
  if (references.characters !== key) {
    textLayer.componentPropertyReferences = {
      ...references,
      characters: key,
    };
    changed = true;
  }
  return { status: "verified", key, layer: textLayer.name, changed };
}

function localColorVariable(name) {
  return localVariablesAsync()
    .then((variables) => variables.find((variable) => variable.name === name && variable.resolvedType === "COLOR"));
}

function bindIconColor(node, variable) {
  if (!node || !variable) return;
  if (typeof node.setBoundVariable === "function") {
    try { node.setBoundVariable("strokes", variable); } catch (_) {}
    try { node.setBoundVariable("fills", variable); } catch (_) {}
  }
  if (node.children) node.children.forEach((child) => bindIconColor(child, variable));
}

function normalizePaintColor(paint) {
  if (!paint || paint.type !== "SOLID" || !paint.color) return null;
  const alpha = typeof paint.opacity === "number" ? paint.opacity : 1;
  const toHex = (value) => Math.round(value * 255).toString(16).padStart(2, "0").toUpperCase();
  const rgb = [paint.color.r, paint.color.g, paint.color.b]
    .map(toHex)
    .join("");
  if (alpha >= 0.999) return "#" + rgb;
  return "#" + rgb + toHex(alpha);
}

async function bindTextRangeColor(textNode, variable) {
  if (!textNode || !variable || typeof textNode.characters !== "string") return false;
  const length = textNode.characters.length;
  if (!length || typeof textNode.getRangeFills !== "function" || typeof textNode.setRangeFills !== "function") {
    return false;
  }
  const paints = textNode.getRangeFills(0, length);
  if (!Array.isArray(paints) || paints.length === 0) return false;
  let didBind = false;
  const boundPaints = paints.map((paint) => {
    if (typeof pixso.setBoundVariableForPaint === "function" && paint.type === "SOLID") {
      try {
        const boundPaint = pixso.setBoundVariableForPaint(paint, "color", variable);
        didBind = true;
        return boundPaint;
      } catch (_) {}
    }
    return paint;
  });
  textNode.setRangeFills(0, length, boundPaints);
  return didBind;
}

async function bindCoremailTextColors() {
  const variables = await localVariablesAsync();
  const byName = new Map(
    variables
      .filter((variable) => variable.resolvedType === "COLOR")
      .map((variable) => [variable.name, variable]),
  );
  const coremailPage = pixso.root.children.find(
    (node) => node.type === "PAGE" && node.name === "Coremail",
  );
  const root = coremailPage && (await coremailPage.findAllAsync(
    (node) => node.type === "FRAME" && node.name === "html",
  ))[0];
  if (!root) {
    pixso.notify("未找到 Coremail 导入画板（html Frame）。", { error: true });
    return 0;
  }
  const results = [];
  for (const node of await root.findAllAsync((item) => item.type === "TEXT")) {
    const paints = typeof node.getRangeFills === "function" && node.characters.length
      ? node.getRangeFills(0, node.characters.length)
      : [];
    const tokenName = COREMAIL_TEXT_COLOR_TOKENS.get(normalizePaintColor(paints?.[0]));
    const variable = tokenName ? byName.get(tokenName) : null;
    if (!variable) {
      results.push({ id: node.id, status: "unmapped", color: normalizePaintColor(paints?.[0]) });
      continue;
    }
    try {
      const bound = await bindTextRangeColor(node, variable);
      results.push({ id: node.id, token: tokenName, status: bound ? "bound" : "blocked" });
    } catch (error) {
      results.push({ id: node.id, token: tokenName, status: "blocked", reason: error.message });
    }
  }
  const bound = results.filter((item) => item.status === "bound").length;
  const blocked = results.filter((item) => item.status === "blocked").length;
  const unmapped = results.filter((item) => item.status === "unmapped").length;
  pixso.notify("Coremail 文本颜色绑定：已绑定 " + bound + "，阻塞 " + blocked + "，未映射 " + unmapped + "。详见控制台。");
  console.log("Text-to-UI Coremail text color binding", results);
  return bound;
}

async function getOrCreateIconComponent(alias) {
  const name = "Text-to-UI Icon/" + alias;
  const library = await libraryPage();
  // Only resolve helpers that are already in the authoritative library page.
  // Never move a component from another page: doing so can invalidate Pixso's
  // internal S_Guid references while the document is being synchronized.
  const existing = (await library.findAllAsync(
    (node) => node.type === "COMPONENT" && node.name === name,
  ))[0];
  if (existing) return existing;
  const definition = SEMANTIC_ICONS[alias];
  if (!definition) throw new Error("未登记语义图标：" + alias);
  const previousPage = pixso.currentPage;
  pixso.currentPage = library;
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="' + definition.viewBox + '" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + definition.geometry + '</svg>';
    const imported = pixso.createNodeFromSvg(svg);
    imported.name = name + "/SVG";
    imported.x = library.children.length * 40;
    imported.y = 40;
    const component = pixso.createComponentFromNode(imported);
    component.name = name;
    component.setPluginData("text-to-ui-icon-alias", alias);
    const variable = await localColorVariable("neutral-dark/90");
    bindIconColor(component, variable);
    return component;
  } finally {
    pixso.currentPage = previousPage;
  }
}

async function replaceIconSlot(component, logicalSlot, iconComponent) {
  const existingTarget = (await component.findAllAsync((node) => (
    node.type === "INSTANCE" &&
    node.name === logicalSlot &&
    node.mainComponent &&
    node.mainComponent.name === iconComponent.name
  )))[0];
  if (existingTarget) {
    return { status: "verified", key: propertyKey(component, logicalSlot), layer: existingTarget.name, reused: true };
  }

  const iconFont = (await iconFontDescendants(component))[0];
  let oldSlot = iconFont ? iconFont.parent : null;
  if (!oldSlot || oldSlot === component) {
    oldSlot = component.children.find((child) => child.name === ".search" || child.name.indexOf("Arrow-bottom") >= 0) || null;
  }
  if (!oldSlot || !oldSlot.parent) {
    return { status: "blocked", reason: "未找到可替换的图标槽位" };
  }

  let key = propertyKey(component, logicalSlot);
  let propertyStatus = "existing";
  if (!key) {
    try {
      key = component.addComponentProperty(logicalSlot, "INSTANCE_SWAP", iconComponent.key);
      propertyStatus = "created";
    } catch (error) {
      // A linked instance is still safe and reusable even if Pixso rejects the
      // optional INSTANCE_SWAP metadata. Keep the swap and report the detail.
      propertyStatus = "blocked: " + (error.message || String(error));
    }
  }

  // Prefer an in-place component swap. It preserves the library instance,
  // Auto Layout, constraints, and the slot's exact geometry. The old version
  // created a new instance and tried to attach its property reference before
  // inserting it into the component, which Pixso rejects for API 2.x.
  if (oldSlot.type === "INSTANCE" && typeof oldSlot.swapComponent === "function") {
    oldSlot.swapComponent(iconComponent);
    oldSlot.name = logicalSlot;
    if (key) {
      try {
        oldSlot.componentPropertyReferences = {
          ...(oldSlot.componentPropertyReferences || {}),
          mainComponent: key,
        };
      } catch (error) {
        propertyStatus = "blocked: " + (error.message || String(error));
      }
    }
    return { status: "verified", key, propertyStatus, layer: oldSlot.name, swapped: true };
  }

  if (typeof oldSlot.parent.insertChild !== "function") {
    return { status: "blocked", reason: "当前 Pixso 节点不支持插入共享实例" };
  }

  const parent = oldSlot.parent;
  const index = parent.children.indexOf(oldSlot);
  const instance = iconComponent.createInstance();
  instance.name = logicalSlot;
  instance.x = oldSlot.x;
  instance.y = oldSlot.y;
  if (oldSlot.width && oldSlot.height) instance.resizeWithoutConstraints(oldSlot.width, oldSlot.height);
  parent.insertChild(index, instance, true);
  if (key) {
    try {
      // The instance must already be inside the component before a component
      // property reference can be attached to it.
      instance.componentPropertyReferences = {
        ...(instance.componentPropertyReferences || {}),
        mainComponent: key,
      };
    } catch (error) {
      propertyStatus = "blocked: " + (error.message || String(error));
    }
  }
  oldSlot.remove();
  return { status: "verified", key, propertyStatus, layer: instance.name };
}

async function repairIcons() {
  const results = [];
  for (const repair of ICON_REPAIRS) {
    const set = await findSet(repair.componentSet);
    const component = findVariant(set, repair.variant);
    if (!component) {
      results.push({ componentSet: repair.componentSet, variant: repair.variant, status: "missing" });
      continue;
    }
    try {
      const iconComponent = await getOrCreateIconComponent(repair.alias);
      results.push({ componentSet: repair.componentSet, variant: component.name, alias: repair.alias, ...await replaceIconSlot(component, repair.slot, iconComponent) });
    } catch (error) {
      results.push({ componentSet: repair.componentSet, variant: component.name, alias: repair.alias, status: "blocked", reason: error.message });
    }
  }
  const fixed = results.filter((item) => item.status === "verified").length;
  const blocked = results.length - fixed;
  pixso.notify("语义 SVG 图标处理完成：已替换 " + fixed + "，阻塞 " + blocked + "。请重新运行审计。");
  console.log("Text-to-UI semantic icon repair", results);
  return fixed;
}

async function auditTarget(target) {
  const set = await findSet(target.componentSet);
  const component = findVariant(set, target.variant);
  if (!set) {
    return { logicalName: target.logicalName, status: "missing", reason: "缺少组件集 " + target.componentSet };
  }
  if (!component) {
    return { logicalName: target.logicalName, status: "missing", reason: "缺少目标 Variant" };
  }
  const definitions = component.componentPropertyDefinitions || {};
  const missingSlots = [];
  for (const slot of target.slots) {
    if (propertyKey(component, slot)) continue;
    const linkedIcon = (slot === "Leading" || slot === "Icon") &&
      (await component.findAllAsync((node) => (
        node.type === "INSTANCE" &&
        node.name === slot &&
        node.mainComponent &&
        String(node.mainComponent.name || "").startsWith("Text-to-UI Icon/")
      ))).length > 0;
    if (!linkedIcon) missingSlots.push(slot);
  }
  const iconFonts = (await iconFontDescendants(component)).length;
  const blockers = [];
  if (missingSlots.length) blockers.push("可编辑槽位：" + missingSlots.join("、"));
  if (iconFonts) blockers.push("存在 " + iconFonts + " 个 icon_font；需替换为注册语义 SVG 图标槽位");
  return {
    logicalName: target.logicalName,
    status: blockers.length ? "blocked" : "ready-for-instance-test",
    variant: component.name,
    componentId: component.id,
    slots: Object.keys(definitions),
    blockers,
  };
}

function notifyReport(report) {
  const ready = report.filter((item) => item.status === "ready-for-instance-test").length;
  const missing = report.filter((item) => item.status === "missing").length;
  const blocked = report.filter((item) => item.status === "blocked").length;
  pixso.notify(
    "Coremail 组件审计：可实例测试 " + ready + "，槽位或图标阻塞 " + blocked + "，缺失 " + missing + "。详见控制台。",
  );
  console.log("Text-to-UI Coremail component audit", report);
}

async function repairSlots() {
  const results = [];
  for (const repair of SLOT_REPAIRS) {
    const set = await findSet(repair.componentSet);
    for (const variant of repair.variants) {
      const component = findVariant(set, variant);
      if (!component) {
        results.push({ componentSet: repair.componentSet, variant, status: "missing" });
        continue;
      }
      results.push({
        componentSet: repair.componentSet,
        variant: component.name,
        slot: repair.slot,
        ...await attachTextSlot(component, repair.slot),
      });
    }
  }
  const fixed = results.filter((item) => item.status === "verified").length;
  const changed = results.filter((item) => item.status === "verified" && item.changed).length;
  const blocked = results.length - fixed;
  pixso.notify("文字槽位处理完成：已验证 " + fixed + "，实际修改 " + changed + "，阻塞 " + blocked + "。安全模式未写入图标。");
  console.log("Text-to-UI slot repair", results);
  return changed;
}

// END EMBEDDABLE_COMPONENT_SYNC_CORE

if (pixso.ui && typeof pixso.ui === "object") {
  pixso.ui.onmessage = (message) => {
    if (message?.type === "CLOSE") pixso.closePlugin();
  };
}

async function run() {
  const command = pixso.command || "health";
  pixso.notify("Text-to-UI 组件同步已启动：" + command);
  let changed = 0;
  if (command === "sync") {
    pixso.showUI(__html__, {
      width: 420,
      height: 560,
      themeColors: true,
    });
    const facts = await readComponentFacts();
    pixso.ui.postMessage({ type: "COMPONENT_FACTS", facts });
    pixso.notify("已读取当前 Pixso 组件事实，正在生成安全同步提案。");
    return;
  } else if (command === "health") {
    pixso.notify("Pixso 安全自检通过：本次未读取或修改任何节点。");
  } else if (command === "slots") {
    changed = await repairSlots();
  } else if (command === "icons") {
    pixso.notify("安全模式：图标槽位写入已暂停，避免失效 S_Guid。当前未修改任何节点。");
  } else if (command === "repair") {
    // Do not chain icon creation or component swapping into the default repair.
    // Those operations caused Pixso to resolve stale S_Guid values in the old
    // plugin. Text properties are the only safe library mutation for now.
    changed = await repairSlots();
  } else if (command === "bind-text") {
    pixso.notify("安全模式已禁止 Coremail 写入；本次未修改任何节点。");
  } else if (command === "audit") {
    pixso.notify("安全模式：Coremail 审计由 Codex MCP 实时读取；插件未扫描或修改文档。");
  } else {
    pixso.notify("未知命令：本次未读取或修改任何节点。", { error: true });
  }
  // v5 deliberately does not call commitUndo. Pixso has been resolving stale
  // internal S_Guid values while committing plugin operations after a refresh.
  // A safe plugin must prefer a small, recoverable write over an undo checkpoint.
  pixso.closePlugin();
}

run().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  pixso.notify("组件注册同步失败：" + message, { error: true });
  console.error(error && error.stack ? error.stack : error);
  pixso.closePlugin();
});
