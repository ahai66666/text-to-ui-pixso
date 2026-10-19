#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadComponentMap, loadTokenResources, parseArgs, readJson, repoRelativePath, writeJson } from "./pixso-native-scene-lib.mjs";
import { buildCoremailScene, collectSceneStats } from "./coremail-semantic-adapter.mjs";
import { computeHtmlSourceFingerprint, validateFreshHtmlVisualSnapshot } from "./html-visual-contract.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: generate-pixso-scene.mjs --page-spec <page-spec.json> --layout-contract <layout-contract.json> --page-data <page-data.json> --component-map <pixso-native-component-map.json|mapping-registry.json> --out <pixso-scene.json> [--mapping-registry <mapping-registry.json> --mapping-profile <profile-id>] [--html-root <html-source-root>] [--stats-out <scene-stats.json>]";
if (args.help || !args["page-spec"] || !args["layout-contract"] || !args["page-data"] || !args["component-map"] || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}

const pageSpecPath = path.resolve(args["page-spec"]);
const pageSpec = readJson(pageSpecPath);
const layoutContract = readJson(args["layout-contract"]);
const pageDataPath = path.resolve(args["page-data"]);
const pageData = readJson(pageDataPath);
const visualSnapshot = pageSpec.pixso?.visualSnapshot
  ? readJson(path.resolve(path.dirname(pageSpecPath), pageSpec.pixso.visualSnapshot))
  : null;
const visualSnapshotPath = pageSpec.pixso?.visualSnapshot
  ? path.resolve(path.dirname(pageSpecPath), pageSpec.pixso.visualSnapshot)
  : null;
const configuredHtmlRoots = args["html-root"]
  ? [args["html-root"]]
  : pageSpec.htmlSourceRoots ?? [pageSpec.htmlSourceRoot ?? "."];
const htmlSourceRoots = configuredHtmlRoots.map((root) => path.resolve(path.dirname(pageSpecPath), root));
const mappingOptions = {
  mappingRegistry: args["mapping-registry"] ? path.resolve(args["mapping-registry"]) : undefined,
  mappingProfile: args["mapping-profile"] || undefined,
};
const componentMap = loadComponentMap(args["component-map"], mappingOptions);
if (pageSpec.pixso?.strategy !== "native-scene") {
  throw new Error("page-spec.pixso.strategy must be native-scene before generating a Pixso Scene");
}
if (pageSpec.pixso?.stateScope && pageSpec.pixso.stateScope !== "default-visible") {
  throw new Error("This generation path currently supports only pixso.stateScope=default-visible");
}
const pagePattern = pageSpec.shell?.pattern ?? pageSpec.pattern;
if (layoutContract.pattern !== pagePattern) {
  throw new Error(`layout-contract.pattern (${layoutContract.pattern}) must match page pattern (${pagePattern})`);
}
const tokenDir = args["token-dir"] ? path.resolve(args["token-dir"]) : undefined;
const tokens = loadTokenResources({ tokenDir, ...mappingOptions });
const htmlSourceFingerprint = computeHtmlSourceFingerprint(htmlSourceRoots);
validateFreshHtmlVisualSnapshot({
  snapshot: visualSnapshot,
  htmlSourceFingerprint,
  viewport: pageSpec.viewport ?? layoutContract.viewport ?? null,
  requiredActions: (pageData.detailActions ?? []).map((action) => action.id),
  sourcePath: visualSnapshotPath,
});
// A plan is valid only for the exact current HTML-derived inputs used to
// build it. This fingerprint is intentionally independent of Pixso state, so
// an old bridge payload cannot masquerade as a fresh page import.
const sourceFingerprint = crypto.createHash("sha256");
const mappingRegistryPath = mappingOptions.mappingRegistry || path.join(path.dirname(path.resolve(args["component-map"])), "mapping-registry.json");
for (const inputPath of [pageSpecPath, path.resolve(args["layout-contract"]), pageDataPath, path.resolve(args["component-map"]), mappingRegistryPath, visualSnapshotPath].filter((inputPath) => inputPath && fs.existsSync(inputPath))) {
  sourceFingerprint.update(inputPath);
  sourceFingerprint.update(fs.readFileSync(inputPath));
}
sourceFingerprint.update("coremail-secondary-list-v2");
sourceFingerprint.update(`html-source:${htmlSourceFingerprint}`);
const scene = buildCoremailScene({ pageSpec, layoutContract, pageData, componentMap, visualSnapshot, sourceFingerprint: sourceFingerprint.digest("hex").slice(0, 24), htmlSourceFingerprint, tokens, assetBaseDir: path.dirname(pageDataPath) });
writeJson(args.out, scene);
if (args["stats-out"]) writeJson(args["stats-out"], { schemaVersion: 1, scene: repoRelativePath(args.out), ...collectSceneStats(scene) });
console.log(JSON.stringify({ ok: true, scene: path.resolve(args.out), ...collectSceneStats(scene) }, null, 2));
