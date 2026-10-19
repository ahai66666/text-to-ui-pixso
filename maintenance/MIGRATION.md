# 从 text-to-ui-compact 迁移
冻结输入为本地2.1.1维护源，详见 origin.json。原仓和旧安装包保留恢复路径。
1. 根据任务安装 text-to-ui-pixso；页面生成与画板导入可分别安装。
2. 备份原项目，在副本中迁移；无需把旧技能整个复制入新技能。
3. 模型入口改为 text-to-ui-pixso，RULES_ROOT 指向本技能绝对目录，不再指向父目录或另一个技能。
4. HTML 项目保留 Blueprint、绑定、组件和样式，重新验收后生成 schemaVersion 1 交接；外部HTML不要求此文件。
5. 重新捕获页面进入 Pixso；旧 run、截图、摘要不作为新页面的证据。
6. 包移动后重跑索引/清单检查。回退时恢复旧技能目录及备份项目，不覆盖现有用户编辑。

9张布局参考截图仅在HTML仓maintenance/reference-assets保留。两端运行包排除测试、维护资料、历史快照、页面Demo及外部Symbol库。现行组件外观、Token值、Pattern架构及插件协议保持兼容。
