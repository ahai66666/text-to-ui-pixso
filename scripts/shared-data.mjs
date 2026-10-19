#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {sha256} from "./artifact-dependencies.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const json=v=>JSON.stringify(v,null,2)+"\n";
const allowed=f=>f.startsWith("packages/component-contracts/")||f.startsWith("packages/tokens/")||f.startsWith("assets/icons/")||f==="schemas/html-handoff.schema.json"||/^assets\/design-system\/(?:pattern-contracts(?:\.schema)?\.json|titlebar-scene-contracts\.json|token-runtime-map\.json|token-utility-map\.json|dual-output-token-map\.json|tokens\.[a-z]+\.(?:json|css))$/.test(f);
function walk(base,relative=""){return fs.readdirSync(path.join(base,relative),{withFileTypes:true}).flatMap(e=>{if(e.name.startsWith(".")||["node_modules","dist","maintenance","tests"].includes(e.name))return [];const f=path.join(relative,e.name).split(path.sep).join("/");if(e.isSymbolicLink())throw new Error("Shared data symlink: "+f);return e.isDirectory()?walk(base,f):e.isFile()?[f]:[];});}
export function sharedIdentity(base=root){
 const files=Object.fromEntries(walk(base).filter(allowed).sort().map(f=>[f,sha256(fs.readFileSync(path.join(base,f)))]));
 return {schemaVersion:1,publisher:"ahai66666/text-to-ui-html",dataVersion:"1.0.0",handoffSchemaVersions:[1],files,digest:sha256(JSON.stringify(files))};
}
export function verifySharedData(base=root){
 const file=path.join(base,"shared-data-lock.json");
 if(!fs.existsSync(file))throw new Error("Missing pinned shared-data-lock.json");
 const saved=JSON.parse(fs.readFileSync(file)),current=sharedIdentity(base);
 if(JSON.stringify(saved)!==JSON.stringify(current))throw new Error("Shared data snapshot changed; use the versioned publisher snapshot");
 return saved;
}
export function exportSharedData(out){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json")));
 if(pkg.name!=="text-to-ui-html")throw new Error("Only the HTML publisher exports shared data");
 out=path.resolve(out);if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error("Snapshot output must be empty");
 const identity=sharedIdentity(root);fs.mkdirSync(out,{recursive:true});
 for(const f of Object.keys(identity.files)){const p=path.join(out,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,f),p);}
 fs.writeFileSync(path.join(out,"snapshot.json"),json(identity));return identity;
}
export function syncSharedData(snapshot){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json")));
 if(pkg.name!=="text-to-ui-pixso")throw new Error("Only the Pixso consumer synchronizes publisher data");
 const src=path.resolve(snapshot),spec=JSON.parse(fs.readFileSync(path.join(src,"snapshot.json")));
 if(spec.schemaVersion!==1||spec.publisher!=="ahai66666/text-to-ui-html"||spec.dataVersion!=="1.0.0"||!spec.handoffSchemaVersions?.includes(1))throw new Error("Unsupported shared data publisher/version");
 const actual=sharedIdentity(src);if(JSON.stringify(spec)!==JSON.stringify(actual))throw new Error("Publisher snapshot hash mismatch");
 const previousFile=path.join(root,"shared-data-lock.json"),previous=fs.existsSync(previousFile)?JSON.parse(fs.readFileSync(previousFile)):null;
 const backups=new Map();
 for(const [f,expected]of Object.entries(spec.files)){
  if(!allowed(f)||path.isAbsolute(f)||f.split("/").includes(".."))throw new Error("Unexpected shared snapshot path: "+f);
  const target=path.join(root,f),current=fs.existsSync(target)?fs.readFileSync(target):null;
  if(current&&sha256(current)!==expected&&sha256(current)!==previous?.files?.[f])throw new Error("Preserve edited consumer snapshot: "+f);
  backups.set(f,current);
 }
 const oldLock=fs.existsSync(previousFile)?fs.readFileSync(previousFile):null;
 try{for(const f of Object.keys(spec.files)){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.copyFileSync(path.join(src,f),path.join(root,f));}fs.writeFileSync(previousFile,json(spec));verifySharedData(root);}
 catch(error){for(const[f,bytes]of backups){if(bytes)fs.writeFileSync(path.join(root,f),bytes);else fs.rmSync(path.join(root,f),{force:true});}if(oldLock)fs.writeFileSync(previousFile,oldLock);else fs.rmSync(previousFile,{force:true});throw error;}
 return spec;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=process.argv[2],args=process.argv.slice(3),at=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
 if(command==="export"){if(!at("--out"))throw new Error("data:export --out <empty-directory>");console.log(json({ok:true,...exportSharedData(at("--out"))}));}
 else if(command==="sync"){if(!at("--snapshot"))throw new Error("data:sync --snapshot <local-directory>");const v=syncSharedData(at("--snapshot"));console.log(json({ok:true,digest:v.digest,dataVersion:v.dataVersion}));}
 else if(command==="check")console.log(json({ok:true,digest:verifySharedData().digest}));
 else if(command==="lock"){fs.writeFileSync(path.join(root,"shared-data-lock.json"),json(sharedIdentity()));}
 else throw new Error("shared-data.mjs export|sync|check");
}
