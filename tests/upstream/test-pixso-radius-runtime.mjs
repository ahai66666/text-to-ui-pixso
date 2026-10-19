#!/usr/bin/env node

import assert from "node:assert/strict";

await import("../../scripts/pixso-native-execution-runtime.js");

function descendants(node) {
  return (node.children ?? []).flatMap((child) => [child, ...descendants(child)]);
}

function makeFrame() {
  return {
    id: `frame-${Math.random()}`,
    type: "FRAME",
    name: "",
    children: [],
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    strokes: [],
    cornerRadius: 0,
    boundVariables: {},
    width: 100,
    height: 100,
    appendChild(child) { this.children.push(child); child.parent = this; },
    remove() {
      if (!this.parent?.children) return;
      this.parent.children = this.parent.children.filter((child) => child !== this);
      this.parent = null;
    },
    resize(width, height) { this.width = width; this.height = height; },
    setBoundVariable(property, variable) { this.boundVariables[property] = { type: "VARIABLE_ALIAS", id: variable.id }; },
    setPluginData(key, value) { this.pluginData ??= {}; this.pluginData[key] = value; },
    getPluginData(key) { return this.pluginData?.[key] ?? ""; },
    findAll(predicate) { return descendants(this).filter(predicate); },
  };
}

const page = {
  id: "page-1",
  type: "PAGE",
  name: "coremail",
  children: [],
  appendChild(child) { this.children.push(child); child.parent = this; },
  findAll(predicate) { return descendants(this).filter(predicate); },
};
const radiusVariable = { id: "variable-radius-08", name: "radius/08", value: 8 };
const pixso = {
  currentPage: page,
  root: { children: [page] },
  variables: { getLocalVariablesAsync: async () => [radiusVariable] },
  getLocalTextStylesAsync: async () => [],
  getLocalEffectStylesAsync: async () => [],
  createFrame: makeFrame,
};
const plan = {
  execution: { rootNodeId: "root", canonicalKey: "radius-runtime-test" },
  page: { name: "Radius runtime test" },
  resources: { variableAliases: {} },
  operations: [{
    op: "create-frame",
    phase: "layout",
    nodeId: "root",
    parentId: null,
    name: "Radius runtime test",
    region: "test",
    layout: { direction: "VERTICAL", width: "hug", height: "hug", padding: {}, gap: null, align: "MIN", clipsContent: false },
    style: { radius: { ref: "$variable/radius/08", name: "radius/08", value: 8 } },
  }],
};

const runtime = globalThis.TextToUiPixsoRuntime.create(pixso);
const result = await runtime.execute(plan);
assert.equal(result.ok, true, result.audit?.issues?.join(", "));
assert.equal(page.children[0].cornerRadius, 8, "radius/08 must render as 8, not 0");
assert.equal(page.children[0].boundVariables.cornerRadius?.id, radiusVariable.id, "corner radius must remain bound to the Pixso Variable");
const replacementPlan = structuredClone(plan);
replacementPlan.execution.runId = "radius-replacement";
const replacement = await runtime.execute(replacementPlan, { replaceExisting: true, singleManagedBoard: true, draftVisible: false, retainFailedDraft: false });
assert.equal(replacement.ok, true, replacement.audit?.issues?.join(", "));
assert.equal(page.children.length, 1, "a successful replacement must leave one canonical artboard");
const failingPlan = structuredClone(plan);
failingPlan.execution.runId = "radius-failed-draft";
failingPlan.operations.push({ op: "create-frame", nodeId: "orphan", parentId: "missing-parent", name: "Orphan", layout: {}, style: {} });
const failed = await runtime.execute(failingPlan, { replaceExisting: true, singleManagedBoard: true, draftVisible: false, retainFailedDraft: false });
assert.equal(failed.ok, false);
assert.equal(page.children.length, 1, "a failed hidden draft must be removed while the previous canonical artboard remains");
assert.equal(page.children[0].visible, true);
assert.equal(globalThis.TextToUiPixsoRuntime.version, "5.0.0");
console.log("Pixso runtime test passed: radius binding remains correct and replacement leaves one canonical artboard.");
