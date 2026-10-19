## 位图资源

PNG/JPG 等位图必须声明为 Scene `image` 节点，并在 `resources.images` 中以稳定符号
`ref` 携带 MIME 类型与 base64 数据。Operation Plan 输出 `ensure-image` 和
`create-image`；执行器通过 Pixso `base64Decode`、`createImage` 创建文档图片句柄，
再生成带 `IMAGE` Fill 的原生 Rectangle。Scene 和仓库不保存 Pixso image hash。

品牌 Logo、头像和内容缩略图不得用相似的语义 SVG 代替。插件读回时必须确认 IMAGE
Fill 和 `text-to-ui-image-ref` 均存在；资源缺失或当前运行时不支持图片 API 时阻断。

