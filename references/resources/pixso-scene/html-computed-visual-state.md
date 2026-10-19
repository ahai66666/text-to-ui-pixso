## HTML computed visual state
普通导入使用本包 scripts/browser-visual-manifest.js 的 collectTextToUiVisualManifest，记录实际 DOM、计算样式、几何、可见文字、图像和图标；schemaVersion4、source browser-computed-visual-manifest，与当前 runId、源码摘要、视口、缩放和状态绑定。固定交接中的滚动位置。
由 scripts/pixso-capture-bundle.mjs 校验同一运行的清单和截图，由 scripts/html-visual-contract.mjs 校验依赖指纹。无需 HTML 技能或 packages/components-html。画板尺寸来自当前目标视口；默认1728×1152，用户指定时使用指定值。
历史 page-spec 的 html-live-computed-style 快照仅供明确选择 legacy-semantic 的诊断路径，不作为普通导入证据。缺失或过期采集不能由历史快照或 page-data 代替。
