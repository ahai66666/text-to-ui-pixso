import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalizedWords = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "");

export function buildComponentRouteIndex(skillRoot) {
  const sourceRoot = path.join(skillRoot, "packages/component-contracts/src");
  const contractsDirectory = path.join(sourceRoot, "components");
  const metadataPath = path.join(sourceRoot, "registry.json");
  const aliasesPath = path.join(skillRoot, "references/index/capability-aliases.source.json");
  if (!fs.existsSync(contractsDirectory) || !fs.existsSync(metadataPath)) {
    throw new Error(`Split component contracts are required under ${sourceRoot}.`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const aliases = JSON.parse(fs.readFileSync(aliasesPath, "utf8")).aliases ?? {};
  const names = fs.readdirSync(contractsDirectory).filter((name) => name.endsWith(".json")).sort();
  const contracts = names.map((name) => {
    const contract = JSON.parse(fs.readFileSync(path.join(contractsDirectory, name), "utf8"));
    if (path.basename(name, ".json") !== contract.id) throw new Error(`${name}: component ID and filename do not match.`);
    return contract;
  });
  const aggregate = {
    schemaVersion: 1,
    contractVersion: metadata.contractVersion,
    components: contracts,
    registryPolicy: metadata.registryPolicy
  };
  if (metadata.sourceDigest !== sha256(`${JSON.stringify(aggregate, null, 2)}\n`)) {
    throw new Error("Split component files changed. Run pnpm components:registry:build before updating the route index.");
  }

  const components = contracts.map((contract) => {
    if (!contract.logicalName) throw new Error(`${contract.id}: logicalName is required.`);
    const capabilities = new Set([contract.id, normalizedWords(contract.logicalName?.split("/")[0])].filter(Boolean));
    for (const [capability, values] of Object.entries(aliases)) {
      if ([capability, ...(Array.isArray(values) ? values : [])].some((value) => value === contract.id || value === normalizedWords(contract.logicalName?.split("/")[0]))) {
        capabilities.add(capability);
      }
    }
    const source = contract.implementations?.html || contract.frameworks?.html?.source || null;
    const contractPath = `packages/component-contracts/src/components/${contract.id}.json`;
    const sourcePath = source?.split("#")[0];
    if ((!sourcePath || !fs.existsSync(path.join(skillRoot, sourcePath))) && JSON.parse(fs.readFileSync(path.join(skillRoot,"skill-profile.json"),"utf8")).kind === "html") {
      throw new Error(`${contract.id}: HTML implementation is missing from the bundled component package.`);
    }
    return {
      id: contract.id,
      logicalName: contract.logicalName,
      capabilities: [...capabilities].sort(),
      contractPath,
      frameworks: { html: { exists: Boolean(sourcePath && fs.existsSync(path.join(skillRoot, sourcePath))) } }
    };
  });
  return {
    schemaVersion: 1,
    generatedFrom: [
      { path: "packages/component-contracts/src/registry.json", sha256: sha256(fs.readFileSync(metadataPath)) },
      { path: "references/index/capability-aliases.source.json", sha256: sha256(fs.readFileSync(aliasesPath)) }
    ],
    contractRoot: "packages/component-contracts/src/components",
    sourceRoot: "skill-root",
    frameworkPackages: { html: "@text-to-ui/components-html" },
    componentCount: components.length,
    components
  };
}

export function stableComponentIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}
