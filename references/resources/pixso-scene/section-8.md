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

