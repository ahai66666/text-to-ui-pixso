# Pixso Component Maintenance

Use this workflow whenever the reusable components in “鸿蒙客户端设计规范”
are created, repaired, or synchronized with the bundled component gallery.

## Authority and generated specification

The component system has a cross-source relationship layer plus four local
authority layers:

0. `assets/design-system/mapping-registry.json` owns the selected HTML/Token ↔
   Pixso/native component relationships and profile boundaries. Its generated
   maps, coverage tables, and profile summary counts are projections.
1. `assets/design-system/tokens.*.json` owns primitive and semantic values.
2. `assets/design-system/design.md` and component references own semantic rules.
3. The production HTML implementations in `packages/components-html` and their
   imported CSS in `packages/component-styles` own the rendered structure,
   variants, and visual result.
4. `apps/component-gallery/index.html#runtime-view` is the sole review surface
   for HTML component adapters. It must not override a component's shape or
   omit an HTML-supported variant during Pixso component construction.
5. Pixso is a generated reusable representation of the HTML component rules.

Do not infer a Pixso component from its name alone. Build and check the
machine-readable contract first:

```bash
node scripts/validate-mapping-registry.mjs
node scripts/build-pixso-component-specs.mjs
node scripts/build-pixso-component-specs.mjs --check
node scripts/validate-pixso-component-specs.mjs
```

When a live Pixso facts snapshot changes the component count, apply the facts
sync before validation. It refreshes `profiles[].summary` in the same
transaction; a `registeredPixsoTargets` mismatch should be repaired by
`node scripts/sync-mapping-registry.mjs --write`, not by editing the count by
hand.

For HTML-to-Pixso synchronization, the contract is also executable. Generate a
library plan from the selected `packages/component-contracts/src/components/<id>.json` files. Use `references/index/generated/component-index.json` to resolve component IDs; load all 49 files only when performing a full-library audit. `components.json` is the generated aggregate used by compatible scripts:

```bash
node scripts/generate-pixso-component-library-plan.mjs \
  --out /absolute/path/pixso-component-library-plan.json
node scripts/validate-pixso-component-library-plan.mjs \
  --plan /absolute/path/pixso-component-library-plan.json
```

The plan writes `NewComponents` by default and supports a manual-review target
such as `Components` via `--library-page Components`. A review plan must be
approved before its components are used as production Instances. Both targets
create direct Pixso `COMPONENT` nodes with exact logical names. Every declared HTML slot becomes a `#slot-name` layer;
text/boolean props are exposed as component properties, and HTML source,
renderer key, slot contracts, and Token roles are stored as provenance. This
prevents a page generator from mistaking a component set with a partial slot
surface for a complete component. A missing slot is repaired in the library
phase and never replaced by a page-local combination.

The generator also resolves an HTML logical name to the closest approved
Pixso visual spec (for example `Titlebar/Default` uses the existing L/64px
geometry and `Checkbox/Default` uses the Unchecked/20px geometry). This is an
identity alias only; the generated component keeps the HTML logical name so
page mapping remains deterministic. Surface ownership follows the HTML
contract: a white host surface does not imply a white component. Search/Input
controls on a white host bind the neutral-dark/05 control fill, while ordinary
list and navigation items leave their root transparent. Only explicit cards,
dialogs, and primary/secondary controls own a default fill.

The generated file is
`assets/design-system/pixso-component-specs.json`. It records the authoritative
preview selector, master and placement sizing behavior, height, Auto Layout
direction, text-style roles, nested groups, spacing tokens, and icon rules for
every registered component.

## Sizing contract

Keep three sizing concepts separate:

- `masterWidth: hug`: the source component hugs its content.
- `masterWidth: <number>`: the source component uses a reviewable sample width.
- `placementWidth: fill`: page instances fill their containing Auto Layout.
- `placementWidth: fixed`: page instances retain their standard fixed size.

Never replace `hug` or `fill` with an arbitrary fixed width merely to make the
library page look tidy. A component may have a fixed review width while its
registered placement rule remains `fill`.

## Typography contract

Every reusable text layer must bind a shared Pixso Text Style. Matching only
font size, line-height, or layer height is not sufficient. Use the `textRoles`
map in `pixso-component-specs.json` and verify the style binding by reading the
node back from Pixso.

## Alpha contract

Core colors carry their final alpha. The receiving layer remains at 100%
opacity. Do not multiply a translucent color variable by another layer or paint
opacity.

The only normal exception is whole-component Disabled treatment, which may bind
the approved disabled opacity token. Colors such as `brand/10`,
`function/success/20`, and `neutral-dark/60` must not receive a second opacity.

## Icon contract

Resolve component icons through `assets/icons/icon-aliases.json`.

- Common controls use exact Lucide package geometry.
- Primary-level icons use the approved pinned Lucide Regular aliases.
- Titlebar controls use the exact titlebar SVG assets.
- Status icons use their approved circle assets.
- Outline icon stroke weights are authoritative by display size: 16px = 1px,
  20px = 1.25px, and 24px = 1.5px. Every icon hot zone sets both axes to
  `CENTER`, then centers the actual vector bounds horizontally and vertically;
  this applies to page SVGs, component masters, and swapped instances.

Do not substitute a similarly named icon-font glyph for an approved SVG.

Run `node scripts/validate-pixso-icon-map.mjs` before releasing a Pixso component change. For generated Text to UI components, reject `HM Symbol` and `icon_font` layers unless the component is explicitly marked as an untouched native source reference.

For the primary-navigation settings repair, use the exact
`action/settings` alias from assets/icons/icon-aliases.json (`lucide/settings`), replace the component-library slot in NewComponents, and
verify the 24 × 24 viewBox, root/vector geometry, visible overflow, and
currentColor binding on a temporary linked instance. Regenerate the HTML sprite
from the same alias and run the strict icon audit. Do not fix only the page
instance; the shared component slot and the source alias must agree.

## Safe synchronization sequence

1. Confirm the active Pixso file is “鸿蒙客户端设计规范”.
2. Pass the Token Gate and read variables, styles, and components.
3. Read `pixso-component-migration.json` and confirm the resource origin,
   migration status, active provider, and deletion permission.
4. Build a temporary replacement component away from the production library.
5. Apply Auto Layout, exact sizing behavior, bindings, text styles, and SVGs.
6. Read the new component back and run layout checking.
7. Compare it with the gallery at the same width and surface.
8. Only after it passes, switch the registry's active provider and migrate all
   linked instances.
9. Mark only the replaced `text-to-ui-generated` component as `superseded`.
   Add its exact name to the deletion allowlist only after its live instance
   count is zero. Never add or delete a `harmonyos-native` resource.
10. Resolve component GUIDs again immediately before an allowed deletion; never carry old GUIDs across a rebuild or an
active-document change.

### Plugin artifact delivery

The canonical unified plugin source remains under
`scripts/pixso-unified-agent-plugin/`. Every Pixso plugin release
must also be copied to the local plugin delivery directory configured by
`TEXT_TO_UI_PLUGIN_DELIVERY_ROOT` (or the user's local plugin folder). Keep the
plugin in its own named subfolder containing its `manifest.json`, entry script,
and a short installation note. Do not make a temporary workspace path the only
upload location.

### One-click component synchronization

Once the Text-to-UI Pixso Unified Agent is installed, a component edit does not
require rebuilding or reinstalling the plugin. Start the managed local services
and choose **同步当前组件事实与导入映射** in Pixso, or click **同步组件映射**
in the unified right panel:

```bash
node scripts/start-text-to-ui-services.mjs start
```

The plugin reads the current `variantProperties` and component geometry from
`NewComponents`, omits all Pixso IDs, and posts the snapshot to
`http://127.0.0.1:43982/component-sync`. The Bridge writes a proposal first,
then applies exact variant and Token changes, regenerates projections, and
runs validation. Unknown, missing, asymmetric, or non-token geometry is
reported as review/blocking detail for that mapping only; it must not cancel an
otherwise usable page import. A complete snapshot changes a missing registered
target to `pending-review`: its symbolic name stays in the registry for repair,
but imports use Token-native composition until a later snapshot restores it.
Run `node scripts/validate-mapping-registry.mjs --strict-component-gates` only
for shared-library release acceptance; ordinary page imports do not use this
release-wide gate. The sync never mutates the Pixso canvas.

For `icon-text`, the accepted identity is `type + size + state`; `density` is
not inferred from a stale layer name. The current 8px horizontal inset resolves
to `padding/button-sm-x` in component specs and `space/3` in native mappings.
Changes to the plugin's own code may still require loading a new delivery
package because Pixso caches plugin code; ordinary Pixso component edits only
need the sync command.

### Coremail registration helper

For the Coremail validation path, use
`scripts/pixso-unified-agent-plugin/manifest.json` as a Pixso development
plugin after the source component names and Variant axes have been normalized.
The current manifest is `Text-to-UI Pixso Unified Agent v2`; load it once as a
new local plugin so Pixso cannot reuse the old cached plugin ID. Run
**自检服务与 Pixso 连接（只读）** first. Coremail 审计由 Codex MCP
实时读取，不再由插件执行长时扫描；MCP resolves the five
Coremail-priority logical components by exact component-set name and Variant,
then reports missing components, unexposed text slots, and `icon_font` layers.

The unified plugin targets Pixso API 2.x. Pixso API 2 deprecates the synchronous
`findAll`/`findOne` node methods, so the helper must use `findAllAsync` and
scope library reads to the `NewComponents` page. Semantic SVG helper components
are created only on `NewComponents`; the older
`Text-to-UI Registered Icons` page is not the authoritative library page, and
the unified plugin never moves nodes across pages. If its source changes, load
the new versioned manifest once before running a command; otherwise Pixso may
execute a cached copy. Subsequent component edits use the sync command and do
not require another plugin install.
A command failure must show the original error message and stop before any page
outside `NewComponents` is written. The plugin's audit menu is intentionally a
no-op safety notice; it does not scan Coremail or hold a Pixso login session
open.

The helper's audit command is read-only and must not call `pixso.commitUndo()`.
Only a command that reports an actual write may create an Undo checkpoint; this
avoids touching Pixso's undo state during a stale-document health check.

Run **补齐 NewComponents 文字槽位** only after reviewing the audit. It may
expose existing text as a component Text property, but it does not promote a
component to `verified`. v5 deliberately does not run icon creation or
component swapping from the plugin: those writes previously caused Pixso to
resolve stale `S_Guid` values. Re-run the audit and create a
temporary linked instance to prove content overrides before changing an
adapter-map entry to `verified`.

For an imported page, first use `apply_design` with `$token` values for
`fillPaints`/`strokePaints`, then read the nodes back with `query_nodes`.
This binds ordinary TextNode fills as well as frame paints. For mixed ranges
or range-specific overrides, run **绑定 Coremail 文本颜色**; it uses Pixso's
SolidPaint range API. If any text remains blocked or unmapped after read-back,
keep strict parity disabled and record the exact node in the live audit.

If the active document changes, variables/styles disappear, or previously read
GUIDs become invalid, stop all writes immediately and re-run `fetch_context`.

## Component gate

A component is eligible for `pixso-component-registry.json` only when:

- its exact name is unique;
- it uses Auto Layout for normal content flow;
- direct children do not unintentionally overlap;
- Hug, Fill, and Fixed behavior matches the generated spec;
- every reusable text layer has the required Text Style;
- standard colors, sizes, radius, padding, and gaps are variable-bound;
- translucent tokens are not combined with extra opacity;
- icons have approved semantic aliases and exact source geometry;
- Pixso layout checking reports no issue;
- its screenshot matches the component gallery at the same dimensions.
- its provenance and takeover state pass the migration validator;
- a native candidate cannot replace the active generated provider until all
  gates pass.

Missing or failed components remain library defects. Page generation must not
redraw or detach an imitation.
