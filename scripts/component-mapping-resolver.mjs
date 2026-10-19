import { iconColorSourceForMapping } from "./mapping-registry-lib.mjs";

export function resolveComponentVariant(binding, { htmlVariant = "default", props = {}, state = null, surface = null } = {}) {
  const resolved = {
    ...(binding?.variant ?? {}),
    ...(binding?.variantByHtml?.[String(htmlVariant).toLowerCase()] ?? {}),
  };
  const values = {
    ...props,
    state: props.state ?? state,
    surface: props.surface ?? surface,
  };
  for (const [propName, variants] of Object.entries(binding?.variantByProp ?? {})) {
    const value = values[propName];
    if (value === undefined || value === null || value === "") continue;
    Object.assign(resolved, variants?.[String(value).toLowerCase()] ?? {});
  }
  return resolved;
}

// Canonical bindings and declared aliases are normalized once, without reading projections.
export function resolveComponentBindings(mappingProfile) {
  const compatibilityBindings = mappingProfile.componentAliases ?? [];
  const map = new Map();
  const selectorMap = new Map();
  const formalNames = new Set((mappingProfile.componentMappings ?? []).map(entry => entry.htmlLogicalName));
  for (const entry of compatibilityBindings) {
    if (!entry.logicalName || formalNames.has(entry.logicalName) || map.has(entry.logicalName)) {
      throw new Error(`Duplicate or invalid component alias: ${entry.logicalName}`);
    }
    map.set(entry.logicalName, { ...entry });
  }
  // Native source mappings carry the authoritative component identity and
  // Variant contract. Visual colors remain owned by the Pixso Variant and
  // are never promoted to a page Instance override here.
  const nativeSourceByTarget = new Map(
    (mappingProfile.nativeSourceMappings ?? [])
      .map((mapping) => [mapping.targetHtmlLogicalName ?? mapping.target, mapping])
      .filter(([target]) => target),
  );
  for (const binding of mappingProfile.componentMappings ?? []) {
    const existing = map.get(binding.htmlLogicalName) || {};
    const runtime = binding.runtimeBinding || {};

    const effective = {
      ...existing,
      ...runtime,
      logicalName: binding.htmlLogicalName,
      pixsoSpecKey: binding.pixsoSpecKey ?? existing.pixsoSpecKey ?? null,
    };
    if (!effective.rendererKey && binding.htmlRendererKey) {
      effective.rendererKey = binding.htmlRendererKey;
    }
    if (!runtime.availability && !existing.availability) {
      effective.availability = "native-only";
    }
    if (binding.pixsoTargetStatus === "pending-review") {
      // Preserve the desired symbolic name for repair, but never create a
      // stale Instance while a complete Pixso snapshot says it is absent.
      effective.availability = "pending-review";
      effective.pixsoName = null;
      effective.componentSetName = null;
      effective.mappingReason = binding.pixsoMappingReason ?? "Pixso target needs review";
    } else if (binding.pixsoTargetStatus === "unregistered") {
      effective.availability = binding.pixsoMappingPolicy === "excluded" ? "excluded" : "blocked";
      effective.pixsoName = null;
      effective.componentSetName = null;
      if (binding.pixsoMappingPolicy === "excluded") {
        effective.mappingReason = binding.pixsoMappingReason;
      }
    }
    map.set(binding.htmlLogicalName, effective);
    for (const submapping of binding.subcomponentMappings ?? []) {
      if (!submapping.htmlLogicalName || !submapping.pixsoTarget) continue;
      // The Titlebar control group uses the registered Pixso `control button`
      // component; semantic actions select its authored child layers.
      const runtime = submapping.runtimeBinding ?? {};
      map.set(submapping.htmlLogicalName, {
        logicalName: submapping.htmlLogicalName,
        rendererKey: runtime.rendererKey ?? submapping.htmlRole,
        pixsoName: runtime.pixsoName ?? submapping.pixsoTarget,
        componentSetName: runtime.componentSetName ?? submapping.pixsoTarget,
        availability: runtime.availability ?? "mapped",
        variant: runtime.variant ?? submapping.variantByHtmlSize?.medium ?? {},
        ...(iconColorSourceForMapping({ ...runtime, supportedSlots: runtime.supportedSlots ?? submapping.supportedSlots })
          ? { iconColorSource: "variant-content" }
          : {}),
        mappingSource: "subcomponent",
      });
      selectorMap.set(submapping.htmlSelector, submapping.htmlLogicalName);
    }
  }
  // Apply current library identity once for both formal components and aliases.
  // An explicitly unregistered component must never be revived by source facts.
  for (const [logicalName, existing] of map.entries()) {
    const nativeSource = nativeSourceByTarget.get(logicalName);
    const sourceComponentSet = nativeSource?.source?.componentSet;
    const sourceVariant = nativeSource?.pixsoVariant;
    const enriched = sourceComponentSet && !["blocked", "excluded", "pending-review"].includes(existing.availability)
      ? {
        ...existing,
        pixsoName: sourceComponentSet,
        componentSetName: sourceComponentSet,
        ...(sourceVariant ? { variant: { ...(existing.variant ?? {}), ...sourceVariant } } : {}),
      }
      : existing;
    // Keep the live component identity in the runtime projection. A source
    // content token is audit data, not permission to recolor a page Instance.
    const iconColorSource = iconColorSourceForMapping(enriched);
    const withIconColorPolicy = iconColorSource ? { ...enriched, iconColorSource } : enriched;
    if (withIconColorPolicy !== existing) map.set(logicalName, withIconColorPolicy);
  }
  return { map, selectorMap, mappings: [...map.values()] };
}
