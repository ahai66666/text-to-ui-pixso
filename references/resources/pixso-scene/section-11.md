## 页面状态

当前版本固定 `stateScope: default-visible`。导入的是默认可见的静态快照：hover、focus、
临时菜单、快捷操作和逐行选择 Checkbox 不进入主画板；只有默认状态中确实可见的控件
（例如列表工具栏的“全选”）才生成。交互态应作为显式独立状态板生成，不能让 HTML 的
hover 行为泄漏到静态画板。弹层、Toast、空状态和 AI 标签切换不生成额外画板。

`page-data.json` 中的可选业务段落也遵循同一规则：数据存在不代表 HTML 默认态会显示它。
`roadmap`、`quote`、`ai` 等段落只有显式写入 `defaultVisible: true` 才能进入
`default-visible` Scene；省略或写成 `false` 时保留为后续状态数据，但静态 Pixso 画板不创建
对应的卡片、填充或文本。这样可以阻止 Pixso 单独生成 HTML 没有的紫色卡片或灰色引用块。

自动替换还兼容旧版没有写入 plugin data 的画板：规范根名称及其确定性的 ` / N`
后缀都视为同一个 canonical 输出身份。新树读回成功后再清理旧根，避免插件升级或
重复发布时不断累积设计稿。

Coremail 默认画布为 `1728 × 1152`；主导航和列表栏分别通过
`layout/width/240`、`layout/width/360` 绑定，三栏 Titlebar 统一通过
`size/64` 绑定。布局中的间距、尺寸、圆角和页面视觉属性必须保留
`variableRef`/`styleRef`，不能退化成 CSS 字符串或裸像素值。
