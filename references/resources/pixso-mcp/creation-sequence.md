## Pixso 资源读取与诊断顺序

正常整页导入执行 existing-html-to-pixso，不用本节另建画板。MCP 用于当前文档事实读取、组件库任务和显式诊断。

1. 读取 mapping-registry 当前 profile，核对 Token/组件投影，不用缓存 GUID。
2. 在目标文档读取 Variables、样式、组件和页面，明确库阶段和目标页。
3. 组件库操作遵守 pixso-component-maintenance/usage；正常页面由同一捕获经 Unified Agent 执行。
4. 仅独立诊断或明确授权应急可使用一次 code_to_design 作为临时证据；使用真实静态捕获包，不传 URL/路径占位。
5. 回读准确目标的布局、变量、mainComponent、Variant 和插槽；截图不能替代绑定。
6. 失败报告阶段，不在普通导入中手改画布掩盖编译错误，不重复生成整页。

执行边界以 pixso-execution-invariants.md 为准。旧 ZIP/页面 Token 修复工具为显式兼容工具。
