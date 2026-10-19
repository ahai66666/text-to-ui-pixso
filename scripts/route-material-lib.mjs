import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const routeMaterialSourcePath = (skillRoot) => path.join(skillRoot, 'references/routes/materials.source.json');
export const workflowRouteSourcePath = (skillRoot) => path.join(skillRoot, 'references/routes/index.json');
export const generatedRouteMaterialPath = (skillRoot) => path.join(skillRoot, 'references/index/generated/route-material-index.json');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const sha256File = (file) => sha256(fs.readFileSync(file));
export const stableDigest = (value) => sha256(JSON.stringify(value));

export function readRouteMaterialSource(skillRoot) {
  return JSON.parse(fs.readFileSync(routeMaterialSourcePath(skillRoot), 'utf8'));
}

export function repoPathForMaterial(repo, materialPath) {
  return path.join(repo, materialPath);
}

function normalizeRepoPath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '');
}

export function materialPathFromSkillReference(reference) {
  const normalized = normalizeRepoPath(reference).split('#')[0];
  return normalized.startsWith('skill-support/') ? normalized : `skill-support/${normalized}`;
}

export function dedupeMaterials(materials) {
  const byPath = new Map();
  for (const material of materials) {
    const pathValue = normalizeRepoPath(material.path);
    const current = byPath.get(pathValue);
    byPath.set(pathValue, {
      ...(current ?? {}),
      ...material,
      path: pathValue,
      role: material.role ?? current?.role ?? 'reference',
      required: material.required ?? current?.required ?? true
    });
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function materialDefinitions({ skillRoot, routeId, workflowRoute, extraMaterials = [] }) {
  const source = readRouteMaterialSource(skillRoot);
  const route = source.routes?.[routeId];
  if (!route) throw new Error(`Route material manifest is missing route '${routeId}'`);
  const base = source.baseMaterials ?? [];
  const routeMaterials = route.materials ?? [];
  const exactRouteReferences = (workflowRoute?.exactReferencesToRead ?? []).map((entry) => ({
    path: materialPathFromSkillReference(entry),
    role: 'route-reference'
  }));
  return dedupeMaterials([...base, ...routeMaterials, ...exactRouteReferences, ...extraMaterials]);
}

function materialFileCandidates({ repo, skillRoot, materialPath }) {
  const relative = normalizeRepoPath(materialPath).split('#')[0];
  const candidates = [];
  if (skillRoot && relative.startsWith('skill-support/')) {
    candidates.push(path.join(skillRoot, relative.slice('skill-support/'.length)));
  }
  if (skillRoot && relative.startsWith('packages/component-contracts/src/components/')) {
    candidates.push(path.join(skillRoot, relative));
  }
  candidates.push(repoPathForMaterial(repo, relative));
  if (skillRoot) candidates.push(path.join(skillRoot, relative));
  return [...new Set(candidates.map(candidate => path.resolve(candidate)))];
}

export function materialSnapshot({ repo, skillRoot = null, definitions }) {
  const missing = [];
  const materials = definitions.map((definition) => {
    const candidates = materialFileCandidates({ repo, skillRoot, materialPath: definition.path });
    const absolute = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? candidates[0];
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      missing.push(definition.path);
      return { ...definition, absolute, sha256: null };
    }
    return { ...definition, absolute, sha256: sha256File(absolute) };
  });
  if (missing.length) throw new Error(`Route materials are missing:\n${missing.join('\n')}`);
  const digest = stableDigest(materials.map(({ path: materialPath, role, required, sha256: digestValue }) => ({ path: materialPath, role, required, sha256: digestValue })));
  return { materials, digest };
}

export function routeMaterialIndexDigest(index) {
  return stableDigest({
    schemaVersion: index.schemaVersion,
    kind: index.kind,
    routes: index.routes
  });
}

export function readGeneratedRouteMaterialIndex(skillRoot) {
  const file = generatedRouteMaterialPath(skillRoot);
  if (!fs.existsSync(file)) throw new Error('Route material index has not been built. Run pnpm index:build.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function assertRouteMaterialSourceFresh({ repo, skillRoot, index }) {
  const source = readRouteMaterialSource(skillRoot);
  const sourceDigest = sha256File(routeMaterialSourcePath(skillRoot));
  const expected = index.generatedFrom?.find((entry) => entry.path === 'skill-support/references/routes/materials.source.json')?.sha256;
  if (sourceDigest !== expected) throw new Error('Route material index is stale. Run pnpm index:build before routing.');
  const workflowDigest = sha256File(workflowRouteSourcePath(skillRoot));
  const expectedWorkflow = index.generatedFrom?.find((entry) => entry.path === 'skill-support/references/routes/index.json')?.sha256;
  if (workflowDigest !== expectedWorkflow) throw new Error('Workflow route index is stale. Run pnpm index:build before routing.');
  if (!source.routes || !Object.keys(source.routes).length) throw new Error('Route material manifest has no routes.');
  return index;
}

export function verifyMaterialSnapshot({ repo, skillRoot = null, materials, digest }) {
  const definitions = materials.map(({ path: materialPath, role, required }) => ({ path: materialPath, role, required }));
  const current = materialSnapshot({ repo, skillRoot, definitions });
  if (current.digest !== digest) throw new Error(`Route material snapshot is stale; expected ${digest}, got ${current.digest}.`);
  return current;
}

export function writeReadReceipt({ output, routeId, routeDigest, snapshot, reader = 'text-to-ui-route-resolver' }) {
  const receipt = {
    schemaVersion: 1,
    kind: 'text-to-ui-route-read-receipt',
    routeId,
    routeDigest,
    generatedAt: new Date().toISOString(),
    reader,
    materialsDigest: snapshot.digest,
    materials: snapshot.materials.map(({ path: materialPath, role, required, sha256: digest }) => ({ path: materialPath, role, required, sha256: digest }))
  };
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function writeContextReadReceipt({ output, workflowRouteId, routeDigest, snapshot, reader = 'text-to-ui-context-resolver' }) {
  const receipt = {
    schemaVersion: 1,
    kind: 'text-to-ui-context-material-receipt',
    workflowRouteId,
    routeDigest,
    generatedAt: new Date().toISOString(),
    reader,
    materialsDigest: snapshot.digest,
    materials: snapshot.materials.map(({ path: materialPath, role, required, sha256: digest }) => ({ path: materialPath, role, required, sha256: digest }))
  };
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
