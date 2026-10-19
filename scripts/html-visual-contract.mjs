#!/usr/bin/env node
import {collectProjectDependencies} from "./artifact-dependencies.mjs";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const HTML_VISUAL_SNAPSHOT_SCHEMA_VERSION = 2;
export const HTML_VISUAL_SNAPSHOT_SOURCE = "html-live-computed-style";

const SOURCE_EXTENSIONS = new Set([".html", ".css", ".js", ".mjs", ".cjs", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const SOURCE_DIRECTORIES = new Set(["src", "assets", "public", "static", "components", "page-components", "styles"]);
const IGNORED_DIRECTORIES = new Set([".git", ".text-to-ui", "node_modules", "dist", "build", "coverage", "pixso", "pixso-import", "pixso-runs", "contracts"]);
const IGNORED_FILE_NAMES = new Set([
  "html-visual-snapshot.json",
  "pixso-scene.json",
  "pixso-operation-plan.json",
  "pixso-operation-batches.json",
  "pixso-mcp-call-plan.json",
]);

function isGeneratedFile(name) {
  return /^(?:pixso[-_]|scene-stats|context-packet|runtime-component-evidence|visual-parity|validation-report|component-usage|component-bindings|registered-reuse-plan|prepare-|requirement-contract)/i.test(name);
}

function walkSourceFiles(root, relative = "", output = []) {
  const directory = path.join(root, relative);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || IGNORED_DIRECTORIES.has(entry.name)) continue;
    const childRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      const atRoot = relative === "";
      if (!IGNORED_DIRECTORIES.has(entry.name) && (!atRoot || SOURCE_DIRECTORIES.has(entry.name))) walkSourceFiles(root, childRelative, output);
      continue;
    }
    if (!entry.isFile() || IGNORED_FILE_NAMES.has(entry.name)) continue;
    if (isGeneratedFile(entry.name)) continue;
    if (relative === "" && !["index.html"].includes(entry.name) && ![".html", ".css", ".js", ".mjs", ".cjs"].includes(path.extname(entry.name).toLowerCase())) continue;
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) output.push(childRelative);
  }
  return output;
}

export function collectHtmlSourceFiles(root) {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`HTML source root does not exist or is not a directory: ${resolvedRoot}`);
  }
  return walkSourceFiles(resolvedRoot).sort();
}

export function computeHtmlSourceFingerprint(roots, {entry="index.html",observedLocalFiles=[]} = {}) {
  const values=(Array.isArray(roots)?roots:[roots]).map(root=>collectProjectDependencies(root,entry,{observedLocalFiles}));
  return crypto.createHash("sha256").update(JSON.stringify(values.map(v=>({entry:v.entry,files:v.files})))).digest("hex").slice(0,24);
}

function failSnapshot(message, sourcePath) {
  const suffix = sourcePath ? ` (${sourcePath})` : "";
  throw new Error(`HTML visual snapshot is not fresh${suffix}: ${message}`);
}

function isFinitePositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateFreshHtmlVisualSnapshot({
  snapshot,
  htmlSourceFingerprint = null,
  viewport = null,
  requiredActions = [],
  sourcePath = null,
} = {}) {
  if (!snapshot || typeof snapshot !== "object") failSnapshot("missing snapshot", sourcePath);
  if (Number(snapshot.schemaVersion ?? 0) < HTML_VISUAL_SNAPSHOT_SCHEMA_VERSION) {
    failSnapshot(`schemaVersion must be ${HTML_VISUAL_SNAPSHOT_SCHEMA_VERSION} or newer`, sourcePath);
  }
  if (snapshot.source !== HTML_VISUAL_SNAPSHOT_SOURCE) {
    failSnapshot(`source must be ${HTML_VISUAL_SNAPSHOT_SOURCE}, received ${snapshot.source ?? "<missing>"}`, sourcePath);
  }
  if (htmlSourceFingerprint && !snapshot.htmlSourceFingerprint) failSnapshot("htmlSourceFingerprint is missing", sourcePath);
  if (htmlSourceFingerprint && snapshot.htmlSourceFingerprint !== htmlSourceFingerprint) {
    failSnapshot(`snapshot fingerprint ${snapshot.htmlSourceFingerprint} does not match current HTML ${htmlSourceFingerprint}`, sourcePath);
  }
  const snapshotViewport = snapshot.viewport ?? {};
  if (!isFinitePositive(snapshotViewport.width) || !isFinitePositive(snapshotViewport.height)) {
    failSnapshot("viewport width and height must be positive numbers", sourcePath);
  }
  if (viewport && (snapshotViewport.width !== viewport.width || snapshotViewport.height !== viewport.height)) {
    failSnapshot(`snapshot viewport ${snapshotViewport.width}x${snapshotViewport.height} does not match ${viewport.width}x${viewport.height}`, sourcePath);
  }
  const detailTitlebarActions = snapshot.regions?.detailTitlebarActions ?? {};
  const actionOrder = detailTitlebarActions.order;
  const actionRecords = detailTitlebarActions.actions ?? {};
  if (requiredActions.length) {
    if (!Array.isArray(actionOrder)) failSnapshot("detailTitlebarActions.order is missing", sourcePath);
    if (new Set(actionOrder).size !== actionOrder.length) failSnapshot("detailTitlebarActions.order contains duplicate action ids", sourcePath);
    for (const actionId of requiredActions) {
      if (!actionOrder.includes(actionId)) failSnapshot(`detailTitlebarActions.order is missing action ${actionId}`, sourcePath);
    }
  }
  for (const actionId of requiredActions) {
    const record = actionRecords[actionId];
    if (!record) failSnapshot(`detailTitlebarActions is missing action ${actionId}`, sourcePath);
    for (const field of ["visible", "labelVisible", "mode", "label", "buttonWidth", "buttonHeight", ...(htmlSourceFingerprint ? ["color", "backgroundColor", "border", "borderRadius", "padding", "gap"] : [])]) {
      if (!(field in record)) failSnapshot(`action ${actionId} is missing computed field ${field}`, sourcePath);
    }
    if (!(["icon", "icon-text"].includes(record.mode))) failSnapshot(`action ${actionId} has invalid mode ${record.mode}`, sourcePath);
    if (record.visible && (!isFinitePositive(record.buttonWidth) || !isFinitePositive(record.buttonHeight))) {
      failSnapshot(`visible action ${actionId} has invalid button bounds`, sourcePath);
    }
    if (record.visible && record.mode === "icon-text" && record.labelVisible !== true) {
      failSnapshot(`visible icon-text action ${actionId} must have a visible label`, sourcePath);
    }
    if (record.visible && (record.color == null || ["", "undefined", "null"].includes(String(record.color).trim()))) failSnapshot(`visible action ${actionId} has no computed color`, sourcePath);
  }
  return { ok: true, schemaVersion: snapshot.schemaVersion, source: snapshot.source, htmlSourceFingerprint: snapshot.htmlSourceFingerprint };
}

export function tokenNameForCssColor(tokens, cssColor, fallback = null) {
  const match = String(cssColor ?? "").match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:[, /]+\s*([\d.]+))?\s*\)/i);
  if (!match) return fallback;
  const rgba = [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
  const hex = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0").toUpperCase();
  const target = `#${hex(rgba[0] / 255)}${hex(rgba[1] / 255)}${hex(rgba[2] / 255)}${hex(rgba[3])}`;
  let best = null;
  for (const [name, definition] of tokens?.values ?? []) {
    if (definition?.type !== "color" || typeof definition.value !== "string") continue;
    const value = definition.value.toUpperCase();
    if (value === target) return name;
    if (value.length === 7 && target.length === 9 && `${value}FF` === target) return name;
    if (!best && value.slice(0, 7) === target.slice(0, 7)) best = name;
  }
  return best ?? fallback;
}

export function tokenNameForCssLength(tokens, cssLength, prefixes = ["space/", "size/", "radius/"], fallback = null) {
  const match = String(cssLength ?? "").match(/-?[\d.]+/);
  if (!match) return fallback;
  const target = Number(match[0]);
  const allowed = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const [name, definition] of tokens?.values ?? []) {
    if (definition?.type !== "number" || !allowed.some((prefix) => name.startsWith(prefix))) continue;
    if (Number(definition.value) === target) return name;
  }
  return fallback;
}

export function tokenBoxForCssPadding(tokens, cssPadding, fallback = null) {
  const values = String(cssPadding ?? "").match(/-?[\d.]+(?:px)?/g)?.map((value) => tokenNameForCssLength(tokens, value, ["space/"], fallback)) ?? [];
  if (!values.length || values.some((value) => !value)) return fallback;
  const [top, right = top, bottom = top, left = right] = values.length === 1
    ? [values[0], values[0], values[0], values[0]]
    : values.length === 2
      ? [values[0], values[1], values[0], values[1]]
      : values.length === 3
        ? [values[0], values[1], values[2], values[1]]
        : values;
  return { top, right, bottom, left };
}
