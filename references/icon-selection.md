# 组件图标选择与外部资源边界

## 当前资源

Skill 仅内置组件需要的图标：assets/icons/icon-aliases.json 中的语义别名、packages/components-html/src/icon-map.js 与 component-icons.svg 中的预编译几何，以及组件引用的少量本地 SVG。

assets/icons/components/checkbox-check.svg 是从旧目录迁移的组件素材，保持原始 SVG 几何。窗口控制 SVG 在 assets/icons/titlebar/；assets/icons/status/ 的状态 SVG 仍由 tokens.icon.json 引用。两者保留。

HarmonyOS Symbol 全量/子集目录、字体、名称映射、导出工具和全量预览已移出 Skill。不要从 Skill 中查找或加载 Symbol 库，也不要假定本机装有 HM Symbol 字体。

## 选择顺序

1. 优先采用用户明确提供的精确 SVG。
2. 复用现有组件的已批准语义别名和原始几何。
3. 缺少合适图标时，在项目可用的图标来源中查找；目前默认组件风格为 Lucide Regular 线性图标。
4. 项目需要外部 Symbol 库时，由项目提供明确来源和选中图标；只把所用 SVG 引入项目。Skill 不自动扫描整库、不自动捆绑整库，也没有内置的外部 Symbol 服务。
5. 无法解析时报告缺失或显式 fallback；不得把近似图形说成原图。

旧名称如 close、disclosure-down、window-minimize 通过运行时兼容表解析。新增别名与预编译定义必须一起维护；仅导出一个 SVG 或只改 alias JSON，不代表组件工厂已经支持新图标。

## 调用边界

普通动态页面通过组件的 icon/options/slots 引用现有图标，组件运行时使用已打包的 SVG 几何，无需读取外部库或图标字体。

本机维护环境可使用 pnpm icons:search -- reply 搜索已安装的 Lucide 文件名，使用 pnpm icons:export -- --aliases action/reply,action/forward --out <PROJECT_DIR>/assets/icons.svg 导出精确几何。搜索、导出与严格审计需要已安装且版本匹配的 lucide；node_modules 不随 Skill 包分发。

用于捕获的导出/展开步骤应操作单独捕获副本。index.html 继续是动态空宿主，不把整页图标精灵或组件 DOM 内联到可编辑宿主。

## 样式与几何

- 标准 SVG 画板为 24 × 24，显示尺寸为 16、20、24px。
- Lucide 在 24px 源画板上使用 1.5px 描边；整体等比缩放后，16/20/24px 的有效描边分别为 1/1.25/1.5px。不要只缩小外框或单独修改路径。
- 颜色继承 currentColor 和组件状态 Token；禁用态继承组件整体透明度。
- 图标的可见矢量与方形热区分开，均按组件契约居中，禁止裁切。
- 窗口控制使用用户提供的原始 SVG；不要用其他库中近似图标替换。
- 非图标 SVG 标明 data-svg-role 为 logo、illustration、chart 或 decoration。真正的手工 fallback 必须显式标记并记录原因。

## Pixso

执行当前 references/pixso-fidelity-import-pipeline.md 的捕获、编译、插件、回读流程，沿用同一动态页面的图标与状态。

assets/design-system/pixso-icon-map.json 负责尺寸、描边、来源、热区、居中和裁切要求。新增页面与组件使用真实 SVG，不使用 HM Symbol/icon_font 字体节点。导入成功不等于图标几何或视觉一致；必须回读外框和矢量边界。

## 当前别名示例

~~~text
action/reply     -> lucide/reply
field/search     -> lucide/search
field/date       -> lucide/calendar-days
field/time       -> lucide/clock-3
status/info      -> lucide/info
choice/check     -> assets/icons/components/checkbox-check.svg
window/close     -> assets/icons/titlebar/window-close.svg
~~~

具体值以 alias JSON 与运行时定义为准；不从说明示例创建第二套映射。
