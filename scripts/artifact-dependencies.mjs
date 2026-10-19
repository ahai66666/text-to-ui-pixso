import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {inspectHtmlArtifact} from "./html-artifact-graph.mjs";
export const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
export function projectFile(root,relative){
 const base=path.resolve(root),file=path.resolve(base,relative);
 if(!file.startsWith(base+path.sep))throw new Error("Project dependency escapes root: "+relative);
 let current=file;while(current!==base){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error("Project dependency symlink: "+relative);current=path.dirname(current);}
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error("Missing project dependency: "+relative);
 return file;
}
export function collectProjectDependencies(root,entry="index.html",{observedLocalFiles=[]}={}){
 root=path.resolve(root);
 const initial=inspectHtmlArtifact(projectFile(root,entry),{projectRoot:root});
 const all=new Set(initial.files.map(r=>r.file));
 for(const f of observedLocalFiles)all.add(projectFile(root,f));
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.name.startsWith(".")||["node_modules","dist","build","outputs","coverage","pixso-runs"].includes(e.name))continue;
  const file=path.join(dir,e.name);
  if(e.isSymbolicLink())throw new Error("Project dependency symlink: "+file);
  if(e.isDirectory())walk(file);else if(e.isFile())all.add(file);
 }};
 for(const dir of ["src","assets","public","static","components","page-components","styles"]){const full=path.join(root,dir);if(fs.existsSync(full))walk(full);}
 const files=[...all].sort().map(file=>({path:path.relative(root,file).split(path.sep).join("/"),sha256:sha256(fs.readFileSync(projectFile(root,path.relative(root,file)))),bytes:fs.statSync(file).size})).sort((a,b)=>a.path.localeCompare(b.path));
 const remoteResources=new Set();
 for(const row of files.filter(r=>/\.(?:html|css|js|mjs)$/.test(r.path))){const t=fs.readFileSync(projectFile(root,row.path),"utf8");for(const m of t.matchAll(/https?:\/\/[^\s"'<> )]+/g))remoteResources.add(m[0]);}
 return {entry,observedLocalFiles:[...new Set(observedLocalFiles)].sort(),files,digest:sha256(JSON.stringify(files)),remoteResources:[...remoteResources].sort(),remotePolicy:"Remote/dynamic resources require a fresh browser capture; local digest alone does not prove their bytes."};
}
