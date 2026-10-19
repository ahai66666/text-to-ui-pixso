import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const registryPath = resolve(skillRoot, "assets/icons/icon-aliases.json");

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeSourcePath(relativePath) {
  const absolutePath = resolve(skillRoot, relativePath);
  if (absolutePath !== skillRoot && !absolutePath.startsWith(`${skillRoot}${sep}`)) {
    throw new Error(`Icon asset escapes the Skill root: ${relativePath}`);
  }
  return absolutePath;
}

function serializeNode([tag, attributes]) {
  const serializedAttributes = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  return `    <${tag}${serializedAttributes ? ` ${serializedAttributes}` : ""}/>`;
}

function extractSvg(svg, sourcePath) {
  const match = svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!match) throw new Error(`Invalid SVG asset: ${sourcePath}`);
  const viewBoxMatch = match[1].match(/\bviewBox=["']([^"']+)["']/i);
  const viewBox = viewBoxMatch?.[1] ?? "0 0 24 24";
  const geometry = match[2].trim();
  if (!geometry) throw new Error(`SVG asset has no geometry: ${sourcePath}`);
  return { viewBox, geometry };
}

export function aliasToSymbolId(alias) {
  return `icon-${alias.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export async function loadIconRegistry() {
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  if (registry.version !== 1 || !registry.lucideVersion) {
    throw new Error("Unsupported or invalid icon alias registry");
  }
  if (!registry.aliases || typeof registry.aliases !== "object") {
    throw new Error("Icon alias registry has no aliases object");
  }
  const skillPackage = JSON.parse(await readFile(resolve(skillRoot, "package.json"), "utf8"));
  const lucidePackage = JSON.parse(await readFile(resolve(skillRoot, "node_modules/lucide/package.json"), "utf8"));
  const declaredVersion = skillPackage.dependencies?.lucide;
  if (declaredVersion !== registry.lucideVersion) {
    throw new Error(
      `Lucide dependency must be pinned exactly to registry version ${registry.lucideVersion}; found ${declaredVersion ?? "missing"}`
    );
  }
  if (lucidePackage.version !== registry.lucideVersion) {
    throw new Error(
      `Installed Lucide version ${lucidePackage.version} does not match registry version ${registry.lucideVersion}; run pnpm install`
    );
  }
  return registry;
}

export async function buildIconSymbol(alias, registry) {
  const entry = registry.aliases[alias];
  if (!entry) throw new Error(`Unknown icon alias: ${alias}`);
  const id = aliasToSymbolId(alias);

  if (entry.source === "lucide") {
    const modulePath = resolve(skillRoot, `node_modules/lucide/dist/esm/icons/${entry.name}.mjs`);
    const iconModule = await import(pathToFileURL(modulePath).href);
    if (!Array.isArray(iconModule.default)) {
      throw new Error(`Lucide icon did not export node data: ${entry.name}`);
    }
    const geometry = iconModule.default.map(serializeNode).join("\n");
    return [
      `  <symbol id="${id}" viewBox="0 0 24 24" data-icon-alias="${escapeAttribute(alias)}" data-icon-source="lucide@${escapeAttribute(registry.lucideVersion)}" data-icon-name="${escapeAttribute(entry.name)}">`,
      geometry,
      "  </symbol>"
    ].join("\n");
  }

  if (entry.source === "asset") {
    const absolutePath = normalizeSourcePath(entry.path);
    const { viewBox, geometry } = extractSvg(await readFile(absolutePath, "utf8"), entry.path);
    const indentedGeometry = geometry.split("\n").map(line => `    ${line.trim()}`).join("\n");
    return [
      `  <symbol id="${id}" viewBox="${escapeAttribute(viewBox)}" data-icon-alias="${escapeAttribute(alias)}" data-icon-source="${escapeAttribute(entry.source)}" data-icon-path="${escapeAttribute(entry.path)}">`,
      indentedGeometry,
      "  </symbol>"
    ].join("\n");
  }

  throw new Error(`Unsupported icon source for ${alias}: ${entry.source}`);
}

export async function buildIconSprite(aliases, registry) {
  const uniqueAliases = [...new Set(aliases)];
  const symbols = [];
  for (const alias of uniqueAliases) symbols.push(await buildIconSymbol(alias, registry));
  return [
    '<svg data-icon-sprite="text-to-ui" aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">',
    "<defs>",
    ...symbols,
    "</defs>",
    "</svg>"
  ].join("\n");
}

export function normalizeMarkup(markup) {
  return markup.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();
}
