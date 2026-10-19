---
name: text-to-ui-pixso
description: Import an approved rendered HTML page into editable Pixso using calibrated browser capture, component and Token mapping, the managed plugin, readback and visual comparison. Also diagnose imports or maintain mappings when requested.
---

# Text to UI Pixso

本目录为 RULES_ROOT。输入是已确认的实际 HTTP 页面、可运行 HTML 项目或 html-handoff.json；不要求安装 text-to-ui-html。此阶段保留页面内容、结构和状态。

## 选择操作与最小读取
普通导入选择 existing-html-to-pixso；明确要求排错时使用 converter-diagnosis；组件库维护使用 pixso-component-library。按 query-resources.mjs --stage pixso --phase <phase> --view api 领取 readiness、capture、compile、publish、readback 当前阶段任务包。诊断使用 diagnosis。普通导入不重新走需求和页面设计。

按精确组件 ID 查询 --mapping，映射快照用于定位，执行前检查当前文档、组件和变量事实。所有数据来自本包固定版本快照，不自动联网更新。缺失维护源只影响需要源码的维护操作。

## 导入执行
遵循 references/routes/existing-html-to-pixso.md：
1. 确认项目、URL、目标文件/页面、CSS 视口和可见状态。默认 1728×1152、zoom 1.0，用户指定值优先。
2. 有交接清单时先 handoff:check --handoff <file> --project <root>；检查协议、数据版本、依赖和验收记录。无清单的外部 HTML 使用自己的加载机制，确认字体、图片和目标内容就绪。生成页面等待 #app.__tuiReady。
3. 启动当前包的 Bridge/Preview 服务，创建隔离 run。捕获当前浏览器计算结果、资源和参考截图，固定状态；截图和采集结果必须属于同一 run。
4. dom-visual-ir 编译保持浏览器几何，之后匹配兼容组件与 Token。报告 native fallback 的数量与原因，不能把近似控件称为真实实例。
5. 验证后通过 orchestrator 发布一次，由当前插件事务执行、回读并对比。协议、资源、来源或几何失败时停止；正常导入不反复发布或改用近似重建。

## 验收边界
分别报告页面是否存在、真实组件实例/回退、回读、像素差异。页面存在不代表视觉通过。正式不同像素比例阈值为 0.5%，保留原有抗锯齿处理规则。发布失败按现有事务与状态规则处理，排错只在需要时继续。真实插件不可用就报告 pending，不用源码测试代替。

## 维护与版本
本仓维护转换器、映射、插件和执行协议；组件契约、Tokens、图标身份及交接协议由 text-to-ui-html 发布。data:sync --snapshot <local-directory> 只同步受版本和哈希保护的允许文件；不手改快照，不访问另一技能安装目录。
规范维护源是主题小文件，依次 resources:build → catalog:build → index:build，再更新交付摘要。测试与维护资料、布局截图、旧安装包不进入使用包。skill:pack 生成 ZIP；未完成真实验收的版本标为候选包。
