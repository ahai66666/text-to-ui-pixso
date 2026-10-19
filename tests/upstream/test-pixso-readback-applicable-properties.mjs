#!/usr/bin/env node

import assert from "node:assert/strict";

await import("../../scripts/pixso-native-execution-runtime.js");

function descendants(node) {
  return (node.children ?? []).flatMap((child) => [child, ...descendants(child)]);
}

function makeNode(type, options = {}) {
  const node = {
    id: `${type.toLowerCase()}-${Math.random()}`,
    type,
    name: "",
    children: [],
    fills: [],
    strokes: [],
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    appendChild(child) { this.children.push(child); child.parent = this; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); },
    resize(width, height) { this.width = width; this.height = height; },
    setBoundVariable(property, variable) {
      this.boundVariables ??= {};
      this.boundVariables[property] = { type: "VARIABLE_ALIAS", id: variable.id };
    },
    setPluginData(key, value) { this.pluginData ??= {}; this.pluginData[key] = value; },
    getPluginData(key) { return this.pluginData?.[key] ?? ""; },
    findAll(predicate) { return descendants(this).filter(predicate); },
  };
  if (type === "TEXT") {
    // TEXT supports textStyleId, but does not expose Frame padding properties.
    node.textStyleId = "";
    node.textAlignHorizontal = "LEFT";
    node.fontName = { family: "Noto Sans SC", style: "Regular" };
    node.fontSize = 14;
    node.lineHeight = { unit: "PIXELS", value: 20 };
    node.letterSpacing = { unit: "PIXELS", value: 0 };
    let textAutoResize = "NONE";
    let characters = "";
    Object.defineProperty(node, "characters", {
      configurable: true,
      get() { return characters; },
      set(value) {
        characters = String(value ?? "");
        if (textAutoResize === "WIDTH_AND_HEIGHT" && options.rejectTruncate) this.width = Math.max(1, Array.from(characters).length * 8);
      }
    });
    Object.defineProperty(node, "textAutoResize", {
      configurable: true,
      get() { return textAutoResize; },
      set(value) {
        if (value === "TRUNCATE" && options.rejectTruncate) throw new Error("Invalid enum value. Expected 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE', received 'TRUNCATE'");
        textAutoResize = value;
        // Simulate the native font-metric expansion that motivated the hug
        // rule. The readback contract must not reject intrinsic dimensions.
        if (value === "WIDTH_AND_HEIGHT") {
          this.width = options.rejectTruncate ? Math.max(1, Array.from(this.characters ?? "").length * 8) : this.width + 3;
          this.height -= 2;
        } else if (value === "HEIGHT") {
          this.height += 6;
        }
      }
    });
  }
  if (["FRAME", "COMPONENT", "INSTANCE"].includes(type)) {
    node.strokeTopWeight = 0;
    node.strokeRightWeight = 0;
    node.strokeBottomWeight = 0;
    node.strokeLeftWeight = 0;
    node.layoutMode = "NONE";
    node.itemSpacing = 0;
    node.paddingTop = 0;
    node.paddingRight = 0;
    node.paddingBottom = 0;
    node.paddingLeft = 0;
    node.primaryAxisAlignItems = "MIN";
    node.counterAxisAlignItems = "MIN";
    node.primaryAxisSizingMode = "FIXED";
    node.counterAxisSizingMode = "FIXED";
    node.layoutGrow = 0;
    node.layoutAlign = "INHERIT";
    node.layoutPositioning = "AUTO";
  }
  return node;
}

function makePage(name) {
  return {
    ...makeNode("PAGE"),
    id: `page-${name}`,
    name,
    type: "PAGE",
  };
}

function makeSearchLibrary() {
  const page = makePage("NewComponents");
  const icon = makeNode("COMPONENT");
  icon.id = "component-field-search";
  icon.name = "Text-to-UI Icon/field/search";
  icon.setPluginData("text-to-ui-icon-alias", "field/search");
  page.appendChild(icon);
  const set = makeNode("COMPONENT_SET");
  set.name = "Search";
  const variant = makeNode("COMPONENT");
  variant.name = "surface=white, state=Default";
  variant.createInstance = () => {
    const instance = makeNode("INSTANCE");
    instance.mainComponent = variant;
    instance.componentProperties = { "Icon#1": { type: "INSTANCE_SWAP", value: "legacy-star" } };
    instance.setProperties = (changes) => {
      for (const [key, value] of Object.entries(changes)) {
        if (instance.componentProperties[key]) instance.componentProperties[key] = { ...instance.componentProperties[key], value };
      }
    };
    const value = makeNode("TEXT");
    value.name = "Search value";
    value.characters = "旧占位符";
    const label = makeNode("TEXT");
    label.name = "Search advanced label";
    label.characters = "旧高级";
    instance.appendChild(value);
    instance.appendChild(label);
    return instance;
  };
  set.appendChild(variant);
  page.appendChild(set);

  const addIcon = makeNode("COMPONENT");
  addIcon.id = "component-action-add";
  addIcon.name = "Text-to-UI Icon/action/add";
  addIcon.setPluginData("text-to-ui-icon-alias", "action/add");
  page.appendChild(addIcon);
  const buttonSet = makeNode("COMPONENT_SET");
  buttonSet.name = "Icon Text Button";
  const primary = makeNode("COMPONENT");
  primary.name = "type=Primary, size=Medium, state=Default";
  primary.createInstance = () => {
    const instance = makeNode("INSTANCE");
    instance.mainComponent = primary;
    instance.componentProperties = { "Icon#1": { type: "INSTANCE_SWAP", value: "legacy-star" } };
    instance.setProperties = (changes) => {
      for (const [key, value] of Object.entries(changes)) {
        if (instance.componentProperties[key]) instance.componentProperties[key] = { ...instance.componentProperties[key], value };
      }
    };
    const iconInstance = makeNode("INSTANCE");
    iconInstance.id = "button-icon-instance";
    iconInstance.name = "Text-to-UI Icon/action/add";
    iconInstance.componentPropertyReferences = { mainComponent: "Text-to-UI Icon/action/add" };
    iconInstance.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    iconInstance.boundVariables = {
      fills: [{ type: "VARIABLE_ALIAS", id: "variable-neutral-light-100" }],
    };
    const vector = makeNode("VECTOR");
    vector.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
    vector.boundVariables = {
      strokes: [{ type: "VARIABLE_ALIAS", id: "variable-neutral-light-100" }],
    };
    iconInstance.appendChild(vector);
    const label = makeNode("TEXT");
    label.name = "Label";
    label.characters = "旧文字";
    label.fills = [{
      type: "SOLID",
      color: { r: 1, g: 1, b: 1 },
      boundVariables: { color: { type: "VARIABLE_ALIAS", id: "variable-neutral-light-100" } },
    }];
    instance.appendChild(iconInstance);
    instance.appendChild(label);
    return instance;
  };
  buttonSet.appendChild(primary);
  page.appendChild(buttonSet);
  return page;
}

function makePlan(targetPage, suffix) {
  const zeroPadding = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    schemaVersion: 1,
    kind: "pixso-operation-plan",
    execution: {
      rootNodeId: `root-${suffix}`,
      canonicalKey: `readback-applicable-properties-${suffix}`,
      targetPage,
    },
    page: { name: `Readback fixture / ${targetPage}`, targetPage },
    resources: {
      variableAliases: {},
      variables: [{ ref: "$variable/neutral-light/100", name: "neutral-light/100" }],
      styles: [{ ref: "$style/typography/body" }],
    },
    operations: [
      {
        op: "create-frame",
        phase: "layout",
        nodeId: `root-${suffix}`,
        parentId: null,
        name: "Readback fixture",
        region: "fixture",
        layout: { direction: "VERTICAL", width: 180, height: 80, padding: {}, gap: 8, align: "MIN", clipsContent: false },
        style: {},
      },
      {
        op: "create-frame",
        phase: "layout",
        nodeId: `transparent-border-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Transparent border fixture",
        region: "fixture",
        layout: { direction: "HORIZONTAL", width: 160, height: 24, padding: zeroPadding, gap: 0, align: "MIN", clipsContent: false },
        // CSS keeps a transparent border for box geometry, but there is no
        // visible/bindable stroke Token to apply in Pixso.
        style: { fill: { kind: "transparent" }, strokeEdges: ["top", "right", "bottom", "left"] },
      },
      {
        op: "create-instance",
        phase: "component-enrichment",
        nodeId: `transparent-border-instance-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Search instance with transparent border",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 0, width: 160, height: 24, padding: zeroPadding, gap: 0, clipsContent: false },
        style: { strokeEdges: ["top", "right", "bottom", "left"] },
        componentRef: {
          logicalName: "Search/White Surface/Default",
          pixsoName: "Search",
          componentSetName: "Search",
          variant: { surface: "white", state: "Default" },
        },
        props: {},
        slots: {},
      },
      {
        op: "create-instance",
        phase: "component-enrichment",
        nodeId: `search-slot-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Search slot order",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 0, width: 160, height: 24, padding: zeroPadding, gap: 0, clipsContent: false },
        style: { fill: { kind: "transparent" } },
        componentRef: {
          logicalName: "Search/White Surface/Default",
          pixsoName: "Search",
          componentSetName: "Search",
          variant: { surface: "white", state: "Default" },
        },
        props: { label: "高级", placeholder: "搜索邮件", mode: "icon-text" },
        slots: { icon: "field/search", value: "搜索邮件", label: "高级" },
      },
      {
        op: "create-instance",
        phase: "component-enrichment",
        nodeId: `primary-button-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Primary button content color",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 0, width: 120, height: 40, padding: zeroPadding, gap: 0, clipsContent: false },
        style: { fill: { kind: "transparent" } },
        componentRef: {
          logicalName: "Icon Text Button/Primary/Default",
          pixsoName: "Icon Text Button",
          componentSetName: "Icon Text Button",
          variant: { type: "Primary", size: "Medium", state: "Default" },
          iconColorSource: "variant-content",
        },
        props: { label: "写邮件", variant: "primary", mode: "icon-text" },
        slots: { icon: "action/add", label: "写邮件" },
      },
      {
        op: "create-text",
        phase: "layout",
        nodeId: `text-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Text with computed zero padding",
        region: "fixture",
        layout: { direction: "HORIZONTAL", width: 140, height: 20, textAutoResize: "NONE", padding: zeroPadding, gap: 0, align: "MIN", clipsContent: false },
        style: { textStyle: { ref: "$style/typography/body" }, textAlignHorizontal: "LEFT" },
        characters: "Fixture text",
      },
      {
        op: "create-text",
        phase: "layout",
        nodeId: `fallback-text-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Fallback typography text",
        region: "fixture",
        layout: { direction: "HORIZONTAL", width: 80, height: 14, padding: zeroPadding, gap: 0, align: "MIN", clipsContent: false },
        style: {
          typography: {
            fontFamily: "HarmonyOS Sans",
            fontStyle: "Bold",
            fontSize: 10,
            lineHeight: { unit: "AUTO" },
            letterSpacing: 0,
          },
          textAlignHorizontal: "LEFT",
        },
        characters: "10:42",
      },
      {
        op: "create-text",
        phase: "layout",
        nodeId: `intrinsic-text-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Intrinsic single-line text",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 0, width: 100, height: 14, textAutoResize: "WIDTH_AND_HEIGHT", padding: zeroPadding, gap: 0, clipsContent: false },
        style: { typography: { fontFamily: "HarmonyOS Sans", fontStyle: "Regular", fontSize: 12, lineHeight: { unit: "AUTO" }, letterSpacing: 0 }, textAlignHorizontal: "LEFT" },
        characters: "2026-01-09 10:42",
      },
      {
        op: "create-text",
        phase: "layout",
        nodeId: `height-text-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Fixed width auto height paragraph",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 24, width: 140, height: 20, textAutoResize: "HEIGHT", padding: zeroPadding, gap: 0, clipsContent: false },
        style: { typography: { fontFamily: "HarmonyOS Sans", fontStyle: "Regular", fontSize: 14, lineHeight: 20, letterSpacing: 0 }, textAlignHorizontal: "LEFT" },
        characters: "A paragraph that may wrap with native metrics",
      },
      {
        op: "create-text",
        phase: "layout",
        nodeId: `truncate-text-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Fixed width ellipsis text",
        region: "fixture",
        layout: { direction: "NONE", positioning: "ABSOLUTE", x: 0, y: 48, width: 120, height: 20, textAutoResize: "TRUNCATE", overflow: "truncate", maxLines: 1, padding: zeroPadding, gap: 0, clipsContent: true },
        style: { typography: { fontFamily: "HarmonyOS Sans", fontStyle: "Regular", fontSize: 14, lineHeight: 20, letterSpacing: 0 }, textAlignHorizontal: "LEFT" },
        characters: "A long truncated subject",
      },
      {
        op: "create-icon-slot",
        phase: "layout",
        nodeId: `icon-slot-${suffix}`,
        parentId: `root-${suffix}`,
        name: "Icon slot with inherited text style",
        region: "fixture",
        layout: { direction: "VERTICAL", width: 20, height: 20, padding: zeroPadding, gap: 0, align: "CENTER", clipsContent: true },
        // Browser computed styles expose textStyle metadata on every element;
        // the native Frame created for an icon slot cannot own textStyleId.
        style: { textStyle: { ref: "$style/typography/body" } },
        iconSlot: { alias: "action/add", size: 20 },
      },
    ],
  };
}

function makePixso(pages, options = {}) {
  const textStyle = { id: "style-body", name: "typography/body" };
  const library = makeSearchLibrary();
  const lightVariable = { id: "variable-neutral-light-100", name: "neutral-light/100", value: { r: 1, g: 1, b: 1, a: 1 } };
  return {
    currentPage: pages[0],
    root: { children: [...pages, library] },
    variables: {
      getLocalVariablesAsync: async () => [lightVariable],
      setBoundVariableForPaint(paint, channel, variable) {
        return { ...paint, boundVariables: { ...(paint.boundVariables ?? {}), [channel]: { type: "VARIABLE_ALIAS", id: variable.id } } };
      },
    },
    getLocalTextStylesAsync: async () => [textStyle],
    getLocalEffectStylesAsync: async () => [],
    createFrame: () => makeNode("FRAME"),
    createText: () => makeNode("TEXT", options),
    createRectangle: () => makeNode("RECTANGLE"),
  };
}

// Run the same fixture on a generic page and the Coremail page. This keeps the
// regression cross-page: readback must validate only properties supported by
// the actual native node type, independent of page-specific structure rules.
for (const [targetPage, suffix, rejectTruncate] of [["generic", "generic", false], ["coremail", "coremail", false], ["compatibility", "compatibility", true]]) {
  const pages = [makePage("generic"), makePage("coremail")];
  if (targetPage === "compatibility") pages.push(makePage("compatibility"));
  const pixso = makePixso(pages, { rejectTruncate });
  const result = await globalThis.TextToUiPixsoRuntime.create(pixso).execute(makePlan(targetPage, suffix));
  assert.equal(result.ok, true, `${targetPage}: ${JSON.stringify(result)}`);
  assert.deepEqual(result.audit.issues, [], `${targetPage} readback should have no false positives`);
  const page = pages.find((item) => item.name === targetPage);
  const root = page.children[0];
  assert.equal(root.itemSpacing, 8, `${targetPage}: native Auto Layout must retain the captured gap`);
  assert.equal(root.layoutMode, "VERTICAL", `${targetPage}: native Auto Layout direction must be preserved`);
  assert.equal(root.children.find((item) => item.type === "TEXT").textStyleId, "style-body");
  const fallbackText = root.children.find((item) => item.name === "Fallback typography text");
  assert.deepEqual(fallbackText.fontName, { family: "HarmonyOS Sans", style: "Bold" });
  assert.equal(fallbackText.fontSize, 10);
  assert.deepEqual(fallbackText.lineHeight, { unit: "AUTO" });
  const intrinsicText = root.children.find((item) => item.name === "Intrinsic single-line text");
  assert.equal(intrinsicText.textAutoResize, "WIDTH_AND_HEIGHT", `${targetPage}: single-line intrinsic text must use native hug sizing`);
  const heightText = root.children.find((item) => item.name === "Fixed width auto height paragraph");
  assert.equal(heightText.textAutoResize, "HEIGHT", `${targetPage}: constrained paragraph must preserve width and use native auto height`);
  assert.equal(heightText.width, 140, `${targetPage}: auto-height paragraph must not shrink its captured width`);
  const truncateText = root.children.find((item) => item.name === "Fixed width ellipsis text");
  assert.equal(truncateText.textAutoResize, rejectTruncate ? "NONE" : "TRUNCATE", `${targetPage}: ellipsis text must use the native truncate mode or verified compatibility mode`);
  assert.equal(truncateText.width, 120, `${targetPage}: ellipsis text must preserve its fixed width`);
  assert.equal(truncateText.height, 20, `${targetPage}: ellipsis text must preserve its fixed height`);
  if (rejectTruncate) {
    assert.equal(truncateText.getPluginData("text-to-ui-truncate-renderer"), "ending-ellipsis-v1");
    assert.equal(truncateText.getPluginData("text-to-ui-truncate-source"), "A long truncated subject");
    assert.ok(truncateText.characters.endsWith("…"), `${targetPage}: compatibility mode must render a visible ending ellipsis`);
  }
  const fixedText = root.children.find((item) => item.name === "Text with computed zero padding");
  assert.equal(fixedText.textAutoResize, "NONE", `${targetPage}: fixed text fixture must remain fixed-size`);
  assert.equal(root.children.find((item) => item.name === "Icon slot with inherited text style").type, "FRAME");
  const searchInstance = root.children.find((item) => item.name === "Search slot order");
  assert.deepEqual(descendants(searchInstance).filter((item) => item.type === "TEXT").map((item) => item.characters), ["搜索邮件", "高级"], `${targetPage}: Search value must be populated before the advanced label`);
  assert.equal(searchInstance.componentProperties["Icon#1"].value, "component-field-search", `${targetPage}: semantic search icon must replace the component's legacy default icon`);
  const primaryInstance = root.children.find((item) => item.name === "Primary button content color");
  const primaryLabel = descendants(primaryInstance).find((item) => item.type === "TEXT");
  assert.equal(primaryLabel.fills[0].boundVariables.color.id, "variable-neutral-light-100", `${targetPage}: Primary button label must bind neutral-light/100`);
  const primaryIcon = descendants(primaryInstance).find((item) => item.type === "INSTANCE" && item.name === "Text-to-UI Icon/action/add");
  const primaryVector = descendants(primaryIcon).find((item) => item.type === "VECTOR");
  assert.equal(primaryVector.strokes[0].boundVariables.color.id, "variable-neutral-light-100", `${targetPage}: Primary button SVG stroke must bind neutral-light/100`);
}

console.log("Pixso readback applicability regression passed on generic and coremail pages.");
