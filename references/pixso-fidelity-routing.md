# Pixso 执行路径

正常 HTML 导入使用 existing-html-to-pixso：当前 HTTP 页面 → 浏览器计算证据与截图 → capture bundle → DOM Visual IR → Operation Plan → Unified Agent → 回读与同状态对比。

正常模式不调用 code_to_design，不因插件断连自动换执行器。只发布一次；断连由 Bridge 保留当前 publication，按有界连接政策等待同一插件领取。页面已提交与质量验收分别报告。

converter-diagnosis 为独立诊断运行。只有该流程或用户明确授权应急可用 MCP/一次 code_to_design 作为临时证据；不能成为正常运行输入。旧 ZIP/页面 Token 修复工具为显式兼容工具。

映射、原生组合、Token、回读和视觉差异分别给出证据。可安全保留浏览器几何的可选映射缺口记录为 componentRepairItems；非法计划、来源或结构错误仍阻断。不要把原生组合计为 Component Instance。

当前执行约束见 pixso-execution-invariants.md；按 resource-workflow.md 查询 readiness、capture、compile、publish、readback 或 diagnosis。组件库维护走 pixso-component-library。
