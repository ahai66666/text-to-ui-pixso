# Text-to-UI Pixso Unified Agent v2

这是合并后的唯一 Pixso 插件，同时提供两类能力：

- Permanent Agent：持续接收并执行 Text-to-UI Operation Plan，负责网页和 HTML 组件库导入。
- Component Registry Sync：读取 `NewComponents` 的真实 Variant 和几何，安全同步组件映射与规格。

## 安装与使用

插件源码目录：`skill-support/scripts/pixso-unified-agent-plugin/`。

将构建后的插件包放在你选择的位置，并在 Pixso Developer Mode 中加载该目录下的 `manifest.json`。如需由交付脚本把文件同步到已存在的额外目录，设置 `TEXT_TO_UI_UNIFIED_PLUGIN_DELIVERY_ROOT`（兼容 `TEXT_TO_UI_PLUGIN_DELIVERY_ROOT`）；未设置时不会写入机器专属目录。

1. 在 Text-to-UI 根目录启动常驻服务：

   ```bash
   node scripts/start-text-to-ui-services.mjs start
   ```

2. 在 Pixso 开发者模式只加载本目录的 `manifest.json`。
3. 选择 **打开导入与同步界面**，并保持插件在右侧栏；它会持续接收页面导入计划。
4. 修改 Pixso 组件后，在同一界面点击 **同步组件映射**，或直接选择菜单中的
   **同步当前组件事实与导入映射**。

同步和导入使用同一个插件会话，但在 Bridge 内部仍是两个独立接口。同步失败、缺失或
歧义只进入待处理清单，不会阻塞或回滚页面导入。页面导入仍按“布局与内容 → 图标
填充 → 图片资源优化”执行，资源优化失败保留可见降级占位。

`icon-text` 固定使用 `type + size + state`，不传递 `density`。当前左右 8px 内边距
对应 `padding/button-sm-x` / `space/3`。

组件的普通修改只需点击同步，不需要重新安装插件。只有插件自身代码发生变化时，才需
重新加载新的插件包；合并包使用新 ID `text-to-ui-pixso-agent-v2`，用于避开 Pixso
旧缓存。不要同时开启旧的 `Text-to-UI Pixso Permanent Agent` 和本合并插件，否则
可能产生两个执行器会话。
