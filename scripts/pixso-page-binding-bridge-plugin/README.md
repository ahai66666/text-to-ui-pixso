# Text-to-UI Page Binding Bridge v2

v2 修复了 Pixso 运行时兼容问题：使用显式 `run()` 启动、启动时反馈、异常反馈和安全关闭，避免菜单点击后无任何提示。Pixso 本地插件请重新加载本目录的 `manifest.json`；插件 ID 已升级，防止执行旧缓存。

## 双轨 Token 标记

- HTML 视觉样式使用 `u-` 前缀的 Token Class，例如 `u-bg-neutral-light-100`、`u-text-neutral-dark-90`、`u-p-space-5`、`u-type-body-l`。
- Pixso 映射必须使用 `data-px-key="pane.primary.surface"` 语义标记；`class` 只负责 HTML 样式，不作为 Pixso 绑定的唯一依据。
- 导入前由 `prepare-pixso-binding-html.mjs` 把 `data-px-key` 转成 `id="px-key:..."`。Pixso 导入后即使把图层名变成 `div.px-key:...`，插件也能识别。
- Token Class 的完整映射由 `assets/design-system/token-utility-map.json` 和 `tokens.utility.css` 生成，禁止在 Class 中写 hex、rgba 或任意值。

这是 HTML → Pixso 的页面绑定桥接插件，和 `text-to-ui-component-registry-sync-v4-safe` 分工不同：

- 只处理当前产品页的**明确目标 Frame**，不自动切页，不读取旧 GUID，也不按颜色猜节点。
- `预检` 为只读；页面、Frame、语义标记或变量不满足条件时，绑定命令直接停止。
- `批量绑定` 只绑定 `page-binding-manifest.json` 中列出的颜色 Token，并写入绑定审计标记；不创建组件、不替换实例、不修改 `NewComponents`。
- `审计` 输出 `schemaVersion: 1` 的页面绑定报告，覆盖分母明确标为 `managed-bindings`，不会把未管理的页面节点伪装成“全页已绑定”。

## 使用前提

1. 在浏览器检查通过的 HTML 副本上保留 `data-px-key="..."` 语义标记。
2. 使用 `prepare-pixso-html.mjs` 生成 Pixso 专用 HTML，再用下面的脚本按 manifest 的明确 selector 补齐页面标记；不要把动态页面直接交给 `code_to_design`。
   ```bash
   node scripts/prepare-pixso-binding-html.mjs \
     --in /absolute/path/to/page.pixso.html \
     --out /absolute/path/to/page.binding.pixso.html \
     --manifest scripts/pixso-page-binding-bridge-plugin/page-binding-manifest.json \
     --utility-map assets/design-system/token-utility-map.json
   ```
3. 导入后在 Pixso 中确认当前页就是 `coremail`，并选择目标 Frame；插件不会根据当前选中对象猜页面。
4. 先运行“预检当前页面绑定（只读）”，确认 `ready` 后再运行绑定。

## 本版本不做的事

- 不写 `NewComponents`。
- 不把 HTML `data-component` 自动变成原生 Pixso Component 实例。
- 不用 hex 颜色、节点位置、同名 Frame 或缓存 GUID 推断 Token/组件。
- 不把 `icon_font` 当作 HTML SVG 导入的前置条件；图标仍由 Pixso 专用 inline SVG 副本负责。

`page-binding-manifest.json` 是映射契约的可审查来源；`main.js` 内嵌同一份映射是因为 Pixso 插件运行时不能可靠读取本地 JSON。修改映射时必须同时更新两处，并运行 Skill 的离线校验脚本。
