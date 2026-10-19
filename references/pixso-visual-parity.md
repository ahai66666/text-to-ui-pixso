# HTML 与 Pixso 视觉一致性契约

HTML 和 Pixso 是同一份页面规则的两个渲染器，不是两份可以各自凭感觉调的稿子。视觉比对只有在来源、状态、视口和几何都一致时才有意义。

## 1. 先锁定同一份输入

- HTML 截图与 Pixso 导入必须来自同一个 `page-spec.json`、同一个静态导入副本和同一个 `visual-parity.json`。
- 在导入前固定可见状态：账号、路由、选中项、查询词、筛选、排序、展开状态、滚动位置、字体加载状态。把状态写成可读的 `data-visual-state-id`，不要依赖浏览器上一次点击留下的状态。
- 视觉比较前先排除画布标尺、编辑器工具栏和浏览器外框；只比较页面内容区域。
- 正常结构化导入不调用 `code_to_design`，直接比较当前 HTML 截图与插件生成的同一个 canonical Frame。只有独立诊断运行可以调用一次 `code_to_design`，且其临时 Frame 不得成为后续输入。

## 2. 1728 × 1152 是 CSS 视口，不是浏览器 API 的盲填值

浏览器自动化工具的 `viewport.set({ width, height })` 可能接收物理像素，而页面的 `innerWidth`/`innerHeight` 是 CSS 像素。必须先读取 `devicePixelRatio`，再校准：

```text
physicalWidth  = round(targetCssWidth  × devicePixelRatio)
physicalHeight = round(targetCssHeight × devicePixelRatio)
```

设置物理视口后，重新读取 `window.innerWidth`、`window.innerHeight` 和 `devicePixelRatio`；两项 CSS 尺寸允许误差不超过 1px 才能继续截图或导入。禁止把“设置了 1728 × 1152”当成已验证的 CSS 视口。

当前目标为 `1728 × 1152 CSS px`。例如设备倍率约为 `1.12` 时，应尝试物理视口约 `1935 × 1290`，然后以页面实际 `innerWidth/innerHeight` 为准记录校准结果。

截图还必须是已归一化的比较栅格：PNG 的真实宽高必须等于目标 CSS
画布（当前为 `1728 × 1152`），不能是浏览器侧栏后的可见面板宽度，也
不能直接使用 DPR 放大的 backing surface。采集完成后通过
`pixso-import-orchestrator.mjs capture` 提交 `capture-bundle.json`；没有该
Bundle 时，编译和 Pixso 发布必须失败且不得创建草稿画板。

## 3. 先验收几何，再判断样式

桌面三栏页面至少记录并核验：

- Frame：`1728 × 1152`
- Titlebar：`64px`
- Primary Navigation：`240px`（收起 `64px`）
- Secondary/List：`360px`
- Main Detail：剩余宽度
- 工作区高度：`1088px`
- Main Content/Main Detail 左右内边距：`24px`，顶部 `16px`，底部 `0px`

允许浏览器与 Pixso 的测量有 1px 舍入误差；超过误差先修复视口、Frame 或 Token，不先改文字和组件样式。

## 4. 导入前和导入后各做一次同状态检查

浏览器证据必须是静态可见快照：动态列表、详情卡片和状态标签必须在采集时已经可见。导入前检查每个关键区域的子节点数、可见文本长度和非零尺寸；导入后只截一张首屏图并读取每个关键区域的代表节点。若内容为空，记录为 `importSnapshotFailure`，修复采集状态后创建新运行。

导入副本还必须保留 `data-visual-state-id`、`data-canvas-size` 和语义 `data-px-key`。绑定副本用 `prepare-pixso-binding-html.mjs` 生成并记录 marker 数量；没有 marker 的普通快速导入可以是视觉稿，但不能宣称 Token/Component 已绑定。将 ZIP 送入 Pixso 前，使用 `validate-pixso-import-package.mjs` 按 `fast` 或 `strict` 通道做入口、静态内容、本地资源、状态标记和颜色写法检查；strict 的最终颜色一致性仍以 Pixso `$variable` 读回为准。

## 5. 验收顺序

1. 校验页面契约和视觉一致性 manifest。
2. 用校准后的 CSS 视口打开浏览器，截图并记录状态 ID。
3. 从同一运行的 Operation Plan 单次生成 Pixso canonical Frame，记录执行器与模块耗时，读取 Frame 尺寸和三栏边界。
4. 在相同内容状态下比较 HTML 与 Pixso 截图；先看边界、内边距、字体加载和选中态，再看颜色、图标和阴影。
5. 同一次读回确认 Token 绑定和 Component Instance；禁止先生成视觉近似稿、再用第二套逻辑逐个替换。

## 6. 交付记录

每个同时交付 HTML/Pixso 的页面都应保留：目标 CSS 视口、实际 DPR、校准后的物理视口、已验证的 CSS 尺寸、Pixso page/frame ID、状态 ID、关键几何、各阶段耗时、操作数量、组件/变量读回和视觉差异。这样下一次不会把不同状态、不同裁切或不同视口误判成组件 CSS 不一致。
