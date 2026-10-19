#!/usr/bin/env node

import assert from "node:assert/strict";

await import("../../scripts/pixso-native-execution-runtime.js");

function descendants(node) {
  return (node.children ?? []).flatMap((child) => [child, ...descendants(child)]);
}

function makeFrame(type = "FRAME") {
  return {
    id: `${type}-${Math.random()}`,
    type,
    name: "",
    children: [],
    fills: [],
    strokes: [],
    cornerRadius: 0,
    minWidth: 0,
    maxWidth: 0,
    minHeight: 0,
    maxHeight: 0,
    width: 100,
    height: 100,
    appendChild(child) { this.children.push(child); child.parent = this; },
    resize(width, height) { this.width = width; this.height = height; },
    setBoundVariable(property, variable) { this.boundVariables ??= {}; this.boundVariables[property] = { type: "VARIABLE_ALIAS", id: variable.id }; },
    setPluginData(key, value) { this.pluginData ??= {}; this.pluginData[key] = value; },
    getPluginData(key) { return this.pluginData?.[key] ?? ""; },
    findAll(predicate) { return descendants(this).filter(predicate); },
  };
}

const page = { ...makeFrame("PAGE"), id: "page-gradient", name: "coremail", type: "PAGE" };
const variables = [
  { id: "var-brand-05", name: "brand/05", resolvedType: "COLOR", value: { r: 0.039, g: 0.349, b: 0.969, a: 0.047 } },
  { id: "var-neutral-light-100", name: "neutral-light/100", resolvedType: "COLOR", value: { r: 1, g: 1, b: 1, a: 1 } },
];
const pixso = {
  currentPage: page,
  root: { children: [page] },
  variables: {
    getLocalVariablesAsync: async () => variables,
    setBoundVariableForPaint(paint, channel, variable) {
      return { ...paint, boundVariables: { [channel]: { type: "VARIABLE_ALIAS", id: variable.id } } };
    },
  },
  getLocalTextStylesAsync: async () => [],
  getLocalEffectStylesAsync: async () => [],
  createFrame: () => makeFrame(),
};
const gradient = {
  kind: "linear-gradient",
  angle: 135,
  stops: [
    { position: 0, color: { ref: "$variable/brand/05" } },
    { position: 1, color: { ref: "$variable/neutral-light/100" } },
  ],
};
const plan = {
  execution: { rootNodeId: "root", canonicalKey: "gradient-runtime-test" },
  page: { name: "Gradient runtime test" },
  resources: { variableAliases: {} },
  operations: [{
    op: "create-frame",
    phase: "layout",
    nodeId: "root",
    parentId: null,
    name: "Gradient runtime test",
    region: "test",
    layout: { direction: "VERTICAL", width: 1200, height: "hug", padding: {}, gap: null, align: "MIN", counterAlign: "CENTER", clipsContent: false },
    style: { fill: gradient },
  }, {
    op: "create-frame",
    phase: "layout",
    nodeId: "mail-message",
    parentId: "root",
    name: "Mail message",
    region: "test",
    layout: { direction: "VERTICAL", width: "fill", maxWidth: 920, height: "hug", padding: {}, gap: 0, align: "MIN", counterAlign: "CENTER", clipsContent: false },
    style: {},
  }],
};

const runtime = globalThis.TextToUiPixsoRuntime.create(pixso);
const result = await runtime.execute(plan);
assert.equal(result.ok, true, result.audit?.issues?.join(", "));
const node = page.children[0];
const message = node.children[0];
assert.equal(node.fills[0].type, "GRADIENT_LINEAR");
assert.equal(node.fills[0].gradientStops.length, 2);
assert.equal(node.fills[0].gradientStops[0].color.a, 0.047);
assert.equal(node.counterAxisAlignItems, "CENTER");
assert.equal(message.maxWidth, 920);
assert.equal(message.width, 920);
assert.equal(message.layoutAlign, "INHERIT");
assert.deepEqual(JSON.parse(node.getPluginData("text-to-ui-gradient-token-refs")), [
  { position: 0, ref: "$variable/brand/05" },
  { position: 1, ref: "$variable/neutral-light/100" },
]);
console.log("Pixso gradient runtime test passed: token-authored CSS gradient is recreated as a linear Pixso paint.");
