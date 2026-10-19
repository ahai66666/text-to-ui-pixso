# Text-to-UI Component Registry Sync v5

这是 Pixso 组件事实与 Text-to-UI 映射的同步插件。它只读取
`NewComponents` 页面中的当前组件集、真实 `variantProperties` 和组件几何，
不会修改 Pixso 画布，也不会保存 Pixso GUID、node ID 或 file key。

## 安装与使用

1. 在 Text-to-UI 根目录启动常驻服务：

   ```bash
   node scripts/start-text-to-ui-services.mjs start
   ```

2. 在 Pixso 开发者模式加载本目录的 `manifest.json`。
3. 运行一次 **自检 Pixso 连接（只读）**。
4. 修改 Pixso 组件后选择 **同步当前组件事实与导入映射**。

同步会把快照发送到本机 `43982` Bridge。确定的 Variant、几何和 Token
变化会自动写回规范源，并重新生成投影和规格；缺失、歧义或无法映射的条目
只进入待处理清单，不会回滚已经完成的页面导入。

`icon-text` 固定使用 `type + size + state`，不传递 `density`。当前左右 8px
内边距对应 `padding/button-sm-x` / `space/3`。

组件的普通修改只需再次点击同步，不需要重新安装插件。只有插件自身的代码
发生变化时，才需要重新加载新的插件包；本 v5 ID 用于避免 Pixso 继续执行旧
缓存版本。
