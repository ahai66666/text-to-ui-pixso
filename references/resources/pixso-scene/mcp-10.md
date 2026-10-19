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

