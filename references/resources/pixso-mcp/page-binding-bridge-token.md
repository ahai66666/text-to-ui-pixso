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

