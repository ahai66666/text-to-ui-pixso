import fs from "node:fs";
import path from "node:path";
import { loadResourceIndex, localFile, read, json, hash } from "./resource-index-lib.mjs";
import { normalizeList } from "./navigation-index-lib.mjs";
import { buildComponentRouteIndex } from "./component-route-index.mjs";
import { loadReadinessPolicy, resolveComponentReadiness } from "./component-readiness-policy.mjs";
import { materialSnapshot } from "./route-material-lib.mjs";
import { findTaskRouteCandidates } from "./task-route-lib.mjs";

export const stageCards = {
  intake: { objective: "识别用户、业务任务、约束和缺失事实；未确定 Pattern 时不编造。",
    writes: ["需求摘要与必要澄清"], next: "design", done: ["主任务、成功状态、恢复路径明确；业务路由已唯一确定或明确列出候选。"] },
  design: { objective: "在选定 Pattern 的真实宽度内设计信息结构，先完成 Blueprint。",
    writes: ["page-blueprint.json"], next: "discovery", done: ["Blueprint 的区域、数据关系、内容分组、状态和验收条件完整。"] },
  discovery: { objective: "先看名称与用途，定位真实组件；只在必要时读取所选 API。",
    writes: ["精确组件 ID 与语义上下文清单"], next: "bindings", done: ["每项能力有明确组件 ID；歧义已经解决。"] },
  bindings: { objective: "按已选 API 写配方、组件绑定、组合树、样式计划和行为计划。",
    writes: ["page-content-recipes.json", "page-bindings.json", "src/<declared-business-module>.js（仅声明 page-module 时）"],
    next: "styling", done: ["参数/插槽/语义符合契约；各绑定进入正确 Pattern 插槽；业务组合不重画组件。"] },
  styling: { objective: "仅编写使用规范 Token 的业务容器 CSS。",
    writes: ["styles/page-composition.css"], next: "validation",
    done: ["无 @import；无组件/Pattern 内部覆盖；页面尺寸与颜色来自规范 Token。"] },
  validation: { objective: "脚本准备组件与样式并生成动态页面，再验证实际预览。",
    writes: ["脚本生成的项目文件与验证证据"], next: "pixso（仅用户需要时）",
    done: ["index 是空宿主；组件/页面/CSS 独立；来源校验通过；实际浏览器就绪、主要交互与布局已检查并分别报告。"] },
  pixso: { objective: "按当前阶段处理同一实际渲染页面，保留视口/状态/运行证据。",
    writes: ["当前导入阶段的运行证据；发布仅在用户要求导入时执行"], next: null,
    done: ["区分页面存在、组件实例与回退、回读、像素差异；未执行的步骤明确标注。"] }
};
export function makePageBrief(packet, contextPath = null) {
  const seen = new Set();
  return {
    schemaVersion: 2, kind: "text-to-ui-page-brief", task: packet.request.task,
    contextPacket: contextPath, defaultStage: "design",
    routes: { workflow: packet.route.workflowRouteId, task: packet.route.id, pattern: packet.layout.id },
    layout: { paneOrder: packet.layout.paneOrder, requiredSlots: packet.layout.requiredSlots },
    componentCandidates: packet.components.filter((v) => v.component && !seen.has(v.component) && seen.add(v.component)).map((v) => ({
      id: v.component, logicalName: v.logicalName, capabilities: packet.components.filter((c) => c.component === v.component).map((c) => c.capability)
    })),
    optionalCapabilities: packet.optionalCapabilities,
    readPolicy: "只读取当前阶段任务包；完整 Context Packet、总表与实现源码由脚本使用。API 通过精确组件 ID + 当前语义查询。",
    query: "node <RULES_ROOT>/scripts/query-resources.mjs --stage <stage> --context <context.json> --view api --out-dir <task-pack-dir>",
    stages: Object.keys(stageCards),
    modelInputs: ["page-blueprint.json", "page-content-recipes.json", "page-bindings.json", "styles/page-composition.css"],
    scriptOutputs: ["components/", "styles/index.css", "styles/base.css", "styles/style-manifest.json", "index.html", "main.js", "generated-page.js", "generated-entry.js"],
    delivery: "动态页面引用独立组件；main.js 统一加载 styles/index.css；Pattern 与组件内部由共享运行时负责。",
    pixso: "existing-html-to-pixso：同一 HTTP 页面等待 __tuiReady 后按阶段捕获/编译/发布/回读。"
  };
}
function assertPacket(root, packet) {
  if (packet.schemaVersion !== 1 || !packet.route?.workflowRouteId || !packet.materials?.length || !packet.materialsDigest) throw new Error("Expected a complete machine Context Packet, not a page brief");
  const snapshot = materialSnapshot({ repo: root, skillRoot: root, definitions: packet.materials.map(({path, role, required}) => ({path,role,required})) });
  if (snapshot.digest !== packet.materialsDigest) throw new Error("Context materials are stale; rerun resolve-context with current sources");
  const patterns = read(localFile(root, "assets/design-system/pattern-contracts.json")).patterns;
  const canonical = patterns.find((p) => p.id === packet.layout?.id);
  if (!canonical || json(canonical) !== json(packet.patternContract?.pattern)) throw new Error("Context Pattern drift");
}
function tokenQuery(root, roles) {
  const map = read(localFile(root, "packages/tokens/src/token-runtime-map.json"));
  const variables = new Map();
  for (const file of fs.readdirSync(path.join(root, "packages/tokens/src")).filter((f) => f.endsWith(".css")).sort()) {
    const relative = "packages/tokens/src/" + file;
    const text = fs.readFileSync(localFile(root, relative), "utf8");
    for (const match of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) variables.set(match[1], { cssVariable: match[1], value: match[2].trim(), path: relative });
  }
  const result = [], visited = new Set();
  const addVariable = (name, reason, chain = []) => {
    if (chain.includes(name)) throw new Error("Token alias cycle: " + [...chain,name].join(" -> "));
    if (!variables.has(name)) throw new Error("Unknown canonical Token variable: " + name);
    if (visited.has(name)) return;
    const row = variables.get(name);
    for (const m of row.value.matchAll(/var\((--[a-zA-Z0-9-]+)/g)) addVariable(m[1], "dependency of " + name, [...chain,name]);
    visited.add(name); result.push({ ...row, reason });
  };
  for (const role of roles) {
    const normalized = role.replaceAll(".", "/");
    const semantic = map.semanticRoles[role] || map.semanticRoles[normalized];
    let names = semantic ? [semantic.cssVariable] : [];
    if (!names.length && normalized.startsWith("typography/")) {
      names = Object.entries(map.semanticRoles).filter(([key]) => key.startsWith(normalized + "/")).map(([,v]) => v.cssVariable);
    }
    if (!names.length) {
      const css = role.startsWith("--") ? role : "--" + normalized.replace(/^spacing\//,"").replaceAll("/","-");
      names = [css];
    }
    for (const name of names) addVariable(name, role);
  }
  return result;
}
function collectTokenRoles(value, out = new Set()) {
  if (typeof value === "string" && /^(space|layout)\//.test(value)) out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => collectTokenRoles(v,out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectTokenRoles(v,out));
  return out;
}
function resolveComponents(root, options, packet, view) {
  const index = buildComponentRouteIndex(root);
  const selection = read(localFile(root, "references/components/component-selection-rules.json")).rules;
  const bindingData = options.bindings ? read(path.resolve(options.bindings)) : null;
  const requests = bindingData ? (bindingData.componentBindings || []).map((b) => ({
    key: index.components.find((c) => c.logicalName === b.logicalName)?.id || b.logicalName,
    context: b.semanticContext, options: b.options || {}, bindingId: b.id, exact: true
  })) : [...normalizeList(options.component).map((key) => ({key, exact:true})), ...normalizeList(options.capabilities).map((key) => ({key,exact:false}))].map((v) => ({...v, context: options["semantic-context"]}));
  const discovery = options.stage === "discovery";
  const defaultRows = discovery && !requests.length ? (packet?.components || []).filter((v,i,a) => v.component && a.findIndex((c) => c.component === v.component) === i).map((v) => ({key:v.component,exact:true})) : requests;
  const results = [], seen = new Set();
  for (const req of defaultRows) {
    const key = String(req.key).trim().toLowerCase();
    const exact = req.exact ? index.components.find((c) => c.id.toLowerCase() === key) : null;
    let candidates = exact ? [exact] : index.components.filter((c) => c.capabilities.some((v) => v.toLowerCase() === key));
    let matchingRules = selection.filter((rule) => exact ? rule.logicalName === exact.logicalName : rule.capabilities.includes(key));
    if (req.context) {
      const contextual = matchingRules.filter((rule) => rule.context === req.context);
      if (matchingRules.length && !contextual.length) throw new Error("Semantic context mismatch for " + req.key + "; allowed: " + [...new Set(matchingRules.map((v) => v.context))].join(", "));
      matchingRules = contextual;
      if (!exact && contextual.length) candidates = candidates.filter((c) => contextual.some((rule) => rule.logicalName === c.logicalName));
    }
    if (candidates.length !== 1) {
      const error = new Error(candidates.length ? "Ambiguous component capability: " + req.key : "Missing registered component: " + req.key);
      error.candidates = candidates.map(({id,logicalName,contractPath}) => ({id,logicalName,contractPath})); throw error;
    }
    const chosen = candidates[0];
    const allowedContexts = [...new Set(matchingRules.map((rule) => rule.context))];
    if (!req.context && allowedContexts.length > 1 && !discovery && view !== "summary") throw new Error("Semantic context required for " + chosen.id + ": " + allowedContexts.join(", "));
    if (packet && !discovery && !(packet.componentReadMap || []).some((v) => v.component === chosen.id)) throw new Error("Component not in Context Packet: " + chosen.id + "; resolve context again with --capabilities");
    const unique = chosen.id + ":" + (req.context || "");
    if (seen.has(unique)) continue; seen.add(unique);
    const contract = read(localFile(root, chosen.contractPath));
    const summary = { id: chosen.id, logicalName: chosen.logicalName, purpose: contract.description || chosen.logicalName, capabilities: chosen.capabilities,
      contractPath: chosen.contractPath, allowedContexts, ...(req.context ? {semanticContext:req.context} : {}) };
    if (view === "summary" || discovery) { results.push(summary); continue; }
    const keys = ["props","slots","slotContracts","variants","states","allowedStates","sizes","modes","sizePolicy","behaviors","tokenRoles","iconAliases"];
    const api = Object.fromEntries(keys.filter((key) => contract[key] !== undefined).map((key) => [key,contract[key]]));
    results.push({ ...summary, ...api, semanticRules: matchingRules, readiness: resolveComponentReadiness(contract,loadReadinessPolicy(root)),
      projectModule:"components/"+chosen.id+"/index.js", ...(view==="full"?{contract}: {}) });
  }
  return { results, bindingData };
}
export function queryResources(root, options) {
  const profile = read(localFile(root,"skill-profile.json"));
  const stage = options.stage || (profile.kind === "pixso" ? "pixso" : "discovery"), view = options.view || "api";
  if (!profile.stages.includes(stage)) throw new Error("Stage is outside this skill: " + stage);
  if (profile.kind === "html" && options.mapping) throw new Error("Pixso mapping belongs to text-to-ui-pixso");
  if (!stageCards[stage]) throw new Error("Unknown stage: " + stage);
  if (!["summary","api","full"].includes(view)) throw new Error("Unknown view: " + view);
  const index = loadResourceIndex(root);
  const packet = options.context ? read(path.resolve(options.context)) : null;
  if (packet) assertPacket(root,packet);
  if (["design","styling","validation"].includes(stage) && !packet && !options.resource && !options.search) throw new Error(stage + " requires --context; use an exact --resource for a standalone reference query");
  const workflow = options.workflow || (stage === "pixso" ? "existing-html-to-pixso" : packet?.route.workflowRouteId || "new-page");
  const workflows = read(localFile(root,"references/routes/index.json")).routes;
  if (!Object.hasOwn(workflows, workflow)) throw new Error("Unknown workflow: " + workflow);
  if (stage === "pixso" && !["existing-html-to-pixso","converter-diagnosis","pixso-component-library"].includes(workflow)) throw new Error("Pixso stage requires a Pixso workflow");
  const patternId = options.pattern || packet?.layout.id;
  if (packet && options.pattern && options.pattern !== packet.layout.id) throw new Error("Pattern conflicts with Context Packet");
  const pattern = patternId ? read(localFile(root,"assets/design-system/pattern-contracts.json")).patterns.find((p) => p.id===patternId) : null;
  if (patternId && !pattern) throw new Error("Unknown Pattern: " + patternId);
  const phase = options.phase || "readiness";
  if (!["readiness","capture","compile","publish","readback","diagnosis"].includes(phase)) throw new Error("Unknown Pixso phase: " + phase);
  const explicitComponents = normalizeList(options.resource).filter((v)=>v.startsWith("component.")).map((v)=>v.slice("component.".length));
  if(options.search && (options.resource || options.component || options.bindings || options.capabilities))throw new Error("--search is metadata discovery; select an exact ID in a second query");
  const parsed = options.search ? {results:[],bindingData:null} : resolveComponents(root,{...options,component:[...normalizeList(options.component),...explicitComponents],stage},packet,view);
  const searchText=options.search ? String(options.search).normalize("NFKC").toLowerCase().trim() : null;
  if(options.search && !searchText)throw new Error("--search needs a topic keyword");
  const searchResults=searchText ? index.resources.filter((r)=>[r.id,r.purpose,r.path].join(" ").normalize("NFKC").toLowerCase().includes(searchText)).map(({id,path,purpose,stage,appliesTo})=>({id,path,purpose,stage,appliesTo})) : null;
  const components = parsed.results, ids = components.map((c) => c.id);
  // An unselected bindings query returns the shared composition rules, with no component APIs.
  const interactions = new Set(normalizeList(options.interaction));
  for (const item of parsed.bindingData?.behaviorPlan?.interactions || []) {
    if (/overlay/.test(item.kind)) { interactions.add("overlay"); interactions.add("keyboard"); }
    if (item.kind === "set-selected") interactions.add("selection");
    if (item.kind === "open-secondary-page") interactions.add("secondary-page");
  }
  if (ids.includes("date-picker")) { interactions.add("date"); interactions.add("keyboard"); }
  if (ids.includes("time-picker")) { interactions.add("time"); interactions.add("keyboard"); }
  if (ids.some(id=>["field","form-field","input","textarea","combobox","native-select","select","checkbox","radio","switch","number-selector"].includes(id))) interactions.add("form");
  if (parsed.bindingData?.pageModules?.length) interactions.add("page-module");
  if (ids.some((id) => ["dialog","alert-dialog","popover","semi-modal"].includes(id))) {interactions.add("overlay");interactions.add("keyboard");}
  const validInteractions = new Set(["pointer","keyboard","date","time","selection","resize","overlay","form","feedback","undo","motion","record","validation","secondary-page","page-module"]);
  for(const name of interactions) if (!validInteractions.has(name)) throw new Error("Unknown interaction: " + name);
  const matches = (row) => {
    const a = row.appliesTo || {};
    if (a.patterns && !a.patterns.includes(patternId)) return false;
    if (a.components && !(a.components.includes("*") ? ids.length : ids.some((id) => a.components.includes(id)))) return false;
    if (a.interactions && !a.interactions.some((v) => interactions.has(v))) return false;
    if (a.phases && !a.phases.includes(phase)) return false;
    if (a.workflows && !a.workflows.includes(workflow)) return false;
    if (row.id.startsWith("composition.") && (workflow === "micro-revision" || (ids.length && !parsed.bindingData && !normalizeList(options.resource).includes(row.id)))) return false;
    return true;
  };
  const explicit = normalizeList(options.resource).map(id=>index.aliases?.[id] || id);
  const roots = searchText ? [] : explicit.length ? explicit : index.resources.filter((r) => r.kind==="document" && r.stage.includes(stage) && matches(r)).map((r)=>r.id);
  roots.unshift("core.delivery");
  if (!explicit.length && packet?.request.mode !== "fast-preview" && stage==="validation") {
    const n=roots.indexOf("validation.preview"); if(n>=0)roots.splice(n,1); roots.push("validation.release");
  }
  if (!explicit.length && !searchText && packet?.route.domainReference && stage==="design") {
    const relative=packet.route.domainReference, body=fs.readFileSync(localFile(root,relative));
    index.resources.push({id:"domain.current",kind:"document",path:relative,purpose:"当前业务域设计约束",sha256:hash(body),bytes:body.length,requires:[],stage:["design"],appliesTo:{}});
    roots.push("domain.current");
  }
  const selected = new Map(), active=new Set();
  const visit = (id,reason) => {
    if(active.has(id))throw new Error("Resource cycle: "+id);
    const row=index.resources.find((r)=>r.id===id);
    if(!row)throw new Error("Missing resource: "+id);
    if(selected.has(id)){selected.get(id).reasons.push(reason);return;}
    if(!matches(row))throw new Error("Resource does not apply to current selectors: "+id);
    active.add(id);row.requires.forEach((v)=>visit(v,"dependency of "+id));active.delete(id);
    selected.set(id,{...row,reasons:[reason]});
  };
  roots.forEach((id)=>visit(id,explicit.includes(id)?"explicit resource":"stage "+stage));
  if (stage==="bindings" || (options.component && view!=="summary")) for(const id of ids)visit("component."+id,"selected component");
  const projectContent = row => {
    const text=fs.readFileSync(localFile(root,row.path),"utf8");
    if (view==="full" || !ids.length || !row.id.startsWith("supplement.") || row.id==="supplement.universal-contract") return text;
    const fold=s=>s.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
    const labels=components.flatMap(c=>[fold(c.id),fold(c.logicalName.split("/")[0])]);
    return text.split("\n").filter(line=>{
      if(!line.startsWith("|"))return true;
      const label=line.split("|")[1]?.trim()||"";
      if(/^(component|---)/i.test(label))return true;
      const words=" "+fold(label)+" ";
      return labels.some(v=>words.includes(" "+v+" "));
    }).join("\n");
  };
  const resources=[...selected.values()].map((r)=>{
    // Source hashes, dependency closure and selection reasons belong in read-plan.json.
    const modelMeta={id:r.id,path:r.path};
    return view==="summary" ? {...modelMeta,purpose:r.purpose,sourceBytes:r.bytes}
      : r.kind==="component" ? modelMeta : {...modelMeta,content:projectContent(r)};
  });
  const roles=normalizeList(options.roles || options.role);
  if(stage==="styling" && pattern) for(const role of collectTokenRoles(pattern.geometry))roles.push(role);
  const tokens=roles.length ? tokenQuery(root,[...new Set(roles)]) : [];
  const mappings=options.mapping ? read(localFile(root,"assets/design-system/mapping-registry.json")).profiles.flatMap((p)=>p.componentMappings.filter((m)=>ids.some((id)=>m.htmlRendererKey===id)).map((m)=>({profile:p.id,...m}))) : [];
  if(options.mapping && !ids.length)throw new Error("--mapping requires exact --component selections");
  const taskRoutes=read(localFile(root,"references/index/task-routes.source.json")).routes;
  const candidates=!packet && options.task ? findTaskRouteCandidates(options.task,taskRoutes) : null;
  const handoff = {};
  const artifactSources = [];
  if (options.blueprint) {
    const full = path.resolve(options.blueprint), blueprint=read(full);
    if (pattern && blueprint.pattern && ![pattern.id, pattern.id.split("-")[1].toUpperCase()].includes(typeof blueprint.pattern==="string"?blueprint.pattern:blueprint.pattern.id)) throw new Error("Blueprint Pattern conflicts with task pack");
    const keys=["user","workObject","primaryJob","successCriteria","recoveryPaths"];
    if(["discovery","bindings"].includes(stage))keys.push("regions","contentGroups","dataEntities","interactions","states","design");
    handoff.blueprint=Object.fromEntries(keys.filter((k)=>blueprint[k]!==undefined).map((k)=>[k,blueprint[k]]));
    artifactSources.push({path:full,sha256:hash(fs.readFileSync(full)),bytes:fs.statSync(full).size,reason:"confirmed Blueprint handoff"});
  }
  if(parsed.bindingData) {
    const full=path.resolve(options.bindings);
    artifactSources.push({path:full,sha256:hash(fs.readFileSync(full)),bytes:fs.statSync(full).size,reason:"actual binding selection"});
    if(stage==="styling")handoff.stylePlan=parsed.bindingData.stylePlan;
    if(stage==="validation")handoff.behaviorPlan=parsed.bindingData.behaviorPlan;
  }
  const pack={schemaVersion:1,kind:"text-to-ui-task-pack",stage,view,task:packet?.request.task || options.task || null,
    routes:{workflow,task:packet?.route.id || null,pattern:patternId || null},...(stage==="pixso"?{phase}:{}),
    card:{...stageCards[stage],read:"只读当前包内资源；需要额外参数时按资源 ID/组件 ID 查询，禁止预读总表。",failure:"缺失、歧义、上下文冲突或摘要过期时停止依赖步骤，修正选择或重建后继续。"},
    ...(searchResults?{searchResults,searchPolicy:"只返回候选元数据；随后用 --resource <id> 读取正文，不自动选择第一项。"}:{}),
    ...(candidates?{routeCandidates:candidates.candidates.map((r)=>({id:r.id,pattern:r.layout})),routeResolution:candidates.candidates.length===1?"unique":candidates.candidates.length?"ambiguous":"unknown"}:{}),
    ...(stage==="design"?{pattern:pattern ? Object.fromEntries(Object.entries(pattern).filter(([key])=>key!=="references")) : null}:{}),
    ...(Object.keys(handoff).length?{handoff}:{}),
    ...(stage==="discovery"||components.length?{components}:{}),
    ...(tokens.length?{tokens}:{}),...(options.mapping?{mappings}:{}),resources,
    commands:stage==="validation"?{validate:"node <RULES_ROOT>/scripts/validate-page-project.mjs --project <PROJECT_DIR> --skill-root <RULES_ROOT> --mode "+(packet?.request.mode || "fast-preview"),generate:"node <RULES_ROOT>/scripts/generate-compliant-page.mjs --project <PROJECT_DIR> --repo <RULES_ROOT> --skill-root <RULES_ROOT> --framework html --task <task> --route new-page --mode "+(packet?.request.mode || "fast-preview")+" --blueprint <PROJECT_DIR>/page-blueprint.json --content-recipes <PROJECT_DIR>/page-content-recipes.json --bindings <PROJECT_DIR>/page-bindings.json --page-css <PROJECT_DIR>/styles/page-composition.css",stylesCheck:"node <RULES_ROOT>/scripts/prepare-page-styles.mjs --project <PROJECT_DIR> --check"}:{nextQuery:"node <RULES_ROOT>/scripts/query-resources.mjs --stage "+(stageCards[stage].next?.split("（")[0] || stage)+" --context <context.json> --view api --out-dir <next-pack-dir>"},
    provenance:{resourceIndexDigest:index.digest,...(options.context?{contextSha256:hash(fs.readFileSync(path.resolve(options.context)))}:{})}
  };
  if(stage==="pixso") {
    const phases=["readiness","capture","compile","publish","readback"];
    const next=phases[phases.indexOf(phase)+1] || phase;
    pack.commands={phaseQuery:"node <RULES_ROOT>/scripts/query-resources.mjs --stage pixso --phase "+next+" --workflow "+workflow+" --view api --out-dir <next-phase-pack>"+(options.context?" --context <context.json>":""),execution:"Use the current phase commands in resources. Readiness/query alone never authorizes publication."};
  }
  if(stage==="discovery")pack.commands.nextQuery+=" --component <exact-id> --semantic-context <context>";
  const projectionBytes=Buffer.byteLength(json(pack));
  if(options["max-bytes"] && (!Number.isFinite(Number(options["max-bytes"])) || Number(options["max-bytes"])<=0))throw new Error("--max-bytes must be a positive number");
  if(options["max-bytes"] && projectionBytes>Number(options["max-bytes"]))throw new Error("Task pack exceeds --max-bytes: "+projectionBytes+"; narrow --resource/--component/--interaction selections; no content was truncated");

  const sourceFiles=new Map([...selected.values()].map((r)=>[r.path,{path:r.path,sha256:r.sha256,bytes:r.bytes}]));
  const dataPaths=new Set();
  if(stage==="design" || stage==="styling")dataPaths.add("assets/design-system/pattern-contracts.json");
  if(tokens.length) {
    dataPaths.add("packages/tokens/src/token-runtime-map.json");
    for(const token of tokens)dataPaths.add(token.path);
  }
  if(options.mapping)dataPaths.add("assets/design-system/mapping-registry.json");
  if(components.length)for(const file of ["references/components/component-selection-rules.json","references/components/component-readiness-policy.json"])dataPaths.add(file);
  for(const file of dataPaths)sourceFiles.set(file,{path:file,sha256:hash(fs.readFileSync(localFile(root,file))),bytes:fs.statSync(localFile(root,file)).size,reason:"queried canonical data"});
  artifactSources.forEach((item)=>sourceFiles.set(item.path,item));
  const plan={schemaVersion:1,kind:"text-to-ui-read-plan",stage,view,selectors:{workflow,pattern:patternId || null,components:ids,semanticContext:options["semantic-context"] || null,interactions:[...interactions],...(stage==="pixso"?{phase}:{})},
    resources:[...selected.values()].map(({id,path,sha256,requires,reasons,bytes,source})=>({id,path,sha256,requires,reasons,sourceBytes:bytes,...(source?{source}:{})})),
    sources:[...sourceFiles.values()],metrics:{modelPackBytes:projectionBytes,selectedSourceBytes:[...sourceFiles.values()].reduce((n,r)=>n+r.bytes,0),selectedFileCount:sourceFiles.size,tokenCount:null},
    provenance:pack.provenance,taskPackSha256:hash(json(pack)),note:"字节数为 UTF-8 实测；未调用 tokenizer，不估算 Token。完整源文件字节数不等于投影上下文。"};
  return {pack,plan};
}
export function packMarkdown(pack) {
  return "# "+pack.stage+" 阶段任务包\n\n先遵守 card 与 core.delivery，再处理本阶段资料。JSON 块是脚本原样导出的可移交上下文。\n\n~~~json\n"+json(pack)+"~~~\n";
}
