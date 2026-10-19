## Pixso 衔接

先在 HTTP 预览中等待 document.querySelector("#app").__tuiReady，确认 data-tui-ready 为 ready，再固定状态和视口、截取同一页面。root.__tuiReady 返回组件证据；截图就绪仅证明资源加载完成，仍需检查交互与视觉。

接着走 existing-html-to-pixso 操作路由。输入是实际渲染的 HTML，保留 component-manifest.json、styles/style-manifest.json、component-usage.json 和生成收据供追溯。现有导入运行的捕获包、几何编译、变量/组件匹配、发布、回读和像素对比继续适用。不要在 Skill 维护期间直接向 Pixso 发布页面。
