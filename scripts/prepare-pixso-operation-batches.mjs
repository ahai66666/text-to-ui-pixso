#!/usr/bin/env node

import path from "node:path";
import { parseArgs, readJson, repoRelativePath, writeJson } from "./pixso-native-scene-lib.mjs";

const args = parseArgs(process.argv.slice(2));
const usage = "Usage: prepare-pixso-operation-batches.mjs --plan <pixso-operation-plan.json> --out <pixso-operation-batches.json> [--max-operations 100]";
if (args.help || !args.plan || !args.out) {
  if (!args.help) console.error(usage);
  process.exit(args.help ? 0 : 2);
}
const plan = readJson(args.plan);
const maxOperations = Math.max(1, Number(args["max-operations"] ?? 100));
if (!Array.isArray(plan.operations) || plan.operations.length === 0) throw new Error("Operation plan has no operations");
const batches = [];
for (let index = 0; index < plan.operations.length; index += maxOperations) {
  const operations = plan.operations.slice(index, index + maxOperations);
  batches.push({ batchIndex: batches.length, phases: [...new Set(operations.map((operation) => operation.phase).filter(Boolean))], operations });
}
const output = {
  schemaVersion: 1,
  kind: "pixso-operation-batches",
  plan: repoRelativePath(args.plan),
  maxOperations,
  page: plan.page,
  execution: plan.execution,
  batchCount: batches.length,
  batches,
};
writeJson(args.out, output);
console.log(JSON.stringify({ ok: true, output: path.resolve(args.out), batchCount: batches.length, operationCount: plan.operations.length, maxOperations }, null, 2));
