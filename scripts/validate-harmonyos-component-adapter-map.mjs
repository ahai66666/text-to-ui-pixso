import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));

const adapter = readJson(
  "assets/design-system/harmonyos-component-adapter-map.json",
);
const coverage = readJson(
  "assets/design-system/harmonyos-component-mapping-table.json",
);
const registry = readJson("assets/design-system/pixso-component-registry.json");
const specs = readJson("assets/design-system/pixso-component-specs.json");
const icons = readJson("assets/icons/icon-aliases.json");
const pixsoVariables = readJson("assets/design-system/pixso-variables.json");

const registryNames = new Set(Object.values(registry.categories).flat());
const specNames = new Set(Object.keys(specs.components));
const iconNames = new Set(Object.keys(icons.aliases));
const textStyles = new Set([
  "Typography/Display_L",
  "Typography/Display_M",
  "Typography/Display_S",
  "Typography/Title_L",
  "Typography/Title_M",
  "Typography/Title_S",
  "Typography/Subtitle_L",
  "Typography/Subtitle_M",
  "Typography/Subtitle_S",
  "Typography/Body_L",
  "Typography/Body_M",
  "Typography/Body_S",
]);
const effectStyles = new Set([
  "Effect/Foundation/shadow-1",
  "Effect/Foundation/shadow-2",
  "Effect/Foundation/shadow-3",
  "Effect/Foundation/shadow-4",
  "Effect/Foundation/shadow-5",
  "Effect/Foundation/shadow-6",
]);

const tokenNames = new Set();
for (const collection of pixsoVariables.collections ?? []) {
  for (const token of Object.keys(collection.variables ?? {})) {
    tokenNames.add(token);
  }
}

const errors = [];
const seenTargets = new Set();

if (adapter.schemaVersion !== 2) {
  errors.push("adapter schemaVersion must be 2");
}
if (adapter.policy?.partialCoverageAllowed !== true) {
  errors.push("adapter policy must explicitly allow partial registry coverage");
}
if (adapter.policy?.strictParityRequiresEveryUsedTargetVerified !== true) {
  errors.push("strict parity must require every used target to be verified");
}

for (const entry of adapter.adapters) {
  const label = `${entry.source.componentSet} -> ${entry.target}`;
  if (!registryNames.has(entry.target)) {
    errors.push(`${label}: target is not in pixso-component-registry.json`);
  }
  if (!specNames.has(entry.target)) {
    errors.push(`${label}: target has no generated Pixso component spec`);
  }
  if (seenTargets.has(entry.target)) {
    errors.push(`${label}: duplicate target mapping`);
  }
  seenTargets.add(entry.target);

  for (const styleName of Object.values(entry.textStyles ?? {})) {
    if (!textStyles.has(styleName)) {
      errors.push(`${label}: unknown text style ${styleName}`);
    }
  }
  for (const iconName of Object.values(entry.icons ?? {})) {
    if (!iconNames.has(iconName)) {
      errors.push(`${label}: unknown semantic icon ${iconName}`);
    }
  }
  for (const tokenName of Object.values(entry.tokens ?? {})) {
    if (!tokenNames.has(tokenName)) {
      errors.push(`${label}: unknown or unsynced token ${tokenName}`);
    }
  }
  if (entry.effectStyle && !effectStyles.has(entry.effectStyle)) {
    errors.push(`${label}: unknown effect style ${entry.effectStyle}`);
  }
}

const coverageTargets = new Set();
for (const row of coverage.rows ?? []) {
  if (!registryNames.has(row.target)) {
    errors.push(`coverage row is not registered: ${row.target}`);
  }
  if (coverageTargets.has(row.target)) {
    errors.push(`duplicate coverage row: ${row.target}`);
  }
  coverageTargets.add(row.target);

  const mapped = seenTargets.has(row.target);
  if (mapped && row.status === "missing-target") {
    errors.push(`${row.target}: mapped adapter is marked missing in coverage`);
  }
  if (!mapped && row.status !== "missing-target") {
    errors.push(`${row.target}: unmapped target has non-missing coverage status`);
  }
  if (row.strictEligible !== (row.status === "verified")) {
    errors.push(`${row.target}: strictEligible does not match verified status`);
  }
}

for (const registryName of registryNames) {
  if (!coverageTargets.has(registryName)) {
    errors.push(`coverage table is missing registered target ${registryName}`);
  }
}

if (errors.length) {
  console.error("HarmonyOS component adapter map is invalid:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `HarmonyOS component adapter map valid: ${adapter.adapters.length} mappings, ` +
    `${coverageTargets.size} registry coverage rows, ` +
    `${adapter.sourceOnly.length} source-only entries.`,
);
