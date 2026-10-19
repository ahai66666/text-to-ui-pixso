import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
let inputPath;
let outputPath;
let manifestPath;
let utilityMapPath;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--in") inputPath = path.resolve(args[++index]);
  else if (args[index] === "--out") outputPath = path.resolve(args[++index]);
  else if (args[index] === "--manifest") manifestPath = path.resolve(args[++index]);
  else if (args[index] === "--utility-map") utilityMapPath = path.resolve(args[++index]);
  else if (args[index] === "--help") {
    console.log("Usage: node scripts/prepare-pixso-binding-html.mjs --in <prepared-pixso.html> --out <binding-pixso.html> [--manifest page-binding-manifest.json] [--utility-map token-utility-map.json]");
    process.exit(0);
  } else throw new Error("Unknown argument: " + args[index]);
}
if (!inputPath || !outputPath) throw new Error("Both --in and --out are required");
if (inputPath === outputPath) throw new Error("Binding preparation must write a separate HTML copy");

const input = await fs.readFile(inputPath, "utf8");
const manifest = manifestPath ? JSON.parse(await fs.readFile(manifestPath, "utf8")) : null;
const utilityMap = utilityMapPath ? JSON.parse(await fs.readFile(utilityMapPath, "utf8")) : null;
if (utilityMap) {
  const knownClasses = new Set([
    ...(utilityMap.utilities ?? []).map((item) => item.className),
    ...(utilityMap.semanticTypes ?? []).map((item) => item.className),
  ]);
  const unknownClasses = new Set();
  for (const match of input.matchAll(/\bclass\s*=\s*(["'])(.*?)\1/gi)) {
    for (const className of match[2].split(/\s+/).filter((value) => value.startsWith(utilityMap.classPrefix ?? "u-"))) {
      if (!knownClasses.has(className)) unknownClasses.add(className);
    }
  }
  if (unknownClasses.size) {
    throw new Error(`Unknown Token utility class(es): ${[...unknownClasses].join(", ")}`);
  }
}
const selectorBindings = (manifest?.bindings ?? [])
  .filter((binding) => binding.selector && binding.key)
  .map((binding) => ({ key: binding.key, selector: binding.selector }));
const protectedBlocks = [];
const masked = input.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (block) => {
  const token = `__TEXT_TO_UI_BINDING_PROTECTED_${protectedBlocks.length}__`;
  protectedBlocks.push([token, block]);
  return token;
});
let marked = 0;
const conflicts = [];
function selectorMatches(attributes, selector) {
  const parts = [...selector.matchAll(/\[([\w:-]+)(?:\s*=\s*(['"])(.*?)\2)?\]/g)];
  if (!parts.length) return false;
  return parts.every(([, name, , expected]) => {
    const actual = attributes.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"))?.[2];
    return expected === undefined ? actual !== undefined : actual === expected;
  });
}
function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
let output = masked.replace(/<([a-z][\w:-]*)(\s[^>]*?)?>/gi, (full, tag, rawAttributes = "") => {
  const existingKey = rawAttributes.match(/\bdata-px-key\s*=\s*(["'])(.*?)\1/i)?.[2];
  const matches = selectorBindings.filter((binding) => selectorMatches(rawAttributes, binding.selector));
  const key = existingKey ?? (matches.length === 1 ? matches[0].key : null);
  if (matches.length > 1) conflicts.push({ tag, keys: matches.map((item) => item.key) });
  if (!key || /(?:^|\s)id\s*=\s*["']px-key:/i.test(rawAttributes)) return full;
  const safeKey = key.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  marked += 1;
  const existingId = rawAttributes.match(/(?:^|\s)id\s*=\s*(["'])(.*?)\1/i)?.[2];
  const marker = `id="px-key:${safeKey}"`;
  let nextAttributes = rawAttributes.replace(/\s+id\s*=\s*(?:"[^"]*"|'[^']*')/i, ` ${marker}`);
  if (existingId) {
    nextAttributes = nextAttributes.replace(/\s+id="px-key:[^"]*"/i, ` ${marker} data-px-source-id="${escapeAttribute(existingId)}"`);
  } else {
    nextAttributes += ` ${marker}`;
  }
  return `<${tag}${nextAttributes}>`;
});
for (const [token, block] of protectedBlocks) output = output.replaceAll(token, block);
await fs.writeFile(outputPath, output);
if (conflicts.length) {
  console.warn(`Skipped ${conflicts.length} selector conflict(s); add an explicit data-px-key before import.`);
}
console.error(`Added ${marked} Pixso semantic marker id(s): ${outputPath}`);
