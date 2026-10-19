#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIconSymbol, loadIconRegistry } from "./icon-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const map = readJson("assets/design-system/pixso-icon-map.json");
const specs = readJson("assets/design-system/pixso-component-specs.json");
const registry = await loadIconRegistry();
const failures = [];

if (map.sourceArtboard !== 24) failures.push("sourceArtboard must be 24");
const expectedStrokeWidths = {"16": 1, "20": 1.25, "24": 1.5};
if (map.rendering?.lucide?.strokeWidth !== 1.5) failures.push("lucide strokeWidth must be 1.5 on the 24x24 source artboard");
if (map.rendering?.lucide?.strokeWeightFormula !== "supported display sizes use strokeWidthByDisplaySize[displaySize]; other approved sizes use 1.5 * displaySize / sourceArtboard") failures.push("strokeWeightFormula must use the authoritative display-size table");
if (map.rendering?.hotZone?.alignment !== "CENTER" || map.rendering?.hotZone?.axes !== "BOTH") failures.push("icon hotZone must be centered on both axes");
for (const [size, width] of Object.entries(expectedStrokeWidths)) {
  if (Number(map.rendering?.lucide?.strokeWidthByDisplaySize?.[size]) !== width) {
    failures.push(`lucide strokeWidthByDisplaySize.${size} must be ${width}`);
  }
}
const seenAliases = new Set();
for (const contract of map.displayContracts ?? []) {
  if (![16, 20, 24].includes(contract.displaySize)) failures.push(`${contract.name}: invalid displaySize`);
  if (contract.displaySizeToken !== `size/${String(contract.displaySize).padStart(2, "0")}`) failures.push(`${contract.name}: displaySizeToken must match displaySize`);
  for (const alias of contract.aliases ?? []) {
    if (seenAliases.has(alias)) failures.push(`duplicate icon alias: ${alias}`);
    seenAliases.add(alias);
    const source = registry.aliases[alias];
    if (!source) { failures.push(`${contract.name}: unknown alias ${alias}`); continue; }
    if (contract.sourceRequirement && source.source !== contract.sourceRequirement) failures.push(`${contract.name}: ${alias} must use ${contract.sourceRequirement}`);
    try { await buildIconSymbol(alias, registry); } catch (error) { failures.push(`${contract.name}: ${alias} cannot export exact SVG (${error.message})`); }
  }
}
for (const [name, spec] of Object.entries(specs.components ?? {})) {
  for (const size of [spec.iconSize, ...(spec.iconSizes ?? [])].filter((value) => value != null)) if (![16, 20, 24].includes(size)) failures.push(`${name}: invalid iconSize ${size}`);
}
const registryAliases = new Set(Object.keys(registry.aliases ?? {}));
for (const alias of registryAliases) if (!seenAliases.has(alias)) failures.push(`alias registry entry has no Pixso display contract: ${alias}`);
for (const alias of seenAliases) if (!registryAliases.has(alias)) failures.push(`Pixso display contract has no alias registry entry: ${alias}`);
if (failures.length) { console.error("Pixso icon map is invalid:"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`Pixso icon map valid: ${seenAliases.size} aliases, ${Object.keys(specs.components ?? {}).length} component specs.`);
