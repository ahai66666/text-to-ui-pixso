# Pixso Native Scene（插件与 MCP 共用）

Text-to-UI 有两条严格分离的 Pixso 编译路径。

对于“已有 HTML → Pixso”，生产路径是：

1. `html-visual-manifest.json`：当前浏览器计算结果。
2. `dom-visual-ir.json`：唯一几何来源，保存规范化的 selector、父子关系、绝对 bounds、样式和组件候选。
3. `pixso-operation-plan.json`：先锁定 DOM 几何，再执行兼容组件替换和图标填充。

对于“从需求同时生成 HTML/Pixso”或 Coremail 语义诊断，旧原生 Scene 路径是：

1. `page-data.json`：业务内容唯一数据源。
2. `pixso-scene.json`：布局、节点、Token、图标和组件意图，不保存文档 GUID。
3. `pixso-operation-plan.json`：按父子依赖排序的符号化 Pixso 操作。

HTML 页面和语义 Scene 可以消费同一份 page-data，但这条规则不得用于已有网站导入。已有 HTML 的 Pixso 几何只能来自 DOM Visual IR；`page-data` 和 Coremail Scene 只能补充语义，不能覆盖当前 computed bounds、颜色、边距、Grid 或文字换行。两条路径都不调用 `code_to_design` 作为生产页面渲染器。

## HTML computed visual state
普通导入使用本包 scripts/browser-visual-manifest.js 的 collectTextToUiVisualManifest，记录实际 DOM、计算样式、几何、可见文字、图像和图标；schemaVersion4、source browser-computed-visual-manifest，与当前 runId、源码摘要、视口、缩放和状态绑定。固定交接中的滚动位置。
由 scripts/pixso-capture-bundle.mjs 校验同一运行的清单和截图，由 scripts/html-visual-contract.mjs 校验依赖指纹。无需 HTML 技能或 packages/components-html。画板尺寸来自当前目标视口；默认1728×1152，用户指定时使用指定值。
历史 page-spec 的 html-live-computed-style 快照仅供明确选择 legacy-semantic 的诊断路径，不作为普通导入证据。缺失或过期采集不能由历史快照或 page-data 代替。
## DOM Visual IR 三阶段生成模型

已有 HTML 的 Operation Plan 按以下顺序执行：

1. `layout`：按浏览器相对 bounds 创建绝对定位的原生节点，固定外部几何。
2. `component-enrichment`：仅把尺寸和槽位兼容的候选替换为真实 Instance，且保持锁定 bounds。
3. `icon-hydration`：在固定 Icon Slot 内填充 SVG，不允许改变父布局。

`scripts/compile-pixso-import.mjs` 默认使用 `dom-visual-ir`。旧 Coremail Scene
只能显式传入 `--pipeline legacy-semantic`，并由
`scripts/coremail-semantic-adapter.mjs` 隔离。

## 旧 Scene 两阶段生成模型

资源预检后，一个 Operation Plan 必须按顺序执行两个构建阶段：

1. `layout`：创建框架、业务组合、文字、组件 Instance 和 Icon Slot。Icon Slot 是
   固定的 `20×20`、`24×24` 等 Token 化容器，内部只放统一占位节点，不包含 SVG。
2. `icon-hydration`：根据 `semanticAlias` 将真实 Pixso 图标 Instance 或 SVG Vector
   放入已有 Slot，只删除占位子节点，不删除或替换 Slot。

`resources.icons` 是 SVG 数据的唯一保存位置。`hydrate-icon` 只记录
`targetNodeId`、alias、size 与颜色角色，禁止在每个操作中复制完整 SVG。映射组件内部
已有的图标不再生成第二份。

复杂页面的图标填充使用安全的原生 Vector 路径转换；页面导入期间不调用
`pixso.createNodeFromSvg` 或 `pixso.createComponentFromNode`，也不临时生成整套语义图标
Component。这样可以避开 Pixso 桌面端的陈旧 `S_Guid` 转换路径；当前运行时不支持
`createVector` 时，图标阶段会明确失败并保留失败草稿，不会用黑色占位图标冒充成功。

图标颜色绑定必须保留源通道语义：Lucide 等 stroke-only 图标只能替换已有 Stroke
Paint，实心资产只能替换已有 Fill Paint；禁止为了绑定颜色给没有 Fill 的路径新增
Fill。填充完成后 Slot 的宽高、父级和 Auto Layout 属性必须与填充前一致。

所有标准描边图标遵循同一份显示尺寸表：16px 使用 1px、20px 使用 1.25px、24px
使用 1.5px。Icon Slot 是独立的正方形热区，主轴和交叉轴都必须为 `CENTER`；填充
完成后按实际 Vector bounds 计算 x/y，使图形在热区左右和上下同时居中。该规则同时
适用于页面 SVG、NewComponents 中的图标组件和组件 Instance，不能因节点已存在而跳过
修复或沿用旧的上对齐。

映射组件的颜色由 Pixso Variant 自己控制。HTML 最终颜色仍作为兼容性证据记录，不能
在创建 Instance 后通过 `contentColor` 或 HTML 颜色重着色覆盖组件。如果映射需要把
语义图标替换进 Variant 的图标槽，只能通过计划中的 `iconColorSource: "variant-content"`
读取该 Variant 已有的 Fill/Stroke，并把同一颜色转移到新图标几何；这不是 HTML 颜色
覆盖，也不能改变文字或 Instance 外层颜色。若 HTML 与 Pixso 的组件契约确实不一致，
应调整映射到正确 Variant，或退回 Token 化原生组合，而不是修改当前画板上的 Instance。
只有显式授权的 native-composition 覆盖才允许使用颜色重写。

布局阶段同时遵守两个跨项目规则：

- native Frame 的 `fixed` 宽高必须携带 canonical Variable，裸 `fixed` 阻断生成。
- 横向容器中不得直接放置多个无比例约束的 `fill` 文本。列表条目、消息头、会议、
  附件等必须先生成明确的 copy stack、metadata row 和 trailing actions 组合层。

## Surface 继承与透明背景

Scene 默认采用“背景继承”，而不是“每个 Frame 自动填白”。只有根画板、栏容器、
卡片、选中态、提示态等明确的 `surfaceOwner` 可以拥有 Surface。普通布局 Frame、
Titlebar 包装层、未选中导航项和内容组合层默认透明；如果子容器声明的 Fill 与继承到的
父级 Surface 相同，生成器必须把子容器归一化为 `{ kind: "transparent" }`。这条规则
同时避免半透明 Token 在父子两层重复叠加后变深。

文字和图标的前景色不参与 Surface 继承。确实需要与父级同色但独立绘制的卡片，必须
显式声明 `metadata.surfaceOwner: true`，禁止依赖插件为所有 Frame 添加默认白底。

## Divider ownership 与单边描边

描边不是“节点有 Stroke 就默认四边绘制”。Scene 必须把边的归属写成显式的
`style.strokeEdges`，执行器会为 top、right、bottom、left 四个权重逐一赋值，并把
未声明的边清零。三栏工作台的 `Brand title segment`、`Search title segment`、
`Primary navigation pane` 和 `Secondary list pane` 都只声明 `["right"]`；
`Detail title segment` 只声明 `["bottom"]`。如果一个结构只是列间分隔线，不能省略
`strokeEdges`，因为省略会被解释为完整四边描边并在导入后产生额外边框。

## 位图资源

PNG/JPG 等位图必须声明为 Scene `image` 节点，并在 `resources.images` 中以稳定符号
`ref` 携带 MIME 类型与 base64 数据。Operation Plan 输出 `ensure-image` 和
`create-image`；执行器通过 Pixso `base64Decode`、`createImage` 创建文档图片句柄，
再生成带 `IMAGE` Fill 的原生 Rectangle。Scene 和仓库不保存 Pixso image hash。

品牌 Logo、头像和内容缩略图不得用相似的语义 SVG 代替。插件读回时必须确认 IMAGE
Fill 和 `text-to-ui-image-ref` 均存在；资源缺失或当前运行时不支持图片 API 时阻断。

## 运行顺序

```bash
node scripts/generate-pixso-scene.mjs \
  --page-spec /absolute/path/page-spec.json \
  --layout-contract /absolute/path/layout-contract.json \
  --page-data /absolute/path/page-data.json \
  --component-map assets/design-system/mapping-registry.json \
  --html-root /absolute/path/html-source-root \
  --out /absolute/path/pixso-scene.json

node scripts/generate-pixso-operation-plan.mjs \
  --scene /absolute/path/pixso-scene.json \
  --component-map assets/design-system/mapping-registry.json \
  --out /absolute/path/pixso-operation-plan.json

node scripts/prepare-pixso-operation-batches.mjs \
  --plan /absolute/path/pixso-operation-plan.json \
  --out /absolute/path/pixso-operation-batches.json

node scripts/prepare-pixso-mcp-batches.mjs \
  --plan /absolute/path/pixso-operation-plan.json \
  --out /absolute/path/pixso-mcp-call-plan.json
```

## 组件规则

`mapping-registry.json` 是组件跨源关系的唯一编辑来源；
`pixso-native-component-map.json` 是其中面向旧运行时的兼容投影。只有投影中
`availability: mapped` 的逻辑组件生成 `create-instance`。映射缺失时，生成带有
`componentRef` 和 `fallbackRecipe` 的原生 Frame 组合；这种降级仍使用共享 Token 与语义图标。
这类组件不会阻塞整页结构导入；编译器会在 Operation Plan 与预检报告中写入
`componentRepairItems`，记录逻辑名、选择器、原因和后续修复动作。只有没有安全
原生兜底的非法计划或结构契约错误才会阻止发布。

HTML 组件的 Pixso 目标由所选 `packages/component-contracts/src/components/<id>.json` 契约
生成，不允许靠显示名称猜测。生产库默认写入 `NewComponents`；人工审核时先
把同一计划写入 `Components`，不会触碰生产库：

```bash
node scripts/generate-pixso-component-library-plan.mjs \
  --out /absolute/path/pixso-component-library-plan.json
```

```bash
node scripts/generate-pixso-component-library-plan.mjs \
  --library-page Components \
  --out /absolute/path/pixso-component-library-review-plan.json
```

组件库计划为每个 HTML logicalName 创建真实 `COMPONENT`，把
`props`、`slots`、`slotContracts`、Token roles 和 HTML 源路径写入来源数据，并把
每个槽位落成 Pixso 的 `#slot-name` 命名层。组件库缺失某个 HTML 槽位时，页面路径必须
阻断该组件；不能用旁边的 Button、Text 或 Frame 拼出一个视觉近似物。Search 的
`advanced-search` 就是这个规则的典型例子：它必须来自带 `#advanced-search` 槽位的
单一 Search Instance。

当前首批映射为 Button、Icon Text Button、Icon Button、Selection Dropdown、Search 和 Checkbox。Titlebar、Sidebar Item、邮件 Item、Avatar、Badge、Attachment 等保持 native-composition，直到 Pixso 中存在明确映射。

Titlebar 的第三栏业务操作必须遵循同一份 `main-detail-actions` 契约：一组业务操作要么全部使用 `Icon Button/Ghost/Default`，要么全部使用 `Icon Text Button/Ghost/Default`，禁止混用；末尾固定保留 `Icon Button/Ghost/Default`（`action/more`）作为唯一的溢出触发器例外。Scene 在 Titlebar component props 中写入 `actionOverflow: { strategy: "collapse-to-more", fit: "available-width" }`；宽度不足时只把前面的业务操作按原顺序折叠到 More 菜单，并保持原先选定的按钮模式，系统操作和窗口控制不参与折叠。静态画板只生成可见按钮和 More 触发器，不生成打开的菜单状态。

## 执行通道：整页导入强制插件，MCP 仅显式诊断

默认执行器是 Pixso Unified Agent v2（仓库源码：`scripts/pixso-unified-agent-plugin/`）。使用者可选择插件包的本地位置，并在 Pixso Developer Mode 中加载该目录下的 `manifest.json`。它和
Text-to-UI 共享执行运行时，在当前文件中解析 Variables、Styles、Component Set
及其 Variant，并在节点加入父级后完成 Auto Layout 与绑定。它不会覆盖同名旧画板，
也不会用覆盖层或绝对坐标重绘来掩盖组件、变量或布局失败。

交互迭代默认使用本地自动桥接：用户在当前 Pixso 文件中启动一次插件并保持右侧栏
开启，Text-to-UI 每次生成计划后运行：

```bash
node scripts/start-text-to-ui-services.mjs start
node scripts/pixso-plugin-bridge.mjs publish /absolute/path/pixso-operation-plan.json
```

组件库计划也可以走同一条桥接通道：

```bash
node scripts/pixso-plugin-bridge.mjs publish /absolute/path/pixso-component-library-plan.json
```

插件会根据 `kind` 自动进入组件库模式，并写入计划指定的页面；生产计划默认是
`NewComponents`，审核计划可以是 `Components`。审核计划只用于人工检查，不会自动
成为页面 Instance 的来源。这样组件库同步不需要手动点选文件，但第一次建立审核库
仍建议先确认 Pixso 当前文档和 `Components` 页面。

服务组固定使用低冲突端口：`43173` 是唯一对外 Preview Hub，`43175` 是仅由 Hub
代理的组件预览内部端口，`43982` 是 Pixso 插件自动桥。启动命令在后台托管服务并可
重复执行；不得为单个页面另开 `4173`，也不得在端口被未知程序占用时自动结束该程序。

`43982` 同时承担本地编排服务职责。服务协议当前为 `3`，插件 Runtime 当前为
`5.0.0`。插件 UI 连接后必须上报 Kernel、协议、计划版本和能力清单；Bridge 会在 `/claim` 之前
检查版本，旧插件只会得到“需要更新插件”的阻断结果，不会执行新计划。用
`GET /service-status` 检查连接、当前 publication 和 job，用 `GET /job` 检查任务结果。
计划和规则可以通过服务持续更新；插件执行代码或 Pixso API 适配发生变化时，需要重新
加载新的安装包，服务不会下载执行任意远程脚本。

插件会自动接收并执行。自动更新以 `execution.canonicalKey`、`page.targetFrame` 或
`page.name` 作为稳定身份：新树作为隐藏草稿生成，通过读回后才替换同身份的旧画板；
暂停或失败时删除草稿并保留旧画板。正常导入最终只允许一个托管画板。
桥接通道只保存最后一次发布的计划；发布页面计划后应确认 `/claim` 返回的 `kind`
是 `pixso-operation-plan`，并且 `page.name` 与目标页面一致，避免上一轮组件库审核计划
覆盖页面计划。若 `execution.targetPage` 在当前文件中不存在，运行时会按该名称创建目标
页，再在其中生成根画板，因此页面导入不依赖用户预先手动建页。
同计划重复发布仍遵守去重；自动桥接会替换同一 canonical Frame，不保留用户可操作的多版本入口。
插件界面会依次报告“布局与内容”和“图标填充”；默认仍是一键完成。两阶段共享同一个
Scene 和 canonical Frame。
Pixso 没有公开的外部静默启动插件接口，因此每个文件或会话仍需用户启动一次插件。

插件未安装、未连接或版本不兼容时，正常整页任务必须停止，不得自动切换 MCP。只有
converter-diagnosis 或用户明确批准低保真应急路径时，才可启用 MCP；它仍必须执行同一
版本的共享 Pixso Plugin API 运行时，不能重新计算布局、重新解析业务数据或临时手写
另一套页面。`prepare-pixso-mcp-batches.mjs` 输出的实际调用类型是 `eval_script`。

## MCP 适配

MCP 读取同一 Operation Plan，按 `pixso-operation-batches.json` 的顺序调用 Pixso 接口。每批最多 100 个操作；父 Frame 必须先于子节点创建。组件通过 `pixsoName` 精确解析，Variables 通过 `collection + mode + name` 解析，禁止把 GUID 回写到 Scene 或仓库。

`pixso-mcp-call-plan.json` 是可直接交给 MCP `eval_script` 的调用计划。它嵌入与插件
相同的版本化执行运行时和同一份 Operation Plan；运行时在当前文件解析真实资源 ID。
`apply_design` 仅用于已生成画板上的小型原子修复，不能再承担整页布局生成。

跨批次回读的 Scene id、run id、canonical key、图片引用、组件来源和 Token 审计标记
写入 Pixso shared plugin data namespace `text-to-ui`，并同步写入普通 `pluginData`
兼容插件 UI。不能把普通 `pluginData` 作为 MCP 批次间唯一凭证：每个
`eval_script` 都可能是独立运行时。最终批次只有在共享元数据回读通过后才移除临时
节点名前缀并提交新画板；若普通回读误报 `missing-node`，先检查共享元数据和审计计划
是否保留了 `imageRef`，不得重复生成整页。

为了避免复杂页面一次性传输造成丢节点或超时，调用计划会把页面拆成五个有依赖关系的
模块：`shell`（画板壳层与全局 Titlebar）、`primary-navigation`（左侧一级导航）、
`secondary-list`（搜索、收件箱和邮件列表）、`main-detail`（详情正文、会议卡片和附件）、
`icon-hydration`（组件图标填充）。模块内部仍按父节点先于子节点的原始 Operation Index
切分；Variables、Styles 和别名资源在每个批次都完整传递，图片只随创建它的批次传递，
语义 SVG 只随图标批次传递。

当 `replaceExisting` 开启时，插件先创建一个带运行标记的隐藏草稿，旧 canonical 画板保持
可见。最后一个图标模块通过完整回读后，才删除旧根并提交新根；任何中间模块、暂停或最终
回读失败都会删除未完成草稿，保留旧正式画板。显式诊断用 MCP 仍共享同一模块执行器，但
不得成为正常整页任务的自动回退。

执行前必须先通过资源预检：所有 Variable、Text/Effect Style、语义 SVG、Component
Set 与 Variant 都必须存在。任一项缺失即阻断，不能退回普通 RGBA、空图标、错误变体、
覆盖层或手写 lookalike。执行后读回每个页面自有 Fill 的 Variable 绑定、Text Style 与
Instance 数量；读回失败的 Frame 只能作为失败草稿，不能报告为完成。

## 页面状态

当前版本固定 `stateScope: default-visible`。导入的是默认可见的静态快照：hover、focus、
临时菜单、快捷操作和逐行选择 Checkbox 不进入主画板；只有默认状态中确实可见的控件
（例如列表工具栏的“全选”）才生成。交互态应作为显式独立状态板生成，不能让 HTML 的
hover 行为泄漏到静态画板。弹层、Toast、空状态和 AI 标签切换不生成额外画板。

`page-data.json` 中的可选业务段落也遵循同一规则：数据存在不代表 HTML 默认态会显示它。
`roadmap`、`quote`、`ai` 等段落只有显式写入 `defaultVisible: true` 才能进入
`default-visible` Scene；省略或写成 `false` 时保留为后续状态数据，但静态 Pixso 画板不创建
对应的卡片、填充或文本。这样可以阻止 Pixso 单独生成 HTML 没有的紫色卡片或灰色引用块。

自动替换还兼容旧版没有写入 plugin data 的画板：规范根名称及其确定性的 ` / N`
后缀都视为同一个 canonical 输出身份。新树读回成功后再清理旧根，避免插件升级或
重复发布时不断累积设计稿。

Coremail 默认画布为 `1728 × 1152`；主导航和列表栏分别通过
`layout/width/240`、`layout/width/360` 绑定，三栏 Titlebar 统一通过
`size/64` 绑定。布局中的间距、尺寸、圆角和页面视觉属性必须保留
`variableRef`/`styleRef`，不能退化成 CSS 字符串或裸像素值。
