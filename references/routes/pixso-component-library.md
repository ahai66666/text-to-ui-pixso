# Pixso component-library route

Read `references/pixso-import-details.md` and
`references/pixso-execution-invariants.md` for mapping and executor rules.

Read only the references needed for the requested operation:

- cross-source relationship selection and maintenance: `references/mapping-registry.md`
- component creation/synchronization: `references/pixso-component-maintenance.md`
- page instance usage and slots: `references/pixso-component-usage.md`
- native renderer structure: `references/pixso-native-scene.md`

## Import preflight

本技能目录就是运行根。先查询 packages/component-contracts/src/components/ 的49个本地契约和映射快照，再读取当前 Pixso 文档的真实组件、变量与插槽。无需安装 HTML 技能或查找父目录。HTML 实现的改动由发布方 text-to-ui-html 维护；仅在该维护任务需要实现源码时显式取得对应版本来源，不影响普通页面导入。

For each requested component or variant, compare these layers before deciding
what to import:

1. The pinned local component contract and selected rules: identity, props, slots, behavior and surfaces. Source implementation or Gallery is additional evidence only when explicitly supplied for maintenance.
2. `mapping-registry.json` formal `componentMappings`, `componentAliases`, and
   `endpointComponentMappings`, including policy, Variant bindings, and slots;
   then the generated Pixso specs and the component-facts capture date.
3. The live `NewComponents` library: exact component names, Variant properties,
   and relevant child layers and exposed properties. Variant axes alone do not
   reveal whether a child control already exists.

Record which capabilities are already present, partial, or missing, and change
only the missing layers. If a requested component is currently excluded from
Pixso mapping, treat its import as a scope change and update the canonical
registry after the new target passes the component gate. If the contract source
is unavailable after locating the active repository, report that specific
component-library blocker; do not infer that the existing HTML page-import
workflow is unavailable.

Use the HTML component contract as identity, props, slots, and source evidence.
Resolve current Pixso Variables, Styles, Components, and Variant GUIDs at
runtime. Production components target `NewComponents`; `Components` is
review-only when explicitly requested. A missing slot or mapped component blocks
only that component path—never create a lookalike and call it an Instance.

Build and test the plugin package only when renderer/API behavior changes.
