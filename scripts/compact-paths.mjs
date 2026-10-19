import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const compactRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export function servicePaths(env = process.env) {
  const full = env.TEXT_TO_UI_FULL_REPOSITORY || env.TEXT_TO_UI_MONOREPO;
  const repository = compactRoot;
  const gallery = env.TEXT_TO_UI_GALLERY_ROOT ? path.resolve(env.TEXT_TO_UI_GALLERY_ROOT) : full ? path.join(path.resolve(full),"apps/component-gallery") : null;
  return {skillRoot:compactRoot,repository,gallery,bridgeState:path.resolve(env.TEXT_TO_UI_PIXSO_BRIDGE_STATE_DIR||path.join(compactRoot,".text-to-ui/pixso-bridge"))};
}
export function maintenanceSource(root=compactRoot) {
  if(!fs.existsSync(path.join(root,"SKILL.md")))throw new Error("Independent skill root is missing SKILL.md");
  return path.resolve(root);
}
