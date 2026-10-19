import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const remote = value => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
export function inspectHtmlArtifact(artifact, { projectRoot = path.dirname(path.resolve(artifact)) } = {}) {
  const root = path.resolve(projectRoot), realRoot = fs.realpathSync(root);
  const visited = new Map(), modules = new Set(), styles = new Set();
  const visitReference = (from, reference, moduleImport = false) => {
    if (!reference || remote(reference)) return;
    if (moduleImport && !reference.startsWith(".") && !reference.startsWith("/")) throw new Error("Unbundled package import in delivery artifact: " + reference);
    const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (!clean) return;
    visit(clean.startsWith("/") ? path.resolve(root, "." + clean) : path.resolve(path.dirname(from), clean));
  };
  const visit = file => {
    file = path.resolve(file);
    if (!file.startsWith(root + path.sep)) throw new Error("Artifact dependency escapes project: " + file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error("Artifact dependency missing: " + file);
    if (!fs.realpathSync(file).startsWith(realRoot + path.sep)) throw new Error("Artifact dependency symlink escapes project: " + file);
    if (visited.has(file)) return;
    const bytes = fs.readFileSync(file), ext = path.extname(file).toLowerCase();
    visited.set(file, { file, sha256: sha(bytes), bytes: bytes.length });
    if (ext === ".css") styles.add(file);
    if ([".js", ".mjs"].includes(ext)) modules.add(file);
    if (![".html", ".css", ".js", ".mjs"].includes(ext)) return;
    const text = bytes.toString("utf8");
    if (ext === ".html") {
      for (const m of text.matchAll(/<(?:script|link|img|source|video|audio|object)\b[^>]*?\b(?:src|href|poster|data)\s*=\s*["']([^"']+)["']/gi)) visitReference(file, m[1]);
    } else if (ext === ".css") {
      for (const m of text.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']|url\(\s*["']?([^"')\s]+)["']?\s*\)/gi)) visitReference(file, m[1] || m[2]);
    } else {
      for (const m of text.matchAll(/^\s*(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"'\n]+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/gm)) visitReference(file, m[1] || m[2], true);
    }
  };
  visit(path.resolve(artifact));
  const records = [...visited.values()].sort((a,b) => a.file.localeCompare(b.file));
  return { files: records, modules: [...modules].sort(), stylesheets: [...styles].sort(), digest: sha(JSON.stringify(records.map(({file,...row}) => ({path:path.relative(root,file).split(path.sep).join("/"),...row})))) };
}
