#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {runtimeFiles} from "./skill-distribution.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const source=JSON.parse(fs.readFileSync(path.join(root,"skill-profile.json")));
const inputs=runtimeFiles(root).filter(f=>!f.startsWith("references/index/generated/")&&![".delivery-manifest.json","shared-data-lock.json"].includes(f));
const value={schemaVersion:1,kind:"text-to-ui-skill-catalog-index",skill:source.name,policy:{canonicalSource:"this repository",missingOrHashDriftIsBlocking:true},groups:[{id:source.kind+"-runtime",purpose:"Local executable and normative source closure",files:inputs.map(f=>({path:f,sha256:crypto.createHash("sha256").update(fs.readFileSync(path.join(root,f))).digest("hex"),availability:"local"}))}]};
const file=path.join(root,"references/index/generated/skill-catalog-index.json"),text=JSON.stringify(value,null,2)+"\n";
if(process.argv.includes("--check")){if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!==text)throw new Error("Skill catalog drift; rebuild in this skill");}
else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
