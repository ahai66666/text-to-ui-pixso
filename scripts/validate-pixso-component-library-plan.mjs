#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { parseArgs, readJson } from "./pixso-native-scene-lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.plan) {
  if (!args.help) console.error("Usage: validate-pixso-component-library-plan.mjs --plan <pixso-component-library-plan.json>");
  process.exit(args.help ? 0 : 2);
}
const plan = readJson(path.resolve(args.plan));
const errors = [];
if (plan.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (plan.kind !== "pixso-component-library-plan") errors.push("kind must be pixso-component-library-plan");
if (!plan.execution?.libraryPage) errors.push("library plan must declare execution.libraryPage");
if (plan.execution?.mode !== "component-library") errors.push("execution.mode must be component-library");
if (plan.page?.name !== plan.execution?.libraryPage) errors.push("page.name must match execution.libraryPage");

const operations = plan.operations ?? [];
const ids = new Set(operations.map((operation) => operation.nodeId).filter(Boolean));
for (const operation of operations) {
  if (operation.parentId && !ids.has(operation.parentId)) errors.push(`${operation.nodeId}: missing parent ${operation.parentId}`);
  if (operation.op === "create-component") {
    if (!operation.name) errors.push("component operation is missing exact name");
    if (operation.name !== operation.componentContract?.logicalName) errors.push(`${operation.nodeId}: component name must equal logicalName`);
    if (!operation.componentContract?.sourceEvidence?.html) errors.push(`${operation.name}: missing HTML source evidence`);
    const requiredSlots = new Set(operation.componentContract?.slots ?? []);
    // A component may own a semantic slot through a structural wrapper (the
    // Titlebar label is nested inside its leading slot). Validate the complete
    // component operation tree, not only direct children, so named-slot
    // coverage reflects the actual editable structure.
    const actualSlots = new Set(operations.filter((child) => child.slotName).map((child) => child.slotName));
    for (const slot of requiredSlots) if (!actualSlots.has(slot)) errors.push(`${operation.name}: missing named slot ${slot}`);
  }
  if (operation.slotName && !String(operation.name).startsWith("#")) errors.push(`${operation.nodeId}: named slot layer must use #${operation.slotName}`);
  if (operation.op === "create-icon-slot") {
    if (!operation.iconSlot?.alias) errors.push(`${operation.nodeId}: icon slot is missing semantic alias`);
    if (![16, 20, 24].includes(Number(operation.iconSlot?.size))) errors.push(`${operation.nodeId}: icon slot must use 16, 20, or 24px`);
    if (operation.iconSlot?.hotZone?.alignment !== "CENTER" || operation.iconSlot?.hotZone?.axes !== "BOTH") {
      errors.push(`${operation.nodeId}: icon slot hot zone must be centered on both axes`);
    }
  }
  if (operation.op === "hydrate-icon" && (operation.iconRef?.hotZone?.alignment !== "CENTER" || operation.iconRef?.hotZone?.axes !== "BOTH")) {
    errors.push(`${operation.targetNodeId}: icon hydration must carry a two-axis centered hot zone`);
  }
}
const search = operations.find((operation) => operation.op === "create-component" && operation.name === "Search/White Surface/Advanced");
if (search && !operations.some((operation) => operation.parentId === search.nodeId && operation.name === "#advanced-search")) errors.push("Search/White Surface/Advanced must expose #advanced-search");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const components = operations.filter((operation) => operation.op === "create-component").length;
const slots = operations.filter((operation) => operation.slotName).length;
console.log(`Pixso component library plan valid: ${components} components, ${slots} named slots.`);
