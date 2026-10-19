# HTML → Pixso Fidelity Import Pipeline

Use this workflow for any existing website or complex HTML page whose Pixso board must preserve the rendered HTML while also using Pixso Variables and real Components. The current browser rendering is the visual authority. Page-specific generators may describe business semantics, but they may not override current computed geometry or style.

## 0. Normal fast path and diagnostic boundary

Normal import is a bounded one-pass production workflow, not a converter-development
session. Use `--mode normal` unless the user explicitly asks to diagnose or improve
the converter. In normal mode:

- capture the current browser state once, returning both the computed visual
  manifest and an exact HTML screenshot;
- compile one Scene and one Operation Plan from the same run;
- query bridge status once and require the native plugin for whole-page output;
  stop with the precise readiness reason when it is not connected;
- execute once and perform one complete readback;
- capture the structured Pixso board once and compare it directly with the HTML
  screenshot;
- keep `codeToDesignCalls` at `0` and create no temporary Baseline Frame.

Do not edit the renderer, component map, Tokens, source HTML, selector collector,
or Scene compiler while a normal run is active. The run records hashes for those
inputs and validation rejects any mutation. If a converter defect is found, stop
the current run, report the failing gate, and fix it in a separate diagnostic task.
After the fix, create a new run; never regenerate the old run until it appears to
pass.

The native executor orders recoverable asset work after the page structure:
resource preflight, layout/content, icon hydration, then image optimization. A
failure while hydrating a page-owned icon or materializing an image must keep its
measured box and commit the already assembled structure as a visible deferred
placeholder; it is recorded in `audit.iconFailures` or `audit.imageFailures` for
a subsequent repair pass. Missing structural resources, component resolution,
layout execution, cancellation, and readback failures remain hard gates and
must preserve the previous accepted artboard.

The normal total budget is 90 seconds. Stage targets are preflight 3 seconds,
capture 8 seconds, compile 5 seconds, execution 45 seconds, readback 10 seconds,
visual diff 5 seconds, and cleanup 5 seconds. These are stopping signals, not
reasons to publish an unverified board. A budget overrun must be reported before
more retries are attempted. The first real page after a runtime upgrade may be
slower, but it still records the exact stage and module that exceeded budget.
Each stage records both `workElapsedMs` and `orchestrationElapsedMs`. The 90-second
budget uses actual work time; bridge polling, tool round trips and human review
remain visible as wall-clock telemetry but cannot make a 200ms collector appear
to be a 40-second conversion.

### Governed queue and retry lifecycle

Before publication, the orchestrator runs a deterministic preflight over the
current HTML source, browser capture bundle, component facts and Operation Plan
contracts. A missing image is a warning-only repair item: its measured rectangle
is retained as a placeholder and the structure may proceed. An optional
component mapping problem (missing target, missing Variant, or geometry mismatch)
is also a warning when the compiler can retain the browser-measured subtree as
native composition; it is recorded in `componentRepairItems` and does not block
the page. A missing capture bundle, stale fingerprint, schema mismatch, or
malformed component contract fails before a Bridge job is created and is never
retried.

The Bridge records the lifecycle
`PRECHECKING → READY → WAITING_FOR_PLUGIN → CLAIMED → RUNNING(module) →
RECOVERING → COMPLETED / NEEDS_ATTENTION / FAILED`. Each transition records the
attempt, last heartbeat, deadline, blocking reason and next action. If a plugin
does not claim within 15 seconds, the Bridge re-dispatches once. If execution is
not confirmed within 45 seconds, it clears the claim and releases the run lock
as `NEEDS_ATTENTION`. The Pixso main runtime emits a module heartbeat every
5 seconds; 60 seconds without one cancels the draft and stops automatic replay.
Result acknowledgement has a separate 15-second deadline. Only connection
failures may recover automatically, and at most once; old, cancelled, failed or
attention-required runs always require a fresh run.

Record each stage around the actual operation:

```bash
node scripts/update-pixso-import-run.mjs \
  --manifest /absolute/path/run-manifest.json \
  --stage capture --status start

node scripts/update-pixso-import-run.mjs \
  --manifest /absolute/path/run-manifest.json \
  --stage capture --status passed
```

Normal mode permits one attempt per stage. Capture has an internal calibration
handshake before its one committed evidence package: it may measure DPR and
adjust the physical browser surface, but it writes exactly one accepted
Manifest/screenshot pair. Use `--mode diagnostic` only in the
separate diagnosis workflow; it permits bounded retries but cannot publish into
the earlier normal run.

## 1. Start an isolated run

Never generate into a shared output directory that also contains old plans or trials. Create one immutable run directory:

```bash
node scripts/pixso-import-orchestrator.mjs start \
  --html-root /absolute/path/to/current-html \
  --url http://127.0.0.1:43173/path/to/page/ \
  --runs-root /absolute/path/to/import-runs \
  --width 1728 --height 1152 --mode normal
```

The command records `runId`, current HTML fingerprint, viewport, component-map hash, Token-manifest hash, plugin-runtime hash, and the only artifact paths permitted for this run. It also acquires `active-run.lock.json`. A second initialized or running run must fail instead of replacing `current-run.json`; the lock is released only by a completed, failed, or explicitly cancelled run. `current-run.json` is a pointer, not a cache. Never read plans, screenshots, readbacks, or `*-trial.json` files from another run.

Use the orchestrator as the canonical public entry instead of manually choosing
different lifecycle scripts:

```bash
node scripts/pixso-import-orchestrator.mjs status --runs-root /absolute/path/to/import-runs
```

Strict HTML import plans are executable only from the artifact path declared by
that current run. A project-root compatibility plan, a plan without
`execution.importRun.runId`, or a plan whose manifest is not selected by
`current-run.json` must fail closed in the bridge and shared Pixso runtime. Old
run directories may remain for audit; their existence never authorizes replay.

If the HTML, component map, Tokens, or runtime changes after initialization, start a new run. Do not mutate the old run to look current.


## Target page readiness
Before publication verify the exact target page exists in the current Pixso file. If the user requests a new test page, create that empty uniquely named page using the connected Pixso API (only after user authorization), record its ID and pass --target-page <exact-name> at compile. Current executor preflight requires the page to exist before the plan create-page operation; do not rely on implicit creation. Do not create or replace other pages. If a publication fails, retain its evidence and stop that run; after correcting a prerequisite, acceptance testing uses a new capture and new run rather than replaying the failed plan.
Capture at the handoff's scroll position and compare viewport.scroll. Protocol currently requires zoom1.0; validate another CSS viewport size at zoom1.0 when a different target size is needed.
## 2. Capture browser-computed evidence

Calibrate the browser to `1728 × 1152 CSS px`, zoom `1.0`, and the requested state. Inject `scripts/browser-visual-manifest.js`, then call:

```js
collectTextToUiVisualManifest(document, {
  runId,
  htmlSourceFingerprint,
  stateId: "default-visible"
})
```

Save the returned JSON to the run's `html-visual-manifest.json`. Capture the
page root to the run's `html-reference.png` after the CSS viewport is verified;
the comparison raster must be exactly the target CSS size, not the current
Codex panel size or an unnormalised DPR backing surface. It records every
visible element's stable selector, parent relation, bounds, final Flex/Grid
properties, padding, margin, gap, alignment, color, backgrounds, four border
edges, radius, typography, text, and SVG/image evidence.

An `undefined` selector, missing geometry, wrong viewport, wrong zoom, stale fingerprint, or empty node list is blocking. Screenshot-only evidence is not sufficient because it cannot prove padding, border ownership, component identity, or Variable bindings.

### Capture Bundle: the pre-Pixso hard gate

Do not compile or publish directly after saving those two files. Commit them as
one immutable evidence package:

```bash
node scripts/pixso-import-orchestrator.mjs capture \
  --run-manifest <run-manifest.json>
```

`capture` creates `capture-bundle.json` only when all of the following agree:

- current run ID, HTML fingerprint and static visible state;
- requested CSS viewport and browser-computed `innerWidth` / `innerHeight`;
- browser zoom `1.0` and recorded DPR;
- the actual PNG IHDR dimensions equal the target CSS canvas exactly;
- the visual manifest and PNG are exactly the artifact paths owned by this run.

The bundle stores hashes for both artifacts. Compile and publish re-read them,
so a stale, cropped or overwritten screenshot stops before any Pixso draft or
plugin work begins. This is a machine gate, not a user confirmation: a valid
capture advances automatically and normally adds only a few milliseconds.

### Text sizing contract

文字尺寸模式必须来自浏览器最终计算样式和文本测量结果，而不是由“是否存在固定 CSS 盒子”推断：

- 普通单行文字默认使用 `WIDTH_AND_HEIGHT`，宽度随内容自适应。
- 普通多行正文使用 `HEIGHT`，保留 HTML 宽度并允许高度增长。
- 只有明确存在 `text-overflow: ellipsis` 且测量到文字实际超过 HTML 盒宽时使用 `TRUNCATE` 语义，保留固定宽度/高度并设置单行截断；仅声明了省略号但当前内容放得下时仍使用内容自适应；执行到 Pixso 时先设置原生 `textAutoResize: TRUNCATE`。
- `overflow: hidden` 或 `overflow: clip` 本身不等于省略号，不能把普通文字错误转换为固定尺寸。
- 带背景、圆角、描边或内边距的文字外框仍由 Frame 承担；拆出的直接文字按上述文字模式处理。

Operation Plan 必须显式携带 `textAutoResize: TRUNCATE`，执行器先加载字体，再尝试设置该原生值；回读验证固定宽度、固定高度和 `TRUNCATE` 模式。若当前 Pixso 运行时实际只接受 `WIDTH_AND_HEIGHT`、`HEIGHT`、`NONE`，执行器可启用 `ending-ellipsis-v1`：以加载后的原生文本度量二分裁切出带 `…` 的可见字符串，保留 `NONE` 与固定盒，并记录源/渲染文本。回读必须同时验证版本标记、真实 `…`、源文本一致性与固定尺寸；缺少任何一项即失败，防止退化为静默裁切。

### Icon geometry and hot-zone contract

图标也必须保持 HTML 的真实几何，而不能只把 SVG 当作一个方形占位：

- 所有标准描边图标以 24 × 24 为源画板，设计系统描边表是最终权威：16px、20px、24px 分别使用 1px、1.25px、1.5px 的 Pixso 原生描边；其他明确批准的尺寸先归一化到 24 × 24 / 1.5px，再按尺寸比例计算。
- Operation Plan 为每个图标携带 `hotZone.alignment = CENTER` 和 `hotZone.axes = BOTH`。执行器同时设置热区的主轴、交叉轴居中，并依据实际矢量宽高计算 x/y，使图形在热区左右和上下都居中。
- Operation Plan 必须显式携带 `iconRef.strokeWeight`；16/20/24px 分别引用数值变量 `icon/stroke/16`、`icon/stroke/20`、`icon/stroke/24`，其值为 1/1.25/1.5px。插件将矢量加入最终父节点后再次应用并绑定该变量，再回读真实 `VECTOR.strokeWeight` 与 `boundVariables.strokeWeight`。槽位名称、SVG 原始 `stroke-width` 和元数据都不能代替真实属性校验。
- 规则同时适用于 HTML SVG、生成的图标组件和组件实例内的图标交换；只检查“有图标”而不检查实际 bounds、对齐和描边的回读是不完整的。

## 3. Keep two evidence layers and one Pixso output

1. The browser-computed manifest plus `html-reference.png` prove current HTML
   geometry, final computed style, child order, assets and visible appearance.
2. `Structured Output / <runId>` is the only Pixso output. It is produced from
   the Operation Plan and must use Variables, Styles, Auto Layout and verified
   Component Instances.

Do not publish the structured board until its screenshot matches the HTML
reference within tolerance and its readback proves component and Variable parity.

If a normal run fails for unexplained geometry or rendering reasons, stop it and
create a new `--mode diagnostic` run. That run may create one native
code-to-design baseline, must record the exact node id, and must remove only that
node after diagnosis. Diagnostic artifacts never become canonical inputs.

When the diagnostic cause is an image API incompatibility, reproduce it with a
minimal image fixture first, fix the shared runtime/compiler, end the diagnostic
run, and start a fresh normal run. Never let an image-only exception trigger a
full-page rollback before the structural import has completed.

## 4. Compile DOM Visual IR only from the current run

Every structured layout node must carry current browser evidence: a stable
`metadata.htmlSelector` and a positive `metadata.htmlRect` stamped with
`visualEvidenceSource: browser-computed-visual-manifest`. A Pixso-only wrapper
may be excluded only with `visualEvidenceExempt: true` and a concrete
`visualEvidenceExemptReason`. The legacy `selectorOptional` flag is invalid and
cannot remove nodes from coverage. Pattern defaults may fill missing semantics
only after the live value is known; they may not replace computed padding, gap,
size, alignment, color, border edge, radius, font, or visibility.

Ordered control groups must also carry their current browser child order. Capture
direct rendered children only: exclude mirrored overflow-menu entries, and never
reuse the order of `page-data`, an earlier Scene, or a component default. Text
nodes must preserve the browser's horizontal alignment explicitly in the Scene
and Operation Plan; centering the parent frame alone does not center a fill-width
Pixso text layer.

Generate and gate the plan:

```bash
node scripts/compile-pixso-import.mjs \
  --run-manifest /absolute/path/to/run-manifest.json \
  --visual-manifest /absolute/path/to/html-visual-manifest.json \
  --component-map assets/design-system/mapping-registry.json \
  --minimum-selector-coverage 0.8 \
  --minimum-visual-evidence-coverage 0.95 \
  --name "Imported HTML"

node scripts/validate-pixso-import-run.mjs \
  --run-manifest /absolute/path/to/run-manifest.json \
  --visual-manifest /absolute/path/to/html-visual-manifest.json \
  --operation-plan /absolute/path/to/pixso-operation-plan.json
```

Release requires at least 95% browser geometry coverage and should raise both
selector and geometry coverage toward `1.0`. A lower temporary selector
threshold may be used only to diagnose an unfinished mapper; it is not a
release pass.

The default compiler is `dom-visual-ir`. `legacy-semantic` is an explicit
diagnostic-only route for old domain Scene fixtures; it may not publish an
existing website import.

## 5. Resolve Components without changing geometry

Map a component only by canonical `logicalName`, exact Component Set/Variant, declared properties and slots. Never infer identity from visual similarity or layer names.

- Component-owned icons stay inside the Instance and use explicit icon/instance-swap properties.
- Page-owned icons use a fixed Token-sized Icon Slot and semantic SVG hydration.
- If replacing a DOM subtree with an Instance changes its outer bounds, padding, gap, icon size, text wrap, or alignment, the component contract is incompatible. Update the shared component/library contract or leave the region as a Token-bound composition and report the gap. Do not distort the page to fit the old component.
- Native fallback is allowed only when it is explicit, browser-measured,
  Token-bound, and reported in `componentRepairItems`; it must never be a silent
  substitution for a required mapped component.

### Component content-color contract

The selected Pixso Variant owns the visual color of a mapped Instance. Mapping
facts may record the Variant's expected content token for audit and component
maintenance, but HTML computed colors and mapping tokens must not be written as
per-instance overrides during a normal import. The compiler therefore omits
`contentColor` from the execution payload by default. When a semantic icon is
replaced inside a mapped icon slot, the plan may carry
`iconColorSource: "variant-content"`; the runtime copies the selected Variant's
existing icon Fill/Stroke onto that replacement only. It never changes the
label or the Instance's outer content color. The runtime only applies
`allowContentColorOverride: true` when an explicitly authored plan requests an
exception. This prevents a stale `brand/100` mapping from recoloring a Coremail
Ghost control whose native Variant is `neutral-dark/90`.
Readback must verify the exact Variable binding on the label and icon geometry;
checking only the Instance's outer fill is insufficient.

## 6. Execute transactionally

Publish the plan through the plugin bridge. The bridge verifies the run and visual-manifest provenance before exposure to Pixso. The plugin creates a visible draft, executes modules in dependency order, reads the complete result back, and swaps the canonical board only after all checks pass. The visible draft lets the user pause early; the old successful board remains visible if any phase fails.

Choose the executor without waiting for repeated connection timeouts:

```bash
node scripts/pixso-plugin-bridge.mjs status
```

`recommendedExecutor` remains `plugin` for a normal whole-page run. Publish once
after validation even when Pixso is temporarily disconnected; Bridge v7 keeps
the plan in a durable queue, performs one bounded reconnect, and then either
claims it after reconnect or exposes a clear `NEEDS_ATTENTION` action.
Claiming creates only a 15-second lease. The job becomes `running` only after
the plugin UI confirms `/start`, so a disconnected poll or stale debug request
cannot hold the active-run lock. The installed Permanent Executor is
self-contained and consumes only the fixed v1 data-plan vocabulary; Bridge is
optional automatic delivery, not an executable-code update channel. A shared
plugin can therefore import an Operation Plan directly without a local Agent.
Capability, plan-schema, kernel, and protocol mismatches are explicit blockers.
Never automatically prepare MCP calls or run both executors for the same run.

The plugin posts its result to `/result`; the UI keeps an unacknowledged result
durably and retries after a Bridge restart. The Bridge stores it at the run's
`pixso-plugin-result.json`, closes the execute/readback stages, and releases the
active run lock on failure or cancellation. Cancelled and terminal publications
cannot be reclaimed by a reloaded plugin. MCP `eval_script` is an explicit diagnostic or
user-approved emergency executor only and must consume the same plan and runtime.

Before the write, generate or read the official adapter contract:

```bash
node scripts/pixso-official-adapter.mjs --plan /absolute/path/pixso-operation-plan.json --plugin-ready
curl http://127.0.0.1:43982/official-adapter
```

This does not create a second renderer. It assigns current-file resource reads
to the official Pixso integration, full-page bulk creation to the Text-to-UI
native plugin, bounded repairs to `apply_design`, and acceptance to layout,
property-binding, and screenshot checks. Normal mode is blocked from routing to
`code_to_design`.

## 7. Acceptance gates

The run passes only when all are true:

- source: runId, HTML fingerprint, viewport, state, component map, Tokens and runtime all match;
- geometry: major bounds, padding, gap, alignment, layout direction and border edges differ by at most 1px;
- typography: family, size, weight, line height, wrapping and truncation match, allowing only rasterization noise;
- color/effects: fills, strokes, opacity, radius, shadows and gradients match and standard values are Variable/Style-bound;
- assets: no emoji/text-glyph substitutes, no cropped or duplicated icons, correct SVG fill/stroke channel, correct raster image;
- components: every required mapped region is a real `INSTANCE` with the expected main component, Variant, properties and slots;
- structure: no missing nodes, extra default content, hover-only controls, stale trial nodes, or root overflow;
- visual parity: compare `html-reference.png` and the structured board screenshot at the same crop and state; use a release threshold of at most 0.5% differing pixels after excluding normal text anti-aliasing.

Run the real pixel gate rather than accepting equal canvas dimensions:

```bash
node scripts/pixso-import-orchestrator.mjs diff \
  --reference /absolute/path/html-reference.png \
  --actual /absolute/path/pixso-structured.png \
  --out /absolute/path/visual-diff.json \
  --run-manifest /absolute/path/run-manifest.json \
  --pixel-threshold 20 --max-different-ratio 0.005
```

Failure leaves the new draft uncommitted and produces a report. Never fix one visible symptom by publishing a manual overlay or by reusing an older plan.
