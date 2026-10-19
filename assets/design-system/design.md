# HarmonyOS PC 设计系统来源

日常页面使用 SKILL.md 和阶段任务包，不将本文件复制为项目填空模板。

- Blueprint/配方：业务、信息层级、实体关系、状态和恢复路径。
- 单组件 API：packages/component-contracts/src/components/<id>.json。
- 结构与样式：packages/components-html、component-styles；页面不得重画。
- HTML Token：packages/tokens/src；基础含义与跨端关系：assets/design-system/tokens.*.json、mapping-registry.json。同名投影不能直接去重删除。
- Pattern 几何、插槽和滚动：pattern-contracts.json 与 Pattern Runtime。
- 标题栏：当前 titlebar 主题和 titlebar-scene-contracts.json；旧原生 GUID 或尺寸示例不覆盖当前契约。
- 图标：references/icon-selection.md。
- Pixso：references/pixso-execution-invariants.md；变量与组件身份通过当前文档读取证明。

深度规则保存在 references/resources/foundations/ 和 component-visual/，用 query-resources --search 查 ID 后精确读取。数值示例仅供解释，实际输出使用标准 Token 和工厂。

旧产品填空、空白断点/动效/z-index、移动端占位、Tailwind 手写组件模板和旧 Pixso 三集合说明退出活动入口。更新前原文在本轮 before.zip。用户当前要求优先；按业务、视觉、平台和实现职责确认来源。

动态页面、独立组件/CSS、预览与正式交付及六条工作流均保留。
