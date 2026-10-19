import fs from "node:fs";
import path from "node:path";

// Keep this helper self-contained. The installed Skill contains the generated
// component index and policy, but it does not contain the repository's
// packages/ tree. Importing readiness logic through ../../packages works in
// the monorepo and breaks when the Skill is invoked from another project.
export function resolveComponentReadiness(component, policy) {
  if (!component?.logicalName) throw new Error("component readiness requires a canonical component");
  const requiredDimensions = policy.requiredDimensions ?? [];
  const unresolvedDimensions = requiredDimensions.filter((dimension) => component.readiness?.[dimension] !== true);
  const override = (policy.overrides ?? []).find((entry) => entry.logicalName === component.logicalName || entry.id === component.id);
  let level;
  let reason;
  if (override) {
    if (!policy.levels?.[override.level]) throw new Error(`invalid readiness override level for ${component.logicalName}: ${override.level}`);
    if (override.level === "approved" && (!override.evidence || String(override.evidence).trim().length === 0)) {
      throw new Error(`approved readiness override requires evidence: ${component.logicalName}`);
    }
    level = override.level;
    reason = override.reason || "Explicit component readiness override.";
  } else if (unresolvedDimensions.length === 0) {
    level = "approved";
    reason = "All required readiness dimensions are verified.";
  } else if (component.readiness?.sourceReady === true && component.readiness?.contractReady === true) {
    level = "provisional";
    reason = `Usable for preview; unresolved parity: ${unresolvedDimensions.join(", ")}.`;
  } else {
    level = "blocked";
    reason = `Unavailable readiness foundation: ${unresolvedDimensions.join(", ")}.`;
  }
  const allowedStages = policy.levels[level]?.allowedStages ?? [];
  return {
    level,
    reason,
    unresolvedDimensions,
    allowedStages,
    allowedInFastPreview: allowedStages.includes("fast-preview"),
    allowedInRelease: allowedStages.includes("release"),
    override: override ? { reason: override.reason ?? null, evidence: override.evidence ?? null } : null
  };
}

export const readinessStages = ["fast-preview", "release"];

export function loadReadinessPolicy(skillRoot) {
  const file = path.join(skillRoot, "references/components/component-readiness-policy.json");
  const policy = JSON.parse(fs.readFileSync(file, "utf8"));
  if (policy.schemaVersion !== 1) throw new Error("component readiness policy schemaVersion must equal 1");
  return policy;
}

export function assertReadinessStage(stage) {
  if (!readinessStages.includes(stage)) throw new Error(`readiness stage must be one of: ${readinessStages.join(", ")}`);
}
