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

