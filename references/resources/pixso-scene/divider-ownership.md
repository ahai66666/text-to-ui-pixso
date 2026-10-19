## Divider ownership 与单边描边

描边不是“节点有 Stroke 就默认四边绘制”。Scene 必须把边的归属写成显式的
`style.strokeEdges`，执行器会为 top、right、bottom、left 四个权重逐一赋值，并把
未声明的边清零。三栏工作台的 `Brand title segment`、`Search title segment`、
`Primary navigation pane` 和 `Secondary list pane` 都只声明 `["right"]`；
`Detail title segment` 只声明 `["bottom"]`。如果一个结构只是列间分隔线，不能省略
`strokeEdges`，因为省略会被解释为完整四边描边并在导入后产生额外边框。

