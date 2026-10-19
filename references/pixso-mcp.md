# Pixso MCP Workflow

Use this reference before reading or writing a Pixso design.

For Text-to-UI whole-page HTML imports, this is not the normal executor. The
native Text-to-UI Pixso plugin is required because it provides the higher-
fidelity single-transaction path. Use MCP whole-page execution only in an
explicit converter diagnosis or after the user approves an emergency fallback;
never switch automatically because the plugin is disconnected.

## Connection

- MCP server name: `pixso`
- Default endpoint: `http://127.0.0.1:3667/mcp`
- Keep Pixso running with the target design file open and active.
- Inspect the live tool schemas before the first operation. Treat them as authoritative because the desktop MCP may evolve.
- The installed official Codex plugin may add workflow guidance, but it does
  not replace this local Desktop MCP or add a second HTML renderer. Do not
  register a remote STDIO proxy under the same `pixso` server name for this
  local-file workflow.
- If the server reports a missing session ID during a raw HTTP probe, complete the MCP `initialize` handshake and reuse the returned `mcp-session-id`. A normally configured Codex MCP connection handles this automatically.

## Target page and path preflight (failure-derived)

Treat the destination as an explicit identity, not as whatever Pixso currently
has selected. Keep these values separate in the task record:

- `browserHtmlPath`: the browser-checked source artifact;
- `pixsoImportHtmlPath` and any ZIP/HTML entry: the Pixso-specific import copy;
- `libraryPageName`/`libraryPageId`: normally `NewComponents` for strict reuse;
- `targetPageName`/`targetPageId`: the product page that owns the final Pattern;
- `targetFrameScope` and the freshly read `sourceFrameId`/component GUIDs.

An absolute file path is not a Pixso page ID. Do not derive a page from a
current selection, a same-name Frame, an old screenshot, an import archive, or
a cached GUID. Before every write, call `fetch_context` and enumerate pages with
`get_top_level_frames({"type":"page"})`; compare the active page ID and name
with the recorded phase target. Normalize only harmless case/whitespace; do
not accept a near match or an ambiguous duplicate.

Strict reuse has two explicit phases:

1. Focus `NewComponents`, verify the active page, and resolve/read back each
   source component, its containing page, variant, slots, SVGs, and Tokens.
2. Re-read the active page after the library phase, focus the recorded product
   page, re-enumerate pages, and only then create linked instances or page-owned
   content there.

If any page ID/name, frame scope, or source GUID is missing, stale, foreign, or
unexpected—or if the MCP cannot switch/focus pages—stop all writes, including
`code_to_design`, `apply_design`, bindings, replacement, and deletion. Preserve
the prepared HTML/import artifacts and ask the user to focus the exact target
page, using a fixed confirmation such as `已切换 Coremail`. Treat that reply as
a request to re-check, not as proof. If three consecutive checks still show the
same page, mark the Pixso stage blocked and report that no Pixso write occurred;
do not keep polling or create a replacement Frame on the wrong page.

## Pixso 资源读取与诊断顺序

正常整页导入执行 existing-html-to-pixso，不用本节另建画板。MCP 用于当前文档事实读取、组件库任务和显式诊断。

1. 读取 mapping-registry 当前 profile，核对 Token/组件投影，不用缓存 GUID。
2. 在目标文档读取 Variables、样式、组件和页面，明确库阶段和目标页。
3. 组件库操作遵守 pixso-component-maintenance/usage；正常页面由同一捕获经 Unified Agent 执行。
4. 仅独立诊断或明确授权应急可使用一次 code_to_design 作为临时证据；使用真实静态捕获包，不传 URL/路径占位。
5. 回读准确目标的布局、变量、mainComponent、Variant 和插槽；截图不能替代绑定。
6. 失败报告阶段，不在普通导入中手改画布掩盖编译错误，不重复生成整页。

执行边界以 pixso-execution-invariants.md 为准。旧 ZIP/页面 Token 修复工具为显式兼容工具。
## 组件、图标与执行边界

正常导入使用浏览器几何与 Unified Agent；不把旧 code_to_design 双通道当作执行入口。实例按真实 logicalName、Variant、插槽和当前文档身份解析。

图标保留原始 SVG、16/20/24px 显示、1/1.25/1.5px 描边和双轴居中，不用 icon_font 或近似路径替代。实例内图标颜色来自 Variant。检查裁切、实际 bounds 和变量绑定，不能只看槽位名称。

组件库维护修复共享来源；正常导入记录可选映射和资源修复项。诊断 MCP 消费同一 Operation Plan 与版本化运行时，不重新计算布局。
## Page Binding Bridge（页面 Token 快速通道）

当目标是“先把 HTML 页面视觉稿导入，再低成本补齐页面 Token”时，使用
`scripts/pixso-page-binding-bridge-plugin`，不要调用组件注册同步插件代替它。两者边界如下：

### 双轨标记协议

HTML 使用 `assets/design-system/tokens.utility.css` 提供的 Tailwind-like `u-`
前缀 Class 控制浏览器视觉，例如 `u-bg-neutral-light-100`、`u-p-space-5`
和 `u-type-body-l`。这些 Class 不是 Pixso 绑定凭证，因为 `code_to_design`
可能不会保留原始 Class 名称。

每个要映射到 Pixso 的页面目标同时带有稳定的
`data-px-key="pane.primary.surface"`。预处理脚本把它转为
`id="px-key:pane.primary.surface"`，插件按语义 key 查找节点，再按
`page-binding-manifest.json` 的 `token` 与 `property` 绑定变量。插件不按
hex、图层可见名称或 CSS Class 猜测变量。

1. `prepare-pixso-html.mjs` 负责把精确 SVG 复制到 Pixso 导入副本；随后
   `prepare-pixso-binding-html.mjs` 为带 `data-px-key` 的页面节点补充稳定语义标记。
2. 在 Pixso 中确认活动页严格为目标产品页（当前 Coremail 为 `coremail`），并选中最终 Frame。
3. 运行“预检当前页面绑定（只读）”。页面不匹配、Frame 不唯一、标记缺失或变量名重复时，预检失败且后续绑定不执行。
4. 预检通过后运行“批量绑定当前页面 Token”，只绑定 manifest 声明的 `fills`/`strokes`，每个写入都必须 read-back 验证。
5. 运行“审计当前页面绑定（只读）”，使用 `scripts/validate-page-binding-audit.mjs` 检查 `schemaVersion: 1`、一致的受管分母与零未验证绑定。

这是页面 Token 的快速通道，不等于 strict registered reuse：它不创建或替换 NewComponents 实例，也不宣称整页所有文字、间距和组件都已绑定。需要 Pixso 原生组件实例时，仍回到 NewComponents 的严格两阶段解析，并使用新鲜的 Variant GUID。

## Token Gate

Use `assets/design-system/pixso-core-baseline.json` as the complete Pixso
variable scope: 127 production variables across four collections.
The Color collection contains the complete 56-variable primitive palette from
`assets/design-system/core-color-token-table.md`: Brand, Neutral Dark, Neutral
Light, Function, and Multi. Do not create semantic color aliases in Pixso;
components bind these core variables directly. Spacing, Size & Layout, and
Typography likewise contain primitives only. Code-side semantic and component
aliases resolve through `token-runtime-map.json`; they never become additional
Pixso variables.
Use the generated `scripts/pixso-token-sync-plugin/manifest.json` to update the
baseline in Pixso. It idempotently creates or updates the four approved
collections and 127 variables.
Use `assets/design-system/pixso-manual-additions.json` as the complete list of
approved additions. Its current count is zero.

### Manually added variables

Do not manually add page, component, or semantic variables. Reuse the approved
primitive that resolves to the same value and keep the semantic name in
CSS/JSON:

| Collection | Use for | Naming examples |
| --- | --- | --- |
| `Color` / `Light` | 56 approved colors | `brand/100`, `neutral-dark/05` |
| `Spacing` / `Compact` | Eight spacing primitives | `space/3`, `space/6` |
| `Size & Layout` / `Desktop` | Size, radius, width, height, divider, opacity primitives | `size/40`, `radius/08`, `layout/width/360`, `opacity/40` |
| `Typography` / `HarmonyOS Sans` | Atomic font family, size, line-height, weight, letter spacing | `font/size/14`, `font/weight/500` |

To extend the baseline, first add a genuinely new primitive to the Token source,
update the baseline, regenerate all three mapping artifacts, and pass the
release gate. Never solve a page-level need by adding `component/*`,
`layout/shell/*`, `gap/*`, or `padding/*` variables. Create shadows as Effect
Styles and complete text treatments as Text Styles.

Do not create components or patterns until the active Pixso file passes this gate:

For a free team or a file at the variable-collection limit, first load
`scripts/pixso-token-probe-plugin/manifest.json` and run “写入 3 个测试变量”.
The probe reuses `Color`, `Size & Layout`, and `Typography`; it does not create
another collection. Run “清理测试变量” after verification.

1. Confirm the target file is active and its intended font appears in `fetch_context`.
2. Create temporary color, number, and string variables in the existing approved collections. Do not create a fifth collection.
3. Verify persistence with all three read paths: `read_variables`, `get_variable_sets`, and `get_variables`. A generated GUID from `write_variables` is not proof of persistence.
4. Bind a temporary node to the probe color and number. Treat every unresolved-variable warning as a failed gate.
5. Delete only the temporary node and probe variables. Preserve the existing approved collections.
6. Only after the probe passes, sync the generated manifest in small batches and compare the Pixso read-back count to the manifest summary.

## Binding Audit

After import or repair, query the top-level Frame without resolving variables.
In strict structured reuse, record every mapped binding, linked component
instance, and remaining literal style finding in `pixso-binding-audit.json` and
validate it with:

```bash
node scripts/validate-dual-output.mjs \
  --page-spec /absolute/path/to/page-spec.json \
  --pixso-audit /absolute/path/to/pixso-binding-audit.json
```

An empty hardcoded-color search is not enough in strict mode: every page-spec
variable must appear in the live binding list. In fast visual import, record the
bindings that were actually proven and list remaining literals as known import
limits; do not run the strict zero-literal claim. Read
`dual-output-contract.md` for the complete contract.

Also record a whole-Frame `coverageSummary`: unique nodes, color-bearing nodes,
variable-bound color nodes, literal-paint nodes, layer-opacity literal nodes,
and intrinsic-alpha paints. The zero-literal gate applies only to strict
structured reuse; fast visual import reports the same counts without treating
remaining literals as a blocker.

Pixso may serialize a translucent variable such as `$neutral-dark/90` as both
the variable name and its intrinsic alpha (for example, `opacity: 0.898`) on the
paint. Do not classify that read-back as double opacity. Rebind one
representative node to the same variable, read it again, and separately inspect
the node-level opacity. Only an additional node/layer opacity is a second
opacity operation.

If a linked component's internal icon or text layer exposes no bindable color
property, record it in `componentColorFindings` as a component-library gap.
Do not detach or locally restyle the instance to make the page audit pass.

If `write_variables` returns GUIDs but both native read tools remain empty, the desktop MCP variable writer is not persisting data. Do not hardcode component values. Generate the fallback artifacts with:

```bash
node scripts/build-pixso-token-manifest.mjs --write
```

Then load `scripts/pixso-token-sync-plugin/manifest.json` as a Pixso development plugin and run “同步 Token” in the target file. The plugin uses Pixso's official `pixso.variables` API and is idempotent. `assets/design-system/pixso-tokens-studio.json` is the alternative Tokens Studio import file. After either fallback, rerun all three read checks before continuing.

## Existing Design and HTML Handoff

1. Re-read the current Pixso document after the user has made edits.
2. Resolve the exact page and top-level Frame; do not rely on a stale GUID from a previous active document.
3. Synchronize approved structural, content, state, and interaction changes into `page-spec.json`.
4. Use `get_screenshot` for visual reference and `design_to_code` for HTML output when the live tools provide it.
5. Treat the latest Pixso state as authoritative over the initial HTML draft, previous HTML, or cached observations.
6. Regenerate or reconcile the final implementation from the synchronized contract, then compare it at the approved desktop viewport, normally `1728 × 1152px`.

## Failure Handling

- `please open a design file`: ask the user to open and focus the intended Pixso design file, then call `fetch_context` again before any retry.
- `activePageMismatch`: when `get_all_components` reports a component in a different Pixso page than the page returned by `fetch_context`, treat the component as read-only discovery evidence. Do not mutate it by guessed or colliding node ID. Ask the user to open/focus the component-library page, refresh `fetch_context`, and re-resolve the component GUID before any repair or linked-instance replacement.
- A read returns nodes from an unexpected file: stop mutations, refresh context, confirm the active page/Frame, and never edit by a stale GUID.
- `code_to_design` succeeds but native edits fail: report partial capability honestly; do not claim full structured-edit QA.
- `code_to_design` succeeds but the Frame has major absolute-bounds overflow,
  clipped regions, or an obviously wrong auto-layout direction: classify it as
  an import-geometry failure. Repair the existing Frame when the cause is
  deterministic; otherwise preserve the artifact and report the limitation.
  Do not invoke a second whole-page renderer to mask the mismatch without
  explicit user approval.
- Do not fall back to Sketch or Figma unless the user explicitly requests that tool in the current task.

## Deliverable Reference

Report the Pixso page name, top-level Frame name, GUID, and Pixso URL when available. Include the final screenshot and HTML path after the approval-to-code phase.
