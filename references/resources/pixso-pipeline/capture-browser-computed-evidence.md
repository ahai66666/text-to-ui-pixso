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

