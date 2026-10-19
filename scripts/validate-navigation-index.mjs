#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findComponent, generatedIndexDir, loadIndexes, locateMonorepo, parseArgs, resolveSkillRoot } from './navigation-index-lib.mjs';
import { materialSnapshot, routeMaterialIndexDigest } from './route-material-lib.mjs';

const args = parseArgs(process.argv.slice(2));
const located = locateMonorepo({ start: args.start || process.cwd(), explicitRepo: args.repo });
if (!located.root) throw new Error('Text-to-UI Monorepo not found');
const repo = located.root;
const skillRoot = resolveSkillRoot(repo, args['skill-root']);
const componentIndexCheck = spawnSync(process.execPath, [path.join(skillRoot, 'scripts/build-component-route-index.mjs'), '--check'], { stdio: 'inherit' });
if (componentIndexCheck.status !== 0) process.exit(componentIndexCheck.status || 1);
const indexes = loadIndexes(skillRoot);
const errors = [];
for (const route of indexes['task-router'].routes) {
  if (!indexes['layout-index'].layouts.some((layout) => layout.id === route.layout)) errors.push(`${route.id}: missing layout ${route.layout}`);
  if (route.domainReference) {
    const resolvedReference = path.resolve(skillRoot, route.domainReference);
    if (!route.domainReference.startsWith('references/') || !resolvedReference.startsWith(`${path.resolve(skillRoot)}${path.sep}`) || !fs.existsSync(resolvedReference)) {
      errors.push(`${route.id}: invalid or missing task-route domain reference ${route.domainReference}`);
    }
  }
  for (const capability of route.requiredCapabilities) {
    try {
      if (!findComponent(indexes['component-index'], capability)) errors.push(`${route.id}: missing required capability ${capability}`);
    } catch (error) {
      errors.push(`${route.id}: ${error.message}`);
    }
  }
  for (const capability of route.optionalCapabilities ?? []) {
    try {
      if (!findComponent(indexes['component-index'], capability)) errors.push(`${route.id}: missing optional capability ${capability}`);
    } catch (error) {
      errors.push(`${route.id}: ${error.message}`);
    }
  }
}
for (const route of indexes['workflow-route-index'].routes) {
  if (!route.id || !route.description || !Array.isArray(route.exactReferencesToRead)) errors.push(`workflow route is incomplete: ${route.id ?? 'unknown'}`);
  for (const reference of route.exactReferencesToRead ?? []) if (!fs.existsSync(path.join(skillRoot, reference))) errors.push(`${route.id}: missing workflow reference ${reference}`);
}
const routeMaterialIndex = indexes['route-material-index'];
if (routeMaterialIndex.indexDigest !== routeMaterialIndexDigest(routeMaterialIndex)) errors.push('route-material-index: indexDigest is invalid');
for (const route of Object.values(routeMaterialIndex.routes ?? {})) {
  const workflowRoute = indexes['workflow-route-index'].routes.find((candidate) => candidate.id === route.id);
  if (!workflowRoute) {
    errors.push(`route-material-index: unknown workflow route ${route.id}`);
    continue;
  }
  if (!Array.isArray(route.materials) || route.materials.length === 0) {
    errors.push(`${route.id}: route material list is empty`);
    continue;
  }
  try {
    const snapshot = materialSnapshot({
      repo,
      skillRoot,
      definitions: route.materials.map(({ path: materialPath, role, required }) => ({ path: materialPath, role, required }))
    });
    if (snapshot.digest !== route.materialsDigest) errors.push(`${route.id}: route material hashes are stale`);
    for (const material of route.materials) {
      const current = snapshot.materials.find((entry) => entry.path === material.path);
      if (!current || current.sha256 !== material.sha256) errors.push(`${route.id}: material hash mismatch ${material.path}`);
    }
  } catch (error) {
    errors.push(`${route.id}: ${error.message}`);
  }
}
for (const component of indexes['component-index'].components) {
  const targets = Object.keys(component.frameworks ?? {});
  if (targets.some((target) => target !== 'html')) errors.push(`${component.id}: compact component index supports HTML only`);
  const html = component.frameworks?.html;
  if (JSON.parse(fs.readFileSync(path.join(skillRoot,'skill-profile.json'),'utf8')).kind === 'html' && !html?.exists) errors.push(`${component.id}: HTML source missing (${html?.source ?? 'unresolved'})`);
  if (component.contractPath) {
    const contractPath = path.resolve(skillRoot, component.contractPath);
    const skillBase = `${path.resolve(skillRoot)}${path.sep}`;
    if (!contractPath.startsWith(skillBase) || !fs.existsSync(contractPath)) {
      errors.push(`${component.id}: missing or unsafe contract path ${component.contractPath}`);
    } else {
      try {
        const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
        if (contract.id !== component.id) errors.push(`${component.id}: contract path resolves to '${contract.id}'`);
      } catch (error) {
        errors.push(`${component.id}: invalid contract file ${component.contractPath}: ${error.message}`);
      }
    }
  } else if (indexes['component-index'].sourceRoot === 'skill-root') {
    errors.push(`${component.id}: compact index lacks an exact contract path`);
  }
}
for (const file of fs.readdirSync(generatedIndexDir(skillRoot))) {
  if (!file.endsWith('.json')) continue;
  JSON.parse(fs.readFileSync(path.join(generatedIndexDir(skillRoot), file), 'utf8'));
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Navigation indexes valid: ${indexes['component-index'].componentCount} components, ${indexes['task-router'].routes.length} task routes, ${indexes['workflow-route-index'].routes.length} workflow routes.`);
