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

