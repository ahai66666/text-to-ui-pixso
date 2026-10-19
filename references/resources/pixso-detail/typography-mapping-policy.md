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

