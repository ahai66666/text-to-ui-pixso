## Surface 继承与透明背景

Scene 默认采用“背景继承”，而不是“每个 Frame 自动填白”。只有根画板、栏容器、
卡片、选中态、提示态等明确的 `surfaceOwner` 可以拥有 Surface。普通布局 Frame、
Titlebar 包装层、未选中导航项和内容组合层默认透明；如果子容器声明的 Fill 与继承到的
父级 Surface 相同，生成器必须把子容器归一化为 `{ kind: "transparent" }`。这条规则
同时避免半透明 Token 在父子两层重复叠加后变深。

文字和图标的前景色不参与 Surface 继承。确实需要与父级同色但独立绘制的卡片，必须
显式声明 `metadata.surfaceOwner: true`，禁止依赖插件为所有 Frame 添加默认白底。

