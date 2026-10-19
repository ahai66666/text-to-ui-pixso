import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "assets/design-system/pixso-component-registry.json"), "utf8"),
);
const specs = JSON.parse(
  fs.readFileSync(path.join(root, "assets/design-system/pixso-component-specs.json"), "utf8"),
);
const mappingRegistry = JSON.parse(
  fs.readFileSync(path.join(root, "assets/design-system/mapping-registry.json"), "utf8"),
);
const aliases = JSON.parse(
  fs.readFileSync(path.join(root, "assets/icons/icon-aliases.json"), "utf8"),
).aliases;
const css = [
  fs.readFileSync(path.join(root, "..", "packages/component-styles/src/index.css"), "utf8"),
].join("\n");
const frameworkComponentCss = fs.readFileSync(
  path.join(root, "..", "packages/component-styles/src/index.css"),
  "utf8",
);
const frameworkComponentContract = JSON.parse(fs.readFileSync(
  path.join(root, "..", "packages/component-contracts/src/components.json"),
  "utf8",
));

const names = Object.values(registry.categories).flat();
const mappingProfile = mappingRegistry.profiles?.find(
  (profile) => profile.id === mappingRegistry.defaultProfile,
) ?? mappingRegistry.profiles?.[0];
// A mapping may introduce a Pixso-specific spec that is not listed directly
// in the physical component registry. This includes repeated-child mappings
// (for example Sub Tabs -> Sub Tabs Item) and fully mapped variants such as
// Coremail's Context Menu/quantity=3. The canonical mapping registry owns
// those registrations; childMapping is optional runtime metadata.
const mappedSpecNames = [
  ...(mappingProfile?.componentMappings ?? []),
  ...(mappingProfile?.endpointComponentMappings ?? []),
]
  .filter((mapping) => (
    mapping?.pixsoTargetStatus === "registered" &&
    mapping?.pixsoSpecKey
  ))
  .map((mapping) => mapping.pixsoSpecKey);
const expectedSpecNames = [...new Set([...names, ...mappedSpecNames])];
const specNames = Object.keys(specs.components);
const errors = [];

// The framework implementation is the source used by imports.  The gallery
// remains useful for review, but it must never silently override a framework
// component's shape or supported semantic variants.
const badgeContract = (frameworkComponentContract.components ?? frameworkComponentContract)
  .find((component) => component.id === "badge" || component.logicalName === "Badge/Default");
const badgeRadiusMatch = frameworkComponentCss.match(
  /\.tui-badge\s*\{[^}]*\bborder-radius:\s*var\((--[^)]+)\)/s,
);
if (!badgeContract) {
  errors.push("Framework component contract is missing Badge/Default.");
} else {
  const expectedBadgeVariants = ["default", "info", "success", "warning", "danger", "neutral"];
  for (const variant of expectedBadgeVariants) {
    if (!(badgeContract.variants ?? []).includes(variant)) {
      errors.push(`Framework Badge contract is missing the ${variant} variant.`);
    }
  }
}
if (!badgeRadiusMatch) {
  errors.push("Framework Badge CSS must declare its border-radius token.");
} else {
  const radiusCssVariable = badgeRadiusMatch[1];
  const radiusMapping = (mappingProfile?.tokenMappings ?? [])
    .find((mapping) => mapping.htmlCssVariable === radiusCssVariable)?.pixsoVariable;
  if (!radiusMapping) {
    errors.push(`Framework Badge radius token ${radiusCssVariable} has no Pixso Variable mapping.`);
  } else {
    for (const [name, item] of Object.entries(specs.components)) {
      if (name.startsWith("Badge/") && item.radiusToken !== radiusMapping) {
        errors.push(`Badge spec ${name} must use ${radiusMapping}, matching HTML component CSS ${radiusCssVariable}.`);
      }
    }
  }
}

for (const name of expectedSpecNames) {
  const item = specs.components[name];
  if (!item) {
    errors.push(`Missing component spec: ${name}`);
    continue;
  }
  if (!item.autoLayout) errors.push(`Auto Layout must be required: ${name}`);
  if (!item.sizing?.masterWidth || !item.sizing?.placementWidth || item.sizing?.height == null) {
    errors.push(`Incomplete sizing contract: ${name}`);
  }
  const selectorClasses = [...(item.previewSelector ?? "").matchAll(/\.([a-zA-Z0-9_-]+)/g)]
    .map((match) => `.${match[1]}`);
  if (item.previewStatus === "current-framework") {
    if (!item.previewSelector || !String(item.previewSelector).includes(".tui-") || !selectorClasses.some((className) => css.includes(className))) {
      errors.push(`Preview selector must identify a current HTML component: ${name} -> ${item.previewSelector}`);
    }
  } else if (item.previewStatus !== "pixso-library-only" || item.previewSelector) {
    errors.push(`Component without a current HTML preview must be marked pixso-library-only: ${name}`);
  }
  for (const style of Object.values(item.textRoles ?? {})) {
    if (!specs.shared.typographyPolicy.styles.includes(style)) {
      errors.push(`Unknown text style ${style} in ${name}`);
    }
  }
}

for (const name of specNames) {
  if (!expectedSpecNames.includes(name)) errors.push(`Orphan component spec: ${name}`);
}

for (const [pattern, value] of Object.entries(registry.semanticIcons)) {
  for (const alias of Array.isArray(value) ? value : [value]) {
    if (!aliases[alias]) errors.push(`Missing icon alias ${alias} for ${pattern}`);
  }
}

if (specs.shared.alphaPolicy.rule !== "token-alpha-only") {
  errors.push("Alpha policy must be token-alpha-only.");
}
if (specs.shared.alphaPolicy.layerOpacity !== 1) {
  errors.push("Default layer opacity must be 1.");
}
const iconPolicy = specs.shared.iconPolicy ?? {};
const expectedIconStrokeWeights = { "16": 1, "20": 1.25, "24": 1.5 };
for (const [size, weight] of Object.entries(expectedIconStrokeWeights)) {
  if (Number(iconPolicy.strokeWeightByDisplaySize?.[size]) !== weight) {
    errors.push(`Icon stroke weight for ${size}px must be ${weight}px.`);
  }
}
if (iconPolicy.hotZone?.alignment !== "CENTER" || iconPolicy.hotZone?.axes !== "BOTH") {
  errors.push("Icon hot zone must be centered on both axes.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Pixso component specs valid: ${specNames.length} specs, complete registry coverage.`);
