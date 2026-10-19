import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aliasToSymbolId, loadIconRegistry, skillRoot } from "./icon-tools.mjs";
import { resolvePixsoIcon } from "./pixso-native-scene-lib.mjs";

const args = process.argv.slice(2);
let inputPath = null;
let outputPath = null;
let strict = false;

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--") continue;
  if (argument === "--in") inputPath = resolve(args[++index]);
  else if (argument === "--out") outputPath = resolve(args[++index]);
  else if (argument === "--strict") strict = true;
  else if (argument === "--help") {
    console.log("Usage: node scripts/prepare-pixso-html.mjs --in <browser.html> --out <pixso.html> [--strict]");
    console.log("Converts exact SVG sprite <use> instances into Pixso-importable inline SVG geometry.");
    process.exit(0);
  } else throw new Error("Unknown argument: " + argument);
}

if (!inputPath || !outputPath) throw new Error("Both --in and --out are required");
if (inputPath === outputPath) throw new Error("Pixso preparation must write to a separate file; the browser HTML is kept unchanged");

const registry = await loadIconRegistry();
const pixsoIconMap = JSON.parse(await readFile(resolve(skillRoot, "assets/design-system/pixso-icon-map.json"), "utf8"));
const inputHtml = await readFile(inputPath, "utf8");

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function attribute(attributes, name) {
  return attributes.match(new RegExp("\\b" + name + "=[\"']([^\"']*)[\"']", "i"))?.[1] ?? null;
}

function setAttribute(attributes, name, value) {
  const escaped = escapeAttribute(value);
  const pattern = new RegExp("\\s" + name + "\\s*=\\s*(?:\"[^\"]*\"|'[^']*')", "i");
  if (pattern.test(attributes)) return attributes.replace(pattern, " " + name + "=\"" + escaped + "\"");
  return attributes + " " + name + "=\"" + escaped + "\"";
}

function appendSvgSourceAttributes(wrapperAttributes, symbolAttributes) {
  // Keep component classes/size attributes from the HTML wrapper, but copy
  // source rendering attributes so the Pixso importer sees the same geometry.
  const sourceAttributeNames = [
    "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-miterlimit", "fill-rule", "clip-rule", "preserveAspectRatio"
  ];
  let next = wrapperAttributes;
  for (const name of sourceAttributeNames) {
    if (!attribute(next, name)) {
      const value = attribute(symbolAttributes, name);
      if (value !== null) next = setAttribute(next, name, value);
    }
  }
  return next;
}

function inferDisplaySizeToken(attributes) {
  const className = attribute(attributes, "class") ?? "";
  if (/(^|\s)sm(?:\s|$)/i.test(className)) return "size/16";
  if (/(^|\s)(?:lg|large)(?:\s|$)/i.test(className)) return "size/24";
  const width = Number.parseFloat(attribute(attributes, "width") ?? "");
  const height = Number.parseFloat(attribute(attributes, "height") ?? "");
  if (width === 16 || height === 16) return "size/16";
  if (width === 24 || height === 24) return "size/24";
  return "size/20";
}

function displaySizeTokenForAlias(alias, attributes) {
  const className = attribute(attributes, "class") ?? "";
  const width = Number.parseFloat(attribute(attributes, "width") ?? "");
  const height = Number.parseFloat(attribute(attributes, "height") ?? "");
  const hasExplicitSize = /(^|\s)(?:sm|lg|large)(?:\s|$)/i.test(className) ||
    width === 16 || width === 24 || height === 16 || height === 24;
  if (hasExplicitSize) return inferDisplaySizeToken(attributes);
  const contract = pixsoIconMap.displayContracts?.find(item => item.aliases?.includes(alias));
  if (contract?.displaySizeToken) return contract.displaySizeToken;
  return inferDisplaySizeToken(attributes);
}

function inferAlias(id, symbolAttributes) {
  const explicitAlias = attribute(symbolAttributes, "data-icon-alias");
  if (explicitAlias) return explicitAlias;
  for (const alias of Object.keys(registry.aliases)) {
    if (aliasToSymbolId(alias) === id) return alias;
  }
  return null;
}

function inferSource(id, symbolAttributes) {
  const source = attribute(symbolAttributes, "data-icon-source");
  if (source) return source;
  const harmonySymbol = attribute(symbolAttributes, "data-harmonyos-symbol");
  if (harmonySymbol) return "harmonyos-symbol:" + harmonySymbol;
  const titlebarIcon = attribute(symbolAttributes, "data-titlebar-icon");
  if (titlebarIcon) return "titlebar-asset:" + titlebarIcon;
  const lucideIcon = attribute(symbolAttributes, "data-lucide-icon");
  if (lucideIcon) return "lucide-symbol:" + lucideIcon;
  return "inline-sprite:" + id;
}

function removeSpriteBlocks(html) {
  return html
    .replace(/<!-- TEXT_TO_UI_ICON_SPRITE_START -->[\s\S]*?<!-- TEXT_TO_UI_ICON_SPRITE_END -->/gi, "")
    .replace(/<svg\b[^>]*data-icon-sprite=["'][^"']+["'][^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<svg\b[^>]*class=["'][^"']*(?:hmos-sprite|icon-sprite)[^"']*["'][^>]*>[\s\S]*?<\/svg>/gi, "");
}

// Protect executable/style text. A generated page can contain a template
// literal such as <svg><use ...></svg> inside a script; it is not an icon
// instance that should be transformed at import time.
function maskExecutableBlocks(html) {
  const protectedBlocks = [];
  const masked = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, block => {
    const token = "__TEXT_TO_UI_PIXSO_PROTECTED_" + protectedBlocks.length + "__";
    protectedBlocks.push([token, block]);
    return token;
  });
  return {
    masked,
    restore(value) {
      return protectedBlocks.reduce((current, item) => current.replaceAll(item[0], item[1]), value);
    }
  };
}

const symbols = new Map();
const symbolPattern = /<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/gi;
let symbolMatch;
while ((symbolMatch = symbolPattern.exec(inputHtml))) {
  const id = attribute(symbolMatch[1], "id");
  if (id) symbols.set(id, { attributes: symbolMatch[1], body: symbolMatch[2].trim() });
}

let unresolvedUses = 0;
let unaliasedUses = 0;
let inlineCount = 0;
let output = removeSpriteBlocks(inputHtml);
const protectedHtml = maskExecutableBlocks(output);
output = protectedHtml.masked.replace(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/gi, (full, wrapperAttributes, body) => {
  const useMatch = body.match(/<use\b[^>]*(?:href|xlink:href)=["']#([^"']+)["'][^>]*\/?\s*>/i);
  if (!useMatch || /<(?!use\b)[a-z]/i.test(body)) return full;

  const symbolId = useMatch[1];
  const symbol = symbols.get(symbolId);
  if (!symbol) {
    const requestedName = symbolId.replace(/^(?:hmos|tui|icon)-/i, "");
    const resolved = resolvePixsoIcon(requestedName);
    const sourceMatch = resolved.svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
    if (!sourceMatch) {
      unresolvedUses += 1;
      return full;
    }
    let nextAttributes = appendSvgSourceAttributes(wrapperAttributes, sourceMatch[1]);
    const resolvedAlias = resolved.resolvedAlias ?? null;
    const displaySizeToken = attribute(wrapperAttributes, "data-display-size-token") ?? displaySizeTokenForAlias(resolvedAlias, wrapperAttributes);
    nextAttributes = setAttribute(nextAttributes, "data-pixso-icon", "inline-svg");
    nextAttributes = setAttribute(nextAttributes, "data-pixso-overflow", "visible");
    nextAttributes = setAttribute(nextAttributes, "data-display-size-token", displaySizeToken);
    nextAttributes = setAttribute(nextAttributes, "data-icon-source", resolved.source ?? "unresolved-fallback");
    nextAttributes = setAttribute(nextAttributes, "data-icon-request", requestedName);
    if (resolvedAlias) nextAttributes = setAttribute(nextAttributes, "data-icon-alias", resolvedAlias);
    else nextAttributes = setAttribute(nextAttributes, "data-icon-manual-fallback", "unresolved-source:" + requestedName);
    const existingStyle = attribute(nextAttributes, "style");
    nextAttributes = setAttribute(nextAttributes, "style", existingStyle ? existingStyle.replace(/;?$/, ";") + "overflow:visible" : "overflow:visible");
    inlineCount += 1;
    if (!resolvedAlias) unresolvedUses += 1;
    return "<svg" + nextAttributes + ">" + sourceMatch[2].trim() + "</svg>";
  }

  const alias = inferAlias(symbolId, symbol.attributes);
  if (!alias) unaliasedUses += 1;
  let nextAttributes = appendSvgSourceAttributes(wrapperAttributes, symbol.attributes);
  const displaySizeToken = attribute(wrapperAttributes, "data-display-size-token") ?? displaySizeTokenForAlias(alias, wrapperAttributes);
  const source = inferSource(symbolId, symbol.attributes);
  nextAttributes = setAttribute(nextAttributes, "data-pixso-icon", "inline-svg");
  nextAttributes = setAttribute(nextAttributes, "data-pixso-overflow", "visible");
  nextAttributes = setAttribute(nextAttributes, "data-display-size-token", displaySizeToken);
  nextAttributes = setAttribute(nextAttributes, "data-icon-source", source);
  nextAttributes = setAttribute(nextAttributes, "data-icon-sprite-id", symbolId);
  if (alias) nextAttributes = setAttribute(nextAttributes, "data-icon-alias", alias);
  else nextAttributes = setAttribute(nextAttributes, "data-icon-manual-fallback", "unresolved-sprite:" + symbolId);
  const existingStyle = attribute(nextAttributes, "style");
  nextAttributes = setAttribute(nextAttributes, "style", existingStyle ? existingStyle.replace(/;?$/, ";") + "overflow:visible" : "overflow:visible");
  inlineCount += 1;
  return "<svg" + nextAttributes + ">" + symbol.body + "</svg>";
});
output = protectedHtml.restore(output);

if (unresolvedUses > 0) {
  const message = unresolvedUses + " SVG icon request(s) used the explicit non-blocking fallback";
  console.warn("WARN " + message + "; the Pixso import continues and keeps a manual-fallback marker");
}
if (unaliasedUses > 0) {
  const message = unaliasedUses + " SVG icon(s) have no semantic alias in the source sprite";
  console.warn("WARN " + message + "; geometry and source provenance are retained, and the import continues");
}

await writeFile(outputPath, output);
console.error("Prepared " + inlineCount + " inline SVG icon(s) for Pixso: " + outputPath);
