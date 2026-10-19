## 执行通道：整页导入强制插件，MCP 仅显式诊断

默认执行器是 Pixso Unified Agent v2（仓库源码：`scripts/pixso-unified-agent-plugin/`）。使用者可选择插件包的本地位置，并在 Pixso Developer Mode 中加载该目录下的 `manifest.json`。它和
Text-to-UI 共享执行运行时，在当前文件中解析 Variables、Styles、Component Set
及其 Variant，并在节点加入父级后完成 Auto Layout 与绑定。它不会覆盖同名旧画板，
也不会用覆盖层或绝对坐标重绘来掩盖组件、变量或布局失败。

交互迭代默认使用本地自动桥接：用户在当前 Pixso 文件中启动一次插件并保持右侧栏
开启，Text-to-UI 每次生成计划后运行：

```bash
node scripts/start-text-to-ui-services.mjs start
node scripts/pixso-plugin-bridge.mjs publish /absolute/path/pixso-operation-plan.json
```

组件库计划也可以走同一条桥接通道：

```bash
node scripts/pixso-plugin-bridge.mjs publish /absolute/path/pixso-component-library-plan.json
```

插件会根据 `kind` 自动进入组件库模式，并写入计划指定的页面；生产计划默认是
`NewComponents`，审核计划可以是 `Components`。审核计划只用于人工检查，不会自动
成为页面 Instance 的来源。这样组件库同步不需要手动点选文件，但第一次建立审核库
仍建议先确认 Pixso 当前文档和 `Components` 页面。

服务组固定使用低冲突端口：`43173` 是唯一对外 Preview Hub，`43175` 是仅由 Hub
代理的组件预览内部端口，`43982` 是 Pixso 插件自动桥。启动命令在后台托管服务并可
重复执行；不得为单个页面另开 `4173`，也不得在端口被未知程序占用时自动结束该程序。

`43982` 同时承担本地编排服务职责。服务协议当前为 `3`，插件 Runtime 当前为
`5.0.0`。插件 UI 连接后必须上报 Kernel、协议、计划版本和能力清单；Bridge 会在 `/claim` 之前
检查版本，旧插件只会得到“需要更新插件”的阻断结果，不会执行新计划。用
`GET /service-status` 检查连接、当前 publication 和 job，用 `GET /job` 检查任务结果。
计划和规则可以通过服务持续更新；插件执行代码或 Pixso API 适配发生变化时，需要重新
加载新的安装包，服务不会下载执行任意远程脚本。

插件会自动接收并执行。自动更新以 `execution.canonicalKey`、`page.targetFrame` 或
`page.name` 作为稳定身份：新树作为隐藏草稿生成，通过读回后才替换同身份的旧画板；
暂停或失败时删除草稿并保留旧画板。正常导入最终只允许一个托管画板。
桥接通道只保存最后一次发布的计划；发布页面计划后应确认 `/claim` 返回的 `kind`
是 `pixso-operation-plan`，并且 `page.name` 与目标页面一致，避免上一轮组件库审核计划
覆盖页面计划。若 `execution.targetPage` 在当前文件中不存在，运行时会按该名称创建目标
页，再在其中生成根画板，因此页面导入不依赖用户预先手动建页。
同计划重复发布仍遵守去重；自动桥接会替换同一 canonical Frame，不保留用户可操作的多版本入口。
插件界面会依次报告“布局与内容”和“图标填充”；默认仍是一键完成。两阶段共享同一个
Scene 和 canonical Frame。
Pixso 没有公开的外部静默启动插件接口，因此每个文件或会话仍需用户启动一次插件。

插件未安装、未连接或版本不兼容时，正常整页任务必须停止，不得自动切换 MCP。只有
converter-diagnosis 或用户明确批准低保真应急路径时，才可启用 MCP；它仍必须执行同一
版本的共享 Pixso Plugin API 运行时，不能重新计算布局、重新解析业务数据或临时手写
另一套页面。`prepare-pixso-mcp-batches.mjs` 输出的实际调用类型是 `eval_script`。

