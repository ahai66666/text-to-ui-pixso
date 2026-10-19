import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "assets/design-system/pixso-component-registry.json");
const specsPath = path.join(root, "assets/design-system/pixso-component-specs.json");
const aliasesPath = path.join(root, "assets/icons/icon-aliases.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const specs = JSON.parse(fs.readFileSync(specsPath, "utf8"));
const aliases = JSON.parse(fs.readFileSync(aliasesPath, "utf8")).aliases;

const names = Object.values(registry.categories).flat();
const errors = [];

const specNames = Object.keys(specs.components ?? {});
if (names.length !== specNames.length) errors.push(`Component registry/spec count mismatch: registry=${names.length}, specs=${specNames.length}.`);
for (const name of specNames) {
  if (!names.includes(name)) errors.push(`Component spec is not registered: ${name}`);
}
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicates.length) errors.push(`Duplicate component names: ${[...new Set(duplicates)].join(", ")}`);
for (const name of names) {
  if (/#\d+$/.test(name)) errors.push(`Duplicate suffix is forbidden: ${name}`);
  if (!name.includes("/")) errors.push(`Component name must be hierarchical: ${name}`);
}

const semanticAliases = Object.values(registry.semanticIcons).flat();
for (const alias of semanticAliases) {
  const definition = aliases[alias];
  if (!definition) {
    errors.push(`Missing semantic icon alias: ${alias}`);
    continue;
  }
  if (definition.path && !fs.existsSync(path.join(root, definition.path))) {
    errors.push(`Missing icon asset for ${alias}: ${definition.path}`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Pixso component registry valid: ${names.length} unique components, ${semanticAliases.length} semantic icon bindings.`);
