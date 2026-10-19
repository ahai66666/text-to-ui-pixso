# text-to-ui-pixso
将已确认的实际渲染页面转换为 Pixso 可编辑画板，执行回读和视觉对比。

独立技能、独立仓库。候选版本 1.0.0-rc.1；包内技能版本为 1.0.0，正式标签需通过对应真实验收。支持交接协议 schemaVersion 1，共享数据 1.0.0。

## 安装
从本仓 Releases 下载精简 ZIP 和 .sha256，核对摘要后解压。把 ZIP 内的 text-to-ui-pixso/ 文件夹放入你的模型工具的 skills 目录；文件夹根目录应直接包含 SKILL.md。其他模型可读取 SKILL.md 并设置 RULES_ROOT 为其绝对目录。无需安装 text-to-ui-html。

直接从仓库根目录安装也可用，包含 tests 和 maintenance 等维护资料。更新前备份旧目录，在新目录验收通过后替换。不要把新版本覆盖到旧目录而留下过期文件。

## 使用
先读取 SKILL.md，再按当前阶段的查询结果读取指定主题，避免全量载入 references。Node.js 22+；项目生成与构建使用 pnpm，首次安装项目依赖需要包源或本地缓存。技能维护可执行 pnpm install --frozen-lockfile。

例：“使用 text-to-ui-pixso，把这个已确认页面按当前状态导入当前文件的新页面，保持1728×1152、缩放1。”

~~~bash
node scripts/query-resources.mjs --stage pixso --phase readiness --view api
node scripts/html-handoff.mjs check --project /absolute/project --handoff /absolute/project/html-handoff.json
node scripts/pixso-import-orchestrator.mjs start --html-root /absolute/project --url http://127.0.0.1:4173/
~~~
随后按 capture → compile → publish → readback 查询和执行。普通外部 HTML 无交接文件仍可导入，不要求生成器清单。真实 Pixso 文件、当前统一插件面板和浏览器工具须可用。默认视口1728×1152、缩放1；用户指定值优先。页面存在、组件实例、回退、回读和不同像素比例分别报告；正式视觉阈值0.5%。

## 目录与维护
- SKILL.md：模型入口；references/routes：操作路由；references/resources：按需规范源。
- assets/design-system、packages、scripts：本技能独立运行所需数据、代码与脚本。
- shared-data-lock.json、schemas：共享快照和交接接口。
- maintenance：来源、文件归属、迁移及验收记录；tests：维护回归。二者不进精简 ZIP。

修改主题小文件后按 resources:build → catalog:build → index:build 重建，再执行对应 check、pnpm test、skill:manifest。skill:pack --out dist/<new-name>.zip 会在临时副本重建索引和交付摘要。详细协议见 references/handoff-protocol.md；旧技能迁移见 maintenance/MIGRATION.md。

## 来源与许可证
来源为 ahai66666/text-to-ui-skill-compact 的本地2.1.1维护源；冻结清单、摘要及远程差异见 maintenance/origin.json。保留原 MIT LICENSE，组件和资源保留来源身份。外部 Symbol 库不随包交付。
