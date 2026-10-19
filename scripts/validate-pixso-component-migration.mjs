#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(scriptDir, "..");
const designSystemDir = path.join(skillDir, "assets", "design-system");
const migrationPath = path.join(designSystemDir, "pixso-component-migration.json");
const adapterPath = path.join(designSystemDir, "harmonyos-component-adapter-map.json");
const registryPath = path.join(designSystemDir, "pixso-component-registry.json");

const migration = JSON.parse(fs.readFileSync(migrationPath, "utf8"));
const adapter = JSON.parse(fs.readFileSync(adapterPath, "utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const registered = new Set(Object.values(registry.categories).flat());
const failures = [];

if (migration.schemaVersion !== 1) failures.push("schemaVersion must equal 1");
if (migration.library !== registry.library) {
  failures.push("migration library must match the component registry");
}
if (migration.nativeSource?.adapterMap !== "assets/design-system/harmonyos-component-adapter-map.json") {
  failures.push("nativeSource.adapterMap must point to the canonical adapter map");
}
if (migration.nativeSource?.origin !== "harmonyos-native") {
  failures.push("nativeSource.origin must be harmonyos-native");
}
if (migration.nativeSource?.deletionAllowed !== false) {
  failures.push("native resources must never be deletion-eligible");
}
if (migration.policy?.nativeDeletionAllowed !== false) {
  failures.push("policy.nativeDeletionAllowed must be false");
}
if (!Array.isArray(migration.takeovers) || !Array.isArray(migration.deletionAllowlist)) {
  failures.push("takeovers and deletionAllowlist must be arrays");
}

const adapterTargets = new Set((adapter.adapters ?? []).map((entry) => entry.target));
for (const target of adapterTargets) {
  if (!registered.has(target)) {
    failures.push(`adapter target is not registered: ${target}`);
  }
}

const allowlist = new Set(migration.deletionAllowlist ?? []);
if (allowlist.size !== (migration.deletionAllowlist ?? []).length) {
  failures.push("deletionAllowlist contains duplicates");
}

for (const [index, takeover] of (migration.takeovers ?? []).entries()) {
  if (!registered.has(takeover.logicalName)) {
    failures.push(`takeovers[${index}] uses an unregistered component`);
  }
  if (!["harmonyos-native", "text-to-ui-generated"].includes(takeover.origin)) {
    failures.push(`takeovers[${index}].origin is invalid`);
  }
  if (takeover.origin === "harmonyos-native" && takeover.deletionAllowed !== false) {
    failures.push(`native takeover cannot allow deletion: ${takeover.logicalName}`);
  }
  if (takeover.origin === "text-to-ui-generated" && takeover.status === "superseded") {
    if (!allowlist.has(takeover.logicalName)) {
      failures.push(`superseded generated component is not allowlisted: ${takeover.logicalName}`);
    }
    if (takeover.liveInstanceCount !== 0 || takeover.guidReadFresh !== true) {
      failures.push(
        `superseded generated component lacks zero-instance/fresh-GUID proof: ${takeover.logicalName}`,
      );
    }
  } else if (allowlist.has(takeover.logicalName)) {
    failures.push(`non-superseded component is deletion-allowlisted: ${takeover.logicalName}`);
  }
}

for (const name of allowlist) {
  if (!(migration.takeovers ?? []).some((entry) => entry.logicalName === name)) {
    failures.push(`deletionAllowlist entry has no takeover record: ${name}`);
  }
}

if (failures.length > 0) {
  console.error("Pixso component migration invalid:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `Pixso component migration valid: ${adapterTargets.size} native adapter targets, ` +
    `${migration.takeovers.length} takeovers, ${migration.deletionAllowlist.length} deletion entries.`,
);
