import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export const sourceFile = "references/resources/source.json";
export const indexFile = "references/index/generated/resource-index.json";
export const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export const json = (value) => JSON.stringify(value, null, 2) + "\n";
export const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export function localFile(root, relative) {
  const base = fs.realpathSync(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep) || !fs.realpathSync(full).startsWith(base + path.sep)) throw new Error("Resource escapes Skill root: " + relative);
  return full;
}
export function resourceSource(root) {
  const source = read(localFile(root, sourceFile));
  if (source.schemaVersion !== 1 || source.kind !== "text-to-ui-resource-sources") throw new Error("Unsupported resource manifest");
  const ids = new Set(), paths = new Set();
  const stages = new Set(["intake","design","discovery","bindings","styling","validation","pixso"]);
  if (!Array.isArray(source.resources) || !Array.isArray(source.documents)) throw new Error("Resource manifest needs resources/documents arrays");
  for (const row of source.resources) {
    if (!/^[a-z][a-z0-9.-]+$/.test(row.id || "") || row.id.startsWith("component.")) throw new Error("Invalid or reserved resource ID: " + row.id);
    if (typeof row.purpose !== "string" || !row.purpose.trim() || typeof row.path !== "string") throw new Error("Missing purpose/path for " + row.id);
    if (!Array.isArray(row.stage) || row.stage.some((s) => !stages.has(s)) || new Set(row.stage).size !== row.stage.length) throw new Error("Invalid resource stage: " + row.id);
    if (!Array.isArray(row.requires) || row.requires.some((v)=>typeof v!=="string") || new Set(row.requires).size!==row.requires.length) throw new Error("Invalid resource dependencies: " + row.id);
    if (!row.appliesTo || Array.isArray(row.appliesTo) || typeof row.appliesTo!=="object" || Object.values(row.appliesTo).some((v)=>!Array.isArray(v)||v.some((s)=>typeof s!=="string"))) throw new Error("Invalid resource selectors: " + row.id);
    if (ids.has(row.id)) throw new Error("Duplicate resource ID: " + row.id);
    if (paths.has(row.path)) throw new Error("Duplicate resource path: " + row.path);
    paths.add(row.path);
    ids.add(row.id);
    localFile(root, row.path);
  }
  for (const [alias,target] of Object.entries(source.aliases || {})) {
    if (ids.has(alias) || !ids.has(target) || alias === target) throw new Error("Invalid resource alias: " + alias);
  }
  const componentIds = new Set(fs.readdirSync(path.join(root,"packages/component-contracts/src/components")).filter(f=>f.endsWith(".json")).map(f=>f.slice(0,-5)));
  for (const row of source.resources) for (const id of row.appliesTo.components || []) {
    if (id !== "*" && !componentIds.has(id)) throw new Error("Noncanonical component selector: " + row.id + " -> " + id);
  }
  const active = new Set(), done = new Set();
  const visit = (id) => {
    if (!ids.has(id)) throw new Error("Missing resource dependency: " + id);
    if (active.has(id)) throw new Error("Resource dependency cycle: " + id);
    if (done.has(id)) return;
    active.add(id);
    source.resources.find((row) => row.id === id).requires.forEach(visit);
    active.delete(id); done.add(id);
  };
  ids.forEach(visit);
  for (const doc of source.documents) for (const id of doc.parts) {
    if (!ids.has(id)) throw new Error("Missing aggregate part: " + id);
  }
  return source;
}
export function aggregateText(root, source, doc) {
  return doc.parts.map((id) => fs.readFileSync(localFile(root, source.resources.find((row) => row.id === id).path), "utf8")).join("");
}
export function makeResourceIndex(root, source = resourceSource(root)) {
  const inputs = new Set([sourceFile, "skill-profile.json", "references/resources/source.schema.json", "scripts/resource-index-lib.mjs", "scripts/stage-context-lib.mjs", "scripts/query-resources.mjs", "scripts/build-resource-index.mjs", "references/resource-workflow.md", "packages/component-contracts/src/registry.json",
    "references/index/capability-aliases.source.json", "references/index/task-routes.source.json", "references/routes/index.json", "references/routes/materials.source.json", "references/components/component-selection-rules.json",
    "references/components/component-readiness-policy.json", "assets/design-system/pattern-contracts.json",
    "packages/tokens/src/token-runtime-map.json"]);
  const profile=read(localFile(root,"skill-profile.json"));
  if(profile.kind==="pixso")inputs.add("assets/design-system/mapping-registry.json");
  const resources = source.resources.map((row) => {
    inputs.add(row.path);
    const bytes = fs.readFileSync(localFile(root, row.path));
    return { ...row, bytes: bytes.length, sha256: hash(bytes), kind: "document" };
  });
  const registry = read(localFile(root, "packages/component-contracts/src/registry.json"));
  const contracts = fs.readdirSync(path.join(root, "packages/component-contracts/src/components")).filter((f) => f.endsWith(".json")).sort();
  for (const filename of contracts) {
    const relative = "packages/component-contracts/src/components/" + filename;
    const bytes = fs.readFileSync(localFile(root, relative)); const contract = JSON.parse(bytes);
    inputs.add(relative);
    resources.push({ id: "component." + contract.id, kind: "component", purpose: contract.logicalName,
      path: relative, stage: ["discovery", "bindings"], appliesTo: { components: [contract.id] },
      requires: ["core.delivery"], bytes: bytes.length, sha256: hash(bytes) });
  }
  if (contracts.length !== registry.componentCount) throw new Error("Component registry count drift");
  for (const filename of fs.readdirSync(path.join(root, "packages/tokens/src")).filter((f) => f.endsWith(".css")).sort()) inputs.add("packages/tokens/src/" + filename);
  for (const doc of source.documents) {
    const actual = fs.readFileSync(localFile(root, doc.path), "utf8");
    if (actual !== aggregateText(root, source, doc)) throw new Error("Compatibility aggregate drift: " + doc.path + "; run resources:build, edit its resource parts");
    inputs.add(doc.path);
  }
  const sources = [...inputs].sort().map((file) => ({ path: file, sha256: hash(fs.readFileSync(localFile(root, file))) }));
  return { schemaVersion: 1, kind: "text-to-ui-resource-index", policy: "Machine index; query projections only. Edit resource fragments and rebuild, never edit compatibility aggregates.",
    digest: hash(json(sources)), aliases: source.aliases || {}, sources, resources };
}
export function loadResourceIndex(root) {
  const index = read(localFile(root, indexFile));
  if (index.schemaVersion !== 1 || index.kind !== "text-to-ui-resource-index") throw new Error("Unsupported resource index");
  for (const source of index.sources) {
    if (hash(fs.readFileSync(localFile(root, source.path))) !== source.sha256) throw new Error("Stale resource index: " + source.path + "; run resources:build then catalog:build and index:build");
  }
  // Recompute metadata as well: editing the generated index cannot silently change resource resolution.
  const fresh = makeResourceIndex(root);
  if (json(fresh) !== json(index)) throw new Error("Resource index metadata drift; run resources:build");
  return index;
}
