## 组件、图标与执行边界

正常导入使用浏览器几何与 Unified Agent；不把旧 code_to_design 双通道当作执行入口。实例按真实 logicalName、Variant、插槽和当前文档身份解析。

图标保留原始 SVG、16/20/24px 显示、1/1.25/1.5px 描边和双轴居中，不用 icon_font 或近似路径替代。实例内图标颜色来自 Variant。检查裁切、实际 bounds 和变量绑定，不能只看槽位名称。

组件库维护修复共享来源；正常导入记录可选映射和资源修复项。诊断 MCP 消费同一 Operation Plan 与版本化运行时，不重新计算布局。
