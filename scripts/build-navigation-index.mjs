#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  generatedIndexDir, locateMonorepo, parseArgs, readJson, resolveSkillRoot,
  sha256File, stableJson
} from './navigation-index-lib.mjs';
import { materialDefinitions, materialSnapshot, routeMaterialIndexDigest } from './route-material-lib.mjs';
import { buildComponentRouteIndex } from './component-route-index.mjs';

const args = parseArgs(process.argv.slice(2));
const located = locateMonorepo({ start: args.start || process.cwd(), explicitRepo: args.repo });
if (!located.root) throw new Error(`Text-to-UI Monorepo not found. Tried:\n${located.attempted.join('\n')}`);
const repo = located.root;
const skillRoot = resolveSkillRoot(repo, args['skill-root']);
const indexRoot = path.join(skillRoot, 'references', 'index');
const outputRoot = generatedIndexDir(skillRoot);
const bundledContractsRoot = path.join(skillRoot, 'packages/component-contracts/src');
const bundledRegistryPath = path.join(bundledContractsRoot, 'components.json');
const bundledRegistryMetadataPath = path.join(bundledContractsRoot, 'registry.json');
const useBundledRegistry = fs.existsSync(bundledRegistryPath) && fs.existsSync(bundledRegistryMetadataPath);

const sources = {
  components: path.join(repo, 'packages/component-contracts/src/components.json'),
  tokens: path.join(repo, 'packages/tokens/src/token-runtime-map.json'),
  packages: path.join(repo, 'package.json'),
  tasks: path.join(indexRoot, 'task-routes.source.json'),
  layouts: path.join(indexRoot, 'layout-routes.source.json'),
  workflowRoutes: path.join(skillRoot, 'references', 'routes', 'index.json'),
  routeMaterials: path.join(skillRoot, 'references', 'routes', 'materials.source.json'),
  patterns: path.join(skillRoot, 'assets', 'design-system', 'pattern-contracts.json'),
  aliases: path.join(indexRoot, 'capability-aliases.source.json')
};
const skillRelativeEvidence = new Set(['tasks', 'layouts', 'workflowRoutes', 'routeMaterials', 'patterns', 'aliases']);
const sourceEvidence = Object.fromEntries(Object.entries(sources).map(([key, file]) => [key, {
  path: skillRelativeEvidence.has(key)
    ? path.posix.join('skill-support', path.relative(skillRoot, file).split(path.sep).join('/'))
    : path.relative(repo, file).split(path.sep).join('/'),
  sha256: sha256File(file)
}]));
const componentRegistryEvidence = useBundledRegistry
  ? { path: 'packages/component-contracts/src/registry.json', sha256: sha256File(bundledRegistryMetadataPath) }
  : sourceEvidence.components;

const tokenMap = readJson(sources.tokens);
const packageJson = readJson(sources.packages);
const taskSource = readJson(sources.tasks);
const layoutSource = readJson(sources.layouts);
const workflowRouteSource = readJson(sources.workflowRoutes);
const routeMaterialSource = readJson(sources.routeMaterials);
const patternSource = readJson(sources.patterns);

const taskRouter = {
  schemaVersion: 1,
  generatedFrom: [sourceEvidence.tasks, componentRegistryEvidence, sourceEvidence.layouts],
  policy: {
    lookupOrder: ['exact-task-route', 'complete-alias-or-domain-phrase', 'unambiguous-complete-word', 'explicit-pattern-for-unknown-task', 'layout', 'components', 'exact-contract'],
    normalizeBeforeMatch: ['unicode-nfkc', 'lowercase', 'punctuation-to-space'],
    ambiguityPolicy: 'stop-and-list-candidate-route-ids; --task-route explicitly selects among matching candidates',
    componentSourceOrder: ['real-html-component', 'matching-contract', 'token-based-custom'],
    exactContractReadRequiredAfterSelection: true
  },
  routes: taskSource.routes
};
const layoutIndex = {
  schemaVersion: 1,
  generatedFrom: [sourceEvidence.patterns, sourceEvidence.layouts, { path: 'skill-support/references/harmonyos-layout-patterns.md', sha256: sha256File(fs.existsSync(path.join(skillRoot,'references/harmonyos-layout-patterns.md')) ? path.join(skillRoot,'references/harmonyos-layout-patterns.md') : path.join(skillRoot,'skill-profile.json')) }],
  authority: 'assets/design-system/pattern-contracts.json',
  layouts: layoutSource.layouts.map((layout) => ({
    ...layout,
    contract: patternSource.patterns.find((pattern) => pattern.id === layout.id)
  }))
};
const componentIndex = buildComponentRouteIndex(skillRoot);
const tokenIndex = {
  schemaVersion: 1,
  generatedFrom: [sourceEvidence.tokens],
  policy: tokenMap.policy,
  semanticRoles: tokenMap.semanticRoles,
  collections: Object.fromEntries(Object.entries(tokenMap.mappings.reduce((groups, item) => {
    (groups[item.pixsoCollection] ||= []).push({
      role: Object.entries(tokenMap.semanticRoles).find(([, value]) => value.cssVariable === item.cssVariable)?.[0] || null,
      cssVariable: item.cssVariable,
      pixsoVariable: item.pixsoVariable,
      value: item.resolvedCssValue,
      sourceToken: item.sourceToken
    });
    return groups;
  }, {})).map(([key, value]) => [key, value]))
};
const validationIndex = {
  schemaVersion: 1,
  generatedFrom: [sourceEvidence.packages],
  modes: {
    'fast-preview': {
      purpose: 'Reach the first browser-visible interactive page after blocking checks only.',
      commands: ['pnpm resources:check', 'pnpm index:check', 'node <RULES_ROOT>/scripts/validate-page-project.mjs --project <PROJECT_DIR> --skill-root <RULES_ROOT> --mode fast-preview'],
      requiredEvidence: ['context-packet.json', 'layout-contract.json', 'page-blueprint.json', 'page-content-recipes.json', 'page-bindings.json', 'styles/style-manifest.json', 'component-usage.json', 'build-or-open-success', 'target-viewport', 'primary-path-operable']
    },
    'release-validation': {
      purpose: 'Run complete repository and delivery validation after visible direction approval.',
      commands: ['pnpm resources:check', 'pnpm index:check', 'node <RULES_ROOT>/scripts/validate-page-project.mjs --project <PROJECT_DIR> --skill-root <RULES_ROOT> --mode release-validation --runtime-evidence <RUNTIME_EVIDENCE>'],
      requiredEvidence: ['direction-approval', 'full-validation-report', 'final-browser-review']
    }
  },
  availablePackageScripts: (() => {
    const removed = new Set(['page:generate:test', 'components:titlebar:test', 'components:search:test']);
    const scripts = Object.fromEntries(Object.entries(packageJson.scripts).filter(([name]) => !name.startsWith('frameworks:') && !removed.has(name)));
    if (scripts.test) scripts.test = scripts.test.split(' && ').filter((command) => {
      const name = command.replace(/^pnpm /, '');
      return !name.startsWith('frameworks:') && !removed.has(name);
    }).join(' && ');
    return scripts;
  })()
};
const workflowRouteIndex = {
  schemaVersion: 1,
  generatedFrom: [sourceEvidence.workflowRoutes],
  kind: workflowRouteSource.kind,
  routes: Object.entries(workflowRouteSource.routes ?? {}).map(([id, route]) => ({ id, ...route }))
};
const routeMaterialIndex = {
  schemaVersion: 1,
  kind: routeMaterialSource.kind,
  generatedFrom: [sourceEvidence.routeMaterials, sourceEvidence.workflowRoutes],
  policy: {
    canonicalRoot: 'skill-support',
    pathBasis: 'repository-relative',
    missingMaterialIsBlocking: true,
    staleSnapshotIsBlocking: true
  },
  routes: Object.fromEntries(Object.entries(workflowRouteSource.routes ?? {}).map(([id, workflowRoute]) => {
    const definitions = materialDefinitions({
      skillRoot,
      routeId: id,
      workflowRoute,
    });
    const snapshot = materialSnapshot({ repo, skillRoot, definitions });
    return [id, {
      id,
      dynamicMaterials: routeMaterialSource.routes?.[id]?.dynamicMaterials ?? [],
      materialsDigest: snapshot.digest,
      materials: snapshot.materials.map(({ path: materialPath, role, required, sha256 }) => ({ path: materialPath, role, required, sha256 }))
    }];
  }))
};
routeMaterialIndex.indexDigest = routeMaterialIndexDigest(routeMaterialIndex);

const outputs = {
  'task-router.json': taskRouter,
  'layout-index.json': layoutIndex,
  'component-index.json': componentIndex,
  'token-index.json': tokenIndex,
  'validation-index.json': validationIndex
  , 'workflow-route-index.json': workflowRouteIndex
  , 'route-material-index.json': routeMaterialIndex
};
let drift = false;
for (const [name, value] of Object.entries(outputs)) {
  const file = path.join(outputRoot, name);
  const expected = stableJson(value);
  if (args.check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== expected) {
      console.error(`Navigation index drift: ${path.relative(repo, file)}`);
      drift = true;
    }
  } else {
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(file, expected);
    console.log(`Generated ${path.relative(repo, file)}`);
    const deliveryMirror = path.join(repo, 'skill', 'references', 'index', 'generated', name);
    if (skillRoot === path.join(repo, 'skill-support') && fs.existsSync(path.join(repo, 'skill'))) {
      fs.mkdirSync(path.dirname(deliveryMirror), { recursive: true });
      fs.writeFileSync(deliveryMirror, expected);
      console.log(`Synced ${path.relative(repo, deliveryMirror)}`);
    }
  }
}
if (drift) process.exitCode = 1;
