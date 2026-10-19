# Pixso mapping and rendering details

Read for Pixso import, converter diagnosis, and component-library work.

### HTML text sizing and truncation

For HTML-to-Pixso conversion, use the browser's final computed style and text
metrics as the authority. Do not infer fixed sizing merely because an element
has a CSS width or defensive overflow rules:

- A normal single-line label defaults to `WIDTH_AND_HEIGHT` so its width hugs
  its content.
- A wrapping text block keeps the captured width and uses `HEIGHT` so its
  height can grow.
- Use fixed-width, single-line truncation only when the HTML has
  `white-space: nowrap`, `overflow: hidden` or `clip`, and
  `text-overflow: ellipsis`, and the measured inline text width is greater
  than the captured box width. Preserve the captured width and height and set
  `maxLines: 1`.
- For a truncation operation, first write Pixso's native
  `TextNode.textAutoResize = "TRUNCATE"` after loading the font. If the
  connected runtime rejects that enum, use the versioned compatibility
  renderer: measure the loaded text, write an actual ending `…` that fits the
  fixed captured box, retain `NONE`, and store the source/rendered strings in
  plugin metadata. Readback must accept this only when all of those markers,
  the ellipsis, and fixed bounds are present; never silently clip the full
  string or invent a separate `textTruncation` property. If the text fits,
  keep the intrinsic mode even when the CSS contains defensive ellipsis rules.

The detailed import contract is in
`references/pixso-fidelity-import-pipeline.md`; read it for existing HTML
imports and converter diagnosis.

### Icon sizing, stroke, and hot-zone contract

For every semantic SVG icon, keep the 24 × 24 source geometry and treat the
Pixso icon slot as a separate square hot zone:

- Use the design-system stroke table as the authority: 16px → 1px, 20px →
  1.25px, and 24px → 1.5px. For another explicitly approved size, use the
  normalized 24px source rule `1.5 × displaySize ÷ 24`; never copy an asset's
  raw stroke-width unchanged into every display size.
- Set both horizontal and vertical hot-zone alignment to `CENTER`. Centre the
  actual vector bounds inside the slot after hydration; do not use the
  requested icon size as a proxy for the vector bounds and do not inherit top
  alignment from a component or HTML wrapper.
- Use the Pixso `Size & Layout` number variables `icon/stroke/16`,
  `icon/stroke/20`, and `icon/stroke/24` for the three supported weights. The
  Operation Plan must carry these variable references; a literal weight is
  only a diagnostic fallback when the target Pixso file has not synced the
  variables yet.
- Apply the same contract to page SVGs, generated icon Components, and icon
  Instances. A missing exact icon should remain as its original SVG when
  source geometry is available. If no source can be resolved, the page may
  continue with an explicit unresolved fallback for preview; preserve the
  requested name and diagnostic marker so it is not mistaken for exact
  Pixso/library parity.
- The operation plan must carry `hotZone: { alignment: "CENTER", axes:
  "BOTH" }`; Pixso readback must verify both alignment properties, vector x/y
  centring, and the effective stroke weight.

### Cross-source mapping registry

Before mapping any HTML Token, Component, Pixso Variable, Pixso Component, or
HarmonyOS native source, read and use
`assets/design-system/mapping-registry.json`. It is the machine-readable
relationship source for the Skill. A user may propose changes in the controlled
Obsidian mapping-workbook edit queue, but never treat a generated report table
as an editable source:

- `tokenMappings`, `semanticTokenMappings`, `runtimeSemanticAliases`,
  `semanticColorMappings`, and `styleMappings` own Token/Style relationships.
- The runtime semantic index is generated from `semanticTokenMappings` plus
  `runtimeSemanticAliases`; do not maintain a duplicated full
  `runtimeSemanticMappings` table.
- `componentMappings` owns HTML `logicalName` → current Pixso exact
  Component Set/COMPONENT relationships and runtime bindings. Validate
  `pixsoTarget` against `assets/design-system/pixso-component-facts.json`;
  keep `pixsoSpecKey` as the separate Text-to-UI specification key and keep
  Variant selection in `runtimeBinding.variant`.
- An HTML component that is intentionally outside Pixso mapping scope must
  keep `pixsoTargetStatus: "unregistered"` and declare
  `pixsoMappingPolicy: "excluded"` with a concrete `pixsoMappingReason`. Its
  generated availability is `excluded`, not `blocked`, and it must not appear
  in the pending-mapping queue. The current explicit exclusions are
  `Context Menu/Default` and `Dropdown Menu/Default`. For Dropdown Menu, page
  generation must directly compose native nodes from its Token/interaction
  contract; it must not import, instantiate, or reference a reusable master.
- `componentAliases` declares compatibility variants with unique names that
  cannot shadow formal mappings. Normalize canonical bindings once through
  `scripts/component-mapping-resolver.mjs`; never overlay an old generated map.
  The package mapping index is also generated from this source, not maintained
  as a second catalog.
- `endpointComponentMappings` is an internal projection for optional runtime
  component IDs (for example `icon-text-primary`, `icon-text-secondary`,
  `icon-text-ghost`, and `icon`). They are implementation aliases of the same
  HTML formal mapping, never a second component category. In Obsidian, create
  and edit them in the single **HTML Component ↔ Pixso Component** table by
  filling `runtimeComponentId` and `contractId`; the synchronization script
  maintains the internal projection.
- `nativeSourceMappings` and `sourceOnly` own HarmonyOS source reuse and
  candidate/reference relationships.
- `profiles` isolate different HTML sources, Pixso design files, and component
  libraries. Add a profile for a new target; do not overwrite an existing one.

### Typography mapping policy

Typography has two related but distinct layers:

- `tokenMappings` records the atomic foundation relationships, such as
  `--font-size-16` → `font/size/16`, `--line-height-22` →
  `font/line-height/22`, and `--font-weight-400` → `font/weight/400`.
- `styleMappings` and `assets/design-system/typography-style-map.json` record
  the composite HTML typography role → exact Pixso Text Style relationship,
  such as `body-l` → `Typography/Body_L` (16px / 20px / 400). The current
  formal set is `display-l/m/s`, `title-l/m/s`, `subtitle-l/m/s`,
  `body-l/m/s`, and `caption-m`; `caption-l` is deprecated.

For standard typography roles, the HTML → Pixso scene must carry
`style.textStyle.ref`, for example `$style/Typography/Body_L`. The Pixso
runtime resolves the existing local Text Style and assigns its `textStyleId` to
the text node. Do not replace an available Text Style with separate
`fontSize`, `lineHeight`, and `fontWeight` assignments. Computed HTML typography
is still captured for geometry and diagnosis; only a non-standard value with
no matching formal Text Style may use the property-level fallback, binding
`fontSize`, `lineHeight`, or `letterSpacing` variables when possible.

A direct Text Style mapping is valid only when the exact Text Style exists in
the current Pixso file and live readback confirms the binding. The variable
names listed in the registry describe the foundation values; they do not by
themselves prove that the Pixso Text Style internally references those
variables. If the style is renamed or a role is remapped, update the style
mapping; changing only an atomic variable mapping does not necessarily update
an existing Pixso Text Style.

The generated runtime maps and coverage tables are projections. If the user
edited the Obsidian workbook, first run
`scripts/sync-obsidian-mapping-edits.mjs --check`; after reviewing the proposed
changes, use its `--write` form to update the registry. Then run
`node scripts/validate-mapping-registry.mjs`,
`node scripts/sync-mapping-registry.mjs --write`, and its `--check` form. Use
`scripts/build-obsidian-mapping-workbook.mjs` for the clear Obsidian maintenance
view and `scripts/build-mapping-registry-doc.mjs` for the detailed report.
Only apply pending rows from the workbook. If a Pixso target is a same-family
candidate rather than an exact registered name, stop and ask for clarification.
Never persist Pixso GUIDs, node IDs, or file keys in the registry; resolve them
from the current Pixso document at runtime.

`profiles[].summary` is diagnostic derived data, not a second edit surface. The
component-facts sync refreshes it from the normalized Pixso facts before
projection validation, and `sync-mapping-registry.mjs --write` repeats that
refresh as a recovery guard. Do not hand-edit a stale count; rerun the write
sync so the facts, summary, and projections move together.

### Pixso component facts sync

After changing a Pixso component, use the installed Text-to-UI Pixso Unified
Agent's **同步当前组件事实与导入映射** command, or its **同步组件映射** button.
The same plugin remains the Permanent Agent for page import. It sends a no-ID
snapshot of the current `COMPONENT_SET`/`COMPONENT` inventory to the local
Bridge endpoint `/component-sync`; the Bridge normalizes real
`variantProperties` and current geometry, then applies only exact, token-backed
changes to the canonical registry. It also rebuilds and validates the generated
specs and runtime projections in one transaction.

The sync is intentionally partial-safe: a missing or ambiguous source-only
mapping becomes a visible review item while unrelated deterministic mappings
continue to apply. If a currently registered component target disappears, the
old canonical facts file is preserved and safe mapping changes may still be
applied; repair the missing target before accepting a new full facts snapshot.
Never parse a deleted Variant axis from a stale display name, and never persist
Pixso IDs. A new component geometry change should first complete the import or
library task; run this synchronization as the final consistency pass.
