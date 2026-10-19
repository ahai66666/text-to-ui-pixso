# Pixso 执行预算

正常路径以 routes/existing-html-to-pixso.md 和 pixso-execution-invariants.md 为准：一次运行、捕获、编译、发布、回读和同状态对比。断连只按 Bridge 生命周期有界恢复，不重发、不自动切 MCP。

记录 runId、阶段/模块、实际与编排耗时、操作数量、实例/原生组合、资源修复项和视觉对比。页面存在与质量验收分开。超预算指出具体阶段。

诊断 ZIP 包仍可使用 validate-pixso-import-package.mjs；它不是正常路径的第二套渲染器。普通导入中不修改源、映射或运行时绕过失败；修复后创建新正常运行。
