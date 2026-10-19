# 独立使用包与维护源
使用包仅包含本技能运行文件，根目录含 SKILL.md。无需安装相邻技能，也不通过环境变量寻找旧维护源。
维护源另含 tests、maintenance、插件构建源和 CI；运行包排除这些资料、布局截图、历史产物、外部 Symbol 库及 node_modules。
~~~bash
pnpm skill:pack --out dist/text-to-ui-pixso-1.0.0-rc.1.zip
~~~
打包在临时副本调整开发命令并重建资源、目录和路由索引，检查后生成 .delivery-manifest.json 与 ZIP SHA-256。ZIP 内顶层目录与技能名相同，解压到技能安装目录即可。运行需要 Node.js 22+；生成项目使用 Vite 时安装该项目依赖。
源码检查脚本是运行能力，保留在包内。浏览器和 Pixso 真实验收分别记录；候选版的未完成事项见维护验收报告和 Release 说明。
