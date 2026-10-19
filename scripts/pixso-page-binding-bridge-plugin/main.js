// Text-to-UI Page Binding Bridge v2
//
// This plugin deliberately has three explicit commands. It never writes during
// startup, never changes page focus, and never falls back to a same-name Frame.

const TARGET = {
  pageName: "coremail",
  frameNamePrefix: "Coremail Mail Workbench",
  libraryPageName: "NewComponents",
};

const MARKER = {
  pluginDataKey: "text-to-ui-px-key",
  nodeNamePrefix: "px-key:",
  htmlAttribute: "data-px-key",
};

const BINDINGS = [
  { key: "page.root.surface", token: "neutral-light/100", property: "fills", required: true },
  { key: "pane.primary.surface", token: "neutral-light/100", property: "fills", required: true },
  { key: "pane.list.surface", token: "neutral-light/100", property: "fills", required: true },
  { key: "pane.detail.surface", token: "neutral-light/100", property: "fills", required: true },
  { key: "nav.selected.surface", token: "brand/10", property: "fills", required: false },
  { key: "nav.selected.label", token: "brand/100", property: "fills", required: false },
  { key: "text.primary", token: "neutral-dark/90", property: "fills", required: false },
  { key: "text.secondary", token: "neutral-dark/60", property: "fills", required: false },
  { key: "divider.default", token: "neutral-dark/05", property: "fills", required: false },
];

const telemetry = {
  startedAt: Date.now(),
  pixsoCallCount: 0,
  slowestCallMs: 0,
};

const STAGE_TIMEOUT_MS = 8000;

function normalize(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function tokenKey(value) {
  return normalize(value).replace(/\s+/g, "");
}

function recordCall(startedAt) {
  telemetry.pixsoCallCount += 1;
  telemetry.slowestCallMs = Math.max(telemetry.slowestCallMs, Date.now() - startedAt);
}

async function counted(label, operation) {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    recordCall(startedAt);
  }
}

function withTimeout(operation, label, milliseconds = STAGE_TIMEOUT_MS) {
  let timer;
  const task = Promise.resolve().then(operation);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`阶段“${label}”超过 ${milliseconds}ms，已停止，未继续写入。`)), milliseconds);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

function notify(message, options) {
  try {
    if (typeof pixso !== "undefined" && pixso && typeof pixso.notify === "function") {
      pixso.notify(message, options);
    }
  } catch (error) {
    console.error("[text-to-ui-page-binding] Pixso notify failed", error);
  }
  console.log("[text-to-ui-page-binding] " + message);
}

function fail(message) {
  notify("已停止：" + message);
  throw new Error(message);
}

function pageChildren(page) {
  return Array.isArray(page?.children) ? page.children : [];
}

function isNode(value) {
  return value && typeof value === "object" && typeof value.type === "string";
}

function collectDescendants(root) {
  const result = [];
  const stack = [...(Array.isArray(root?.children) ? root.children : [])];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!isNode(node)) continue;
    result.push(node);
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return result;
}

function topLevelFrame(node, page) {
  let current = node;
  let parent = current?.parent;
  while (current && parent && parent !== page) {
    current = parent;
    parent = current?.parent;
  }
  return parent === page ? current : null;
}

function pageIsTarget(page) {
  return normalize(page?.name) === normalize(TARGET.pageName);
}

async function activeTargetPage() {
  const page = await counted("currentPage", async () => pixso.currentPage);
  if (!page) fail("当前没有活动页面；请先打开 Coremail 产品页。");
  if (!pageIsTarget(page)) {
    fail(`当前页面是“${page.name}”，目标页面必须是“${TARGET.pageName}”；插件不会自动切页。`);
  }
  return page;
}

function selectedFrame(page) {
  const selection = Array.isArray(page.selection) ? page.selection : [];
  const frames = selection.map((node) => topLevelFrame(node, page)).filter(Boolean);
  const unique = [...new Map(frames.map((node) => [node.id, node])).values()];
  return unique.length === 1 ? unique[0] : null;
}

function candidateFrames(page) {
  return pageChildren(page).filter((node) => {
    if (!["FRAME", "SECTION", "COMPONENT", "COMPONENT_SET"].includes(node.type)) return false;
    const canonical = normalize(node.getPluginData?.("text-to-ui-canonical-frame")) === "true";
    const named = normalize(node.name).startsWith(normalize(TARGET.frameNamePrefix));
    return canonical || named;
  });
}

async function targetFrame(page) {
  const selected = selectedFrame(page);
  if (selected) return selected;
  const candidates = candidateFrames(page);
  if (candidates.length === 0) {
    // code_to_design names imported top-level frames `html`. Resolve that
    // generic name asynchronously and only keep the frame carrying managed
    // px-key markers; an older unmarked html frame is ignored.
    const htmlFrames = pageChildren(page).filter((node) =>
      node.type === "FRAME" && normalize(node.name) === "html",
    );
    for (const frame of htmlFrames) {
      const descendants = await descendantsOf(frame, "识别 html Frame");
      if (descendants.some((child) => markerValues(child).length > 0)) candidates.push(frame);
    }
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    fail("没有找到唯一目标 Frame；请选中 Coremail 的最终 Frame，或给它设置 text-to-ui-canonical-frame=true。 ");
  }
  fail(`目标 Frame 不唯一（${candidates.length} 个）；请只选中要绑定的最终 Frame。`);
}

function markerValues(node) {
  const values = [];
  const pluginValue = node.getPluginData?.(MARKER.pluginDataKey);
  if (pluginValue) values.push(pluginValue);
  const name = String(node.name ?? "");
  // Pixso's HTML importer commonly prefixes an id-derived layer name with the
  // source tag (for example `div.px-key:page.root.surface`). Accept both the
  // exact marker and this imported `tag.marker` representation.
  const importedMarker = name.match(/(?:^|[.\s])(px-key|data-px-key):(.+)$/i);
  if (importedMarker) values.push(importedMarker[2]);
  else if (name.startsWith(MARKER.nodeNamePrefix)) values.push(name.slice(MARKER.nodeNamePrefix.length));
  else if (name.startsWith(MARKER.htmlAttribute + ":")) values.push(name.slice((MARKER.htmlAttribute + ":").length));
  return values.map(tokenKey).filter(Boolean);
}

function nodesForKey(frame, key, providedDescendants) {
  const expected = tokenKey(key);
  const descendants = providedDescendants ?? collectDescendants(frame);
  return descendants.filter((node) => markerValues(node).includes(expected));
}

async function descendantsOf(root, label = "读取 Frame 节点") {
  if (typeof root?.findAllAsync === "function") {
    return counted(label, () => withTimeout(() => root.findAllAsync(() => true), label));
  }
  return collectDescendants(root);
}

function localVariablesAsync() {
  if (pixso.variables && typeof pixso.variables.getLocalVariablesAsync === "function") {
    return counted("localVariables", () => withTimeout(
      () => pixso.variables.getLocalVariablesAsync(),
      "读取 Pixso 变量",
    ));
  }
  if (typeof pixso.getLocalVariablesAsync === "function") {
    return counted("localVariables", () => withTimeout(
      () => pixso.getLocalVariablesAsync(),
      "读取 Pixso 变量",
    ));
  }
  fail("当前 Pixso API 不支持读取本地变量；没有执行任何页面写入。");
}

async function variableIndex() {
  const variables = await localVariablesAsync();
  const byName = new Map();
  for (const variable of variables ?? []) {
    if (!variable?.name || variable.resolvedType !== "COLOR") continue;
    const key = tokenKey(variable.name);
    const list = byName.get(key) ?? [];
    list.push(variable);
    byName.set(key, list);
  }
  return { variables, byName };
}

function variableFor(index, token) {
  const matches = index.byName.get(tokenKey(token)) ?? [];
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1) return { status: "ambiguous", matches };
  return { status: "ready", variable: matches[0] };
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function containsVariable(value, id) {
  if (!value || typeof value !== "object") return false;
  if (value.id === id || value.variableId === id) return true;
  return Object.values(value).some((child) => containsVariable(child, id));
}

function isBound(node, property, variable) {
  if (containsVariable(node.boundVariables, variable.id)) return true;
  if (property === "fills" && containsVariable(node.fills, variable.id)) return true;
  if (property === "strokes" && containsVariable(node.strokes, variable.id)) return true;
  return false;
}

async function bindTextFills(node, variable) {
  if (typeof node.setRangeFills !== "function") return false;
  const characters = String(node.characters ?? "");
  if (!characters.length) return false;
  let paints = [];
  if (typeof node.getRangeFills === "function") paints = await node.getRangeFills(0, characters.length);
  else if (Array.isArray(node.fills)) paints = node.fills;
  const first = paints?.[0];
  if (!first) return false;
  const next = clone(first);
  if (typeof pixso?.setBoundVariableForPaint === "function") {
    const boundPaint = pixso.setBoundVariableForPaint(next, "color", variable);
    node.setRangeFills(0, characters.length, [boundPaint]);
    return true;
  }
  return false;
}

async function bindNode(node, property, variable) {
  let applied = false;
  if (node.type === "TEXT" && property === "fills") {
    applied = await bindTextFills(node, variable);
  }
  if (!applied && typeof node.setBoundVariable === "function") {
    node.setBoundVariable(property, variable);
    applied = true;
  }
  if (!applied) return { status: "blocked", reason: `节点不支持 ${property} 变量绑定` };
  const verified = isBound(node, property, variable);
  if (verified) {
    node.setPluginData?.("text-to-ui-token", variable.name);
    node.setPluginData?.("text-to-ui-binding-status", "verified");
    return { status: "verified" };
  }
  node.setPluginData?.("text-to-ui-binding-status", "applied-unverified");
  return { status: "blocked", reason: "Pixso 写入成功但 read-back 未发现变量绑定" };
}

function baseReport(frame, page, variables, allNodes) {
  return {
    schemaVersion: 1,
    bridgeVersion: 1,
    auditScope: "managed-bindings",
    frameId: String(frame?.id ?? ""),
    frameName: frame?.name ?? "",
    libraryPage: TARGET.libraryPageName,
    activePage: page?.name ?? "",
    targetPage: page?.name ?? "",
    libraryPhaseCompleted: false,
    activePageMismatch: !pageIsTarget(page),
    iconCropFindings: [],
    availableVariables: [...new Set((variables ?? []).filter((item) => item?.name).map((item) => item.name))],
    bindings: [],
    bindingFindings: [],
    componentInstances: [],
    literalStyleFindings: [],
    coverageSummary: {
      coverageScope: "managed-bindings",
      uniqueNodes: 0,
      colorBearingNodes: 0,
      variableBoundColorNodes: 0,
      literalPaintNodes: 0,
      layerOpacityLiteralNodes: 0,
      intrinsicAlphaPaints: 0,
    },
    performance: {
      pixsoCallCount: telemetry.pixsoCallCount,
      slowestCallMs: telemetry.slowestCallMs,
      codeToDesignMs: 0,
      canonicalNodeCount: (allNodes ?? collectDescendants(frame)).length + 1,
      retryCount: 0,
      abortedByBudget: false,
      bridgeDurationMs: Date.now() - telemetry.startedAt,
    },
  };
}

async function buildPreflight() {
  const page = await activeTargetPage();
  notify("桥接阶段：已确认 coremail 页面");
  const frame = await targetFrame(page);
  notify("桥接阶段：已找到目标 Frame");
  const allNodes = await descendantsOf(frame);
  notify(`桥接阶段：已读取 ${allNodes.length} 个 Frame 节点`);
  const index = await variableIndex();
  notify(`桥接阶段：已读取 ${index.variables.length} 个 Pixso 变量`);
  const report = baseReport(frame, page, index.variables, allNodes);
  const missingKeys = [];
  const ambiguousKeys = [];
  const missingTokens = [];
  const ambiguousTokens = [];
  const targets = [];
  for (const binding of BINDINGS) {
    const nodes = nodesForKey(frame, binding.key, allNodes);
    if (nodes.length === 0) {
      if (binding.required) missingKeys.push(binding.key);
      report.bindingFindings.push({ key: binding.key, status: "missing-node", required: binding.required });
      continue;
    }
    if (nodes.length > 1) {
      ambiguousKeys.push(binding.key);
      report.bindingFindings.push({ key: binding.key, status: "ambiguous-node", nodeIds: nodes.map((node) => node.id) });
      continue;
    }
    const resolution = variableFor(index, binding.token);
    if (resolution.status === "missing") {
      missingTokens.push(binding.token);
      report.bindingFindings.push({ key: binding.key, status: "missing-variable", token: binding.token });
      continue;
    }
    if (resolution.status === "ambiguous") {
      ambiguousTokens.push(binding.token);
      report.bindingFindings.push({ key: binding.key, status: "ambiguous-variable", token: binding.token });
      continue;
    }
    targets.push({ ...binding, node: nodes[0], variable: resolution.variable });
  }
  report.preflight = {
    status: missingKeys.length || ambiguousKeys.length || missingTokens.length || ambiguousTokens.length ? "blocked" : "ready",
    frameId: frame.id,
    missingKeys,
    ambiguousKeys,
    missingTokens,
    ambiguousTokens,
    managedTargetCount: targets.length,
    note: "只读预检不会改变页面、Frame、组件或变量。",
  };
  report.performance.pixsoCallCount = telemetry.pixsoCallCount;
  report.performance.slowestCallMs = telemetry.slowestCallMs;
  report.performance.bridgeDurationMs = Date.now() - telemetry.startedAt;
  return { page, frame, index, report, targets, allNodes };
}

async function runPreflight() {
  const result = await buildPreflight();
  console.log(JSON.stringify(result.report, null, 2));
  notify(`预检${result.report.preflight.status === "ready" ? "通过" : "未通过"}：${result.report.preflight.managedTargetCount} 个目标节点`);
}

async function runBind() {
  const result = await buildPreflight();
  notify(`桥接阶段：预检完成，准备绑定 ${result.targets.length} 个目标节点`);
  if (result.report.preflight.status !== "ready") {
    console.log(JSON.stringify(result.report, null, 2));
    fail("预检未通过；请先补齐唯一目标 Frame、px-key 标记或变量。没有执行任何绑定。");
  }
  const bound = [];
  for (const target of result.targets) {
    const outcome = await counted(`bind:${target.key}`, () => bindNode(target.node, target.property, target.variable));
    const entry = {
      nodeId: String(target.node.id),
      nodeName: target.node.name ?? "",
      key: target.key,
      property: target.property,
      variable: target.variable.name,
      verified: outcome.status === "verified",
      status: outcome.status,
    };
    if (outcome.reason) entry.reason = outcome.reason;
    if (entry.verified) bound.push(entry);
    else result.report.literalStyleFindings.push(entry);
    result.report.bindings.push(entry);
  }
  result.report.coverageSummary.uniqueNodes = result.targets.length;
  result.report.coverageSummary.colorBearingNodes = result.targets.length;
  result.report.coverageSummary.variableBoundColorNodes = bound.length;
  result.report.coverageSummary.literalPaintNodes = result.targets.length - bound.length;
  result.report.preflight.status = bound.length === result.targets.length ? "ready" : "blocked";
  result.report.preflight.boundCount = bound.length;
  result.report.preflight.note = "仅统计 manifest 管理的目标节点；未声明的页面节点不纳入成功分母。";
  result.report.performance.pixsoCallCount = telemetry.pixsoCallCount;
  result.report.performance.slowestCallMs = telemetry.slowestCallMs;
  result.report.performance.bridgeDurationMs = Date.now() - telemetry.startedAt;
  console.log(JSON.stringify(result.report, null, 2));
  notify(`绑定完成：${bound.length}/${result.targets.length} 个目标节点 read-back 已验证`);
}

async function runAudit() {
  const result = await buildPreflight();
  for (const binding of BINDINGS) {
    const node = nodesForKey(result.frame, binding.key, result.allNodes)[0];
    if (!node) continue;
    const resolution = variableFor(result.index, binding.token);
    if (resolution.status !== "ready") continue;
    const verified = isBound(node, binding.property, resolution.variable);
    const entry = {
      nodeId: String(node.id),
      nodeName: node.name ?? "",
      key: binding.key,
      property: binding.property,
      variable: resolution.variable.name,
      verified,
      status: verified ? "verified" : "unbound",
    };
    result.report.bindings.push(entry);
    if (!verified) result.report.literalStyleFindings.push(entry);
  }
  const verified = result.report.bindings.filter((entry) => entry.verified).length;
  result.report.coverageSummary.uniqueNodes = result.report.bindings.length;
  result.report.coverageSummary.colorBearingNodes = result.report.bindings.length;
  result.report.coverageSummary.variableBoundColorNodes = verified;
  result.report.coverageSummary.literalPaintNodes = result.report.bindings.length - verified;
  result.report.performance.pixsoCallCount = telemetry.pixsoCallCount;
  result.report.performance.slowestCallMs = telemetry.slowestCallMs;
  result.report.performance.bridgeDurationMs = Date.now() - telemetry.startedAt;
  console.log(JSON.stringify(result.report, null, 2));
  notify(`审计完成：${verified}/${result.report.bindings.length} 个已声明绑定已验证`);
}

async function run() {
  const command = typeof pixso !== "undefined" && typeof pixso.command === "string"
    ? pixso.command
    : "preflight";
  notify("页面绑定桥接已启动：" + command);
  try {
    if (command === "bind") await runBind();
    else if (command === "audit") await runAudit();
    else if (command === "preflight") await runPreflight();
    else notify("未知命令：本次未读取或修改文档。", { error: true });
  } catch (error) {
    console.error("[text-to-ui-page-binding]", error);
    const message = error && error.message ? error.message : String(error);
    if (!message.startsWith("已停止：")) notify("未完成：" + message, { error: true });
  } finally {
    try {
      if (typeof pixso !== "undefined" && pixso && typeof pixso.closePlugin === "function") {
        pixso.closePlugin();
      }
    } catch (error) {
      console.error("[text-to-ui-page-binding] closePlugin failed", error);
    }
  }
}

run();
