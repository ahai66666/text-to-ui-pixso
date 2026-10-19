#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const ownRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const skipped=new Set(["node_modules",".git",".github",".text-to-ui","dist","outputs","tests","maintenance","__pycache__",".DS_Store",".delivery-manifest.json","pnpm-lock.yaml"]);
export function belongsInRuntime(f){
 if(f==="scripts/build-pixso-unified-agent-plugin.mjs")return false;
 if(f.startsWith("scripts/pixso-unified-agent-plugin/")&&(/\.mjs$|\.template\.js$/.test(f)||f.endsWith("/pixso-native-execution-runtime.js")))return false;
 if(f.startsWith("scripts/pixso-component-registry-sync-plugin/")||f.startsWith("scripts/pixso-page-binding-bridge-plugin/"))return false;
 return true;
}
export function runtimeFiles(root,rel=""){
 return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{
  if(skipped.has(e.name))return [];
  const f=path.join(rel,e.name).split(path.sep).join("/");
  if(e.isSymbolicLink())throw new Error("Skill delivery cannot contain a symlink: "+f);
  if(e.isDirectory())return runtimeFiles(root,f);
  return e.isFile()&&belongsInRuntime(f)?[f]:[];
 }).sort();
}
export function deliveryManifest(root){
 const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json")));
 const files=Object.fromEntries(runtimeFiles(root).map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
 return {schemaVersion:1,name:pkg.name,version:pkg.version,sourceDigest:sha(JSON.stringify(files)),files};
}
function run(root,file,args=[]){const cp=spawnSync(process.execPath,[path.join(root,"scripts",file),...args],{cwd:root,encoding:"utf8"});if(cp.status!==0)throw new Error(file+"\n"+cp.stderr+cp.stdout);}
function write(root){const m=deliveryManifest(root);fs.writeFileSync(path.join(root,".delivery-manifest.json"),JSON.stringify(m,null,2)+"\n");return m;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const command=process.argv[2],args=process.argv.slice(3);const at=args.indexOf("--out");
 if(command==="manifest"){const m=write(ownRoot);console.log(JSON.stringify({ok:true,files:Object.keys(m.files).length,sourceDigest:m.sourceDigest}));}
 else if(command==="check"){const saved=JSON.parse(fs.readFileSync(path.join(ownRoot,".delivery-manifest.json")));if(JSON.stringify(saved)!==JSON.stringify(deliveryManifest(ownRoot)))throw new Error("Delivery manifest drift");console.log(JSON.stringify({ok:true}));}
 else if(command==="pack"){
  if(at<0||!args[at+1])throw new Error("skill:pack --out <new.zip>");
  const out=path.resolve(args[at+1]);if(fs.existsSync(out))throw new Error("Preserve existing archive: "+out);
  const pkg=JSON.parse(fs.readFileSync(path.join(ownRoot,"package.json")));
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"text-to-ui-pack-")),stage=path.join(temp,pkg.name);
  try{
   fs.mkdirSync(stage);for(const f of runtimeFiles(ownRoot)){fs.mkdirSync(path.dirname(path.join(stage,f)),{recursive:true});fs.copyFileSync(path.join(ownRoot,f),path.join(stage,f));}
   const metadata=JSON.parse(fs.readFileSync(path.join(stage,"package.json")));
   for(const k of ["test","pixso:plugin:build"])delete metadata.scripts[k];
   fs.writeFileSync(path.join(stage,"package.json"),JSON.stringify(metadata,null,2)+"\n");
   const profile=JSON.parse(fs.readFileSync(path.join(stage,"skill-profile.json")));profile.distribution="runtime";fs.writeFileSync(path.join(stage,"skill-profile.json"),JSON.stringify(profile,null,2)+"\n");
   for(const s of ["build-resource-index.mjs","build-skill-catalog-index.mjs","build-navigation-index.mjs"])run(stage,s,["--repo",stage,"--skill-root",stage]);
   for(const s of ["build-resource-index.mjs","build-skill-catalog-index.mjs","build-navigation-index.mjs"])run(stage,s,["--repo",stage,"--skill-root",stage,"--check"]);
   const m=write(stage);fs.mkdirSync(path.dirname(out),{recursive:true});
   const py="import os,sys,zipfile\nroot,out=sys.argv[1:]\nwith zipfile.ZipFile(out,'x',zipfile.ZIP_DEFLATED) as z:\n for d,dirs,files in os.walk(root):\n  dirs.sort()\n  for f in sorted(files):\n   p=os.path.join(d,f);z.write(p,os.path.join(os.path.basename(root),os.path.relpath(p,root)))";
   const cp=spawnSync("python3",["-c",py,stage,out],{encoding:"utf8"});if(cp.status!==0)throw new Error(cp.stderr);
   const bytes=Object.keys(m.files).reduce((n,f)=>n+fs.statSync(path.join(stage,f)).size,0);
   const checksum=sha(fs.readFileSync(out));fs.writeFileSync(out+".sha256",checksum+"  "+path.basename(out)+"\n");
   console.log(JSON.stringify({ok:true,out,name:pkg.name,files:Object.keys(m.files).length,uncompressedBytes:bytes,zipBytes:fs.statSync(out).size,sha256:checksum}));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
 }else throw new Error("Usage: skill-distribution.mjs manifest|check|pack --out <new.zip>");
}
