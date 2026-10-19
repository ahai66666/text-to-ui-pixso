#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./navigation-index-lib.mjs";
import { queryResources, packMarkdown } from "./stage-context-lib.mjs";
import { json } from "./resource-index-lib.mjs";
const args = parseArgs(process.argv.slice(2));
try {
  const root = path.resolve(args["skill-root"] || args.repo || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const {pack,plan}=queryResources(root,args);
  if(args["out-dir"]) {
    const dir=path.resolve(args["out-dir"]);
    if(dir===root || dir.startsWith(root+path.sep))throw new Error("Export task packs outside the Skill source");
    fs.mkdirSync(dir,{recursive:true});
    for(const [name,text] of [["task-pack.json",json(pack)],["read-plan.json",json(plan)],["task-pack.md",packMarkdown(pack)]])fs.writeFileSync(path.join(dir,name),text);
    console.log(json({ok:true,stage:pack.stage,output:dir,metrics:plan.metrics}));
  } else console.log(json({ok:true,...pack,readPlan:plan}));
} catch(error) {
  console.error(json({ok:false,error:error.message,...(error.candidates?{candidates:error.candidates}:{})}));process.exitCode=2;
}
