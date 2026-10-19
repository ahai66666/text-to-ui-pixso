#!/usr/bin/env node

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildDomVisualIr, compileDomVisualIrPlan } from "../../scripts/dom-visual-ir.mjs";
import { loadComponentMap, loadTokenResources, readJson } from "../../scripts/pixso-native-scene-lib.mjs";
import { validateImportRun } from "../../scripts/validate-pixso-import-run.mjs";

const tokens = loadTokenResources();
const componentMap = loadComponentMap(fileURLToPath(new URL("../../assets/design-system/pixso-native-component-map.json", import.meta.url)));
const componentSpecs = readJson(fileURLToPath(new URL("../../assets/design-system/pixso-component-specs.json", import.meta.url)));
const baseStyle = {
  display: "block", visibility: "visible", position: "static", overflow: "visible", overflowX: "visible", overflowY: "visible",
  backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none", color: "rgba(0, 0, 0, 0.898)", opacity: "1",
  borderTopWidth: "0px", borderRightWidth: "0px", borderBottomWidth: "0px", borderLeftWidth: "0px",
  borderTopStyle: "none", borderRightStyle: "none", borderBottomStyle: "none", borderLeftStyle: "none",
  borderTopColor: "rgba(0, 0, 0, 0)", borderRightColor: "rgba(0, 0, 0, 0)", borderBottomColor: "rgba(0, 0, 0, 0)", borderLeftColor: "rgba(0, 0, 0, 0)",
  borderTopLeftRadius: "0px", borderTopRightRadius: "0px", borderBottomRightRadius: "0px", borderBottomLeftRadius: "0px",
  paddingTop: "0px", paddingRight: "0px", paddingBottom: "0px", paddingLeft: "0px", boxShadow: "none",
  fontFamily: "HarmonyOS Sans", fontSize: "16px", fontWeight: "400", lineHeight: "22px", textAlign: "start", textOverflow: "clip",
};

function fixture(kind) {
  const fingerprint = `${kind}-fingerprint`;
  const nodes = [
    { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle, backgroundColor: "rgb(255, 255, 255)", overflow: "hidden" }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 1, parentIndex: 0, childIndex: 0, selector: `.${kind}-pane`, selectorAliases: [`.${kind}-pane`], tag: "section", rect: { x: 24, y: 24, width: 1680, height: 1104 }, style: { ...baseStyle, backgroundColor: "rgb(255, 255, 255)", paddingLeft: "24px", paddingRight: "24px" }, semantic: { dataset: { tuiPaneRole: kind }, component: null }, text: "", asset: null },
    { index: 2, parentIndex: 1, childIndex: 0, selector: `.${kind}-heading`, selectorAliases: [`.${kind}-heading`], tag: "h1", rect: { x: 48, y: 48, width: 240, height: 32 }, style: { ...baseStyle, fontSize: "24px", fontWeight: "700", lineHeight: "32px" }, semantic: { dataset: {}, component: null }, text: kind === "email" ? "收件箱" : kind === "settings" ? "设置" : "数据总览", asset: null },
    { index: 3, parentIndex: 1, childIndex: 1, selector: `.tui-component.tui-button.${kind}`, selectorAliases: [`.tui-component.tui-button.${kind}`], tag: "button", rect: { x: 48, y: 96, width: 120, height: 40 }, style: { ...baseStyle, display: "flex", flexDirection: "row", gap: "8px", columnGap: "8px", paddingLeft: "8px", paddingRight: "8px", backgroundColor: "rgb(10, 89, 247)", borderTopLeftRadius: "8px", borderTopRightRadius: "8px", borderBottomRightRadius: "8px", borderBottomLeftRadius: "8px" }, semantic: { accessibleText: "新建", ariaLabel: null, component: "button", variant: "primary", dataset: { component: "button", variant: "primary" } }, text: "", asset: null },
    { index: 4, parentIndex: 3, childIndex: 0, selector: `.tui-component.tui-button.${kind} > svg`, selectorAliases: [`.tui-component.tui-button.${kind} > svg`], tag: "svg", rect: { x: 60, y: 106, width: 20, height: 20 }, style: { ...baseStyle, color: "rgb(255, 255, 255)" }, semantic: { dataset: {}, component: null }, text: "", asset: { kind: "svg", alias: "action/add", html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor"/></svg>' } },
  ];
  return { schemaVersion: 4, kind: "text-to-ui-html-visual-manifest", source: "browser-computed-visual-manifest", runId: `${kind}-run`, htmlSourceFingerprint: fingerprint, stateId: "default-visible", url: `http://fixture/${kind}/`, viewport: { width: 1728, height: 1152, zoom: 1 }, nodeCount: nodes.length, nodes };
}

for (const kind of ["email", "settings", "dashboard"]) {
  const manifest = fixture(kind);
  const ir = buildDomVisualIr(manifest, { tokens, componentMap, componentSpecs, pageName: `${kind} fixture` });
  const plan = compileDomVisualIrPlan(ir, { tokens, componentMap, images: [] });
  plan.page.htmlSourceFingerprint = manifest.htmlSourceFingerprint;
  plan.page.visualSnapshot = { source: manifest.source, runId: manifest.runId, htmlSourceFingerprint: manifest.htmlSourceFingerprint, stateId: manifest.stateId, viewport: manifest.viewport };
  plan.execution.importRun = { runId: manifest.runId, htmlSourceFingerprint: manifest.htmlSourceFingerprint, visualManifestSource: manifest.source, minimumSelectorCoverage: 0.95, minimumVisualEvidenceCoverage: 0.95 };
  plan.execution.visualReconciliation = { source: manifest.source, reconciledNodeCount: ir.nodes.length, staleSceneFallback: "forbidden" };
  const runManifest = { schemaVersion: 1, kind: "text-to-ui-pixso-import-run", runId: manifest.runId, source: { htmlSourceFingerprint: manifest.htmlSourceFingerprint }, viewport: { width: 1728, height: 1152 } };
  const report = validateImportRun({ runManifest, visualManifest: manifest, operationPlan: plan });
  assert.equal(report.ok, true, `${kind}: ${report.failures.join("; ")}`);
  assert.equal(ir.geometryPolicy, "browser-absolute-bounds-only");
  assert.equal(ir.summary.selectorCoverage, 1);
  assert.equal(ir.summary.geometryCoverage, 1);
  assert.equal(plan.execution.pipeline, "dom-visual-ir-geometry-lock-then-component-enrichment");
  assert.equal(plan.execution.minimumRuntimeVersion, "5.0.0");
  assert.equal(plan.execution.agentContract.protocolVersion, 4);
  assert.equal(plan.execution.agentContract.planSchemaVersion, 5);
  assert.equal(plan.execution.agentContract.executorProtocol, 1);
  assert.deepEqual(plan.execution.agentContract.requiredCapabilities, ["executor.data-plan.v1", "executor.transaction.v1", "executor.assets.deferred.v1", "executor.readback.v1"]);
  assert.equal(plan.execution.outputPolicy, "single-managed-artboard");
  assert.equal(plan.execution.preserveFailedDraft, false);
  assert.equal(plan.page.htmlSourceFingerprint, manifest.htmlSourceFingerprint);
  assert.equal(plan.page.visualSnapshot.htmlSourceFingerprint, manifest.htmlSourceFingerprint);
  assert.equal(plan.summary.instanceCount, 1);
  assert.equal(plan.operations.find((operation) => operation.nodeId === "dom-0").layout.direction, "NONE");
  assert.ok(plan.summary.tokenBindingCount > 0);
  const primaryButton = plan.operations.find((operation) => operation.nodeId === "dom-3");
  assert.equal(primaryButton.op, "create-instance", `${kind}: Primary button should use the mapped component instance`);
  assert.equal(primaryButton.componentRef.contentColor, undefined, `${kind}: mapped Variant must own content color without an instance override`);
  assert.equal(primaryButton.componentRef.iconColorSource, "variant-content", `${kind}: icon replacement must inherit the selected Pixso Variant color`);
}

const badgeManifest = fixture("email");
badgeManifest.nodes = badgeManifest.nodes.slice(0, 4);
badgeManifest.nodeCount = badgeManifest.nodes.length;
badgeManifest.nodes[3] = {
  ...badgeManifest.nodes[3],
  selector: ".tui-component.tui-badge.tui-badge--danger",
  selectorAliases: [".tui-component.tui-badge.tui-badge--danger"],
  tag: "span",
  rect: { x: 48, y: 96, width: 52, height: 24 },
  style: {
    ...baseStyle,
    display: "flex",
    paddingLeft: "8px",
    paddingRight: "8px",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: "4px",
    borderBottomRightRadius: "4px",
    borderBottomLeftRadius: "4px",
  },
  semantic: {
    accessibleText: "错误",
    component: "badge",
    logicalName: "Badge/Default",
    variant: "danger",
    dataset: { component: "badge", logicalComponent: "Badge/Default", variant: "danger" },
  },
  text: "错误",
  asset: null,
};
const badgeIr = buildDomVisualIr(badgeManifest, { tokens, componentMap, componentSpecs, pageName: "badge variant fixture" });
const badgePlan = compileDomVisualIrPlan(badgeIr, { tokens, componentMap, images: [] });
const badgeOperation = badgePlan.operations.find((operation) => operation.nodeId === "dom-3");
assert.equal(badgeOperation.op, "create-instance", "Badge must reuse the Pixso component set");
assert.equal(badgeOperation.componentRef.pixsoName, "Badge");
assert.deepEqual(badgeOperation.componentRef.variant, { "属性 1": "Error" });

const imageManifest = fixture("email");
imageManifest.nodeCount += 1;
imageManifest.nodes.push({
  index: 5,
  parentIndex: 1,
  childIndex: 1,
  selector: ".email-pane > img",
  selectorAliases: [".email-pane > img"],
  tag: "img",
  rect: { x: 300, y: 96, width: 48, height: 32 },
  style: { ...baseStyle },
  semantic: { dataset: {}, component: null },
  text: "",
  asset: { kind: "image", src: "data:image/png;base64,cG5n", fit: "contain" },
});
const imageIr = buildDomVisualIr(imageManifest, { tokens, componentMap, componentSpecs, pageName: "image fixture" });
const imagePlan = compileDomVisualIrPlan(imageIr, {
  tokens,
  componentMap,
  images: [{ ref: "dom-image-5", mimeType: "image/png", dataBase64: "cG5n" }],
});
const imageOperation = imagePlan.operations.find((operation) => operation.op === "create-image" && operation.nodeId === "dom-5");
assert.equal(imageOperation?.phase, "image-optimization", "DOM image operations must run in the late image optimization phase");
assert.equal(imagePlan.phases.at(-1).id, "image-optimization");
assert.deepEqual(imagePlan.modules.map((module) => module.id).at(-1), "image-optimization");
assert.ok(imagePlan.modules.at(-1).operationIndexes.includes(imagePlan.operations.indexOf(imageOperation)), "late image operations must be isolated in the final module");

const typographyManifest = {
  schemaVersion: 4,
  kind: "text-to-ui-html-visual-manifest",
  source: "browser-computed-visual-manifest",
  runId: "typography-fallback-run",
  htmlSourceFingerprint: "typography-fallback-fingerprint",
  stateId: "default-visible",
  url: "http://fixture/typography/",
  viewport: { width: 1728, height: 1152, zoom: 1 },
  nodeCount: 6,
  nodes: [
    { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 1, parentIndex: 0, childIndex: 0, selector: ".unread-subject", selectorAliases: [".unread-subject"], tag: "span", rect: { x: 24, y: 24, width: 240, height: 20 }, style: { ...baseStyle, fontSize: "14px", fontWeight: "700", lineHeight: "20px" }, semantic: { dataset: {}, component: null }, text: "Unread subject", asset: null },
    { index: 2, parentIndex: 0, childIndex: 1, selector: ".supporting-copy", selectorAliases: [".supporting-copy"], tag: "span", rect: { x: 24, y: 48, width: 240, height: 16 }, style: { ...baseStyle, fontSize: "12px", fontWeight: "400", lineHeight: "16px" }, semantic: { dataset: {}, component: null }, text: "Supporting copy", asset: null },
    { index: 3, parentIndex: 0, childIndex: 2, selector: ".metadata", selectorAliases: [".metadata"], tag: "time", rect: { x: 24, y: 68, width: 80, height: 14 }, style: { ...baseStyle, fontSize: "10px", fontWeight: "400", lineHeight: "normal" }, semantic: { dataset: {}, component: null }, text: "10:42", asset: null },
    { index: 4, parentIndex: 0, childIndex: 3, selector: ".detail-heading", selectorAliases: [".detail-heading"], tag: "h3", rect: { x: 24, y: 88, width: 240, height: 20 }, style: { ...baseStyle, fontSize: "16px", fontWeight: "700", lineHeight: "normal" }, semantic: { dataset: {}, component: null }, text: "Detail heading", asset: null },
    { index: 5, parentIndex: 0, childIndex: 4, selector: ".detail-body", selectorAliases: [".detail-body"], tag: "p", rect: { x: 24, y: 112, width: 240, height: 28 }, style: { ...baseStyle, fontSize: "14px", fontWeight: "400", lineHeight: "28px" }, semantic: { dataset: {}, component: null }, text: "Detail body", asset: null },
  ],
};
const typographyIr = buildDomVisualIr(typographyManifest, { tokens, componentMap, componentSpecs, pageName: "typography fixture" });
const typographyPlan = compileDomVisualIrPlan(typographyIr, { tokens, componentMap, images: [] });
const typographyOperations = new Map(typographyPlan.operations.map((operation) => [operation.nodeId, operation]));
assert.equal(typographyOperations.get("dom-1").style.typography.fontStyle, "Bold");
assert.equal(typographyOperations.get("dom-1").style.typography.fontSize.ref, "$variable/font/size/14");
assert.equal(typographyOperations.get("dom-2").style.typography.fontSize.ref, "$variable/font/size/12");
assert.equal(typographyOperations.get("dom-3").style.typography.fontSize.ref, "$variable/font/size/10");
assert.deepEqual(typographyOperations.get("dom-3").style.typography.lineHeight, { unit: "AUTO" });
assert.equal(typographyOperations.get("dom-4").style.typography.fontStyle, "Bold");
assert.equal(typographyOperations.get("dom-4").style.typography.fontSize.ref, "$variable/font/size/16");
assert.equal(typographyOperations.get("dom-5").style.typography.fontSize.ref, "$variable/font/size/14");
assert.equal(typographyOperations.get("dom-5").style.typography.lineHeight.ref, "$variable/font/line-height/28");

const directTextManifest = {
  schemaVersion: 4,
  kind: "text-to-ui-html-visual-manifest",
  source: "browser-computed-visual-manifest",
  runId: "direct-text-run",
  htmlSourceFingerprint: "direct-text-fingerprint",
  stateId: "default-visible",
  url: "http://fixture/direct-text/",
  viewport: { width: 1728, height: 1152, zoom: 1 },
  nodeCount: 9,
  nodes: [
    { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 1, parentIndex: 0, childIndex: 0, selector: "#scopeSelect", selectorAliases: ["#scopeSelect"], tag: "button", rect: { x: 24, y: 24, width: 70, height: 40 }, style: { ...baseStyle, display: "flex", fontSize: "14px", lineHeight: "normal", paddingLeft: "12px", paddingRight: "12px" }, semantic: { accessibleText: "全部", dataset: {}, component: null }, text: "", asset: null },
    { index: 2, parentIndex: 1, childIndex: 0, selector: "#scopeSelect::text-0", selectorAliases: [], tag: "text", rect: { x: 36, y: 35, width: 28, height: 16 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "normal" }, semantic: { accessibleText: "全部", dataset: {}, component: null }, text: "全部", asset: null },
    { index: 3, parentIndex: 0, childIndex: 1, selector: ".items", selectorAliases: [".items"], tag: "ol", rect: { x: 24, y: 80, width: 400, height: 28 }, style: { ...baseStyle, paddingLeft: "32px", listStyleType: "decimal" }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 4, parentIndex: 3, childIndex: 0, selector: ".items > li", selectorAliases: [".items > li"], tag: "li", rect: { x: 56, y: 80, width: 368, height: 28 }, style: { ...baseStyle, display: "list-item", fontSize: "14px", lineHeight: "28px" }, semantic: { dataset: {}, component: null }, text: "第一项", asset: null },
    { index: 5, parentIndex: 3, childIndex: 0, selector: ".items > li::marker", selectorAliases: [], tag: "marker", rect: { x: 28, y: 80, width: 12, height: 28 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "28px" }, semantic: { accessibleText: "1.", dataset: {}, component: null }, text: "1.", asset: null },
    { index: 6, parentIndex: 0, childIndex: 2, selector: ".tui-component.tui-search", selectorAliases: [".tui-component.tui-search"], tag: "label", rect: { x: 120, y: 24, width: 260, height: 40 }, style: { ...baseStyle, display: "flex", flexDirection: "row", gap: "0px", columnGap: "0px", fontSize: "14px", lineHeight: "normal" }, semantic: { accessibleText: "高级", dataset: {}, component: "search", variant: "advanced-search" }, text: "", asset: null },
    { index: 7, parentIndex: 6, childIndex: 0, selector: ".tui-component.tui-search > input", selectorAliases: [], tag: "input", rect: { x: 148, y: 33, width: 180, height: 22 }, style: { ...baseStyle, fontSize: "16px", lineHeight: "22px" }, semantic: { ariaLabel: "搜索邮件", placeholder: "搜索邮件", dataset: {}, component: null }, text: "", asset: null },
    { index: 8, parentIndex: 6, childIndex: 1, selector: ".tui-component.tui-search > svg", selectorAliases: [], tag: "svg", rect: { x: 128, y: 36, width: 16, height: 16 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: { kind: "svg", alias: "field/search", html: '<svg viewBox="0 0 24 24"></svg>' } },
  ],
};
const directTextIr = buildDomVisualIr(directTextManifest, { tokens, componentMap, componentSpecs, pageName: "direct text fixture" });
const directTextPlan = compileDomVisualIrPlan(directTextIr, { tokens, componentMap, images: [] });
const directTextOperations = new Map(directTextPlan.operations.map((operation) => [operation.nodeId, operation]));
assert.equal(directTextOperations.get("dom-2").op, "create-text", "direct text beside an icon must remain a text operation");
assert.equal(directTextOperations.get("dom-2").characters, "全部");
assert.equal(directTextOperations.get("dom-2").parentId, "dom-1");
assert.equal(directTextOperations.get("dom-5").characters, "1.", "ordered list marker must remain visible");
assert.equal(directTextOperations.get("dom-5").parentId, "dom-3");
const searchOperation = directTextPlan.operations.find((operation) => operation.nodeId === "dom-6");
assert.equal(searchOperation.op, "create-instance");
assert.deepEqual(searchOperation.slots, { icon: "field/search", value: "搜索邮件", label: "高级" }, "Search must keep placeholder and advanced label in their distinct slots");
assert.equal(searchOperation.componentRef.variant.surface, componentMap.map.get("Search/White Surface/Default")?.variant?.surface, "white Search surface must resolve to the registered Pixso variant");
const graySearchManifest = {
  ...directTextManifest,
  runId: "direct-text-gray-run",
  htmlSourceFingerprint: "direct-text-gray-fingerprint",
  nodes: directTextManifest.nodes.map((node) => node.index === 6
    ? { ...node, semantic: { ...node.semantic, surface: "gray" } }
    : node),
};
const graySearchIr = buildDomVisualIr(graySearchManifest, { tokens, componentMap, componentSpecs, pageName: "direct text gray fixture" });
const graySearchPlan = compileDomVisualIrPlan(graySearchIr, { tokens, componentMap, images: [] });
const graySearchOperation = graySearchPlan.operations.find((operation) => operation.nodeId === "dom-6");
assert.equal(graySearchOperation.componentRef.variant.surface, componentMap.map.get("Search/Gray Surface/Default")?.variant?.surface, "gray Search surface must resolve to the registered Pixso variant");
const incompatibleSearchManifest = {
  ...directTextManifest,
  runId: "direct-text-incompatible-run",
  htmlSourceFingerprint: "direct-text-incompatible-fingerprint",
  nodes: directTextManifest.nodes.map((node) => node.index === 6
    ? { ...node, style: { ...node.style, gap: "4px", columnGap: "4px" } }
    : node),
};
const incompatibleSearchPlan = compileDomVisualIrPlan(buildDomVisualIr(incompatibleSearchManifest, { tokens, componentMap, componentSpecs, pageName: "incompatible search fixture" }), { tokens, componentMap, images: [] });
const incompatibleSearchOperation = incompatibleSearchPlan.operations.find((operation) => operation.nodeId === "dom-6");
assert.equal(incompatibleSearchOperation.op, "create-frame", "a geometry-incompatible mapping must preserve the page structure with native composition");
assert.equal(incompatibleSearchOperation.metadata.componentFallback.reason, "geometry-incompatible", "a geometry mismatch must become a repair item");
assert.ok(incompatibleSearchPlan.operations.some((operation) => operation.nodeId === "dom-8"), "native fallback must retain the browser-owned icon subtree");
assert.equal(incompatibleSearchPlan.summary.componentRepairCount, 1, "the incompatible mapping must be reported without blocking the import");

const itemManifest = {
  ...directTextManifest,
  runId: "item-fallback-run",
  htmlSourceFingerprint: "item-fallback-fingerprint",
  nodeCount: 3,
  nodes: [
    directTextManifest.nodes[0],
    { index: 9, parentIndex: 0, childIndex: 3, selector: ".tui-component.tui-item", selectorAliases: [".tui-component.tui-item"], tag: "article", rect: { x: 24, y: 140, width: 420, height: 72 }, style: { ...baseStyle, display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "16px", paddingRight: "16px" }, semantic: { accessibleText: "邮件标题", logicalName: "List Item/White Surface/Default", component: "item", dataset: { component: "item" } }, text: "", asset: null },
    { index: 10, parentIndex: 9, childIndex: 0, selector: ".tui-component.tui-item__title", selectorAliases: [".tui-component.tui-item__title"], tag: "span", rect: { x: 40, y: 156, width: 180, height: 20 }, style: { ...baseStyle, fontSize: "16px", lineHeight: "20px" }, semantic: { dataset: {} }, text: "邮件标题", asset: null },
  ],
};
const itemIr = buildDomVisualIr(itemManifest, { tokens, componentMap, componentSpecs, pageName: "item fallback fixture" });
const itemPlan = compileDomVisualIrPlan(itemIr, { tokens, componentMap, images: [] });
assert.equal(itemIr.summary.componentFallbackCount, 1, "Item must be recognized as a repairable native fallback");
assert.equal(itemIr.summary.componentRepairItems[0].logicalName, "List Item/White Surface/Default");
assert.ok(!itemPlan.operations.some((operation) => operation.op === "create-instance" && operation.nodeId === "dom-9"), "unmapped Item must never block or emit a broken component instance");
assert.equal(itemPlan.operations.find((operation) => operation.nodeId === "dom-9").op, "create-frame");
assert.equal(itemPlan.operations.find((operation) => operation.nodeId === "dom-10").op, "create-text");

const sidebarManifest = {
  ...directTextManifest,
  runId: "sidebar-instance-run",
  htmlSourceFingerprint: "sidebar-instance-fingerprint",
  nodeCount: 6,
  nodes: [
    directTextManifest.nodes[0],
    { index: 20, parentIndex: 0, childIndex: 0, selector: ".tui-component.tui-sidebar", selectorAliases: [".tui-component.tui-sidebar"], tag: "nav", rect: { x: 24, y: 140, width: 240, height: 40 }, style: { ...baseStyle, display: "flex", flexDirection: "row", gap: "8px", columnGap: "8px", paddingLeft: "8px", paddingRight: "8px" }, semantic: { ariaLabel: "邮件文件夹", component: "sidebar", logicalName: "Sidebar Item/Default", dataset: { component: "sidebar", logicalComponent: "Sidebar Item/Default" } }, text: "", asset: null },
    { index: 21, parentIndex: 20, childIndex: 0, selector: ".tui-sidebar-item", selectorAliases: [".tui-sidebar-item"], tag: "button", rect: { x: 24, y: 140, width: 240, height: 40 }, style: { ...baseStyle, display: "flex", flexDirection: "row", gap: "8px", columnGap: "8px", paddingLeft: "8px", paddingRight: "8px" }, semantic: { dataset: { state: "selected" }, variant: "selected" }, text: "", asset: null },
    { index: 22, parentIndex: 21, childIndex: 0, selector: ".tui-sidebar-item [data-slot='leading']", selectorAliases: [".tui-sidebar-item [data-slot='leading']"], tag: "span", rect: { x: 32, y: 150, width: 20, height: 20 }, style: { ...baseStyle }, semantic: { dataset: { slot: "leading" } }, text: "", asset: null },
    { index: 23, parentIndex: 22, childIndex: 0, selector: ".tui-sidebar-item [data-slot='leading'] > svg", selectorAliases: [], tag: "svg", rect: { x: 32, y: 150, width: 20, height: 20 }, style: { ...baseStyle }, semantic: { dataset: {} }, text: "", asset: { kind: "svg", alias: "navigation/inbox", html: '<svg viewBox="0 0 24 24"><path d="M2 12h20" stroke="currentColor"/></svg>' } },
    { index: 24, parentIndex: 21, childIndex: 1, selector: ".tui-sidebar-item [data-slot='label']", selectorAliases: [".tui-sidebar-item [data-slot='label']"], tag: "span", rect: { x: 60, y: 152, width: 48, height: 20 }, style: { ...baseStyle, fontSize: "16px", lineHeight: "20px" }, semantic: { dataset: { slot: "label" } }, text: "收件箱", asset: null },
    { index: 25, parentIndex: 21, childIndex: 2, selector: ".tui-sidebar-item [data-slot='trailing']", selectorAliases: [".tui-sidebar-item [data-slot='trailing']"], tag: "span", rect: { x: 220, y: 152, width: 20, height: 20 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "20px" }, semantic: { dataset: { slot: "trailing" } }, text: "28", asset: null },
  ],
};
sidebarManifest.nodeCount = sidebarManifest.nodes.length;
const sidebarIr = buildDomVisualIr(sidebarManifest, { tokens, componentMap, componentSpecs, pageName: "sidebar fixture" });
const sidebarPlan = compileDomVisualIrPlan(sidebarIr, { tokens, componentMap, images: [] });
const sidebarOperation = sidebarPlan.operations.find((operation) => operation.nodeId === "dom-21");
assert.equal(sidebarOperation.op, "create-instance", "the Coremail navigation child must resolve to Sidebar Item");
assert.equal(sidebarOperation.componentRef.logicalName, "Sidebar Item/Default");
assert.equal(sidebarOperation.componentRef.variant.state, "selected");
assert.deepEqual(sidebarOperation.slots, { leading: "navigation/inbox", trailing: "28", label: "收件箱", value: "收件箱" });
assert.equal(sidebarPlan.operations.find((operation) => operation.nodeId === "dom-20").op, "create-frame", "the Sidebar collection container must remain a layout frame");

// A live CSS gap is a layout property, not a prerequisite variable name. The
// compiler should bind the captured value to the existing spacing scale and
// promote safe flex containers to native Auto Layout so the spacing remains
// editable and visually effective in Pixso.
for (const targetPage of ["generic", "coremail"]) {
  const gapManifest = {
    schemaVersion: 4,
    kind: "text-to-ui-html-visual-manifest",
    source: "browser-computed-visual-manifest",
    runId: `flex-gap-${targetPage}-run`,
    htmlSourceFingerprint: `flex-gap-${targetPage}-fingerprint`,
    stateId: "default-visible",
    url: `http://fixture/${targetPage}/flex-gap/`,
    viewport: { width: 1728, height: 1152, zoom: 1 },
    nodeCount: 4,
    nodes: [
      { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
      { index: 1, parentIndex: 0, childIndex: 0, selector: ".gap-row", selectorAliases: [".gap-row"], tag: "div", rect: { x: 100, y: 100, width: 240, height: 40 }, style: { ...baseStyle, display: "flex", flexDirection: "row", flexWrap: "nowrap", gap: "8px", rowGap: "8px", columnGap: "8px", justifyContent: "center", alignItems: "center", paddingLeft: "8px", paddingRight: "8px" }, semantic: { dataset: {}, component: null }, text: "", asset: null },
      { index: 2, parentIndex: 1, childIndex: 0, selector: ".gap-row > .label", selectorAliases: [".gap-row > .label"], tag: "span", rect: { x: 168, y: 112, width: 40, height: 16 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "16px", whiteSpace: "nowrap" }, semantic: { dataset: {}, component: null }, text: "标签", textAutoResize: "WIDTH_AND_HEIGHT", asset: null },
      { index: 3, parentIndex: 1, childIndex: 1, selector: ".gap-row > .value", selectorAliases: [".gap-row > .value"], tag: "span", rect: { x: 216, y: 112, width: 40, height: 16 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "16px", whiteSpace: "nowrap" }, semantic: { dataset: {}, component: null }, text: "内容", textAutoResize: "WIDTH_AND_HEIGHT", asset: null },
    ],
  };
  const gapIr = buildDomVisualIr(gapManifest, { tokens, componentMap, componentSpecs, pageName: `${targetPage} flex gap fixture`, targetPage });
  const gapPlan = compileDomVisualIrPlan(gapIr, { tokens, componentMap, images: [] });
  const gapOperations = new Map(gapPlan.operations.map((operation) => [operation.nodeId, operation]));
  assert.equal(gapOperations.get("dom-1").layout.direction, "HORIZONTAL", `${targetPage}: safe flex row should become native horizontal Auto Layout`);
  assert.equal(gapOperations.get("dom-1").layout.gap.name, "space/3", `${targetPage}: 8px CSS gap should use the existing spacing variable`);
  assert.equal(gapOperations.get("dom-2").layout.positioning, "FLOW", `${targetPage}: flex children should remain in flow`);
  assert.equal(gapOperations.get("dom-2").layout.width, "hug", `${targetPage}: intrinsic text width should hug content`);
  assert.equal(gapOperations.get("dom-2").layout.height, "hug", `${targetPage}: intrinsic text height should hug content`);
}

const zeroGapBase = fixture("zero-gap");
const zeroGapManifest = {
  ...zeroGapBase,
  nodes: zeroGapBase.nodes.map((node) => node.index === 1
    ? {
      ...node,
      selector: ".zero-gap-row",
      selectorAliases: [".zero-gap-row"],
      style: {
        ...node.style,
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        gap: "normal",
        rowGap: "normal",
        columnGap: "normal",
        justifyContent: "space-between",
        alignItems: "center",
      },
    }
    : node),
};
const zeroGapIr = buildDomVisualIr(zeroGapManifest, { tokens, componentMap, componentSpecs, pageName: "zero gap fixture" });
const zeroGapPlan = compileDomVisualIrPlan(zeroGapIr, { tokens, componentMap, images: [] });
const zeroGapOperation = zeroGapPlan.operations.find((operation) => operation.nodeId === "dom-1");
assert.equal(zeroGapOperation.layout.direction, "HORIZONTAL", "CSS gap: normal should still promote a safe flex row");
assert.equal(zeroGapOperation.layout.gap.name, "space/0", "CSS gap: normal should resolve to the existing zero spacing token");

// Browser text bounds are authoritative, but a single-line intrinsic text
// node must be allowed to hug its content in Pixso. Otherwise a small font
// metric difference can wrap dates, counts, or CJK headings that are one line
// in HTML. This fixture is intentionally run against both target pages.
for (const targetPage of ["generic", "coremail"]) {
  const intrinsicManifest = {
    schemaVersion: 4,
    kind: "text-to-ui-html-visual-manifest",
    source: "browser-computed-visual-manifest",
    runId: `intrinsic-text-${targetPage}-run`,
    htmlSourceFingerprint: `intrinsic-text-${targetPage}-fingerprint`,
    stateId: "default-visible",
    url: `http://fixture/${targetPage}/intrinsic-text/`,
    viewport: { width: 1728, height: 1152, zoom: 1 },
    nodeCount: 5,
    nodes: [
      { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
      { index: 1, parentIndex: 0, childIndex: 0, selector: ".intrinsic-date", selectorAliases: [".intrinsic-date"], tag: "time", rect: { x: 24, y: 24, width: 100, height: 14 }, style: { ...baseStyle, fontSize: "12px", lineHeight: "normal" }, semantic: { dataset: {}, component: null }, text: "2026-01-09 10:42", textAutoResize: "WIDTH_AND_HEIGHT", asset: null },
      { index: 2, parentIndex: 0, childIndex: 1, selector: ".ellipsis-subject", selectorAliases: [".ellipsis-subject"], tag: "span", rect: { x: 24, y: 48, width: 240, height: 20 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "20px", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }, semantic: { dataset: {}, component: null }, text: "A truncated subject", asset: null },
      { index: 3, parentIndex: 0, childIndex: 2, selector: ".wrapped-paragraph", selectorAliases: [".wrapped-paragraph"], tag: "p", rect: { x: 24, y: 72, width: 240, height: 28 }, style: { ...baseStyle, fontSize: "14px", lineHeight: "28px" }, semantic: { dataset: {}, component: null }, text: "A paragraph with a constrained width", textAutoResize: "HEIGHT", asset: null },
      { index: 4, parentIndex: 0, childIndex: 3, selector: ".padded-button-text", selectorAliases: [".padded-button-text"], tag: "button", rect: { x: 24, y: 108, width: 96, height: 40 }, style: { ...baseStyle, display: "flex", fontSize: "16px", lineHeight: "22px", whiteSpace: "nowrap", paddingLeft: "16px", paddingRight: "16px", backgroundColor: "rgb(10, 89, 247)", borderTopLeftRadius: "8px", borderTopRightRadius: "8px", borderBottomRightRadius: "8px", borderBottomLeftRadius: "8px" }, semantic: { dataset: {}, component: null }, text: "刷新列表", asset: null },
    ],
  };
  const intrinsicIr = buildDomVisualIr(intrinsicManifest, { tokens, componentMap, componentSpecs, pageName: `${targetPage} intrinsic text fixture`, targetPage });
  const intrinsicPlan = compileDomVisualIrPlan(intrinsicIr, { tokens, componentMap, images: [] });
  const intrinsicOperations = new Map(intrinsicPlan.operations.map((operation) => [operation.nodeId, operation]));
  assert.equal(intrinsicOperations.get("dom-1").layout.textAutoResize, "WIDTH_AND_HEIGHT", `${targetPage}: single-line intrinsic text should hug`);
  assert.equal(intrinsicOperations.get("dom-2").layout.textAutoResize, "TRUNCATE", `${targetPage}: ellipsis text must use Pixso's native truncate mode`);
  assert.equal(intrinsicOperations.get("dom-2").layout.width.value, 240, `${targetPage}: ellipsis text must preserve the captured width`);
  assert.equal(intrinsicOperations.get("dom-2").layout.height.value, 20, `${targetPage}: ellipsis text must preserve the captured height`);
  assert.equal(intrinsicOperations.get("dom-2").layout.overflow, "truncate", `${targetPage}: ellipsis text must carry truncation overflow`);
  assert.equal(intrinsicOperations.get("dom-2").layout.maxLines, 1, `${targetPage}: ellipsis text must be single-line`);
  assert.equal(intrinsicOperations.get("dom-3").layout.textAutoResize, "HEIGHT", `${targetPage}: constrained paragraph must preserve width and grow vertically`);
  assert.equal(intrinsicOperations.get("dom-4").layout.textAutoResize, "NONE", `${targetPage}: padded decorated text must stay fixed as a box`);
  assert.equal(intrinsicOperations.get("dom-3").metadata.textSizingMode, "HEIGHT", `${targetPage}: text sizing semantics must survive into the operation plan`);

  // Legacy manifests may omit the explicit mode. Overflow clipping alone
  // must not turn an ordinary single-line label into a fixed-width text node.
  const legacySingleLineManifest = {
    ...intrinsicManifest,
    runId: `${intrinsicManifest.runId}-legacy-single-line`,
    nodes: intrinsicManifest.nodes.map((node) => node.index === 1
      ? { ...node, textAutoResize: undefined, style: { ...node.style, overflow: "hidden" } }
      : node),
  };
  const legacyIr = buildDomVisualIr(legacySingleLineManifest, { tokens, componentMap, componentSpecs, pageName: `${targetPage} legacy text fixture`, targetPage });
  const legacyPlan = compileDomVisualIrPlan(legacyIr, { tokens, componentMap, images: [] });
  const legacyOperations = new Map(legacyPlan.operations.map((operation) => [operation.nodeId, operation]));
  assert.equal(legacyOperations.get("dom-1").layout.textAutoResize, "WIDTH_AND_HEIGHT", `${targetPage}: overflow clipping without ellipsis must keep the intrinsic default`);

  const legacyMultilineManifest = {
    ...intrinsicManifest,
    runId: `${intrinsicManifest.runId}-legacy-multiline`,
    nodes: intrinsicManifest.nodes.map((node) => node.index === 3
      ? { ...node, rect: { ...node.rect, height: 40 }, textAutoResize: undefined, style: { ...node.style, lineHeight: "20px" } }
      : node),
  };
  const legacyMultilineIr = buildDomVisualIr(legacyMultilineManifest, { tokens, componentMap, componentSpecs, pageName: `${targetPage} legacy multiline fixture`, targetPage });
  const legacyMultilinePlan = compileDomVisualIrPlan(legacyMultilineIr, { tokens, componentMap, images: [] });
  assert.equal(new Map(legacyMultilinePlan.operations.map((operation) => [operation.nodeId, operation])).get("dom-3").layout.textAutoResize, "HEIGHT", `${targetPage}: legacy multiline text should preserve width and grow vertically`);
}

const legacyFittingEllipsis = {
  schemaVersion: 4,
  kind: "text-to-ui-html-visual-manifest",
  source: "browser-computed-visual-manifest",
  runId: "legacy-fitting-ellipsis-run",
  htmlSourceFingerprint: "legacy-fitting-ellipsis-fingerprint",
  stateId: "default-visible",
  url: "http://fixture/legacy-fitting-ellipsis/",
  viewport: { width: 1728, height: 1152, zoom: 1 },
  nodeCount: 2,
  nodes: [
    { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 1, parentIndex: 0, childIndex: 0, selector: ".brand", selectorAliases: [".brand"], tag: "span", rect: { x: 24, y: 24, width: 65, height: 22 }, style: { ...baseStyle, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }, semantic: { dataset: {}, component: null }, text: "Coremail", textAutoResize: "TRUNCATE", textMetrics: { lineCount: 1, inlineWidth: 65 }, asset: null },
  ],
};
const legacyFittingIr = buildDomVisualIr(legacyFittingEllipsis, { tokens, componentMap, componentSpecs, pageName: "legacy fitting ellipsis" });
const legacyFittingPlan = compileDomVisualIrPlan(legacyFittingIr, { tokens, componentMap, images: [] });
assert.equal(new Map(legacyFittingPlan.operations.map((operation) => [operation.nodeId, operation])).get("dom-1").layout.textAutoResize, "WIDTH_AND_HEIGHT", "measured fitting ellipsis text must not stay fixed-width");

const edgeManifest = {
  schemaVersion: 4,
  kind: "text-to-ui-html-visual-manifest",
  source: "browser-computed-visual-manifest",
  runId: "single-edge-run",
  htmlSourceFingerprint: "single-edge-fingerprint",
  stateId: "default-visible",
  url: "http://fixture/single-edge/",
  viewport: { width: 1728, height: 1152, zoom: 1 },
  nodeCount: 2,
  nodes: [
    { index: 0, parentIndex: null, childIndex: 0, selector: "#app", selectorAliases: ["#app"], tag: "main", rect: { x: 0, y: 0, width: 1728, height: 1152 }, style: { ...baseStyle }, semantic: { dataset: {}, component: null }, text: "", asset: null },
    { index: 1, parentIndex: 0, childIndex: 0, selector: ".right-separator", selectorAliases: [".right-separator"], tag: "section", rect: { x: 0, y: 0, width: 320, height: 1152 }, style: { ...baseStyle, borderRightWidth: "2px", borderRightStyle: "solid", borderRightColor: "rgba(0, 0, 0, 0.12)" }, semantic: { dataset: {}, component: null }, text: "", asset: null },
  ],
};
const edgePlan = compileDomVisualIrPlan(buildDomVisualIr(edgeManifest, { tokens, componentMap, componentSpecs, pageName: "single edge fixture" }), { tokens, componentMap, images: [] });
const edgeOperation = edgePlan.operations.find((operation) => operation.nodeId === "dom-1");
assert.deepEqual(edgeOperation.style.strokeEdges, ["right"], "a right-only HTML separator must not become a four-sided Pixso stroke");
assert.deepEqual(edgeOperation.style.strokeWeights, { top: 0, right: 2, bottom: 0, left: 0 }, "captured border widths must survive the DOM Visual IR");

console.log("DOM Visual IR regression passed for email, settings, and dashboard fixtures with 100% selector/geometry evidence.");
