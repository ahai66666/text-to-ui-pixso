import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {queryResources} from "../scripts/stage-context-lib.mjs";
import {collectProjectDependencies} from "../scripts/artifact-dependencies.mjs";
import {verifySharedData} from "../scripts/shared-data.mjs";
import {verifyHandoff} from "../scripts/html-handoff.mjs";
import {validateImportRun} from "../scripts/validate-pixso-import-run.mjs";
import {runtimeFiles} from "../scripts/skill-distribution.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const profile=JSON.parse(fs.readFileSync(path.join(root,"skill-profile.json")));
test("pinned data is intact and local",()=>{const data=verifySharedData(root);assert.equal(data.publisher,"ahai66666/text-to-ui-html");assert.equal(Object.keys(data.files).filter(f=>f.startsWith("packages/component-contracts/src/components/")).length,49);});
test("stage projection rejects the other skill",()=>{assert.throws(()=>queryResources(root,{stage:profile.kind==="html"?"pixso":"design",view:"api"}),/outside this skill/);const opts=profile.kind==="html"?{stage:"bindings",workflow:"micro-revision",component:"button","semantic-context":"page-primary-action",view:"api"}:{stage:"pixso",phase:"readiness",view:"api"};const result=queryResources(root,opts);assert.ok(result.plan.metrics.modelPackBytes>0);if(profile.kind==="html")assert.ok(!result.pack.resources.some(r=>r.id.startsWith("pixso")));else assert.ok(!result.pack.resources.some(r=>r.id.startsWith("blueprint")));});
test("runtime delivery excludes tests layout references and history",()=>{const files=runtimeFiles(root);assert.ok(files.includes("SKILL.md"));assert.ok(!files.some(f=>/^(tests|maintenance)\//.test(f)||f.includes("harmonyos-layout-references")));for(const[k,v]of Object.entries(JSON.parse(fs.readFileSync(path.join(root,"package.json"))).scripts)){if(k==="test")continue;for(const m of v.matchAll(/node (scripts\/[^ ]+)/g))assert.ok(fs.existsSync(path.join(root,m[1])),k+" implementation missing");}});
test("complete dependency digest covers modules CSS resources and moves",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"split-dependencies-")),project=path.join(temp,"page");
 try{
 const put=(f,t)=>{const p=path.join(project,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,t);};
 put("index.html",'<main id="app"></main><script type="module" src="./main.js"></script>');put("main.js",'import "./components/button/index.js";\nimport "./styles/index.css";');
 put("components/button/index.js","export const value=1;");put("styles/index.css",'@import "../page-components/results/styles.css";');put("page-components/results/styles.css",".results{gap:var(--space-5)}");put("page-components/results/data.json",'{"v":1}');put("assets/icon.svg","<svg/>");
 const baseline=collectProjectDependencies(project);
 for(const f of ["components/button/index.js","page-components/results/styles.css","page-components/results/data.json","assets/icon.svg"]){const old=fs.readFileSync(path.join(project,f));fs.appendFileSync(path.join(project,f)," ");assert.notEqual(collectProjectDependencies(project).digest,baseline.digest,f);fs.writeFileSync(path.join(project,f),old);}
 const moved=path.join(temp,"moved");fs.cpSync(project,moved,{recursive:true});assert.equal(collectProjectDependencies(moved).digest,baseline.digest);
 fs.writeFileSync(path.join(project,"styles/index.css"),'@import "./missing.css";');assert.throws(()=>collectProjectDependencies(project),/missing/);
 fs.writeFileSync(path.join(project,"styles/index.css"),"");fs.symlinkSync(path.join(temp,"outside"),path.join(project,"assets/link"));assert.throws(()=>collectProjectDependencies(project),/symlink/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test("handoff rejects unknown versions before dependency use",()=>{
 const p=fs.mkdtempSync(path.join(os.tmpdir(),"split-handoff-"));
 try{fs.writeFileSync(path.join(p,"html-handoff.json"),JSON.stringify({schemaVersion:999,kind:"text-to-ui-html-handoff"}));assert.throws(()=>verifyHandoff({projectRoot:p,skillRoot:root}),/Unsupported/);}
 finally{fs.rmSync(p,{recursive:true,force:true});}
});

test("browser-observed dynamic dependencies remain part of identity",()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"split-observed-"));
 try{fs.writeFileSync(path.join(temp,"index.html"),"<!doctype html><main>external</main>");fs.mkdirSync(path.join(temp,"lazy-chunks"));const file=path.join(temp,"lazy-chunks/extra.js");fs.writeFileSync(file,"export const n=1;");const first=collectProjectDependencies(temp,"index.html",{observedLocalFiles:["lazy-chunks/extra.js"]});fs.writeFileSync(file,"export const n=2;");assert.notEqual(first.digest,collectProjectDependencies(temp,"index.html",{observedLocalFiles:first.observedLocalFiles}).digest);assert.throws(()=>collectProjectDependencies(temp,"index.html",{observedLocalFiles:["../escape"]}));}
 finally{fs.rmSync(temp,{recursive:true,force:true});}
});

test("import blocks a missing accepted handoff before publication",()=>{const report=validateImportRun({runManifest:{source:{handoff:{path:"/missing-accepted-handoff.json",sha256:"bad"}}},visualManifest:{}});assert.ok(report.failures.some(f=>f.includes("Handoff integrity failed")));});
