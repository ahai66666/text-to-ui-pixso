#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {collectProjectDependencies,projectFile,sha256} from "./artifact-dependencies.mjs";
import {verifySharedData} from "./shared-data.mjs";
const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=f=>JSON.parse(fs.readFileSync(f));
const json=v=>JSON.stringify(v,null,2)+"\n";
const relative=(root,file)=>path.relative(root,path.resolve(file)).split(path.sep).join("/");
function evidenceReference(root,file){
 const p=projectFile(root,file);return {path:relative(root,p),sha256:sha256(fs.readFileSync(p))};
}
export function verifyHandoff({projectRoot,handoffPath,skillRoot=ownRoot}){
 projectRoot=path.resolve(projectRoot);handoffPath=path.resolve(handoffPath||path.join(projectRoot,"html-handoff.json"));
 const h=read(handoffPath),profile=read(path.join(skillRoot,"skill-profile.json"));
 if(h.schemaVersion!==1||h.kind!=="text-to-ui-html-handoff"||!profile.handoffSchemaVersions.includes(h.schemaVersion))throw new Error("Unsupported HTML handoff schema");
 if(h.producer?.skill!=="text-to-ui-html"||!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(h.producer.version||""))throw new Error("Unknown handoff producer");
 if(!h.artifact?.entry||!h.readiness?.kind||!["tui-promise","document-ready"].includes(h.readiness.kind))throw new Error("Missing artifact/readiness contract");
 const v=h.viewport;if(!v||![v.width,v.height,v.zoom].every(n=>Number.isFinite(n)&&n>0)||!v.stateId||!Number.isFinite(v.scroll?.x)||!Number.isFinite(v.scroll?.y))throw new Error("Invalid handoff viewport/state");
 const data=verifySharedData(skillRoot);
 if(h.designData?.dataVersion!==data.dataVersion||h.designData?.digest!==data.digest)throw new Error("Unsupported Token/component snapshot in handoff");
 const current=collectProjectDependencies(projectRoot,h.artifact.entry,{observedLocalFiles:h.dependencies.observedLocalFiles});
 if(JSON.stringify(current)!==JSON.stringify(h.dependencies))throw new Error("HTML dependencies changed after acceptance; regenerate the handoff");
 const refs=[...Object.values(h.evidence||{}),h.validation?.evidence].filter(Boolean);
 for(const ref of refs){const file=projectFile(projectRoot,ref.path);if(sha256(fs.readFileSync(file))!==ref.sha256)throw new Error("Handoff evidence changed: "+ref.path);}
 if(!h.validation?.evidence)throw new Error("Missing validation evidence reference");
 const validationEvidence=read(projectFile(projectRoot,h.validation.evidence.path));
 if(validationEvidence.dependencyDigest!==current.digest||JSON.stringify(validationEvidence.viewport)!==JSON.stringify(h.viewport))throw new Error("Validation evidence does not describe the accepted page/state");
 for(const gate of ["source","build","browser"]){if(h.validation?.[gate]!=="passed"||validationEvidence[gate]!=="passed")throw new Error("Handoff requires passed "+gate+" evidence");}
 if(!["passed","pending"].includes(h.validation.visual))throw new Error("Failed visual acceptance cannot be handed off");
 if(h.validation.visual!==validationEvidence.visual)throw new Error("Visual evidence status mismatch");
 if(h.evidence?.demoPreservation){
  const record=read(projectFile(projectRoot,h.evidence.demoPreservation.path));
  const results=validationEvidence.preservation||{};
  if(!record.items?.length||record.items.some(i=>!i.id||results[i.id]!=="passed"))throw new Error("Every preserved Demo behavior must pass its browser check");
 }
 return h;
}
export function createHandoff({projectRoot,url,evidencePath,entry="index.html",output=null,skillRoot=ownRoot}){
 projectRoot=path.resolve(projectRoot);
 if(!url||!/^https?:\/\//.test(url))throw new Error("Provide actual HTTP --url");
 if(!evidencePath)throw new Error("Provide --evidence <validation-evidence.json>");
 const validationFile=projectFile(projectRoot,evidencePath),validation=read(validationFile);
 const dependencies=collectProjectDependencies(projectRoot,entry,{observedLocalFiles:validation.observedLocalFiles});
 if(validation.dependencyDigest!==dependencies.digest)throw new Error("Browser/build evidence is stale for current page dependencies");
 for(const k of ["source","build","browser"])if(validation[k]!=="passed")throw new Error("Cannot accept page without passed "+k+" evidence");
 if(!["passed","pending"].includes(validation.visual))throw new Error("Visual evidence must be passed or explicitly pending");
 const cp=spawnSync(process.execPath,[path.join(skillRoot,"scripts/validate-page-project.mjs"),"--project",projectRoot,"--skill-root",skillRoot],{cwd:projectRoot,encoding:"utf8"});
 if(cp.status!==0)throw new Error("Source validation failed before handoff:\n"+cp.stdout+cp.stderr);
 const manifestFile=path.join(projectRoot,"html-page-manifest.json"),manifest=read(manifestFile),profile=read(path.join(skillRoot,"skill-profile.json"));
 const evidence={};
 for(const [key,f]of Object.entries({componentUsage:"component-usage.json",componentBundle:"components/component-manifest.json",styleBundle:"styles/style-manifest.json",generation:".text-to-ui/generation-receipt.json"}))evidence[key]=evidenceReference(projectRoot,f);
 if(fs.existsSync(path.join(projectRoot,"demo-preservation.json")))evidence.demoPreservation=evidenceReference(projectRoot,"demo-preservation.json");
 const handoff={schemaVersion:1,kind:"text-to-ui-html-handoff",producer:{skill:profile.name,version:profile.version},artifact:{entry,serveCommand:"pnpm dev",previewUrl:url},viewport:validation.viewport,readiness:{kind:"tui-promise",selector:"#app",promise:"__tuiReady"},dependencies,designData:{dataVersion:verifySharedData(skillRoot).dataVersion,digest:verifySharedData(skillRoot).digest,pattern:manifest.patternContract?.id||null},evidence,validation:{source:"passed",build:"passed",browser:"passed",visual:validation.visual,evidence:evidenceReference(projectRoot,evidencePath)}};
 const target=path.resolve(output||path.join(projectRoot,"html-handoff.json"));
 if(!target.startsWith(projectRoot+path.sep))throw new Error("Handoff must remain inside project");
 let ancestor=target;while(ancestor!==projectRoot){if(fs.existsSync(ancestor)&&fs.lstatSync(ancestor).isSymbolicLink())throw new Error("Handoff output symlink is forbidden");ancestor=path.dirname(ancestor);}
 const old=fs.existsSync(target)?fs.readFileSync(target):null;fs.mkdirSync(path.dirname(target),{recursive:true});
 try{fs.writeFileSync(target,json(handoff));verifyHandoff({projectRoot,handoffPath:target,skillRoot});}
 catch(error){if(old)fs.writeFileSync(target,old);else fs.rmSync(target,{force:true});throw error;}
 return {path:target,sha256:sha256(fs.readFileSync(target)),dependencyDigest:dependencies.digest};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=process.argv[2],args=process.argv.slice(3),at=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
 const projectRoot=path.resolve(at("--project")||process.cwd());
 if(command==="create")console.log(json({ok:true,...createHandoff({projectRoot,url:at("--url"),evidencePath:at("--evidence"),entry:at("--entry")||"index.html",output:at("--out")})}));
 else if(command==="check"){const h=verifyHandoff({projectRoot,handoffPath:at("--handoff")});console.log(json({ok:true,producer:h.producer,dependencyDigest:h.dependencies.digest,viewport:h.viewport}));}
 else throw new Error("html-handoff.mjs create --project <root> --url <url> --evidence <relative-json> | check --project <root> --handoff <file>");
}
