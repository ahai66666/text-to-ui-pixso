## 旧 Scene 两阶段生成模型

资源预检后，一个 Operation Plan 必须按顺序执行两个构建阶段：

1. `layout`：创建框架、业务组合、文字、组件 Instance 和 Icon Slot。Icon Slot 是
   固定的 `20×20`、`24×24` 等 Token 化容器，内部只放统一占位节点，不包含 SVG。
2. `icon-hydration`：根据 `semanticAlias` 将真实 Pixso 图标 Instance 或 SVG Vector
   放入已有 Slot，只删除占位子节点，不删除或替换 Slot。

`resources.icons` 是 SVG 数据的唯一保存位置。`hydrate-icon` 只记录
`targetNodeId`、alias、size 与颜色角色，禁止在每个操作中复制完整 SVG。映射组件内部
已有的图标不再生成第二份。

复杂页面的图标填充使用安全的原生 Vector 路径转换；页面导入期间不调用
`pixso.createNodeFromSvg` 或 `pixso.createComponentFromNode`，也不临时生成整套语义图标
Component。这样可以避开 Pixso 桌面端的陈旧 `S_Guid` 转换路径；当前运行时不支持
`createVector` 时，图标阶段会明确失败并保留失败草稿，不会用黑色占位图标冒充成功。

图标颜色绑定必须保留源通道语义：Lucide 等 stroke-only 图标只能替换已有 Stroke
Paint，实心资产只能替换已有 Fill Paint；禁止为了绑定颜色给没有 Fill 的路径新增
Fill。填充完成后 Slot 的宽高、父级和 Auto Layout 属性必须与填充前一致。

所有标准描边图标遵循同一份显示尺寸表：16px 使用 1px、20px 使用 1.25px、24px
使用 1.5px。Icon Slot 是独立的正方形热区，主轴和交叉轴都必须为 `CENTER`；填充
完成后按实际 Vector bounds 计算 x/y，使图形在热区左右和上下同时居中。该规则同时
适用于页面 SVG、NewComponents 中的图标组件和组件 Instance，不能因节点已存在而跳过
修复或沿用旧的上对齐。

映射组件的颜色由 Pixso Variant 自己控制。HTML 最终颜色仍作为兼容性证据记录，不能
在创建 Instance 后通过 `contentColor` 或 HTML 颜色重着色覆盖组件。如果映射需要把
语义图标替换进 Variant 的图标槽，只能通过计划中的 `iconColorSource: "variant-content"`
读取该 Variant 已有的 Fill/Stroke，并把同一颜色转移到新图标几何；这不是 HTML 颜色
覆盖，也不能改变文字或 Instance 外层颜色。若 HTML 与 Pixso 的组件契约确实不一致，
应调整映射到正确 Variant，或退回 Token 化原生组合，而不是修改当前画板上的 Instance。
只有显式授权的 native-composition 覆盖才允许使用颜色重写。

布局阶段同时遵守两个跨项目规则：

- native Frame 的 `fixed` 宽高必须携带 canonical Variable，裸 `fixed` 阻断生成。
- 横向容器中不得直接放置多个无比例约束的 `fill` 文本。列表条目、消息头、会议、
  附件等必须先生成明确的 copy stack、metadata row 和 trailing actions 组合层。

