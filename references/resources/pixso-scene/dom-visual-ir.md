## DOM Visual IR 三阶段生成模型

已有 HTML 的 Operation Plan 按以下顺序执行：

1. `layout`：按浏览器相对 bounds 创建绝对定位的原生节点，固定外部几何。
2. `component-enrichment`：仅把尺寸和槽位兼容的候选替换为真实 Instance，且保持锁定 bounds。
3. `icon-hydration`：在固定 Icon Slot 内填充 SVG，不允许改变父布局。

`scripts/compile-pixso-import.mjs` 默认使用 `dom-visual-ir`。旧 Coremail Scene
只能显式传入 `--pipeline legacy-semantic`，并由
`scripts/coremail-semantic-adapter.mjs` 隔离。

