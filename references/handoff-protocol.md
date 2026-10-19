# 页面交接协议 v1
HTML 仓维护 schema；Pixso 仓声明支持并保存固定副本。共享数据版本1.0.0，身份记录在 shared-data-lock.json。运行不联网更新。

html-handoff.json 记录 producer、artifact.entry/serveCommand/previewUrl、viewport（width/height/zoom/stateId/scroll）、readiness、dependencies、designData、evidence 和 validation。项目路径相对项目根；URL只是当前运行地址。生成页面等待 #app.__tuiReady 与 data-tui-ready=ready；外部页面用自身就绪机制。

validation-evidence.json 至少记录 schemaVersion=1、viewport、dependencyDigest、observedLocalFiles（浏览器实际请求映射到项目的文件路径）、source/build/browser/visual。前三项必须 passed；visual 为 passed 或诚实的 pending，failed不能交接。Demo 还需 preservation 对照记录中的每个ID为 passed。通过 collectProjectDependencies(project,entry,{observedLocalFiles}) 获取摘要，禁止凭构建结果填写浏览器通过。

依赖图覆盖静态JS/CSS/资源，额外完整覆盖组件、业务组件、styles和常用资源目录，并合并浏览器观察的动态加载文件。记录实际网络响应与远端资源；远端资源的摘要不等于永久身份，导入时始终重新捕获。独立JS、CSS、资源改变或缺失时旧交接失效，不能复用旧截图。验收证据本身也有SHA-256引用。

data:export 在 HTML 仓产生本地版本化快照；Pixso 的 data:sync --snapshot <dir> 检查允许文件、版本、摘要和本地修改保护后同步。禁止手工修改消费者快照。协议不兼容、数据不匹配或文件变更时阻止后续依赖步骤。
